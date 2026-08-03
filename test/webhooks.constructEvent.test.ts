/**
 * constructEvent, WebhookSignatureError, CurviateEvent.
 *
 * Crypto in tests: use Node's built-in `crypto` to derive a valid HMAC header
 * so we don't depend on constructEvent for setup.
 *
 * Wire format: t=<Unix-seconds (integer)>, v1=<HMAC-SHA256 hex over "<t>.<body>">.
 * The replay window option is `replayWindowSecs` (seconds), matching the server.
 *
 * ⚠ THIS FILE CANNOT PROVE THE PARSER MATCHES THE EMITTER, and must never be
 * treated as if it could. Every payload below is constructed here, so the file
 * only ever pins constructEvent against this file's own idea of the envelope.
 * That is precisely how the discriminator defect shipped: these tests were
 * green throughout, using a `type` field no Curviate delivery has ever carried,
 * while `constructEvent` threw on 100% of real webhooks.
 *
 * The emitter/parser contract is pinned in webhooks.dispatcherEnvelope.test.ts,
 * which replays bytes captured off the wire from the real dispatch worker. Any
 * new "does constructEvent handle X" case belongs HERE; any claim about what
 * the platform actually sends belongs THERE.
 */
import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  constructEvent,
  type CurviateEvent,
  WebhookSignatureError,
} from "../src/index.js";
import { CurviateError } from "../src/index.js";
import type { paths } from "../src/generated/types.js";

// ─── Test helper: build a valid Curviate-Signature header ───────────────────
//
// timestamp must be Unix SECONDS (integer) — the server signs with
// Math.floor(Date.now()/1000), and the SDK verifies against the same unit.

function makeHeader(rawBody: string, secret: string, timestampSecs: number): string {
  const payload = `${timestampSecs}.${rawBody}`;
  const hmac = createHmac("sha256", secret).update(payload, "utf8").digest("hex");
  return `t=${timestampSecs},v1=${hmac}`;
}

/** Current time as Unix seconds (integer), matching the server. */
function nowSecs(): number {
  return Math.floor(Date.now() / 1000);
}

const SECRET = "whsec_test_secret";
const BODY = JSON.stringify({ event: "message.received", data: { message_id: "msg_1", account_id: "acc_1" } });
const BODY_ACCOUNT = JSON.stringify({ event: "account.connected", data: { account_id: "acc_1" } });

// ─── happy path ──────────────────────────────────────────────────────────────

describe("constructEvent — happy path", () => {
  it("returns a typed CurviateEvent with correct type and data", async () => {
    const t = nowSecs();
    const header = makeHeader(BODY, SECRET, t);
    const event: CurviateEvent = await constructEvent(BODY, header, SECRET, { replayWindowSecs: 60 });
    expect(event.event).toBe("message.received");
    expect((event.data as Record<string, unknown>)["message_id"]).toBe("msg_1");
    expect((event.data as Record<string, unknown>)["account_id"]).toBe("acc_1");
  });

  it("accepts a Buffer rawBody", async () => {
    const t = nowSecs();
    const bodyBuf = Buffer.from(BODY, "utf8");
    const header = makeHeader(BODY, SECRET, t);
    const event = await constructEvent(bodyBuf, header, SECRET, { replayWindowSecs: 60 });
    expect(event.event).toBe("message.received");
  });

  it("handles an account-type event", async () => {
    const t = nowSecs();
    const header = makeHeader(BODY_ACCOUNT, SECRET, t);
    const event = await constructEvent(BODY_ACCOUNT, header, SECRET, { replayWindowSecs: 60 });
    expect(event.event).toBe("account.connected");
  });

  // ─── W2 re-key — representative new event types round-trip (behavior
  // coverage; NOT the union-completeness proof — see the compile-time pin
  // below, since verifyAndParse casts unconditionally and would pass for any
  // string).
  it("handles a chat.updated event (new, messaging-grouped)", async () => {
    const t = nowSecs();
    const body = JSON.stringify({ event: "chat.updated", data: { account_id: "acc_1" } });
    const header = makeHeader(body, SECRET, t);
    const event = await constructEvent(body, header, SECRET, { replayWindowSecs: 60 });
    expect(event.event).toBe("chat.updated");
  });

  it("handles a connection.new event (new, user-grouped)", async () => {
    const t = nowSecs();
    const body = JSON.stringify({ event: "connection.new", data: { account_id: "acc_1" } });
    const header = makeHeader(body, SECRET, t);
    const event = await constructEvent(body, header, SECRET, { replayWindowSecs: 60 });
    expect(event.event).toBe("connection.new");
  });

  it("handles an account.initial_sync.failed event (new, account_status-grouped)", async () => {
    const t = nowSecs();
    const body = JSON.stringify({ event: "account.initial_sync.failed", data: { account_id: "acc_1" } });
    const header = makeHeader(body, SECRET, t);
    const event = await constructEvent(body, header, SECRET, { replayWindowSecs: 60 });
    expect(event.event).toBe("account.initial_sync.failed");
  });

  it("accepts an event ~1 second old (within window)", async () => {
    // Signing 1 second in the past — well within any reasonable window.
    const t = nowSecs() - 1;
    const header = makeHeader(BODY, SECRET, t);
    await expect(
      constructEvent(BODY, header, SECRET, { replayWindowSecs: 60 })
    ).resolves.toMatchObject({ event: "message.received" });
  });
});

