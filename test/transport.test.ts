// HTTP transport: serialisation, parsing, retry, backoff, rate-limit,
// timeout, multipart, binary. MSW is the fast (no-server) seam.
import { http, HttpResponse } from "msw";
import { describe, expect, it, vi } from "vitest";
import { server } from "./msw/server.js";
import { execute } from "../src/transport.js";
import { CurviateError, isCurviateError, ERROR_CODES } from "../src/errors.js";

const BASE = "https://app.curviate.test";

/** Common transport options for deterministic tests: no jitter, no real delay. */
function det(overrides: Record<string, unknown> = {}) {
  return {
    apiKey: "k",
    baseUrl: BASE,
    timeout: 30_000,
    maxRetries: 3,
    _jitterFn: () => 0,
    _sleepFn: vi.fn(async () => {}), // never actually waits
    ...overrides,
  };
}

describe("request serialisation", () => {
  // GET: no body, auth header present, no content-type.
  it("GET sends no body, an Authorization header, and no Content-Type", async () => {
    let captured: Request | undefined;
    server.use(
      http.get(`${BASE}/v1/accounts`, ({ request }) => {
        captured = request.clone();
        return HttpResponse.json({ items: [] });
      }),
    );
    await execute("GET", "/v1/accounts", det({ apiKey: "secret_k" }));
    expect(captured?.method).toBe("GET");
    expect(captured?.headers.get("authorization")).toBe("Bearer secret_k");
    expect(captured?.headers.get("content-type")).toBeNull();
  });

  // POST JSON: content-type + JSON.stringify body.
  it("POST JSON sets application/json and stringifies the body", async () => {
    let body: unknown;
    let ct: string | null = null;
    server.use(
      http.post(`${BASE}/v1/accounts/link`, async ({ request }) => {
        ct = request.headers.get("content-type");
        body = await request.json();
        return HttpResponse.json({ id: "acc_1" });
      }),
    );
    await execute("POST", "/v1/accounts/link", det({ body: { username: "u" } }));
    expect(ct).toBe("application/json");
    expect(body).toEqual({ username: "u" });
  });

  // POST FormData: multipart content-type, no JSON.
  it("POST FormData omits Content-Type so the runtime sets the boundary", async () => {
    let ct: string | null = null;
    server.use(
      http.post(`${BASE}/v1/chats`, ({ request }) => {
        ct = request.headers.get("content-type");
        return HttpResponse.json({ id: "c1" });
      }),
    );
    const fd = new FormData();
    fd.append("text", "hi");
    await execute("POST", "/v1/chats", det({ body: fd }));
    expect(ct).toMatch(/^multipart\/form-data/);
    expect(ct).not.toContain("application/json");
  });

  // GET query params appended via URLSearchParams.
  it("GET appends query params to the URL", async () => {
    let url: string | undefined;
    server.use(
      http.get(`${BASE}/v1/chats`, ({ request }) => {
        url = request.url;
        return HttpResponse.json({ items: [] });
      }),
    );
    await execute("GET", "/v1/chats", det({ query: { account_id: "acc_123", limit: 10 } }));
    const parsed = new URL(url!);
    expect(parsed.searchParams.get("account_id")).toBe("acc_123");
    expect(parsed.searchParams.get("limit")).toBe("10");
  });
});

describe("response parsing", () => {
  // JSON success.
  it("parses a 200 application/json response", async () => {
    server.use(
      http.get(`${BASE}/v1/accounts`, () => HttpResponse.json({ items: [{ id: "a" }] })),
    );
    const out = await execute<{ items: { id: string }[] }>("GET", "/v1/accounts", det());
    expect(out.items[0]!.id).toBe("a");
  });

  // binary octet-stream → ArrayBuffer.
  it("returns an ArrayBuffer for application/octet-stream", async () => {
    server.use(
      http.get(`${BASE}/v1/messages/m1/attachments/a1`, () =>
        HttpResponse.arrayBuffer(new Uint8Array([1, 2, 3]).buffer, {
          headers: { "Content-Type": "application/octet-stream" },
        }),
      ),
    );
    const out = await execute<ArrayBuffer>(
      "GET",
      "/v1/messages/m1/attachments/a1",
      det(),
    );
    expect(out).toBeInstanceOf(ArrayBuffer);
    expect(out.byteLength).toBe(3);
  });
});

