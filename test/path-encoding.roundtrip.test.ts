/**
 * Path-parameter round-trip matrix.
 *
 * The guard in path-encoding.guard.test.ts proves every interpolation is
 * SYNTACTICALLY encoded. This file proves the encoding is SEMANTICALLY
 * lossless: every id shape the SDK already carries has to arrive at the server
 * as the same value it does today, or the fix breaks working callers.
 *
 * Evidence standard: a real `http.createServer` on loopback captures
 * `req.url` — the exact request-target bytes Node's HTTP parser read off the
 * socket — and every assertion is made against that captured request, never
 * against a return value. A return value can be a 200 over a request that went
 * somewhere else entirely, which is precisely the bug being fixed.
 *
 * The "server view" column re-derives the parameter the way a router does
 * (split the path on `/`, `decodeURIComponent` the segment) rather than
 * trusting the SDK's own encoder to be its own oracle.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { http, passthrough } from "msw";
import { Curviate } from "../src/index.js";
import { server as mswServer } from "./msw/server.js";

// ─── The request sink ────────────────────────────────────────────────────────

interface Captured {
  method: string;
  /** Raw request target exactly as it arrived on the socket. */
  rawUrl: string;
}

let sink: Server;
let baseUrl: string;
const captured: Captured[] = [];

beforeAll(async () => {
  sink = createServer((req, res) => {
    captured.push({ method: req.method ?? "", rawUrl: req.url ?? "" });
    res.writeHead(200, { "content-type": "application/json" });
    res.end("{}");
  });
  await new Promise<void>((resolve) => sink.listen(0, "127.0.0.1", resolve));
  const addr = sink.address() as AddressInfo;
  baseUrl = `http://127.0.0.1:${addr.port}`;
});

afterAll(async () => {
  await new Promise<void>((resolve, reject) =>
    sink.close((err) => (err ? reject(err) : resolve())),
  );
});

beforeEach(() => {
  // test/setup.ts starts MSW with onUnhandledRequest:"error"; let the sink's
  // origin through so these requests are really sent over TCP rather than
  // intercepted in-process.
  mswServer.use(http.all(`${baseUrl}/*`, () => passthrough()));
  captured.length = 0;
});

function client(): Curviate {
  return new Curviate({ apiKey: "cvt_test_roundtrip", baseUrl });
}

function lastRequest(): Captured {
  const last = captured.at(-1);
  if (last === undefined) {
    throw new Error("The sink captured no request. Nothing was sent, so nothing is proven.");
  }
  return last;
}

/**
 * Re-derive what a router sees: split the captured path on `/` and decode each
 * segment, exactly as a path-parameter router does. Asserting on the WHOLE
 * segment list rather than one index pins three things at once — the value, the
 * position, and the segment count — so an id that silently adds a segment
 * cannot pass by shifting everything one place along.
 */
function serverSegments(rawUrl: string): string[] {
  const pathOnly = rawUrl.split("?")[0] ?? "";
  return pathOnly.split("/").slice(1).map(decodeURIComponent);
}

// ─── The id-shape matrix ─────────────────────────────────────────────────────

/**
 * Every id shape the published SDK already carries. `label` is what a failure
 * report calls the shape; `id` is a realistic value for it.
 */
const ID_SHAPES: ReadonlyArray<{ label: string; id: string }> = [
  { label: "LinkedIn activity URN (colons)", id: "urn:li:activity:7467457289336262656" },
  {
    label: "LinkedIn URN with parens and comma",
    id: "urn:li:fsd_profile:(ACoAABc1d2E3f4G5h6,NAME_SEARCH)",
  },
  { label: "share URN", id: "urn:li:share:7467457289336262656" },
  { label: "chat id with = and -", id: "aBcD-1234_efGH==" },
  { label: "base64 with padding", id: "YWJjL2RlZitnaGk=" },
  { label: "base64 with slash and plus", id: "a/b+c=" },
  { label: "base64url", id: "YWJjX2RlZi1naGkxMjM" },
  { label: "bare integer", id: "7467457289336262656" },
  { label: "acc_ prefixed id", id: "acc_01JQ8Z9ABCDEFGHJKMNPQRS" },
  { label: "public slug", id: "niki-mueller-1a2b3c" },
  { label: "slug with unicode", id: "jose-muller-schafer" },
];