// ─── tampered signature ───────────────────────────────────────────────────────

describe("constructEvent — tampered signature", () => {
  it("throws WebhookSignatureError with reason: invalid_signature", async () => {
    const t = nowSecs();
    const tamperedHeader = `t=${t},v1=bad_hmac_value_1234567890abcdef`;
    await expect(constructEvent(BODY, tamperedHeader, SECRET)).rejects.toBeInstanceOf(WebhookSignatureError);
    await expect(constructEvent(BODY, tamperedHeader, SECRET)).rejects.toMatchObject({
      reason: "invalid_signature",
    });
  });

  it("throws even if one byte differs", async () => {
    const t = nowSecs();
    const validHeader = makeHeader(BODY, SECRET, t);
    // Flip the last character of the v1 value
    const flipped = validHeader.slice(0, -1) + (validHeader.at(-1) === "a" ? "b" : "a");
    await expect(constructEvent(BODY, flipped, SECRET)).rejects.toBeInstanceOf(WebhookSignatureError);
  });

  it("throws on wrong secret", async () => {
    const t = nowSecs();
    const header = makeHeader(BODY, "wrong_secret", t);
    await expect(constructEvent(BODY, header, SECRET)).rejects.toMatchObject({
      reason: "invalid_signature",
    });
  });
});

// ─── replay detection ────────────────────────────────────────────────────────

describe("constructEvent — replay detection", () => {
  it("throws replay_detected for a timestamp from Unix epoch (always outside window)", async () => {
    // t=0 (1970-01-01) is always more than 300s in the past
    const oldTimestampSecs = 0;
    const header = makeHeader(BODY, SECRET, oldTimestampSecs);
    await expect(constructEvent(BODY, header, SECRET)).rejects.toMatchObject({
      reason: "replay_detected",
    });
  });

  it("throws replay_detected for a timestamp 10 minutes old (outside default 5-min window)", async () => {
    const oldTimestampSecs = nowSecs() - 600; // 10 min ago
    const header = makeHeader(BODY, SECRET, oldTimestampSecs);
    await expect(
      constructEvent(BODY, header, SECRET, { replayWindowSecs: 300 })
    ).rejects.toMatchObject({ reason: "replay_detected" });
  });

  it("accepts a timestamp from 4 minutes ago (within 5-min default window)", async () => {
    const t = nowSecs() - 240; // 4 min ago
    const header = makeHeader(BODY, SECRET, t);
    await expect(
      constructEvent(BODY, header, SECRET, { replayWindowSecs: 300 })
    ).resolves.toMatchObject({ event: "message.received" });
  });

  it("rejects a future timestamp beyond the window (future-skew guard)", async () => {
    // t is 10 minutes in the future — Math.abs check catches this too
    const futureTimestampSecs = nowSecs() + 600;
    const header = makeHeader(BODY, SECRET, futureTimestampSecs);
    await expect(
      constructEvent(BODY, header, SECRET, { replayWindowSecs: 300 })
    ).rejects.toMatchObject({ reason: "replay_detected" });
  });

  it("signature is checked before replay (tampered + expired = invalid_signature, not replay_detected)", async () => {
    // The spec step order: 1. parse 2. compute 3. compare 4. replay
    // A tampered header with an old timestamp should fail at step 3.
    const badHeader = `t=0,v1=bad_hmac_value_1234567890abcdef`;
    await expect(constructEvent(BODY, badHeader, SECRET)).rejects.toMatchObject({
      reason: "invalid_signature",
    });
  });
});

// ─── malformed header ────────────────────────────────────────────────────────

describe("constructEvent — malformed header", () => {
  it("throws WebhookSignatureError with reason: malformed_header for 'garbage'", async () => {
    await expect(constructEvent(BODY, "garbage", SECRET)).rejects.toBeInstanceOf(WebhookSignatureError);
    await expect(constructEvent(BODY, "garbage", SECRET)).rejects.toMatchObject({
      reason: "malformed_header",
    });
  });

  it("throws malformed_header for missing v1 component", async () => {
    await expect(
      constructEvent(BODY, `t=${nowSecs()}`, SECRET)
    ).rejects.toMatchObject({ reason: "malformed_header" });
  });

  it("throws malformed_header for missing t component", async () => {
    const hmac = createHmac("sha256", SECRET).update(BODY).digest("hex");
    await expect(
      constructEvent(BODY, `v1=${hmac}`, SECRET)
    ).rejects.toMatchObject({ reason: "malformed_header" });
  });

  it("throws malformed_header for non-numeric timestamp", async () => {
    const hmac = createHmac("sha256", SECRET).update(BODY).digest("hex");
    await expect(
      constructEvent(BODY, `t=notanumber,v1=${hmac}`, SECRET)
    ).rejects.toMatchObject({ reason: "malformed_header" });
  });

  it("throws malformed_header for empty string header", async () => {
    await expect(
      constructEvent(BODY, "", SECRET)
    ).rejects.toMatchObject({ reason: "malformed_header" });
  });
});