describe("error mapping", () => {
  // 401 maps to CurviateError with code + httpStatus.
  it("maps a 401 error envelope to CurviateError", async () => {
    server.use(
      http.get(`${BASE}/v1/accounts`, () =>
        HttpResponse.json(
          {
            code: "UNAUTHORIZED",
            message: "Invalid key.",
            user_fixable: false,
            retry_likely_to_succeed: false,
          },
          { status: 401 },
        ),
      ),
    );
    const err = await execute("GET", "/v1/accounts", det({ maxRetries: 0 })).catch((e) => e);
    expect(isCurviateError(err)).toBe(true);
    expect((err as CurviateError).code).toBe("UNAUTHORIZED");
    expect((err as CurviateError).httpStatus).toBe(401);
    expect((err as CurviateError).userFixable).toBe(false);
  });

  // 500 with non-JSON body → INTERNAL.
  it("wraps a 500 non-JSON body as INTERNAL", async () => {
    server.use(
      http.get(`${BASE}/v1/accounts`, () =>
        new HttpResponse("upstream blew up", {
          status: 500,
          headers: { "Content-Type": "text/plain" },
        }),
      ),
    );
    const err = await execute("GET", "/v1/accounts", det({ maxRetries: 0 })).catch((e) => e);
    expect(isCurviateError(err)).toBe(true);
    expect((err as CurviateError).code).toBe("INTERNAL");
    expect((err as CurviateError).httpStatus).toBe(500);
  });

  // network failure → INTERNAL with undefined httpStatus.
  it("wraps a fetch network failure as INTERNAL with undefined httpStatus", async () => {
    server.use(
      http.get(`${BASE}/v1/accounts`, () => HttpResponse.error()),
    );
    const err = await execute("GET", "/v1/accounts", det({ maxRetries: 0 })).catch((e) => e);
    expect(isCurviateError(err)).toBe(true);
    expect((err as CurviateError).code).toBe("INTERNAL");
    expect((err as CurviateError).httpStatus).toBeUndefined();
  });

  // the apiKey never appears in a thrown or serialized transport error.
  it("never leaks the apiKey in a thrown error", async () => {
    server.use(
      http.get(`${BASE}/v1/accounts`, () =>
        HttpResponse.json(
          { code: "UNAUTHORIZED", message: "no", user_fixable: false, retry_likely_to_succeed: false },
          { status: 401 },
        ),
      ),
    );
    const err = await execute("GET", "/v1/accounts", det({ apiKey: "super_secret_key", maxRetries: 0 })).catch(
      (e) => e,
    );
    const serialized = JSON.stringify(err);
    expect(serialized).not.toContain("super_secret_key");
    expect(serialized).not.toContain("Bearer");
  });
});

