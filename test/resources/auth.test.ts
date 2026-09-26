// auth namespace (5 methods, root-scoped) — split out of `accounts`.
//
// `intent` merges the old `accounts.link` (new account) and `accounts.reconnect`
// (existing account) into a single op, discriminated by an optional `account_id`
// in the body. `solveCheckpoint` / `requestCheckpoint` / `pollCheckpoint` keep
// their old (account id, ...rest) call shape, but the account id now wire-encodes
// into the POST body — it is never a path segment for these ops.
import { http, HttpResponse } from "msw";
import { describe, expect, it } from "vitest";
import { server } from "../msw/server.js";
import { Curviate } from "../../src/index.js";

const BASE = "https://app.curviate.test";
const client = new Curviate({ apiKey: "cvt_test_auth", baseUrl: BASE });

// ─── auth.intent (POST /v1/auth/intent) ──────────────────────────────────────
describe("auth.intent", () => {
  it("connects a new account (201) — no account_id in the body", async () => {
    let seenPath: string | null = null;
    let body: Record<string, unknown> | undefined;
    server.use(
      http.post(`${BASE}/v1/auth/intent`, async ({ request }) => {
        seenPath = new URL(request.url).pathname;
        body = (await request.json()) as Record<string, unknown>;
        return HttpResponse.json(
          { object: "account", account_id: "acc_1", status: "active" },
          { status: 201 },
        );
      }),
    );
    const res = await client.auth.intent({
      seat_id: "seat_1",
      auth_method: "credentials",
      credentials: { email: "u@x.com", password: "p" },
    });
    expect(seenPath).toBe("/v1/auth/intent");
    expect(body?.["account_id"]).toBeUndefined();
    if (res.object !== "account") throw new Error("expected the account branch");
    expect(res.account_id).toBe("acc_1");
  });

  it("re-authenticates an existing account in place (200) when account_id is present in the body", async () => {
    let body: Record<string, unknown> | undefined;
    server.use(
      http.post(`${BASE}/v1/auth/intent`, async ({ request }) => {
        body = (await request.json()) as Record<string, unknown>;
        return HttpResponse.json({ object: "account", account_id: "acc_1", status: "active" });
      }),
    );
    const res = await client.auth.intent({
      account_id: "acc_1",
      auth_method: "cookie",
      cookie: { li_at: "y" },
      user_agent: "UA",
    });
    expect(body?.["account_id"]).toBe("acc_1");
    if (res.object !== "account") throw new Error("expected the account branch");
    expect(res.status).toBe("active");
  });

  it("surfaces a checkpoint challenge on 202", async () => {
    server.use(
      http.post(`${BASE}/v1/auth/intent`, () =>
        HttpResponse.json(
          {
            object: "checkpoint",
            status: "checkpoint_required",
            account_id: "acc_prov",
            challenge_type: "otp",
          },
          { status: 202 },
        ),
      ),
    );
    const res = await client.auth.intent({
      seat_id: "s",
      auth_method: "credentials",
      credentials: { email: "u@x.com", password: "p" },
    });
    expect(res.object).toBe("checkpoint");
  });
});

// ─── auth.solveCheckpoint (POST /v1/auth/checkpoint/solve) ──────────────────
describe("auth.solveCheckpoint", () => {
  it("sends {account_id, code} in the body — account_id is NOT a path segment", async () => {
    let seenPath: string | null = null;
    let body: unknown;
    server.use(
      http.post(`${BASE}/v1/auth/checkpoint/solve`, async ({ request }) => {
        seenPath = new URL(request.url).pathname;
        body = await request.json();
        return HttpResponse.json(
          { object: "account", account_id: "acc_prov", status: "active" },
          { status: 201 },
        );
      }),
    );
    const res = await client.auth.solveCheckpoint("acc_prov", { code: "123456" });
    expect(seenPath).toBe("/v1/auth/checkpoint/solve");
    expect(body).toEqual({ account_id: "acc_prov", code: "123456" });
    expect(res.object).toBe("account");
  });

  it("surfaces a chained challenge on 202", async () => {
    server.use(
      http.post(`${BASE}/v1/auth/checkpoint/solve`, () =>
        HttpResponse.json(
          {
            object: "checkpoint",
            status: "checkpoint_required",
            account_id: "acc_prov",
            challenge_type: "two_factor_sms",
          },
          { status: 202 },
        ),
      ),
    );
    const res = await client.auth.solveCheckpoint("acc_prov", { code: "111" });
    expect(res.object).toBe("checkpoint");
  });
});