// ─── WebhookSignatureError identity ──────────────────────────────────────────

describe("WebhookSignatureError identity", () => {
  it("is an instance of Error but NOT an instance of CurviateError", async () => {
    let caught: unknown;
    try {
      await constructEvent(BODY, "garbage", SECRET);
    } catch (err) {
      caught = err;
    }
    expect(caught).toBeInstanceOf(Error);
    expect(caught).toBeInstanceOf(WebhookSignatureError);
    expect(caught).not.toBeInstanceOf(CurviateError);
  });

  it("has the reason property and correct message", async () => {
    try {
      await constructEvent(BODY, "garbage", SECRET);
    } catch (err) {
      const wse = err as WebhookSignatureError;
      expect(typeof wse.reason).toBe("string");
      expect(wse.message.length).toBeGreaterThan(0);
      expect(wse.name).toBe("WebhookSignatureError");
    }
  });
});

// ─── CurviateEvent union pin — W2 re-key ─────────────────────────────────────
//
// `verifyAndParse` casts `parsed as CurviateEvent` UNCONDITIONALLY (no runtime
// `type` check) — so a runtime "feed event X -> expect(event.event).toBe(X)"
// test (the happy-path tests above) is VACUOUS for union COMPLETENESS: it
// passes for any string, re-keyed or not. This drifted silently once already —
// 0.13.0 shipped `CurviateEvent` holding `account.stopped` / `sync_started` /
// `sync_complete` / `creation_success` / `sync_success` / `reconnect_required` /
// `checkpoint` while the server's create-events enum had already moved on to
// `account.synced` / `paused` / `connecting` / ... — nothing linked the two.
//
// This block is the actual proof. It only matters to `tsc --noEmit`
// (`pnpm typecheck`) — vitest transpiles via esbuild and does not type-check,
// so these assertions are inert at runtime by design; the `expect` calls exist
// only so the `it`s register as real tests.
describe("CurviateEvent union pin — matches the generated create-events catalogue", () => {
  it("CurviateEvent['type'] equals the union of the 3 generated create-variant `events` enums", () => {
    type GeneratedCreateBody =
      paths["/v1/webhooks"]["post"]["requestBody"]["content"]["application/json"];
    type GeneratedCreateEventName = NonNullable<GeneratedCreateBody["events"]>[number];

    // Exact (two-way) type equality — NOT `extends` subtyping, which would
    // silently pass on a strict subset or superset and hide drift.
    type Equal<X, Y> =
      (<T>() => T extends X ? 1 : 2) extends (<T>() => T extends Y ? 1 : 2) ? true : false;
    type AssertTrue<T extends true> = T;

    // If this type alias fails to compile, CurviateEvent["event"] and the
    // generated create-events enum have diverged — update the CurviateEvent
    // union in src/webhooks.ts (never relax this to `extends` subtyping).
    type _Pinned = AssertTrue<Equal<CurviateEvent["event"], GeneratedCreateEventName>>;
    const pinned: _Pinned = true;
    expect(pinned).toBe(true);
  });

  it("the 7 event names removed by the W2 re-key are no longer assignable", () => {
    // Each assignment below is expected to fail to compile (the literal is not
    // a member of CurviateEvent["event"]). If any of these names is ever
    // re-added by mistake, the assignment starts compiling and the
    // `@ts-expect-error` above it goes unused — `tsc` fails on "Unused
    // '@ts-expect-error' directive", catching the regression.
    // @ts-expect-error — 'account.stopped' removed (W2 re-key; split into account.connecting/reconnected/paused/etc)
    const removed1: CurviateEvent["event"] = "account.stopped";
    // @ts-expect-error — 'account.sync_started' removed (W2 re-key; no successor push event)
    const removed2: CurviateEvent["event"] = "account.sync_started";
    // @ts-expect-error — 'account.sync_complete' removed (W2 re-key; superseded by account.synced)
    const removed3: CurviateEvent["event"] = "account.sync_complete";
    // @ts-expect-error — 'account.creation_success' removed (W2 re-key; superseded by account.created)
    const removed4: CurviateEvent["event"] = "account.creation_success";
    // @ts-expect-error — 'account.sync_success' removed (W2 re-key; superseded by account.synced)
    const removed5: CurviateEvent["event"] = "account.sync_success";
    // @ts-expect-error — 'account.reconnect_required' removed (W2 re-key; superseded by account.reconnect_needed)
    const removed6: CurviateEvent["event"] = "account.reconnect_required";
    // @ts-expect-error — 'account.checkpoint' removed (W2 re-key; no successor push event)
    const removed7: CurviateEvent["event"] = "account.checkpoint";
    void [removed1, removed2, removed3, removed4, removed5, removed6, removed7];
    expect(true).toBe(true); // runtime no-op — the real proof is the 7 suppressed errors above
  });
});