describe("retry logic", () => {
  // GET retries on 500 then succeeds; exactly 3 fetches.
  it("retries a GET on 500 and returns the eventual 200 (3 fetches)", async () => {
    let calls = 0;
    server.use(
      http.get(`${BASE}/v1/accounts`, () => {
        calls += 1;
        if (calls < 3) {
          return HttpResponse.json(
            { code: "INTERNAL", message: "x", user_fixable: false, retry_likely_to_succeed: true },
            { status: 500 },
          );
        }
        return HttpResponse.json({ items: [] });
      }),
    );
    const out = await execute<{ items: unknown[] }>("GET", "/v1/accounts", det());
    expect(out.items).toEqual([]);
    expect(calls).toBe(3);
  });

  // POST is NOT auto-retried; exactly 1 fetch.
  it("does not retry a POST on 500 (1 fetch, throws)", async () => {
    let calls = 0;
    server.use(
      http.post(`${BASE}/v1/accounts/link`, () => {
        calls += 1;
        return HttpResponse.json(
          { code: "INTERNAL", message: "x", user_fixable: false, retry_likely_to_succeed: true },
          { status: 500 },
        );
      }),
    );
    const err = await execute("POST", "/v1/accounts/link", det({ body: {} })).catch((e) => e);
    expect(isCurviateError(err)).toBe(true);
    expect(calls).toBe(1);
  });

  // a write that gets 429 + Retry-After waits the delay but
  // does NOT re-fire; it throws with the retry-after surfaced (1 fetch).
  it("waits the Retry-After on a 429 write but does not re-fire it", async () => {
    const sleeps: number[] = [];
    let calls = 0;
    server.use(
      http.post(`${BASE}/v1/accounts/link`, () => {
        calls += 1;
        return HttpResponse.json(
          { code: "RATE_LIMIT_ACCOUNT", message: "slow", user_fixable: false, retry_likely_to_succeed: true },
          { status: 429, headers: { "Retry-After": "7" } },
        );
      }),
    );
    const err = await execute("POST", "/v1/accounts/link", det({
      body: {},
      _sleepFn: async (ms: number) => {
        sleeps.push(ms);
      },
    })).catch((e) => e);
    expect(calls).toBe(1); // never re-fired the write
    expect(sleeps).toEqual([7_000]); // but waited the Retry-After
    expect((err as CurviateError).retryAfterMs).toBe(7_000);
    expect((err as CurviateError).retryLikelyToSucceed).toBe(true);
  });

  // a non-retryable code (404) on a GET throws immediately (1 fetch).
  it("does not retry a non-retryable GET error (404, 1 fetch)", async () => {
    let calls = 0;
    server.use(
      http.get(`${BASE}/v1/accounts/x`, () => {
        calls += 1;
        return HttpResponse.json(
          { code: "ACCOUNT_NOT_FOUND", message: "no", user_fixable: true, retry_likely_to_succeed: false },
          { status: 404 },
        );
      }),
    );
    await execute("GET", "/v1/accounts/x", det()).catch(() => {});
    expect(calls).toBe(1);
  });

  // 409 ACCOUNT_ALREADY_LINKED (duplicate connect) must decode to its own code,
  // not fall back to INTERNAL — and must NOT be retried. Proven on a GET so a
  // retryable INTERNAL fallback would otherwise re-fire up to maxRetries times;
  // real callers only ever see this code from accounts.link/reconnect/solveCheckpoint
  // (all writes, which never auto-retry anyway), so this isolates the code-mapping
  // and RETRYABLE_CODES-exclusion behavior independent of write/read semantics.
  it("maps 409 ACCOUNT_ALREADY_LINKED to its own code and does not retry it (1 fetch)", async () => {
    let calls = 0;
    server.use(
      http.get(`${BASE}/v1/accounts/x`, () => {
        calls += 1;
        return HttpResponse.json(
          {
            code: "ACCOUNT_ALREADY_LINKED",
            message:
              "This LinkedIn account is already linked. Reconnect or disconnect the existing account instead of linking it again.",
            user_fixable: true,
            retry_likely_to_succeed: false,
            retry_hint: { kind: "never" },
          },
          { status: 409 },
        );
      }),
    );
    const err = await execute("GET", "/v1/accounts/x", det()).catch((e) => e);
    expect(isCurviateError(err)).toBe(true);
    expect((err as CurviateError).code).toBe("ACCOUNT_ALREADY_LINKED");
    expect((err as CurviateError).httpStatus).toBe(409);
    expect((err as CurviateError).retryLikelyToSucceed).toBe(false);
    expect(calls).toBe(1);
  });

  // 422 LINKEDIN_OPERATION_NOT_SUPPORTED (permanent LinkedIn platform limitation,
  // e.g. listing a non-self user's following list) must decode to its own code,
  // not fall back to INTERNAL — and must NOT be retried. Proven on a GET so a
  // retryable INTERNAL fallback would otherwise re-fire up to maxRetries times.
  it("maps 422 LINKEDIN_OPERATION_NOT_SUPPORTED to its own code and does not retry it (1 fetch)", async () => {
    let calls = 0;
    server.use(
      http.get(`${BASE}/v1/accounts/x`, () => {
        calls += 1;
        return HttpResponse.json(
          {
            code: "LINKEDIN_OPERATION_NOT_SUPPORTED",
            message: "LinkedIn does not support this operation for the target user.",
            user_fixable: true,
            retry_likely_to_succeed: false,
            retry_hint: { kind: "never" },
          },
          { status: 422 },
        );
      }),
    );
    const err = await execute("GET", "/v1/accounts/x", det()).catch((e) => e);
    expect(isCurviateError(err)).toBe(true);
    expect((err as CurviateError).code).toBe("LINKEDIN_OPERATION_NOT_SUPPORTED");
    expect((err as CurviateError).httpStatus).toBe(422);
    expect((err as CurviateError).userFixable).toBe(true);
    expect((err as CurviateError).retryLikelyToSucceed).toBe(false);
    expect(calls).toBe(1);
  });

  // 409 CONNECTION_REQUEST_CONFLICT (a connect-request to a recipient who already
  // has a pending request from this account, or is already a first-degree
  // connection) must decode to its own code, not fall back to INTERNAL — and must
  // NOT be retried. Real callers see this from invites.send (a write, which never
  // auto-retries); proven here on a GET so a retryable INTERNAL fallback would
  // otherwise re-fire up to maxRetries times, isolating the code-mapping bug.
  it("maps 409 CONNECTION_REQUEST_CONFLICT to its own code and does not retry it (1 fetch)", async () => {
    let calls = 0;
    server.use(
      http.get(`${BASE}/v1/accounts/x`, () => {
        calls += 1;
        return HttpResponse.json(
          {
            code: "CONNECTION_REQUEST_CONFLICT",
            message:
              "A connect-request to this member already exists, or you are already connected. Do not re-send.",
            user_fixable: true,
            retry_likely_to_succeed: false,
            retry_hint: { kind: "never" },
          },
          { status: 409 },
        );
      }),
    );
    const err = await execute("GET", "/v1/accounts/x", det()).catch((e) => e);
    expect(isCurviateError(err)).toBe(true);
    expect((err as CurviateError).code).toBe("CONNECTION_REQUEST_CONFLICT");
    expect((err as CurviateError).httpStatus).toBe(409);
    expect((err as CurviateError).userFixable).toBe(true);
    expect((err as CurviateError).retryLikelyToSucceed).toBe(false);
    expect(calls).toBe(1);
  });
});