// ─── auth.requestCheckpoint (POST /v1/auth/checkpoint/request) ──────────────
describe("auth.requestCheckpoint", () => {
  it("sends {account_id} in the body, returns {resent}", async () => {
    let seenPath: string | null = null;
    let body: unknown;
    server.use(
      http.post(`${BASE}/v1/auth/checkpoint/request`, async ({ request }) => {
        seenPath = new URL(request.url).pathname;
        body = await request.json();
        return HttpResponse.json({ object: "checkpoint", account_id: "acc_prov", resent: true });
      }),
    );
    const res = await client.auth.requestCheckpoint("acc_prov");
    expect(seenPath).toBe("/v1/auth/checkpoint/request");
    expect(body).toEqual({ account_id: "acc_prov" });
    expect("resent" in res && res.resent).toBe(true);
  });

  it("honest no-op: returns resent:false without throwing", async () => {
    server.use(
      http.post(`${BASE}/v1/auth/checkpoint/request`, () =>
        HttpResponse.json({ object: "checkpoint", account_id: "acc_prov", resent: false }),
      ),
    );
    const res = await client.auth.requestCheckpoint("acc_prov");
    expect("resent" in res && res.resent).toBe(false);
  });
});

// ─── auth.pollCheckpoint (POST /v1/auth/checkpoint/poll) ────────────────────
describe("auth.pollCheckpoint", () => {
  it("sends {account_id} in the body, returns status", async () => {
    let seenPath: string | null = null;
    let body: unknown;
    server.use(
      http.post(`${BASE}/v1/auth/checkpoint/poll`, async ({ request }) => {
        seenPath = new URL(request.url).pathname;
        body = await request.json();
        return HttpResponse.json({ object: "checkpoint", status: "pending", account_id: "acc_prov" });
      }),
    );
    const res = await client.auth.pollCheckpoint("acc_prov");
    expect(seenPath).toBe("/v1/auth/checkpoint/poll");
    expect(body).toEqual({ account_id: "acc_prov" });
    expect(res.status).toBe("pending");
  });

  it("surfaces challenge_type + recovery_hint on an expired mobile-approval timeout", async () => {
    server.use(
      http.post(`${BASE}/v1/auth/checkpoint/poll`, () =>
        HttpResponse.json({
          object: "checkpoint",
          status: "expired",
          challenge_type: "mobile_app_approval",
          recovery_hint: "This sign-in wasn't completed in time. Try again.",
        }),
      ),
    );
    const res = await client.auth.pollCheckpoint("acc_prov");
    expect(res.status).toBe("expired");
    expect(res.challenge_type).toBe("mobile_app_approval");
  });
});

// ─── auth.getSession (GET /v1/auth/sessions/:session_id) ────────────────────
describe("auth.getSession", () => {
  it("addresses the session in the PATH; returns a pending status", async () => {
    let seenPath: string | null = null;
    server.use(
      http.get(`${BASE}/v1/auth/sessions/acc_prov`, ({ request }) => {
        seenPath = new URL(request.url).pathname;
        return HttpResponse.json({
          object: "auth_session",
          session_id: "acc_prov",
          status: "checkpoint_required",
          account_id: null,
          challenge_type: "otp",
        });
      }),
    );
    const res = await client.auth.getSession("acc_prov");
    expect(seenPath).toBe("/v1/auth/sessions/acc_prov");
    expect(res.status).toBe("checkpoint_required");
  });

  it("carries account_id once status is done", async () => {
    server.use(
      http.get(`${BASE}/v1/auth/sessions/acc_prov`, () =>
        HttpResponse.json({
          object: "auth_session",
          session_id: "acc_prov",
          status: "done",
          account_id: "acc_9",
        }),
      ),
    );
    const res = await client.auth.getSession("acc_prov");
    expect(res.status).toBe("done");
    expect(res.account_id).toBe("acc_9");
  });
});

// ─── auth is root-scoped only — not reachable from account(id) ──────────────
describe("auth is root-scoped", () => {
  it("is absent from the account(id) accessor", () => {
    const scoped = client.account("acc_test");
    expect((scoped as Record<string, unknown>)["auth"]).toBeUndefined();
  });
});
