// Programmatic auth parity SDK surface: tenant-wide account-status
// webhooks, external_id / metadata, intent timezone + products, challenge
// selection, and public seat add / cancel / revert.
//
// Wire assertions read what reached the mock server, never the call's input.
// The type-level half (every body below compiles only against the regenerated
// types) is enforced by `tsc --noEmit` over this file.
import { http, HttpResponse } from "msw";
import { describe, expect, it } from "vitest";
import { server } from "./msw/server.js";
import { Curviate } from "../src/index.js";
import type { AccountPayload } from "../src/index.js";

const BASE = "https://app.curviate.test";
const client = new Curviate({ apiKey: "cvt_test_parity034", baseUrl: BASE });

function capture(method: "get" | "post" | "patch", path: string, reply: unknown, status = 200) {
  const seen: { url?: URL; body?: unknown; method?: string } = {};
  server.use(
    http[method](`${BASE}${path}`, async ({ request }) => {
      seen.url = new URL(request.url);
      seen.method = request.method;
      const text = await request.text();
      seen.body = text === "" ? undefined : JSON.parse(text);
      return HttpResponse.json(reply as Record<string, unknown>, { status });
    }),
  );
  return seen;
}

describe("webhooks: tenant-wide account_status", () => {
  it("create without account_ids sends no account_ids key", async () => {
    const seen = capture("post", "/v1/webhooks", { object: "webhook", id: "wh_1", account_ids: null }, 201);
    const res = await client.webhooks.create({ source: "account_status", request_url: "https://example.com/h" });
    expect(seen.body).toEqual({ source: "account_status", request_url: "https://example.com/h" });
    expect(res.account_ids).toBeNull();
  });

  it("update with account_ids: null switches to tenant-wide (null reaches the wire)", async () => {
    const seen = capture("patch", "/v1/webhooks/wh_1", { object: "webhook", id: "wh_1", account_ids: null });
    await client.webhooks.update("wh_1", { account_ids: null });
    expect(seen.body).toEqual({ account_ids: null });
  });
});

describe("accounts: external_id and metadata", () => {
  it("list({ external_id }) filters by query param", async () => {
    const seen = capture("get", "/v1/accounts", { object: "account_list", items: [], cursor: null });
    await client.accounts.list({ external_id: "usr_42" });
    expect(seen.url?.searchParams.get("external_id")).toBe("usr_42");
  });

  it("update carries external_id (null clears) and metadata (null clears)", async () => {
    const seen = capture("patch", "/v1/accounts/acc_1", { object: "account", account_id: "acc_1" });
    await client.accounts.update("acc_1", { external_id: null, metadata: null });
    expect(seen.body).toEqual({ external_id: null, metadata: null });
  });
});

describe("auth.intent: external_id, timezone, products", () => {
  it("forwards all three verbatim", async () => {
    const seen = capture("post", "/v1/auth/intent", { object: "account", account_id: "acc_1", external_id: "usr_42" }, 201);
    await client.auth.intent({
      seat_id: "seat_1",
      auth_method: "credentials",
      credentials: { email: "u@x.com", password: "p" },
      external_id: "usr_42",
      timezone: "Europe/Berlin",
      products: ["recruiter"],
    });
    expect(seen.body).toMatchObject({ external_id: "usr_42", timezone: "Europe/Berlin", products: ["recruiter"] });
  });
});

describe("auth.requestCheckpoint: challenge selection", () => {
  it("with { challenge } sends it and returns the next checkpoint (202)", async () => {
    const seen = capture(
      "post",
      "/v1/auth/checkpoint/request",
      { object: "checkpoint", status: "checkpoint_required", account_id: "acc_p", challenge_type: "two_factor_sms" },
      202,
    );
    const res = await client.auth.requestCheckpoint("acc_p", { challenge: "sms" });
    expect(seen.body).toEqual({ account_id: "acc_p", challenge: "sms" });
    if (!("status" in res)) throw new Error("expected the 202 checkpoint branch");
    expect(res.challenge_type).toBe("two_factor_sms");
  });

  it("without a body still sends exactly { account_id } (re-send)", async () => {
    const seen = capture("post", "/v1/auth/checkpoint/request", { object: "checkpoint", account_id: "acc_p", resent: true });
    await client.auth.requestCheckpoint("acc_p");
    expect(seen.body).toEqual({ account_id: "acc_p" });
  });
});

describe("accounts: public seat add / cancel / revert", () => {
  it("addSeats({ qty }) POSTs /v1/billing/seats/add", async () => {
    const seen = capture("post", "/v1/billing/seats/add", { charged_today_eur: 49, next_invoice_at: null, seat_ids: ["seat_2"] });
    const res = await client.accounts.addSeats({ qty: 1 });
    expect(seen.method).toBe("POST");
    expect(seen.body).toEqual({ qty: 1 });
    expect(res.seat_ids).toEqual(["seat_2"]);
  });

  it("cancelSeat(id) POSTs /v1/billing/seats/{id}/cancel with no body", async () => {
    const seen = capture("post", "/v1/billing/seats/seat_2/cancel", { effective_at: "2026-10-01T00:00:00.000Z" });
    const res = await client.accounts.cancelSeat("seat_2");
    expect(seen.url?.pathname).toBe("/v1/billing/seats/seat_2/cancel");
    expect(seen.body).toBeUndefined();
    expect(res.effective_at).toBe("2026-10-01T00:00:00.000Z");
  });

  it("revertSeatCancellation(id) POSTs /v1/billing/seats/{id}/cancel/revert", async () => {
    const seen = capture("post", "/v1/billing/seats/seat_2/cancel/revert", { reverted: true });
    const res = await client.accounts.revertSeatCancellation("seat_2");
    expect(seen.url?.pathname).toBe("/v1/billing/seats/seat_2/cancel/revert");
    expect(res.reverted).toBe(true);
  });

  it("a seat id is a value, not a path fragment (percent-encoded)", async () => {
    const seen = capture("post", "/v1/billing/seats/a%2F..%2Fb/cancel", { effective_at: "x" });
    await client.accounts.cancelSeat("a/../b");
    expect(seen.url?.pathname).toBe("/v1/billing/seats/a%2F..%2Fb/cancel");
  });

  it("a trial workspace's refusal surfaces as a typed error", async () => {
    server.use(
      http.post(`${BASE}/v1/billing/seats/add`, () =>
        HttpResponse.json(
          { code: "TRIAL_ACTIVE_SEAT_LIMIT", message: "trial", user_fixable: true, retry_likely_to_succeed: false },
          { status: 409 },
        ),
      ),
    );
    await expect(client.accounts.addSeats({ qty: 1 })).rejects.toMatchObject({ httpStatus: 409, code: "TRIAL_ACTIVE_SEAT_LIMIT" });
  });
});

describe("account webhook payload types external_id", () => {
  it("AccountPayload exposes external_id as string | null", () => {
    const p: AccountPayload = { account_id: "acc_1", event: "account.connected", occurred_at: "t", external_id: null };
    const id: string | null | undefined = p.external_id;
    expect(id).toBeNull();
  });
});
