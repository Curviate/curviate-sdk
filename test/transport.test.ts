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

  // #1154 (core/018) — a 429 that means one account-safety budget ROW is paused
  // carries `row` and `retry_after`. The row surfaces as `budgetRow`; the
  // seconds fill `retryAfterMs` only when the `Retry-After` header is missing.
  it("surfaces the paused budget row, taking the delay from the header", async () => {
    server.use(
      http.get(`${BASE}/v1/accounts/x`, () =>
        HttpResponse.json(
          {
            code: "PLATFORM_RATE_LIMIT",
            message: "paused",
            user_fixable: false,
            retry_likely_to_succeed: true,
            row: "profile_views",
            retry_after: 120,
          },
          { status: 429, headers: { "Retry-After": "120" } },
        ),
      ),
    );
    const err = (await execute("GET", "/v1/accounts/x", det({ maxRetries: 0 })).catch(
      (e) => e,
    )) as CurviateError;
    expect(err.budgetRow).toBe("profile_views");
    expect(err.retryAfterMs).toBe(120_000);
    expect(err.toJSON().budgetRow).toBe("profile_views");
  });

  it("falls back to the body's retry_after when a proxy dropped the header", async () => {
    server.use(
      http.get(`${BASE}/v1/accounts/x`, () =>
        HttpResponse.json(
          {
            code: "PLATFORM_RATE_LIMIT",
            message: "paused",
            user_fixable: false,
            retry_likely_to_succeed: true,
            row: "search",
            retry_after: 90,
          },
          { status: 429 },
        ),
      ),
    );
    const err = (await execute("GET", "/v1/accounts/x", det({ maxRetries: 0 })).catch(
      (e) => e,
    )) as CurviateError;
    expect(err.budgetRow).toBe("search");
    expect(err.retryAfterMs).toBe(90_000);
  });

  it("CONTROL ARM: an ordinary 429 carries no budgetRow, and toJSON omits it", async () => {
    // Additive means absent by default: an envelope written before #1154 must
    // produce a byte-identical error object.
    server.use(
      http.get(`${BASE}/v1/accounts/x`, () =>
        HttpResponse.json(
          { code: "PLATFORM_RATE_LIMIT", message: "slow", user_fixable: false, retry_likely_to_succeed: true },
          { status: 429 },
        ),
      ),
    );
    const err = (await execute("GET", "/v1/accounts/x", det({ maxRetries: 0 })).catch(
      (e) => e,
    )) as CurviateError;
    expect(err.budgetRow).toBeUndefined();
    expect(err.retryAfterMs).toBeUndefined();
    expect(err.toJSON()).not.toHaveProperty("budgetRow");
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

  // RATE_LIMITED (LinkedIn-platform throttling on Recruiter / Sales Navigator
  // reads; carries retry_likely_to_succeed: true and dedicated RateLimit /
  // Retry-After headers in the served docs) must retry on GET like the other
  // three rate-limit codes and honor Retry-After over the backoff formula.
  // Before RETRYABLE_CODES learned this code, an unrecognized wire code
  // downgraded to INTERNAL — which happened to retry by accident, but with
  // the wrong (generic backoff) delay instead of the server's Retry-After.
  it("retries a 429 RATE_LIMITED GET and honors Retry-After over backoff", async () => {
    const sleeps: number[] = [];
    let calls = 0;
    server.use(
      http.get(`${BASE}/v1/accounts`, () => {
        calls += 1;
        if (calls === 1) {
          return HttpResponse.json(
            {
              code: "RATE_LIMITED",
              message: "Too many requests. Please retry after a short delay.",
              user_fixable: false,
              retry_likely_to_succeed: true,
            },
            { status: 429, headers: { "Retry-After": "3" } },
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
    expect(calls).toBe(2); // retried once, then succeeded
    expect(sleeps).toEqual([3_000]); // Retry-After honored, not generic backoff
  });

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
