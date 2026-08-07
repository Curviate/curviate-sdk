/**
 * Webhook signature verification and typed event parsing.
 *
 * `constructEvent` verifies the HMAC-SHA256 signature on an inbound webhook
 * request and returns a typed `CurviateEvent`. It is framework-agnostic:
 * works in Node 18+, Cloudflare Workers, Vercel Edge, and any runtime that
 * exposes the Web Crypto API via `globalThis.crypto.subtle`.
 *
 * Security properties:
 * - No third-party crypto dependency.
 * - Web Crypto (`globalThis.crypto.subtle`) is the universal primary path,
 *   available in Node 18+, Cloudflare Workers, and Vercel Edge. The function
 *   is therefore always async: call it with `await`.
 * - HMAC comparison is constant-time: byte-by-byte XOR accumulation, no early
 *   return on first mismatch (prevents timing-oracle attacks).
 * - Replay guard: reject events older than `replayWindowSecs` (default 300 s).
 *   Timestamp on the wire is Unix seconds (integer). Both past-skew and
 *   future-skew are bounded.
 */

// ─── WebhookSignatureError ────────────────────────────────────────────────────

/**
 * Thrown by {@link constructEvent} when signature verification fails.
 *
 * Extends `Error`, NOT `CurviateError`, callers can narrow with
 * `instanceof WebhookSignatureError` independently of CurviateError.
 *
 * The `reason` codes split by where the problem actually is, so the code you
 * read points at the thing you need to look at:
 *
 * - `malformed_header` - the `Curviate-Signature` header itself is unusable
 *   (missing `t=` or `v1=`, non-numeric timestamp). Check how you are reading
 *   the header.
 * - `invalid_signature` - the header parsed, but the HMAC does not match.
 *   Check the signing secret, and check that you passed the raw request bytes
 *   rather than a re-serialized object.
 * - `replay_detected` - signature valid, timestamp outside the replay window.
 * - `malformed_payload` - **signature valid**, but the body is not a Curviate
 *   event. Nothing is wrong with your secret or your header; look at what is
 *   POSTing to the endpoint.
 *
 * @example
 * try {
 *   const event = await constructEvent(rawBody, header, secret);
 * } catch (err) {
 *   if (err instanceof WebhookSignatureError) {
 *     if (err.reason === 'replay_detected') { ... }
 *   }
 * }
 */
export class WebhookSignatureError extends Error {
  override readonly name = "WebhookSignatureError";
  /** Structured reason code for the verification failure. */
  readonly reason:
    | "invalid_signature"
    | "replay_detected"
    | "malformed_header"
    | "malformed_payload";

  constructor(reason: WebhookSignatureError["reason"], message: string) {
    super(message);
    this.reason = reason;
    Object.setPrototypeOf(this, WebhookSignatureError.prototype);
  }
}

// ─── CurviateEvent discriminated union ──────────────────────────────────────

/**
 * The three fields every Curviate event payload carries, whatever its type.
 *
 * `occurred_at` matters beyond timestamping: together with `event` and
 * `account_id` it is the only key that survives a retry, because the platform
 * re-sends the identical payload while minting a fresh envelope `id` per
 * attempt. Typing it here is what lets a consumer build that key without
 * widening to `unknown`.
 */
export interface EventPayloadBase {
  /** The account the event happened on. */
  account_id: string;
  /** The event name, repeated inside the payload by the platform. */
  event: string;
  /** ISO-8601 time the event occurred. Stable across every delivery attempt. */
  occurred_at: string;
  [key: string]: unknown;
}

/**
 * Payload carried by message-type events.
 */
export interface MessagePayload extends EventPayloadBase {
  message_id?: string;
}

/**
 * Payload carried by connection-type events.
 */
export type ConnectionPayload = EventPayloadBase;

/**
 * Payload carried by account-state events.
 */
export type AccountPayload = EventPayloadBase;

/**
 * Delivery metadata that accompanies every Curviate webhook event.
 *
 * These fields are present on every delivery the platform sends, but
 * `constructEvent` does **not** require them: the parser insists only on the
 * discriminant. That is deliberate. Requiring an envelope field is exactly how
 * verification broke before (the parser demanded a field the emitter did not
 * send, and rejected every genuine delivery), so anything the union does not
 * strictly need to narrow is optional here and cannot fail a verification.
 */
