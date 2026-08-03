/**
 * Black-box regression gate for `constructEvent` against the built dist.
 *
 * This script imports `../dist/index.js` (NOT src/) and exercises the
 * happy path + replay detection end-to-end. It MUST be run after `pnpm build`.
 *
 * ## The first case is the important one
 *
 * Case 1 replays `test/fixtures/webhook-delivery.capture.json`: real bytes and a
 * real `Curviate-Signature` header recorded off the wire from the Curviate
 * webhook dispatch worker. It is the only case here that can prove the built
 * artifact parses an actual delivery.
 *
 * This gate previously built its own `{ type: ... }` payload and passed
 * throughout the release in which `constructEvent` rejected 100% of genuine
 * webhooks, because a payload this script invents can only ever agree with the
 * parser this script is testing. Do not re-introduce a self-constructed happy
 * path: the synthetic cases below exist for the guards (replay, tampering,
 * malformed input) that need a payload built to order, and they use the real
 * envelope shape.
 *
 * Run: node scripts/verify-dist.mjs
 * Exit 0 = all assertions passed.
 * Exit 1 = a case failed, prints the failure and aborts.
 */

import { createHmac } from "node:crypto";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
// Import from the built dist — this is the whole point.
import { constructEvent, WebhookSignatureError } from "../dist/index.js";

const __dirname = dirname(fileURLToPath(import.meta.url));

function assert(condition, label) {
  if (!condition) {
    console.error(`FAIL: ${label}`);
    process.exit(1);
  }
  console.log(`PASS: ${label}`);
}

function makeHeader(rawBody, secret, timestampSecs) {
  const payload = `${timestampSecs}.${rawBody}`;
  const hmac = createHmac("sha256", secret).update(payload, "utf8").digest("hex");
  return `t=${timestampSecs},v1=${hmac}`;
}

const capture = JSON.parse(
  readFileSync(resolve(__dirname, "../test/fixtures/webhook-delivery.capture.json"), "utf8"),
);

/** The capture is a recording, so widen the window rather than re-sign it. */
const CAPTURE_WINDOW_SECS = 10 * 365 * 24 * 60 * 60;

const SECRET = "whsec_test_secret";
const BODY = JSON.stringify({
  event: "message.received",
  data: { message_id: "msg_1", account_id: "acc_1" },
});

