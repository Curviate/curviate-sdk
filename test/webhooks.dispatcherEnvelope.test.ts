/**
 * `constructEvent` against a REAL delivery: the regression test for the
 * discriminator repair shipped in 0.19.0.
 *
 * ## Why this file is different from webhooks.constructEvent.test.ts
 *
 * That file builds its own payloads (`{ type: "message.received", … }`) and is
 * green for exactly that reason. It pins the parser against itself, so it could
 * never see that the server emits the event name in `event`, not `type` — and
 * `constructEvent` consequently threw on **100% of genuine deliveries** for
 * several releases while the suite stayed green.
 *
 * So this file constructs nothing. `test/fixtures/webhook-delivery.capture.json`
 * holds the exact bytes and the exact `Curviate-Signature` header recorded off
 * the wire from a real run of the Curviate webhook dispatch worker. The
 * assertions below replay that capture verbatim: the body is not re-serialized,
 * the signature is not recomputed. If the emitter and this parser ever diverge
 * again, this test is what goes red.
 *
 * The capture is regenerated, and the emitter side of the same contract pinned,
 * by the Curviate platform's own dispatch contract test. See the fixture's
 * `provenance` and `regenerate` fields.
 */
import { createHmac } from "node:crypto";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { constructEvent, WebhookSignatureError } from "../src/index.js";

const __dirname = dirname(fileURLToPath(import.meta.url));

interface DeliveryCapture {
  eventName: string;
  secret: string;
  signatureHeader: string;
  rawBody: string;
}

const capture = JSON.parse(
  readFileSync(resolve(__dirname, "fixtures/webhook-delivery.capture.json"), "utf8"),
) as DeliveryCapture;

/**
 * The capture is a recording, so it ages past any real replay window. Widen the
 * window rather than re-sign: re-signing would discard the one property that
 * makes this a real delivery instead of a fixture. The replay guard has its own
 * coverage in webhooks.constructEvent.test.ts.
 */
const REPLAY_WINDOW_SECS = 10 * 365 * 24 * 60 * 60;

/** Re-sign an arbitrary body with the capture's secret, for the negative cases. */
function signWith(body: string, secret: string, timestampSecs: number): string {
  const hmac = createHmac("sha256", secret)
    .update(`${timestampSecs}.${body}`, "utf8")
    .digest("hex");
  return `t=${timestampSecs},v1=${hmac}`;
}

function nowSecs(): number {
  return Math.floor(Date.now() / 1000);
}

// ─── The criterion this repair exists for ────────────────────────────────────

describe("constructEvent - a real captured delivery", () => {
  it("parses the dispatcher's own bytes and returns the emitted event name", async () => {
    const event = await constructEvent(
      capture.rawBody,
      capture.signatureHeader,
      capture.secret,
      { replayWindowSecs: REPLAY_WINDOW_SECS },
    );

    // The discriminant is `event`, matching what the server actually sends.
    // Before the repair this line was never reached: the call threw
    // `malformed_header` / 'missing "type" field' on every real delivery.
    expect(event.event).toBe(capture.eventName);
  });

  it("narrows on the discriminant, so `data` is the typed payload", async () => {
    const event = await constructEvent(
      capture.rawBody,
      capture.signatureHeader,
      capture.secret,
      { replayWindowSecs: REPLAY_WINDOW_SECS },
    );

    if (event.event !== "message.received") {
      throw new Error(`capture is no longer a message.received delivery: ${event.event}`);
    }
    // Narrowed to MessagePayload here.
    expect(event.data.account_id).toBe("acc_capture");
    expect(event.data.message_id).toBe("msg_capture");
  });

  it("exposes the delivery envelope metadata the server sends", async () => {
    const event = await constructEvent(
      capture.rawBody,
      capture.signatureHeader,
      capture.secret,
      { replayWindowSecs: REPLAY_WINDOW_SECS },
    );

    // Present on every delivery; the parser does not require them (see
    // src/webhooks.ts), so they are optional on the type.
    expect(event.id).toMatch(/^wdl_/);
    expect(event.webhook_id).toMatch(/^wh_/);
    expect(typeof event.delivered_at).toBe("string");
  });

  it("accepts the capture as a Buffer, the shape most frameworks hand you", async () => {
    const event = await constructEvent(
      Buffer.from(capture.rawBody, "utf8"),
      capture.signatureHeader,
      capture.secret,
      { replayWindowSecs: REPLAY_WINDOW_SECS },
    );
    expect(event.event).toBe(capture.eventName);
  });
});

// ─── The repair must not weaken verification ─────────────────────────────────