export interface CurviateEventEnvelope {
  /**
   * Unique id for this delivery attempt, e.g. `wdl_01J...`. Every retry mints a
   * new one, so it identifies an attempt rather than a logical event and is
   * **not** a de-duplication key. To discard duplicate retries, key on `event`
   * plus `data.account_id` plus `data.occurred_at`, which are identical across
   * every attempt of the same event. Use `id` to correlate one attempt with
   * your own delivery logs.
   */
  id?: string;
  /** Id of the webhook registration this delivery belongs to, e.g. `wh_01J...`. */
  webhook_id?: string;
  /** ISO-8601 timestamp of the delivery attempt. */
  delivered_at?: string;
}

/**
 * The complete discriminated union of the canonical, create-subscribable
 * Curviate webhook events. The **`event`** field is the discriminant, matching
 * the field the platform actually sends on the wire.
 *
 * The size of this union is not stated here on purpose: it is pinned at compile
 * time to the generated create-events enum (below), so the union itself is the
 * count and a number in this comment could only ever go stale.
 *
 * > Migrating from 0.18.x and earlier: the discriminant was `type`, a field no
 * > Curviate delivery has ever contained, so `constructEvent` threw on every
 * > real webhook and no `event.type` branch could ever run. Switch your checks
 * > to `event.event === '...'`. `event.type` is now a compile error, which is
 * > intentional: it points at every site that needs the one-word change.
 *
 * Re-keyed for the v2 catalogue (was 19). Renamed/removed vs. the prior set:
 * `account.stopped`, `account.sync_started`, `account.sync_complete`,
 * `account.creation_success`, `account.sync_success`, `account.reconnect_required`,
 * and `account.checkpoint` are gone, the account-lifecycle names now split
 * across `account.synced` / `account.reconnected` / `account.reconnect_needed` /
 * `account.paused` / `account.connecting` / `account.permission_revoked`. Net-new:
 * `chat.updated`, `chat.deleted`, `connection.new`, and the three
 * `account.initial_sync.*` events. This union is pinned at compile time against
 * the generated create-events enum (see `test/webhooks.constructEvent.test.ts`);
 * it must never drift from the served catalogue again.
 *
 * @example
 * const event = await constructEvent(rawBody, header, secret);
 * if (event.event === 'message.received') {
 *   // event.data is MessagePayload
 * }
 */
export type CurviateEvent = CurviateEventEnvelope &
  (
    | { event: "message.received"; data: MessagePayload }
    | { event: "message.delivered"; data: MessagePayload }
    | { event: "message.read"; data: MessagePayload }
    | { event: "message.edited"; data: MessagePayload }
    | { event: "message.deleted"; data: MessagePayload }
    | { event: "message.reaction"; data: MessagePayload }
    | { event: "chat.updated"; data: MessagePayload }
    | { event: "chat.deleted"; data: MessagePayload }
    | { event: "connection.accepted"; data: ConnectionPayload }
    | { event: "connection.new"; data: ConnectionPayload }
    | { event: "account.created"; data: AccountPayload }
    | { event: "account.connected"; data: AccountPayload }
    | { event: "account.synced"; data: AccountPayload }
    | { event: "account.reconnected"; data: AccountPayload }
    | { event: "account.reconnect_needed"; data: AccountPayload }
    | { event: "account.restricted"; data: AccountPayload }
    | { event: "account.creation_failed"; data: AccountPayload }
    | { event: "account.disconnected"; data: AccountPayload }
    | { event: "account.error"; data: AccountPayload }
    | { event: "account.paused"; data: AccountPayload }
    | { event: "account.connecting"; data: AccountPayload }
    | { event: "account.permission_revoked"; data: AccountPayload }
    | { event: "account.initial_sync.running"; data: AccountPayload }
    | { event: "account.initial_sync.completed"; data: AccountPayload }
    | { event: "account.initial_sync.failed"; data: AccountPayload }
  );

// ─── Header parsing ──────────────────────────────────────────────────────────

interface ParsedHeader {
  timestamp: number;
  v1: string;
}

function parseHeader(header: string): ParsedHeader {
  const parts = header.split(",");
  let tStr: string | undefined;
  let v1: string | undefined;
  for (const part of parts) {
    const eq = part.indexOf("=");
    if (eq === -1) continue;
    const key = part.slice(0, eq).trim();
    const val = part.slice(eq + 1).trim();
    if (key === "t") tStr = val;
    else if (key === "v1") v1 = val;
  }
  if (tStr === undefined || v1 === undefined) {
    throw new WebhookSignatureError(
      "malformed_header",
      'Webhook signature header must contain both "t=<timestamp>" and "v1=<hmac>".',
    );
  }
  const timestamp = Number(tStr);
  if (!Number.isFinite(timestamp) || isNaN(timestamp)) {
    throw new WebhookSignatureError(
      "malformed_header",
      "Webhook signature header timestamp is not a valid number.",
    );
  }
  return { timestamp, v1 };
}

