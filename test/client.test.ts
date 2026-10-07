// Curviate client: auth, config, account-scoped accessor, and the
// accounts.list() reference vertical slice (client → transport → generated
// types → error handling).
import { http, HttpResponse } from "msw";
import { describe, expect, it, vi } from "vitest";
import { server } from "./msw/server.js";
import { Curviate } from "../src/index.js";
import { CurviateError, isCurviateError } from "../src/errors.js";

const BASE = "https://app.curviate.test";

describe("Curviate constructor", () => {
  // happy path, no network call.
  it("constructs without throwing and fires no network call", () => {
    const fetchSpy = vi.fn();
    expect(
      () => new Curviate({ apiKey: "cvt_live_abc", baseUrl: BASE, fetch: fetchSpy }),
    ).not.toThrow();
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  // empty apiKey throws synchronously, no fetch.
  it("throws INVALID_REQUEST synchronously on an empty apiKey", () => {
    const fetchSpy = vi.fn();
    let caught: unknown;
    try {
      new Curviate({ apiKey: "", fetch: fetchSpy });
    } catch (e) {
      caught = e;
    }
    expect(isCurviateError(caught)).toBe(true);
    expect((caught as CurviateError).code).toBe("INVALID_REQUEST");
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  // undefined apiKey coerced → throw.
  it("throws INVALID_REQUEST when apiKey is undefined", () => {
    expect(() => new Curviate({ apiKey: undefined as unknown as string })).toThrow(
      CurviateError,
    );
  });

  // defaults applied.
  it("applies default baseUrl / timeout / maxRetries", () => {
    const c = new Curviate({ apiKey: "k" });
    expect(c.config.baseUrl).toBe("https://api.curviate.com");
    expect(c.config.timeout).toBe(30_000);
    expect(c.config.maxRetries).toBe(3);
  });

  // immutable config (no setApiKey, frozen config view).
  it("exposes an immutable config view", () => {
    const c = new Curviate({ apiKey: "k" });
    expect(Object.isFrozen(c.config)).toBe(true);
    expect((c as unknown as Record<string, unknown>)["setApiKey"]).toBeUndefined();
  });
});

describe("accounts.list() reference slice", () => {
  // auth header on the outgoing request.
  it("sends Authorization: Bearer <apiKey> exactly", async () => {
    let auth: string | null = null;
    server.use(
      http.get(`${BASE}/v1/accounts`, ({ request }) => {
        auth = request.headers.get("authorization");
        return HttpResponse.json({ object: "account_list", items: [], cursor: null });
      }),
    );
    await new Curviate({ apiKey: "cvt_live_xyz", baseUrl: BASE }).accounts.list();
    expect(auth).toBe("Bearer cvt_live_xyz");
  });

  it("returns the parsed account list page", async () => {
    server.use(
      http.get(`${BASE}/v1/accounts`, () =>
        HttpResponse.json({
          object: "account_list",
          items: [{ account_id: "acc_1", status: "active" }],
          cursor: null,
        }),
      ),
    );
    const page = await new Curviate({ apiKey: "k", baseUrl: BASE }).accounts.list();
    expect(page.items?.[0]?.account_id).toBe("acc_1");
    expect(page.cursor).toBeNull();
  });

  it("forwards limit + cursor query params", async () => {
    let url: string | undefined;
    server.use(
      http.get(`${BASE}/v1/accounts`, ({ request }) => {
        url = request.url;
        return HttpResponse.json({ object: "account_list", items: [], cursor: null });
      }),
    );
    await new Curviate({ apiKey: "k", baseUrl: BASE }).accounts.list({ limit: 25, cursor: "cur_abc" });
    const parsed = new URL(url!);
    expect(parsed.searchParams.get("limit")).toBe("25");
    expect(parsed.searchParams.get("cursor")).toBe("cur_abc");
  });

  // The reference 401 path: server error envelope → typed CurviateError.
  it("maps a 401 to CurviateError without leaking the apiKey", async () => {
    server.use(
      http.get(`${BASE}/v1/accounts`, () =>
        HttpResponse.json(
          { code: "UNAUTHORIZED", message: "Invalid key.", user_fixable: false, retry_likely_to_succeed: false },
          { status: 401 },
        ),
      ),
    );
    const err = await new Curviate({ apiKey: "leak_me_not", baseUrl: BASE })
      .accounts.list()
      .catch((e: unknown) => e);
    expect(isCurviateError(err)).toBe(true);
    expect((err as CurviateError).code).toBe("UNAUTHORIZED");
    expect((err as CurviateError).httpStatus).toBe(401);
    expect(JSON.stringify(err)).not.toContain("leak_me_not");
    expect(JSON.stringify(err)).not.toContain("Bearer");
  });
});

describe("account-scoped accessor", () => {
  // account('') throws synchronously.
  it("throws INVALID_REQUEST synchronously on an empty account id", () => {
    const c = new Curviate({ apiKey: "k", baseUrl: BASE });
    let caught: unknown;
    try {
      c.account("");
    } catch (e) {
      caught = e;
    }
    expect(isCurviateError(caught)).toBe(true);
    expect((caught as CurviateError).code).toBe("INVALID_REQUEST");
  });

  // Account-scoped accessor exposes exactly the account-scoped namespaces and
  // none of the root-only ones (accounts, auth, webhooks).
  it("exposes the account-scoped resource namespaces", () => {
    const scoped = new Curviate({ apiKey: "k", baseUrl: BASE }).account("acc_123");
    for (const ns of [
      "users",
      "companies",
      "search",
      "messaging",
      "comments",
      "profile",
      "groups",
      "feed",
      "posts",
      "invites",
      "jobs",
      "recruiter",
      "salesNavigator",
    ]) {
      expect(scoped, `namespace ${ns} should exist`).toHaveProperty(ns);
    }
  });

  it("does not leak the root-only namespaces onto the account accessor", () => {
    const scoped = new Curviate({ apiKey: "k", baseUrl: BASE }).account("acc_123");
    for (const ns of ["accounts", "auth", "webhooks", "drafts", "profiles"]) {
      expect(scoped, `namespace ${ns} must not exist`).not.toHaveProperty(ns);
    }
  });

  it("returns a fresh accessor object per call (no shared mutable state)", () => {
    const c = new Curviate({ apiKey: "k", baseUrl: BASE });
    expect(c.account("acc_1")).not.toBe(c.account("acc_2"));
  });
});