/**
 * Shapes that are the POINT of the fix: today they restructure the URL.
 * They are not "existing id shapes that must round-trip unchanged on the wire",
 * they are the shapes whose wire form must CHANGE.
 */
const HOSTILE_SHAPES: ReadonlyArray<{ label: string; id: string }> = [
  {
    label: "share URL with scheme, slashes and query",
    id: "https://www.linkedin.com/posts/niki-mueller-1a2b3c-activity-7467457289336262656-q_vQ?utm_source=share",
  },
  { label: "traversal to another endpoint", id: "x/../../../v1/accounts" },
  { label: "bare traversal", id: "../../accounts" },
  { label: "fragment injection", id: "123#frag" },
  { label: "query injection", id: "123?limit=999" },
  { label: "segment injection", id: "123/reactions" },
];

const ACCOUNT = "acc_01JQ8Z9ABCDEFGHJKMNPQRS";

// ─── AC3: every existing id shape round-trips ────────────────────────────────

describe("round-trip: account-scoped single path parameter (posts.get)", () => {
  for (const { label, id } of ID_SHAPES) {
    it(`${label} reaches the server as the same value`, async () => {
      await client().account(ACCOUNT).posts.get(id);
      const req = lastRequest();

      expect(serverSegments(req.rawUrl), `raw wire target was ${req.rawUrl}`).toEqual([
        "v1",
        ACCOUNT,
        "posts",
        id,
      ]);
    });
  }
});

describe("round-trip: two path parameters in one template (messaging.getMessage)", () => {
  for (const { label, id } of ID_SHAPES) {
    it(`${label} round-trips in both positions`, async () => {
      await client().account(ACCOUNT).messaging.getMessage(id, id);
      const req = lastRequest();

      expect(serverSegments(req.rawUrl), `raw wire target was ${req.rawUrl}`).toEqual([
        "v1",
        ACCOUNT,
        "chats",
        id,
        "messages",
        id,
      ]);
    });
  }
});

describe("round-trip: root-scoped path parameter (accounts.get)", () => {
  for (const { label, id } of ID_SHAPES) {
    it(`${label} round-trips on a root-scoped path`, async () => {
      await client().accounts.get(id);
      const req = lastRequest();

      expect(serverSegments(req.rawUrl), `raw wire target was ${req.rawUrl}`).toEqual([
        "v1",
        "accounts",
        id,
      ]);
    });
  }
});

describe("round-trip: the bound account id itself", () => {
  for (const { label, id } of ID_SHAPES) {
    it(`${label} round-trips as the account-scoping segment`, async () => {
      await client().account(id).posts.get("urn:li:activity:1");
      const req = lastRequest();

      expect(serverSegments(req.rawUrl), `raw wire target was ${req.rawUrl}`).toEqual([
        "v1",
        id,
        "posts",
        "urn:li:activity:1",
      ]);
    });
  }
});

// ─── AC1/security: the hostile shapes cannot restructure the URL ─────────────