async function main() {
  console.log("=== verify-dist: constructEvent black-box gate ===\n");

  // 1. A REAL captured delivery — verbatim bytes, verbatim signature header.
  {
    let event;
    try {
      event = await constructEvent(capture.rawBody, capture.signatureHeader, capture.secret, {
        replayWindowSecs: CAPTURE_WINDOW_SECS,
      });
    } catch (err) {
      console.error(
        "FAIL: the built artifact rejected a REAL captured delivery. " +
          "This is the defect that shipped in 0.18.1 and earlier:",
        err,
      );
      process.exit(1);
    }
    assert(
      event.event === capture.eventName,
      `real delivery: event.event === '${capture.eventName}' (got '${event.event}')`,
    );
    assert(typeof event.id === "string", "real delivery: event.id is the delivery id");
    assert(
      event.data && event.data.account_id === "acc_capture",
      "real delivery: event.data carries the payload",
    );
  }

  // 1b. Tampering the captured body must still be rejected.
  {
    const tampered = capture.rawBody.replace("acc_capture", "acc_attacker");
    let caughtReason = null;
    try {
      await constructEvent(tampered, capture.signatureHeader, capture.secret, {
        replayWindowSecs: CAPTURE_WINDOW_SECS,
      });
    } catch (err) {
      caughtReason = err instanceof WebhookSignatureError ? err.reason : null;
    }
    assert(
      caughtReason === "invalid_signature",
      `real delivery tampered: reason === 'invalid_signature' (got '${caughtReason}')`,
    );
  }

  // 2. Happy path on a synthetic envelope of the same shape.
  {
    const t = Math.floor(Date.now() / 1000);
    const header = makeHeader(BODY, SECRET, t);
    let event;
    try {
      event = await constructEvent(BODY, header, SECRET, { replayWindowSecs: 60 });
    } catch (err) {
      console.error("FAIL: happy path threw:", err);
      process.exit(1);
    }
    assert(event.event === "message.received", "happy path: event.event === 'message.received'");
    assert(event.data.message_id === "msg_1", "happy path: event.data.message_id === 'msg_1'");
    assert(event.data.account_id === "acc_1", "happy path: event.data.account_id === 'acc_1'");
  }

  // 2. Replay detection — timestamp 10 minutes in the past (600s > 300s default window)
  {
    const oldT = Math.floor(Date.now() / 1000) - 600;
    const header = makeHeader(BODY, SECRET, oldT);
    let caughtReason = null;
    try {
      await constructEvent(BODY, header, SECRET, { replayWindowSecs: 300 });
    } catch (err) {
      if (err instanceof WebhookSignatureError) {
        caughtReason = err.reason;
      } else {
        console.error("FAIL: replay threw unexpected error:", err);
        process.exit(1);
      }
    }
    assert(caughtReason === "replay_detected", `replay detection: reason === 'replay_detected' (got '${caughtReason}')`);
  }

  // 3. Future-skew guard — timestamp 10 minutes in the future
  {
    const futureT = Math.floor(Date.now() / 1000) + 600;
    const header = makeHeader(BODY, SECRET, futureT);
    let caughtReason = null;
    try {
      await constructEvent(BODY, header, SECRET, { replayWindowSecs: 300 });
    } catch (err) {
      if (err instanceof WebhookSignatureError) {
        caughtReason = err.reason;
      } else {
        console.error("FAIL: future-skew threw unexpected error:", err);
        process.exit(1);
      }
    }
    assert(caughtReason === "replay_detected", `future-skew guard: reason === 'replay_detected' (got '${caughtReason}')`);
  }

  // 4. Invalid signature
  {
    const t = Math.floor(Date.now() / 1000);
    const header = `t=${t},v1=badbadbadbadbadbadbadbadbadbadbadbadbadbadbadbadbadbadbadbadbadb`;
    let caughtReason = null;
    try {
      await constructEvent(BODY, header, SECRET, { replayWindowSecs: 300 });
    } catch (err) {
      if (err instanceof WebhookSignatureError) {
        caughtReason = err.reason;
      } else {
        console.error("FAIL: invalid sig threw unexpected error:", err);
        process.exit(1);
      }
    }
    assert(caughtReason === "invalid_signature", `invalid signature: reason === 'invalid_signature' (got '${caughtReason}')`);
  }

  // 5. Malformed header
  {
    let caughtReason = null;
    try {
      await constructEvent(BODY, "garbage", SECRET);
    } catch (err) {
      if (err instanceof WebhookSignatureError) {
        caughtReason = err.reason;
      } else {
        console.error("FAIL: malformed header threw unexpected error:", err);
        process.exit(1);
      }
    }
    assert(caughtReason === "malformed_header", `malformed header: reason === 'malformed_header' (got '${caughtReason}')`);
  }

  // 6. Verified signature over an unparseable body: must NOT blame the header
  //    or the secret, both of which have just been proven correct.
  {
    const junk = "this is not a curviate event";
    const t = Math.floor(Date.now() / 1000);
    const header = makeHeader(junk, SECRET, t);
    let caught = null;
    try {
      await constructEvent(junk, header, SECRET, { replayWindowSecs: 300 });
    } catch (err) {
      caught = err instanceof WebhookSignatureError ? err : null;
    }
    assert(
      caught !== null && caught.reason === "malformed_payload",
      `verified but unparseable: reason === 'malformed_payload' (got '${caught && caught.reason}')`,
    );
    const msg = (caught?.message ?? "").toLowerCase();
    assert(
      !msg.includes("header") && !msg.includes("secret") && !msg.includes("signature"),
      "verified but unparseable: message does not misdirect at the header or the secret",
    );
  }

  console.log("\nAll dist checks passed.");
}

main().catch((err) => {
  console.error("FAIL: unexpected error:", err);
  process.exit(1);
});