describe("backoff computation", () => {
  // deterministic backoff sequence [500, 1000, 2000] with jitter=0.
  it("computes exponential backoff 500/1000/2000 with jitter disabled", async () => {
    const sleeps: number[] = [];
    let calls = 0;
    server.use(
      http.get(`${BASE}/v1/accounts`, () => {
        calls += 1;
        if (calls <= 3) {
          return HttpResponse.json(
            { code: "INTERNAL", message: "x", user_fixable: false, retry_likely_to_succeed: true },
            { status: 500 },
          );
        }
        return HttpResponse.json({ items: [] });
      }),
    );
    await execute("GET", "/v1/accounts", det({
      maxRetries: 3,
      _jitterFn: () => 0,
      _sleepFn: async (ms: number) => {
        sleeps.push(ms);
      },
    })).catch(() => {});
    expect(sleeps).toEqual([500, 1000, 2000]);
  });

  // Retry-After header overrides the backoff formula.
  it("Retry-After header overrides the backoff delay", async () => {
    const sleeps: number[] = [];
    let calls = 0;
    server.use(
      http.get(`${BASE}/v1/accounts`, () => {
        calls += 1;
        if (calls === 1) {
          return HttpResponse.json(
            { code: "RATE_LIMIT_ACCOUNT", message: "slow", user_fixable: false, retry_likely_to_succeed: true },
            { status: 429, headers: { "Retry-After": "42" } },
          );
        }
        return HttpResponse.json({ items: [] });
      }),
    );
    await execute("GET", "/v1/accounts", det({
      _jitterFn: () => 0,
      _sleepFn: async (ms: number) => {
        sleeps.push(ms);
      },
    }));
    expect(sleeps[0]).toBe(42_000);
  });

  // NO `RATE_LIMITED` CASE, deliberately. There was one here, asserting that a
  // 429 `RATE_LIMITED` retried and honoured Retry-After. The API never sends
  // that code: the substrate's own `RATE_LIMITED` is TRANSLATED to
  // `PLATFORM_RATE_LIMIT` (429) in the server's substrate error map before any
  // response is written, so a caller could never receive it and the case was
  // exercising a wire shape that does not exist. The property it checked is
  // covered above by "Retry-After header overrides the backoff delay", on
  // `RATE_LIMIT_ACCOUNT`, which really does arrive. A `RATE_LIMITED` body, were
  // one ever sent, now decodes to `INTERNAL` like any unknown code, which
  // "downgrades an unknown wire code to INTERNAL" below already covers.

  // retry_hint.delay_ms overrides backoff (but Retry-After beats it).
  it("retry_hint.delay_ms overrides the backoff delay", async () => {
    const sleeps: number[] = [];
    let calls = 0;
    server.use(
      http.get(`${BASE}/v1/accounts`, () => {
        calls += 1;
        if (calls === 1) {
          return HttpResponse.json(
            {
              code: "PLATFORM_RATE_LIMIT",
              message: "cool down",
              retry_hint: { kind: "delay", delay_ms: 5000 },
              user_fixable: false,
              retry_likely_to_succeed: true,
            },
            { status: 429 },
          );
        }
        return HttpResponse.json({ items: [] });
      }),
    );
    await execute("GET", "/v1/accounts", det({
      _jitterFn: () => 0,
      _sleepFn: async (ms: number) => {
        sleeps.push(ms);
      },
    }));
    expect(sleeps[0]).toBe(5000);
  });
});

describe("rate-limit surfacing", () => {
  // retryAfterMs populated on a 429 error.
  it("populates retryAfterMs from Retry-After on a thrown 429", async () => {
    server.use(
      http.get(`${BASE}/v1/accounts`, () =>
        HttpResponse.json(
          { code: "RATE_LIMIT_ACCOUNT", message: "slow", user_fixable: false, retry_likely_to_succeed: true },
          { status: 429, headers: { "Retry-After": "10" } },
        ),
      ),
    );
    const err = await execute("GET", "/v1/accounts", det({ maxRetries: 0 })).catch((e) => e);
    expect((err as CurviateError).retryAfterMs).toBe(10_000);
  });

  // Code-review finding on #32 (pre-existing, unrelated to the retry_hint
  // fix): `Number("")` is `0`, which is finite and >= 0, so an empty-but-sent
  // header used to parse as "retry in 0ms" instead of falling back to the
  // same 30s conservative delay the unparseable HTTP-date form already gets.
  it("falls back to the 30s conservative delay on an empty Retry-After header, not 0ms", async () => {
    server.use(
      http.get(`${BASE}/v1/accounts`, () =>
        HttpResponse.json(
          { code: "RATE_LIMIT_ACCOUNT", message: "slow", user_fixable: false, retry_likely_to_succeed: true },
          { status: 429, headers: { "Retry-After": "" } },
        ),
      ),
    );
    const err = await execute("GET", "/v1/accounts", det({ maxRetries: 0 })).catch((e) => e);
    expect((err as CurviateError).retryAfterMs).toBe(30_000);
  });
});