describe("constructEvent - the captured delivery's negative cases", () => {
  it("rejects a tampered body with invalid_signature", async () => {
    const tampered = capture.rawBody.replace("acc_capture", "acc_attacker");
    expect(tampered).not.toBe(capture.rawBody);

    await expect(
      constructEvent(tampered, capture.signatureHeader, capture.secret, {
        replayWindowSecs: REPLAY_WINDOW_SECS,
      }),
    ).rejects.toMatchObject({
      name: "WebhookSignatureError",
      reason: "invalid_signature",
    });
  });

  it("rejects the real body under the wrong secret with invalid_signature", async () => {
    await expect(
      constructEvent(capture.rawBody, capture.signatureHeader, "whsec_not_the_secret", {
        replayWindowSecs: REPLAY_WINDOW_SECS,
      }),
    ).rejects.toMatchObject({ reason: "invalid_signature" });
  });

  it("rejects a truncated (wrong-length) v1 with invalid_signature", async () => {
    const truncated = capture.signatureHeader.slice(0, -2);
    await expect(
      constructEvent(capture.rawBody, truncated, capture.secret, {
        replayWindowSecs: REPLAY_WINDOW_SECS,
      }),
    ).rejects.toMatchObject({ reason: "invalid_signature" });
  });

  it("rejects an odd-length v1 with invalid_signature", async () => {
    const odd = capture.signatureHeader.slice(0, -1);
    await expect(
      constructEvent(capture.rawBody, odd, capture.secret, {
        replayWindowSecs: REPLAY_WINDOW_SECS,
      }),
    ).rejects.toMatchObject({ reason: "invalid_signature" });
  });

  it("still rejects a genuinely malformed header as malformed_header", async () => {
    await expect(
      constructEvent(capture.rawBody, "not-a-signature-header", capture.secret, {
        replayWindowSecs: REPLAY_WINDOW_SECS,
      }),
    ).rejects.toMatchObject({ reason: "malformed_header" });
  });
});

// ─── A valid signature over an unparseable body must not blame the header or
// the secret ─────────────────────────────────────────────────────────────────

describe("constructEvent - verified but unparseable", () => {
  const cases: Array<[string, string]> = [
    ["a body that is not JSON", "this is not json at all"],
    ["a JSON array", JSON.stringify([1, 2, 3])],
    ["a JSON string literal", JSON.stringify("just a string")],
    ["JSON null", "null"],
    ["an object with no event name", JSON.stringify({ id: "wdl_1", data: {} })],
    ["an object whose event name is not a string", JSON.stringify({ event: 42, data: {} })],
  ];

  for (const [label, body] of cases) {
    it(`${label}: reports malformed_payload, not malformed_header`, async () => {
      const header = signWith(body, capture.secret, nowSecs());

      let caught: unknown;
      try {
        await constructEvent(body, header, capture.secret, { replayWindowSecs: 300 });
      } catch (err) {
        caught = err;
      }

      expect(caught).toBeInstanceOf(WebhookSignatureError);
      const err = caught as WebhookSignatureError;

      // The signature verified. Saying "malformed_header" here is what sent
      // integrators to rotate a secret that was never wrong.
      expect(err.reason).not.toBe("malformed_header");
      expect(err.reason).toBe("malformed_payload");

      // And the message must not point at the header or the secret either.
      expect(err.message.toLowerCase()).not.toContain("header");
      expect(err.message.toLowerCase()).not.toContain("secret");
      expect(err.message.toLowerCase()).not.toContain("signature");
    });
  }
});

// ─── Tolerate a `type` field, never require one ──────────────────────────────

describe("constructEvent - forward compatibility with a `type` field", () => {
  it("parses an envelope carrying both `event` and `type`", async () => {
    const body = JSON.stringify({
      id: "wdl_forward",
      webhook_id: "wh_forward",
      event: "account.connected",
      type: "account.connected",
      data: { account_id: "acc_forward" },
      delivered_at: new Date().toISOString(),
    });
    const header = signWith(body, capture.secret, nowSecs());

    const event = await constructEvent(body, header, capture.secret, {
      replayWindowSecs: 300,
    });
    expect(event.event).toBe("account.connected");
  });

  it("does NOT require `type`: the real envelope has none", async () => {
    expect(JSON.parse(capture.rawBody)).not.toHaveProperty("type");
    await expect(
      constructEvent(capture.rawBody, capture.signatureHeader, capture.secret, {
        replayWindowSecs: REPLAY_WINDOW_SECS,
      }),
    ).resolves.toBeDefined();
  });
});