describe("hostile path parameters stay inside their segment", () => {
  for (const { label, id } of HOSTILE_SHAPES) {
    it(`${label} cannot leave the post-id segment`, async () => {
      await client().account(ACCOUNT).posts.get(id);
      const req = lastRequest();

      expect(serverSegments(req.rawUrl), `raw wire target was ${req.rawUrl}`).toEqual([
        "v1",
        ACCOUNT,
        "posts",
        id,
      ]);
      // Nothing the caller put in the id may become a query string.
      expect(req.rawUrl.includes("?"), `id leaked into the query: ${req.rawUrl}`).toBe(false);
    });
  }

  it("an account selector shaped like a traversal cannot retarget the request", async () => {
    // The reported injection: `--account 'x/../../../v1/accounts'` turned a
    // chat write into PATCH /v1/accounts/chats/chat_1.
    await client().account("x/../../../v1/accounts").messaging.markChatRead("chat_1", {});
    const req = lastRequest();

    expect(req.rawUrl).toBe("/v1/x%2F..%2F..%2F..%2Fv1%2Faccounts/chats/chat_1");
    expect(serverSegments(req.rawUrl)).toEqual([
      "v1",
      "x/../../../v1/accounts",
      "chats",
      "chat_1",
    ]);
    expect(req.method).toBe("PATCH");
  });

  it("a post id shaped like a traversal cannot retarget the request", async () => {
    await client().account(ACCOUNT).posts.delete("../../../v1/accounts/acc_victim");
    const req = lastRequest();

    expect(req.rawUrl).toBe(
      `/v1/${ACCOUNT}/posts/..%2F..%2F..%2Fv1%2Faccounts%2Facc_victim`,
    );
    expect(req.method).toBe("DELETE");
  });
});

// ─── The wire-format delta, stated as an assertion ───────────────────────────

describe("wire-format delta against the raw-interpolation behaviour", () => {
  /** What the pre-fix SDK would have produced for the same call. */
  function preFixWireTarget(accountId: string, postId: string): string {
    return new URL(`/v1/${accountId}/posts/${postId}`, "http://x").pathname;
  }

  it("leaves ASCII-safe ids byte-identical on the wire", async () => {
    // Shapes made only of unreserved characters are untouched: an existing
    // caller sees literally the same request target as before.
    const unchanged = ["7467457289336262656", "acc_01JQ8Z9ABCDEF", "niki-mueller-1a2b3c"];
    for (const id of unchanged) {
      await client().account(ACCOUNT).posts.get(id);
      expect(lastRequest().rawUrl).toBe(preFixWireTarget(ACCOUNT, id));
    }
  });

  it("changes the wire bytes for reserved characters while preserving the decoded value", async () => {
    // These DO change on the wire; the decoded value a router extracts does not.
    const reencoded: ReadonlyArray<[string, string]> = [
      ["urn:li:activity:123", "/v1/{acc}/posts/urn%3Ali%3Aactivity%3A123"],
      ["a,b", "/v1/{acc}/posts/a%2Cb"],
      ["a=b", "/v1/{acc}/posts/a%3Db"],
      ["a+b", "/v1/{acc}/posts/a%2Bb"],
    ];
    for (const [id, expectedTemplate] of reencoded) {
      await client().account(ACCOUNT).posts.get(id);
      const req = lastRequest();
      expect(req.rawUrl).toBe(expectedTemplate.replace("{acc}", ACCOUNT));
      expect(req.rawUrl).not.toBe(preFixWireTarget(ACCOUNT, id));
      expect(serverSegments(req.rawUrl)).toEqual(["v1", ACCOUNT, "posts", id]);
    }
  });

  it("double-encodes an id the caller pre-encoded, the one breaking change", async () => {
    // Documented, not accidental. Before the fix, a caller who worked around
    // the bug by pre-encoding got `urn:li:activity:1` at the server. Now the
    // SDK owns the encoding, so a pre-encoded id is treated as a literal value
    // containing percent signs, which is what it now is.
    await client().account(ACCOUNT).posts.get("urn%3Ali%3Aactivity%3A1");
    const req = lastRequest();

    expect(req.rawUrl).toBe(`/v1/${ACCOUNT}/posts/urn%253Ali%253Aactivity%253A1`);
    expect(serverSegments(req.rawUrl)).toEqual([
      "v1",
      ACCOUNT,
      "posts",
      "urn%3Ali%3Aactivity%3A1",
    ]);
    // The caller must now pass the decoded id; that is the documented migration.
    await client().account(ACCOUNT).posts.get("urn:li:activity:1");
    expect(serverSegments(lastRequest().rawUrl)).toEqual([
      "v1",
      ACCOUNT,
      "posts",
      "urn:li:activity:1",
    ]);
  });
});