describe("error-code decode coverage", () => {
  // Every code the SDK's taxonomy knows must decode from the wire back to
  // itself — never silently downgraded to INTERNAL. This is the coverage whose
  // absence let a real server code (CONNECTION_REQUEST_CONFLICT) reach callers
  // as INTERNAL: the decode round-trip had never been exercised per code.
  // maxRetries:0 so even a retryable code throws after exactly one fetch,
  // isolating the code-mapping from retry semantics.
  it.each([...ERROR_CODES])("decodes wire code %s to itself, not INTERNAL", async (code) => {
    let calls = 0;
    server.use(
      http.get(`${BASE}/v1/probe`, () => {
        calls += 1;
        return HttpResponse.json(
          { code, message: "probe", user_fixable: false, retry_likely_to_succeed: false },
          { status: 400 },
        );
      }),
    );
    const err = await execute("GET", "/v1/probe", det({ maxRetries: 0 })).catch((e) => e);
    expect(isCurviateError(err)).toBe(true);
    expect((err as CurviateError).code).toBe(code);
    expect(calls).toBe(1);
  });

  // An unknown/unmapped wire code is the only thing that should ever become
  // INTERNAL — the fallback still works for codes outside the taxonomy.
  it("downgrades an unknown wire code to INTERNAL", async () => {
    server.use(
      http.get(`${BASE}/v1/probe`, () =>
        HttpResponse.json(
          { code: "SOME_FUTURE_UNMAPPED_CODE", message: "x", user_fixable: false, retry_likely_to_succeed: false },
          { status: 400 },
        ),
      ),
    );
    const err = await execute("GET", "/v1/probe", det({ maxRetries: 0 })).catch((e) => e);
    expect((err as CurviateError).code).toBe("INTERNAL");
  });
});

describe("timeout", () => {
  // per-attempt timeout fires AbortError → INTERNAL 'timed out'.
  it("aborts and throws INTERNAL 'timed out' when the request exceeds timeout", async () => {
    server.use(
      http.get(`${BASE}/v1/slow`, async () => {
        await new Promise((r) => setTimeout(r, 5_000));
        return HttpResponse.json({ ok: true });
      }),
    );
    // Real timers here: a 50ms timeout vs a 5s handler. Uses the real sleep so
    // the AbortController actually fires; no retry so the test stays fast.
    const err = await execute("GET", "/v1/slow", {
      apiKey: "k",
      baseUrl: BASE,
      timeout: 50,
      maxRetries: 0,
    }).catch((e) => e);
    expect(isCurviateError(err)).toBe(true);
    expect((err as CurviateError).code).toBe("INTERNAL");
    expect((err as CurviateError).message.toLowerCase()).toContain("timed out");
  });
});