// ─── Hex encoding helpers ────────────────────────────────────────────────────

function hexToBytes(hex: string): Uint8Array {
  if (hex.length % 2 !== 0) {
    throw new WebhookSignatureError("malformed_header", "HMAC hex has odd length.");
  }
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < bytes.length; i++) {
    const byte = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
    if (isNaN(byte)) {
      throw new WebhookSignatureError("malformed_header", "HMAC hex contains non-hex character.");
    }
    bytes[i] = byte;
  }
  return bytes;
}

function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

// ─── Constant-time comparison ────────────────────────────────────────────────

/**
 * Compare two byte arrays in constant time, no early return on first mismatch.
 * The loop always runs over the full range of `Math.max(a.length, b.length)`.
 * Accumulated bitwise-OR `diff` encodes any difference; returns true only when
 * `diff === 0` (all bytes matched, lengths matched).
 */
function constantTimeEqual(a: Uint8Array, b: Uint8Array): boolean {
  const len = Math.max(a.length, b.length);
  // Seed with length mismatch so unequal-length inputs always fail.
  let diff = a.length ^ b.length;
  for (let i = 0; i < len; i++) {
    const ai = i < a.length ? (a[i] as number) : 0;
    const bi = i < b.length ? (b[i] as number) : 0;
    diff |= ai ^ bi;
  }
  return diff === 0;
}

// ─── HMAC-SHA256 via Web Crypto ──────────────────────────────────────────────

/**
 * Async HMAC-SHA256 via Web Crypto (`globalThis.crypto.subtle`).
 * Available in Node 18+, Cloudflare Workers, and Vercel Edge.
 * The result is returned as a hex string.
 */
async function hmacWebCrypto(secret: string, payload: string): Promise<string> {
  const enc = new TextEncoder();
  const keyMaterial = await globalThis.crypto.subtle.importKey(
    "raw",
    enc.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await globalThis.crypto.subtle.sign("HMAC", keyMaterial, enc.encode(payload));
  return bytesToHex(new Uint8Array(sig));
}

// ─── constructEvent options ───────────────────────────────────────────────────

/**
 * Options for {@link constructEvent}.
 */
export interface ConstructEventOptions {
  /**
   * Maximum age in seconds of a webhook event before it is rejected as a
   * replay. Default: 300 (5 minutes). Applies in both directions (past and
   * future skew).
   *
   * Note: this was previously `replayWindowMs` (milliseconds). The option is
   * now in **seconds** to match the server's wire format (Unix seconds). If
   * you were passing a millisecond value (e.g. `300_000`), divide by 1000.
   */
  replayWindowSecs?: number;
}

// ─── Core verification logic ──────────────────────────────────────────────────

function verifyAndParse(
  computedHex: string,
  v1: string,
  timestamp: number,
  bodyStr: string,
  replayWindowSecs: number,
): CurviateEvent {
  // Step 3, constant-time HMAC comparison.
  let providedBytes: Uint8Array;
  try {
    providedBytes = hexToBytes(v1);
  } catch {
    // hexToBytes throws WebhookSignatureError for invalid hex
    throw new WebhookSignatureError(
      "invalid_signature",
      "Webhook signature v1 value is not valid hex.",
    );
  }
  const computedBytes = hexToBytes(computedHex);
  if (!constantTimeEqual(computedBytes, providedBytes)) {
    throw new WebhookSignatureError(
      "invalid_signature",
      "Webhook signature does not match. Verify your signing secret.",
    );
  }

  // Step 4, replay guard (Unix seconds, both past and future).
  // timestamp is Unix seconds (integer); Date.now()/1000 is the current epoch in seconds.
  const nowSecs = Date.now() / 1000;
  const ageSecs = Math.abs(nowSecs - timestamp);
  if (ageSecs > replayWindowSecs) {
    throw new WebhookSignatureError(
      "replay_detected",
      `Webhook event is outside the replay window (${Math.floor(ageSecs)}s ago/ahead, window is ${replayWindowSecs}s).`,
    );
  }

  // Step 5, parse the JSON body into a typed CurviateEvent.
  //
  // Everything below this line runs only AFTER the HMAC matched, so the header
  // and the signing secret are both proven correct at this point. A failure
  // here is therefore `malformed_payload`, never `malformed_header`: reporting
  // a header problem for a body problem is what sends people to rotate a secret
  // that was never wrong.
  let parsed: unknown;
  try {
    parsed = JSON.parse(bodyStr);
  } catch {
    throw new WebhookSignatureError(
      "malformed_payload",
      "Webhook body is not valid JSON. Verification already succeeded, so the problem is the request body, not your webhook configuration.",
    );
  }

  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    throw new WebhookSignatureError(
      "malformed_payload",
      "Webhook body is not a JSON object. Verification already succeeded, so the problem is the request body, not your webhook configuration.",
    );
  }

  const record = parsed as Record<string, unknown>;

  // The discriminant. Curviate sends the event name in `event`; `type` is
  // accepted as a fallback for forward-compatibility and normalized onto
  // `event` so `CurviateEvent` always narrows on one field. Neither is
  // required to be BOTH present, and `type` alone is never required.
  const discriminant =
    typeof record["event"] === "string"
      ? record["event"]
      : typeof record["type"] === "string"
        ? record["type"]
        : undefined;

  if (discriminant === undefined) {
    throw new WebhookSignatureError(
      "malformed_payload",
      'Webhook body has no "event" field, so it cannot be resolved to a Curviate event. Verification already succeeded, so the problem is the request body, not your webhook configuration.',
    );
  }

  record["event"] = discriminant;

  // `discriminant` is a runtime string; the union's literal members cannot be
  // proven from it here, and narrowing to one arm would be a lie. Widening
  // through `unknown` is the honest cast, and it is safe: the only invariant
  // the union depends on is that `event` is a string, which is checked above.
  return record as unknown as CurviateEvent;
}

