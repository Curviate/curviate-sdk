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
import { Curviate, CurviateError } from "../src/index.js";
import { server as mswServer } from "./msw/server.js";

// ─── The request sink ────────────────────────────────────────────────────────

interface Captured {
  method: string;
  /** Raw request target exactly as it arrived on the socket. */
  rawUrl: string;
  /** Raw request body exactly as it arrived on the socket. */
  rawBody: string;
}

let sink: Server;
let baseUrl: string;
const captured: Captured[] = [];

beforeAll(async () => {
  sink = createServer((req, res) => {
    const chunks: Buffer[] = [];
    req.on("data", (c: Buffer) => chunks.push(c));
    req.on("end", () => {
      captured.push({
        method: req.method ?? "",
        rawUrl: req.url ?? "",
        rawBody: Buffer.concat(chunks).toString("utf8"),
      });
      res.writeHead(200, { "content-type": "application/json" });
      res.end("{}");
    });
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

// ─── Dot segments: the one class percent-encoding cannot close ───────────────

describe("a path parameter that is entirely dot segments is rejected", () => {
  // encodeURIComponent leaves `.` unescaped, and `.` / `..` are a complete
  // dot-segment grammar that `new URL(path, baseUrl)` resolves BEFORE the
  // request is sent. So encoding alone does not stop them:
  //   posts.get("..")             -> GET  /v1/{acct}/
  //   createProjectJob("..", ...) -> POST /v1/{acct}/recruiter/jobs   (a WRITE)
  //   account("..")               -> escapes /v1 entirely
  // `%2E` is not a fix either: the URL parser decodes before it detects dot
  // segments. Rejection is the only close, and it costs nothing because no
  // LinkedIn id, URN or slug is ever "." or "..".
  //
  // The empty string is in the same family and is included deliberately: it
  // produces a BYTE-IDENTICAL request target to "." (`/v1/{acct}/posts/`), so
  // rejecting "." while admitting "" would leave a one-character bypass.
  const REJECTED = [".", "..", ""];

  async function expectRejected(label: string, run: () => Promise<unknown>): Promise<void> {
    const before = captured.length;
    await expect(run(), label).rejects.toThrowError(CurviateError);
    await run().catch((err: unknown) => {
      const e = err as CurviateError;
      expect(e.code, label).toBe("INVALID_REQUEST");
      expect(e.userFixable, label).toBe(true);
      expect(e.retryLikelyToSucceed, label).toBe(false);
    });
    // The decisive assertion: nothing was sent. A rejected promise over a
    // request that still went out would be worse than no guard at all.
    expect(captured.length, `${label}: a request was sent anyway`).toBe(before);
  }

  for (const value of REJECTED) {
    it(`rejects ${JSON.stringify(value)} as a single path parameter`, async () => {
      await expectRejected(`posts.get(${JSON.stringify(value)})`, () =>
        client().account(ACCOUNT).posts.get(value),
      );
    });

    it(`rejects ${JSON.stringify(value)} in a write with a fixed suffix`, async () => {
      await expectRejected(`jobs.publish(${JSON.stringify(value)})`, () =>
        client().account(ACCOUNT).jobs.publish(value, {} as never),
      );
    });

    it(`rejects ${JSON.stringify(value)} in either slot of a two-parameter template`, async () => {
      await expectRejected("getMessage(bad, ok)", () =>
        client().account(ACCOUNT).messaging.getMessage(value, "msg_1"),
      );
      await expectRejected("getMessage(ok, bad)", () =>
        client().account(ACCOUNT).messaging.getMessage("chat_1", value),
      );
    });

    it(`rejects ${JSON.stringify(value)} as the bound account selector`, async () => {
      if (value === "") {
        // Pre-existing, documented behaviour: `account("")` throws
        // synchronously from the factory, before any namespace is built. Left
        // as it is, and asserted here so the empty-account path is covered by
        // this suite rather than assumed.
        expect(() => client().account("")).toThrowError(CurviateError);
        expect(captured.length).toBe(0);
        return;
      }
      await expectRejected(`account(${JSON.stringify(value)})`, () =>
        client().account(value).posts.get("p1"),
      );
    });

    it(`rejects ${JSON.stringify(value)} carried in an object argument`, async () => {
      await expectRejected("saveAccount({list_id})", () =>
        client()
          .account(ACCOUNT)
          .salesNavigator.saveAccount({ list_id: value, company_id: "c" } as never),
      );
    });
  }

  it("does not reject the near misses, which are ordinary values", async () => {
    // Only `.` and `..` are dot segments. Everything below is a normal segment
    // that the URL parser leaves alone, so rejecting it would break a caller.
    const ALLOWED = ["...", "....", ".a", "a.", "a..b", "1.2.3", ".hidden", "..a", " "];
    for (const value of ALLOWED) {
      await client().account(ACCOUNT).posts.get(value);
      expect(serverSegments(lastRequest().rawUrl), `rejected a valid id: ${value}`).toEqual([
        "v1",
        ACCOUNT,
        "posts",
        value,
      ]);
    }
  });

  it("does not reject a caller-supplied literal %2e, which is already safe", async () => {
    // `%2e` IS a dot segment to the URL parser, but only when it arrives raw.
    // Encoding turns it into `%252e`, so it is inert; rejecting it would refuse
    // a value that works.
    for (const value of ["%2e", "%2E", "%2e%2e", ".%2e"]) {
      await client().account(ACCOUNT).posts.get(value);
      const req = lastRequest();
      expect(req.rawUrl).toBe(`/v1/${ACCOUNT}/posts/${encodeURIComponent(value)}`);
      expect(serverSegments(req.rawUrl)).toEqual(["v1", ACCOUNT, "posts", value]);
    }
  });
});

// ─── Path parameters that arrive DESTRUCTURED out of an object argument ──────

describe("path parameters carried in an object argument, not a leading positional", () => {
  // salesNavigator.saveAccount/saveLead take a single object and destructure
  // `list_id` out of it into the path. Any guard keyed on ARGUMENT POSITION is
  // blind to these two: a caller-supplied selector reached the URL through a
  // shape the guard never inspected, and the fixed `/save` suffix could be
  // truncated with a `#` to make it an arbitrary POST target. The encoding here
  // is keyed on the path TEMPLATE, so where the value came from is irrelevant,
  // and these tests are what says so out loud.
  const EXPLOITS: ReadonlyArray<{ label: string; listId: string; mustNotHit: string }> = [
    {
      label: "traversal + fragment truncation into a message send",
      listId: "../../chats/chat_ABC/messages#",
      mustNotHit: "/chats/chat_ABC/messages",
    },
    {
      label: "traversal + fragment truncation into the webhooks collection",
      listId: "../../../webhooks#",
      mustNotHit: "/v1/webhooks",
    },
    { label: "query injection", listId: "x?evil=1", mustNotHit: "evil=1" },
  ];

  for (const { label, listId, mustNotHit } of EXPLOITS) {
    it(`saveAccount: ${label} stays inside the list_id segment`, async () => {
      await client().account(ACCOUNT).salesNavigator.saveAccount({
        list_id: listId,
        company_id: "urn:li:organization:1",
      } as never);
      const req = lastRequest();

      expect(serverSegments(req.rawUrl), `raw wire target was ${req.rawUrl}`).toEqual([
        "v1",
        ACCOUNT,
        "sales-navigator",
        "account-lists",
        listId,
        "save",
      ]);
      // The fixed suffix survives: nothing the caller supplied may truncate it.
      expect(req.rawUrl.endsWith("/save"), `suffix truncated: ${req.rawUrl}`).toBe(true);
      expect(req.rawUrl.includes(mustNotHit), `reached ${mustNotHit}: ${req.rawUrl}`).toBe(false);
      expect(req.rawUrl.includes("?"), `query injected: ${req.rawUrl}`).toBe(false);
      expect(req.rawUrl.includes("#"), `fragment injected: ${req.rawUrl}`).toBe(false);
    });

    it(`saveLead: ${label} stays inside the list_id segment`, async () => {
      await client().account(ACCOUNT).salesNavigator.saveLead({
        list_id: listId,
        user_id: "urn:li:member:1",
      } as never);
      const req = lastRequest();

      expect(serverSegments(req.rawUrl), `raw wire target was ${req.rawUrl}`).toEqual([
        "v1",
        ACCOUNT,
        "sales-navigator",
        "lead-lists",
        listId,
        "save",
      ]);
      expect(req.rawUrl.endsWith("/save"), `suffix truncated: ${req.rawUrl}`).toBe(true);
      expect(req.rawUrl.includes(mustNotHit), `reached ${mustNotHit}: ${req.rawUrl}`).toBe(false);
      expect(req.method).toBe("POST");
    });
  }

  it("keeps the rest of the object as the request body", async () => {
    // The destructure must not lose the body while the path is being fixed.
    await client().account(ACCOUNT).salesNavigator.saveAccount({
      list_id: "list_1",
      company_id: "urn:li:organization:42",
    } as never);
    const req = lastRequest();

    expect(JSON.parse(req.rawBody)).toEqual({ company_id: "urn:li:organization:42" });
    expect(req.rawBody).not.toContain("list_id");
  });
});

// ─── Leading strings that are NOT path parameters ────────────────────────────

describe("a leading string argument that is a BODY field is never encoded", () => {
  // Encoding belongs where a value BECOMES A PATH SEGMENT, never at an argument
  // position. These four methods take a leading string that travels in the JSON
  // body; percent-encoding them by position would corrupt a working call, and
  // posts.save specifically accepts a share URL the API normalises itself.
  it("posts.save sends a share URL verbatim in the body, on a static path", async () => {
    const shareUrl =
      "https://www.linkedin.com/posts/niki-mueller-1a2b3c-activity-7467457289336262656-q_vQ?utm_source=share";
    await client().account(ACCOUNT).posts.save(shareUrl);
    const req = lastRequest();

    expect(serverSegments(req.rawUrl)).toEqual(["v1", ACCOUNT, "saved-posts"]);
    expect(JSON.parse(req.rawBody)).toEqual({ post_id: shareUrl });
  });

  it("posts.save sends a URN verbatim, with no percent-encoding applied", async () => {
    await client().account(ACCOUNT).posts.save("urn:li:activity:7467457289336262656");
    const req = lastRequest();

    expect(req.rawBody).toContain("urn:li:activity:7467457289336262656");
    expect(req.rawBody).not.toContain("%3A");
  });

  for (const method of ["solveCheckpoint", "requestCheckpoint", "pollCheckpoint"] as const) {
    it(`auth.${method} sends the account id verbatim in the body, on a static path`, async () => {
      const accountId = "acc_01JQ8Z9/with:reserved,chars";
      const auth = client().auth;
      if (method === "solveCheckpoint") {
        await auth.solveCheckpoint(accountId, { code: "123456" } as never);
      } else {
        await auth[method](accountId);
      }
      const req = lastRequest();

      expect(req.rawUrl).toBe(
        `/v1/auth/checkpoint/${method === "solveCheckpoint" ? "solve" : method === "requestCheckpoint" ? "request" : "poll"}`,
      );
      expect(JSON.parse(req.rawBody).account_id).toBe(accountId);
      expect(req.rawBody).not.toContain("%2F");
    });
  }
});

// ─── card_urn: encoded exactly once, byte-identical to the previous form ─────

describe("notification card urns are encoded exactly once", () => {
  // These two sites were already hand-wrapped in encodeURIComponent before the
  // sweep. The tag now encodes every substitution, so the wrapper was removed:
  // leaving it would double-encode a value that legitimately carries `/`, `:`
  // and parentheses, breaking a call that works today.
  const CARD_URN = "urn:li:fsd_notificationCard:(ACoAAB1c2d/3e4f,NOTIFICATIONS,urn:li:activity:123)";

  it("delete produces the same bytes the pre-sweep encodeURIComponent produced", async () => {
    await client().account(ACCOUNT).notifications.delete(CARD_URN);
    const req = lastRequest();

    // The exact pre-sweep expression, evaluated here as an independent oracle.
    expect(req.rawUrl).toBe(
      `/v1/${ACCOUNT}/notifications/${encodeURIComponent(CARD_URN)}`,
    );
    expect(serverSegments(req.rawUrl)).toEqual(["v1", ACCOUNT, "notifications", CARD_URN]);
    // Double-encoding would show as %25 (an encoded percent sign).
    expect(req.rawUrl.includes("%25"), `double-encoded: ${req.rawUrl}`).toBe(false);
  });

  it("showLess produces the same bytes, with its suffix intact", async () => {
    await client().account(ACCOUNT).notifications.showLess(CARD_URN);
    const req = lastRequest();

    expect(req.rawUrl).toBe(
      `/v1/${ACCOUNT}/notifications/${encodeURIComponent(CARD_URN)}/show-less`,
    );
    expect(serverSegments(req.rawUrl)).toEqual([
      "v1",
      ACCOUNT,
      "notifications",
      CARD_URN,
      "show-less",
    ]);
    expect(req.rawUrl.includes("%25"), `double-encoded: ${req.rawUrl}`).toBe(false);
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

  it("no longer lets the URL parser silently delete a control character", async () => {
    // Tab, CR and LF were STRIPPED by the URL parser, so an id carrying a
    // stray one accidentally matched the intended resource. It is now encoded
    // and will simply miss. Documented as a delta because the old behaviour
    // was an accidental cleanup some caller may be leaning on.
    for (const [id, encoded] of [
      ["a\tb", "a%09b"],
      ["a\rb", "a%0Db"],
      ["a\nb", "a%0Ab"],
    ] as const) {
      await client().account(ACCOUNT).posts.get(id);
      const req = lastRequest();
      expect(req.rawUrl).toBe(`/v1/${ACCOUNT}/posts/${encoded}`);
      expect(req.rawUrl).not.toBe(preFixWireTarget(ACCOUNT, id));
      expect(serverSegments(req.rawUrl)).toEqual(["v1", ACCOUNT, "posts", id]);
    }
  });

  it("no longer substitutes a caller value that contains the literal {account_id}", async () => {
    // `{account_id}` is how an account-scoped path template is built, and the
    // substitution used to rewrite a raw id that happened to contain it.
    const id = "p{account_id}x";
    await client().account(ACCOUNT).posts.get(id);
    const req = lastRequest();

    expect(req.rawUrl).toBe(`/v1/${ACCOUNT}/posts/p%7Baccount_id%7Dx`);
    expect(serverSegments(req.rawUrl)).toEqual(["v1", ACCOUNT, "posts", id]);
    // The pre-fix path would have injected the account id into the caller value.
    expect(req.rawUrl).not.toContain(`p${ACCOUNT}x`);
  });

  it("changes the wire for EVERY call through an account scope, not one method", async () => {
    // The bound selector is encoded once per request, so a reserved character
    // in it moves the bytes of every method reached through that scope.
    const acc = client().account("acc:with:colons");
    await acc.posts.get("p1");
    expect(lastRequest().rawUrl).toBe("/v1/acc%3Awith%3Acolons/posts/p1");
    await acc.messaging.listChats();
    expect(lastRequest().rawUrl).toBe("/v1/acc%3Awith%3Acolons/chats");
    await acc.profile.ssi();
    expect(lastRequest().rawUrl).toBe("/v1/acc%3Awith%3Acolons/profile/ssi");
  });

  it("stringifies a non-string runtime value before encoding it", async () => {
    // The signature says string, but a JS consumer can pass anything. An array
    // stringifies to "a,b", and the comma is now encoded.
    await client()
      .account(ACCOUNT)
      .posts.get(["a", "b"] as unknown as string);
    const req = lastRequest();

    expect(req.rawUrl).toBe(`/v1/${ACCOUNT}/posts/a%2Cb`);
    expect(serverSegments(req.rawUrl)).toEqual(["v1", ACCOUNT, "posts", "a,b"]);
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