// ── Account-safety refusals (BUDGET_EXHAUSTED) and paused rows ─────────────
//
// Two 429s that must not behave like a rate limit. `BUDGET_EXHAUSTED` is
// Curviate's own ceiling and `PLATFORM_RATE_LIMIT` + `row` is a locally paused
// row; neither is freed by backing off inside the call, and both used to be
// retried (the first decoded to INTERNAL, which IS retryable on a GET).
//
// THE INSTRUMENT IS THE FETCH COUNT, not the decoded code: a decode assertion
// alone stays green if the retry gate regresses. Every "not retried" arm below
// has the ordinary-429 control beside it, so "never retries" cannot become
// true by 429 quietly ceasing to be retryable at all.
describe("account-safety refusals", () => {
  const BREACH = {
    code: "BUDGET_EXHAUSTED",
    message: "The profile_views budget for this account is spent.",
    user_fixable: true,
    retry_likely_to_succeed: false,
    row: "profile_views",
    reset_at: "2026-09-06T00:00:00.000Z",
    hint: {
      parameter: "profile_views.ceiling",
      message: "effective ceiling 15 = 100 x warm-up 0.15 (week 0, account_age).",
    },
    reason: "ceiling",
    blocked: true,
  } as const;

  function serve(body: Record<string, unknown>, status = 429) {
    let calls = 0;
    server.use(
      http.get(`${BASE}/v1/probe`, () => {
        calls += 1;
        return HttpResponse.json(body, { status });
      }),
    );
    return () => calls;
  }

  it("decodes the whole BUDGET_EXHAUSTED payload onto the error", async () => {
    serve({ ...BREACH });
    const err = (await execute("GET", "/v1/probe", det()).catch((e) => e)) as CurviateError;
    expect(err.code).toBe("BUDGET_EXHAUSTED");
    expect(err.httpStatus).toBe(429);
    expect(err.budgetRow).toBe("profile_views");
    expect(err.resetAt).toBe("2026-09-06T00:00:00.000Z");
    expect(err.safetyHint).toEqual({
      parameter: "profile_views.ceiling",
      message: "effective ceiling 15 = 100 x warm-up 0.15 (week 0, account_age).",
    });
    expect(err.safetyReason).toBe("ceiling");
    expect(err.blocked).toBe(true);
  });

  it("carries the payload on toJSON()", async () => {
    serve({ ...BREACH });
    const err = (await execute("GET", "/v1/probe", det()).catch((e) => e)) as CurviateError;
    expect(err.toJSON()).toMatchObject({
      code: "BUDGET_EXHAUSTED",
      budgetRow: "profile_views",
      resetAt: "2026-09-06T00:00:00.000Z",
      safetyReason: "ceiling",
      blocked: true,
    });
  });

  it("never retries a BUDGET_EXHAUSTED GET (1 fetch)", async () => {
    const calls = serve({ ...BREACH });
    await execute("GET", "/v1/probe", det()).catch((e) => e);
    expect(calls()).toBe(1);
  });

  // CONTROL for the arm above. An ordinary 429 with no `row` is still retried
  // to exhaustion, so "1 fetch" up there is a property of the safety payload
  // rather than of 429 having stopped being retryable.
  it("still retries an ordinary 429 with no row (4 fetches)", async () => {
    const calls = serve({
      code: "RATE_LIMIT_ACCOUNT",
      message: "slow down",
      user_fixable: false,
      retry_likely_to_succeed: true,
    });
    await execute("GET", "/v1/probe", det()).catch((e) => e);
    expect(calls()).toBe(4); // 1 initial + maxRetries 3
  });

  // The gate is belt-and-braces: `row` is absent here, so the ONLY thing
  // stopping the retry is BUDGET_EXHAUSTED's absence from RETRYABLE_CODES.
  // Without this arm, deleting that exclusion would stay green.
  it("does not retry a BUDGET_EXHAUSTED that carries no row (1 fetch)", async () => {
    const calls = serve({
      code: "BUDGET_EXHAUSTED",
      message: "spent",
      user_fixable: true,
      retry_likely_to_succeed: false,
    });
    await execute("GET", "/v1/probe", det()).catch((e) => e);
    expect(calls()).toBe(1);
  });

  // reset_at is null-BEARING wherever no clock frees the row (the
  // pending_invites gauge, and an InMail credit exhaustion): that is a
  // different fact from the field being absent, and both have to survive the
  // round trip and toJSON().
  it("keeps a null reset_at as null, and an absent one as undefined", async () => {
    serve({ ...BREACH, row: "pending_invites", reset_at: null });
    const gauge = (await execute("GET", "/v1/probe", det()).catch((e) => e)) as CurviateError;
    expect(gauge.resetAt).toBeNull();
    expect(gauge.toJSON()).toHaveProperty("resetAt", null);

    const { reset_at: _drop, ...withoutResetAt } = BREACH;
    serve(withoutResetAt);
    const absent = (await execute("GET", "/v1/probe", det()).catch((e) => e)) as CurviateError;
    expect(absent.resetAt).toBeUndefined();
    expect(absent.toJSON()).not.toHaveProperty("resetAt");
  });

  it("discards a malformed hint and an unrecognised reason rather than surfacing them", async () => {
    serve({ ...BREACH, hint: { parameter: "profile_views.ceiling" }, reason: "some_future_rule" });
    const err = (await execute("GET", "/v1/probe", det()).catch((e) => e)) as CurviateError;
    expect(err.safetyHint).toBeUndefined();
    expect(err.safetyReason).toBeUndefined();
    // The rest of the payload still decodes, so the narrowing is field-local.
    expect(err.budgetRow).toBe("profile_views");
    expect(err.blocked).toBe(true);
  });

  // A PAUSED row: same wire `row`, different code, different recovery.
  it("surfaces a paused row on PLATFORM_RATE_LIMIT and never retries it", async () => {
    const calls = serve({
      code: "PLATFORM_RATE_LIMIT",
      message: "paused",
      user_fixable: false,
      retry_likely_to_succeed: false,
      row: "connection_requests_no_note",
      retry_after: 3600,
    });
    const err = (await execute("GET", "/v1/probe", det()).catch((e) => e)) as CurviateError;
    expect(err.budgetRow).toBe("connection_requests_no_note");
    expect(err.retryAfterSeconds).toBe(3600);
    // retry_after is NOT folded into retryAfterMs, which everything sleeps.
    expect(err.retryAfterMs).toBeUndefined();
    expect(calls()).toBe(1);
  });

  // A paused row on a WRITE must not sleep either: the write path sleeps
  // retryAfterMs before throwing, and an hour there is a hang.
  it("does not sleep on a paused-row write", async () => {
    const sleeps: number[] = [];
    server.use(
      http.post(`${BASE}/v1/probe`, () =>
        HttpResponse.json(
          {
            code: "PLATFORM_RATE_LIMIT",
            message: "paused",
            user_fixable: false,
            retry_likely_to_succeed: false,
            row: "profile_views",
            retry_after: 3600,
          },
          { status: 429 },
        ),
      ),
    );
    await execute("POST", "/v1/probe", det({
      body: {},
      _sleepFn: async (ms: number) => {
        sleeps.push(ms);
      },
    })).catch((e) => e);
    expect(sleeps).toEqual([]);
  });

  // LINKEDIN_SESSION_EVICTED: driven on a GET on purpose. An INTERNAL fallback
  // is retryable, so an undecoded code would re-fire up to maxRetries; the
  // fetch count is the instrument, not the decoded code alone.
  it("decodes LINKEDIN_SESSION_EVICTED and does not retry it (1 fetch)", async () => {
    const calls = serve(
      {
        code: "LINKEDIN_SESSION_EVICTED",
        message: "Signed in elsewhere.",
        user_fixable: true,
        retry_likely_to_succeed: false,
        retry_hint: { kind: "never" },
      },
      401,
    );
    const err = (await execute("GET", "/v1/probe", det()).catch((e) => e)) as CurviateError;
    expect(err.code).toBe("LINKEDIN_SESSION_EVICTED");
    expect(err.code).not.toBe("LINKEDIN_AUTH_FAILED");
    expect(calls()).toBe(1);
  });

  // NOT_STORED (#30): a `mode=cache_only` read the store could not answer, so
  // the API refused rather than reaching LinkedIn. Driven on a GET because the
  // fetch count is what carries the harmful half of the gap: undecoded, this
  // fell to INTERNAL, INTERNAL is retryable, and three retries were spent
  // re-asking a question whose answer cannot change until the caller picks
  // another mode.
  //
  // NO `retry_hint` in this body, unlike the sibling refusals above, and that
  // is the wire being copied rather than an omission: the server mints this
  // one through `makeError` with no hint at all, so a hint here would be a
  // fixture asserting something the API does not send.
  it("decodes a 422 NOT_STORED and does not retry it (1 fetch)", async () => {
    const calls = serve(
      {
        code: "NOT_STORED",
        message: "Nothing is stored for this chat. Re-read with mode=refill or mode=auto.",
        user_fixable: true,
        retry_likely_to_succeed: false,
      },
      422,
    );
    const err = (await execute("GET", "/v1/probe", det()).catch((e) => e)) as CurviateError;
    expect(err.code).toBe("NOT_STORED");
    expect(err.code).not.toBe("INTERNAL");
    expect(err.httpStatus).toBe(422);
    // The taxonomy classification, as the wire states it: fixable by choosing
    // another mode, and worth nothing on a retry.
    expect(err.userFixable).toBe(true);
    expect(err.retryLikelyToSucceed).toBe(false);
    expect(calls()).toBe(1);
  });

  // CONTROL for the arm above, on the same path with the same status. An
  // unrecognised code still falls to INTERNAL and is still retried to
  // exhaustion, so "1 fetch" up there is a property of NOT_STORED having
  // entered the taxonomy — not of 422 or of this probe having stopped
  // retrying. Without this arm, a decode that quietly stopped working would
  // look identical to a decode that works.
  //
  // `retry_likely_to_succeed: TRUE`, no `retry_hint`, deliberately (#32,
  // revisited). As of #32 the retry decision DOES consult one envelope field:
  // `retry_hint.kind === "never"` suppresses a retry outright. It still does
  // NOT consult `retry_likely_to_succeed` — that half was investigated and
  // deliberately deferred: the server's own registry catch-all and its
  // substrate-error-map default arm both degrade an unresolved error on a
  // RETRYABLE_CODES code to `retry_likely_to_succeed: false` with no
  // `retry_hint`, as a generic "we don't know" default rather than a per-cause
  // verdict, so honouring it would silently stop retrying most undecoded
  // server errors. This body carries `retry_likely_to_succeed: true` (not the
  // deferred `false` case) and no `retry_hint` at all, so it isolates the one
  // thing this control is here to prove: an unknown code still decodes to
  // INTERNAL and INTERNAL still retries. The sibling arm below
  // (`retry_hint.kind: "never"`) proves the part that DID change.
  it("still downgrades an unknown 422 code to INTERNAL and retries it (4 fetches)", async () => {
    const calls = serve(
      {
        code: "SOME_FUTURE_UNMAPPED_CODE",
        message: "x",
        user_fixable: true,
        retry_likely_to_succeed: true,
      },
      422,
    );
    const err = (await execute("GET", "/v1/probe", det()).catch((e) => e)) as CurviateError;
    expect(err.code).toBe("INTERNAL");
    expect(calls()).toBe(4); // 1 initial + maxRetries 3
  });

  // STRIPE_DRIFT_DETECTED: checkout refuses closed (503) when the operator's
  // configured seat price disagrees with what Curviate displays. Undecoded it
  // reads as INTERNAL, "something broke", and INTERNAL is retried, so the
  // fetch count carries the harm here too. The body is the one the server
  // mints: `makeError` with both booleans false and no retry_hint. Its control
  // is the same path at the same status with an unknown code, directly below.
  it("decodes a 503 STRIPE_DRIFT_DETECTED and does not retry it (1 fetch)", async () => {
    const calls = serve(
      {
        code: "STRIPE_DRIFT_DETECTED",
        message: "Checkout is temporarily unavailable while we resolve a pricing configuration issue.",
        user_fixable: false,
        retry_likely_to_succeed: false,
      },
      503,
    );
    const err = (await execute("GET", "/v1/probe", det()).catch((e) => e)) as CurviateError;
    expect(err.code).toBe("STRIPE_DRIFT_DETECTED");
    expect(err.httpStatus).toBe(503);
    expect(err.userFixable).toBe(false);
    expect(err.retryLikelyToSucceed).toBe(false);
    expect(calls()).toBe(1);
  });

  it("CONTROL: an unknown 503 code still downgrades to INTERNAL and retries (4 fetches)", async () => {
    const calls = serve(
      { code: "SOME_FUTURE_UNMAPPED_CODE", message: "x", user_fixable: false, retry_likely_to_succeed: true },
      503,
    );
    const err = (await execute("GET", "/v1/probe", det()).catch((e) => e)) as CurviateError;
    expect(err.code).toBe("INTERNAL");
    expect(calls()).toBe(4);
  });
});