// ─── constructEvent ───────────────────────────────────────────────────────────

/**
 * Verify a Curviate webhook signature and parse the event payload.
 *
 * Uses Web Crypto (`globalThis.crypto.subtle`) universally, available in
 * Node 18+, Cloudflare Workers, and Vercel Edge. Always returns a Promise;
 * always `await` it.
 *
 * @param rawBody - The raw (un-parsed) request body as a string or Buffer.
 *   **Must be the exact bytes received**, do not JSON.parse then re-serialize.
 * @param signatureHeader - Full value of the `Curviate-Signature` header.
 * @param secret - The webhook signing secret from your webhook registration.
 * @param opts - Optional verification settings.
 * @returns `Promise<CurviateEvent>`, a typed event once verified.
 * @throws {WebhookSignatureError} if the header is malformed, the HMAC is
 *   invalid, or the timestamp is outside the replay window.
 *
 * @example
 * // Express handler (Node 18+)
 * app.post('/webhook', express.raw({ type: 'application/json' }), async (req, res) => {
 *   const sig = req.headers['curviate-signature'] as string;
 *   let event;
 *   try {
 *     event = await constructEvent(req.body, sig, secret);
 *   } catch (err) {
 *     if (err instanceof WebhookSignatureError) {
 *       return res.sendStatus(400);
 *     }
 *     throw err;
 *   }
 *   if (event.event === 'message.received') { ... }
 *   res.sendStatus(200);
 * });
 *
 * @example
 * // Hono / Vercel Edge
 * app.post('/webhook', async (c) => {
 *   const rawBody = await c.req.text();
 *   const event = await constructEvent(rawBody, c.req.header('curviate-signature')!, secret);
 *   return c.text('ok');
 * });
 */
export async function constructEvent(
  rawBody: string | Buffer,
  signatureHeader: string,
  secret: string,
  opts?: ConstructEventOptions,
): Promise<CurviateEvent> {
  const replayWindowSecs = opts?.replayWindowSecs ?? 300;

  // Step 1, parse the header.
  const { timestamp, v1 } = parseHeader(signatureHeader);

  // Step 2, compute HMAC-SHA256(secret, "<timestamp>.<rawBody>").
  // timestamp on the wire is Unix seconds.
  const bodyStr = typeof rawBody === "string" ? rawBody : rawBody.toString("utf8");
  const hmacPayload = `${timestamp}.${bodyStr}`;

  const computedHex = await hmacWebCrypto(secret, hmacPayload);
  return verifyAndParse(computedHex, v1, timestamp, bodyStr, replayWindowSecs);
}