// #32: the retry decision now honours `retry_hint.kind === "never"` as an
// explicit server instruction, ahead of the RETRYABLE_CODES table. It
// deliberately does NOT act on `retry_likely_to_succeed` alone — see the
// `neverRetry` comment in transport.ts. Verified server-side: the two most
// common "we don't know what happened" server error paths both degrade an
// unresolved error on a RETRYABLE_CODES code (INTERNAL, PLATFORM_ERROR) to
// `retry_likely_to_succeed: false` with NO `retry_hint`, as a generic
// "unresolved" default rather than a per-cause verdict that a retry is
// futile — honouring that field here would have silently stopped retrying
// most undecoded server errors, the exact class RETRYABLE_CODES exists for.
// That half is filed back to the server rather than shipped.
describe("retry_hint honouring (#32)", () => {
  // Same call-counting JSON-envelope handler as the sibling describe block's
  // `serve()` above; redeclared here because that one is scoped to its own
  // describe and JS closures don't reach across siblings.
  function serve(body: Record<string, unknown>, status: number) {
    let calls = 0;
    server.use(
      http.get(`${BASE}/v1/probe`, () => {
        calls += 1;
        return HttpResponse.json(body, { status });
      }),
    );
    return () => calls;
  }

  // The issue's own root cause: PLATFORM_ERROR (RETRYABLE) with
  // `retry_hint.kind: "never"` (e.g. UPSTREAM_SHAPE_DRIFT — the upstream
  // answered, in a shape that will not become readable by asking again).
  it("does not retry a GET whose envelope says retry_hint.kind: never, even though the code is retryable (1 fetch)", async () => {
    const calls = serve(
      {
        code: "PLATFORM_ERROR",
        message: "The upstream answered in a shape we could not read.",
        user_fixable: false,
        retry_likely_to_succeed: false,
        retry_hint: { kind: "never" },
      },
      502,
    );
    const err = (await execute("GET", "/v1/probe", det()).catch((e) => e)) as CurviateError;
    expect(err.code).toBe("PLATFORM_ERROR");
    expect(err.retryHint).toEqual({ kind: "never" });
    expect(calls()).toBe(1);
  });

  // Same-path positive control: identical code and status with no
  // `retry_hint` at all retries to exhaustion, so "1 fetch" above is a
  // property of the hint, not of PLATFORM_ERROR having quietly left
  // RETRYABLE_CODES.
  it("CONTROL: retries the same PLATFORM_ERROR/502 to exhaustion when no retry_hint is sent (4 fetches)", async () => {
    const calls = serve(
      {
        code: "PLATFORM_ERROR",
        message: "Upstream hiccup.",
        user_fixable: false,
        retry_likely_to_succeed: true,
      },
      502,
    );
    const err = (await execute("GET", "/v1/probe", det()).catch((e) => e)) as CurviateError;
    expect(err.code).toBe("PLATFORM_ERROR");
    expect(calls()).toBe(4); // 1 initial + maxRetries 3
  });

  // `retry_hint.kind: "delay"` is NOT "never" — guards against an overbroad
  // `if (err.retryHint)` truthiness check standing in for `.kind === "never"`.
  it("still retries a GET whose retry_hint.kind is 'delay', not 'never' (4 fetches)", async () => {
    const calls = serve(
      {
        code: "INTERNAL",
        message: "x",
        user_fixable: false,
        retry_likely_to_succeed: true,
        retry_hint: { kind: "delay", delay_ms: 1 },
      },
      500,
    );
    await execute("GET", "/v1/probe", det()).catch((e) => e);
    expect(calls()).toBe(4);
  });

  // Deferred half of #32 (server-side finding above): `retry_likely_to_succeed:
  // false` with NO `retry_hint` must NOT suppress a retry — today's
  // code-based behaviour is unchanged for this exact shape, because the
  // server's own catch-alls emit it as a generic default, not a verdict.
  it("still retries a GET when retry_likely_to_succeed is false but retry_hint is absent (4 fetches)", async () => {
    const calls = serve(
      {
        code: "INTERNAL",
        message: "An unexpected error occurred.",
        user_fixable: false,
        retry_likely_to_succeed: false,
      },
      500,
    );
    await execute("GET", "/v1/probe", det()).catch((e) => e);
    expect(calls()).toBe(4); // 1 initial + maxRetries 3 — unchanged by #32
  });

  // No envelope at all (non-JSON body): the issue's own "obvious fix" trap.
  // #32 never reads `retry_likely_to_succeed` for the retry decision, so this
  // stays exactly as before — retried to exhaustion on the code table alone.
  it("still retries a GET on a non-JSON 500 body (no envelope) to exhaustion (4 fetches)", async () => {
    let calls = 0;
    server.use(
      http.get(`${BASE}/v1/probe`, () => {
        calls += 1;
        return new HttpResponse("upstream blew up", {
          status: 500,
          headers: { "Content-Type": "text/plain" },
        });
      }),
    );
    const err = (await execute("GET", "/v1/probe", det()).catch((e) => e)) as CurviateError;
    expect(err.code).toBe("INTERNAL");
    expect(calls).toBe(4);
  });
});
