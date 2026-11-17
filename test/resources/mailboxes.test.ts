// mailboxes, domains, the Mailbox Connect request and the Team safety policy: one table, the wire shape of every
// new operation (method, path, query, body), the `mailboxes.list` budget (one HTTP call per page) and the
// 404 decode of the new codes. Fixture passwords are plainly fake.
import { http, HttpResponse } from "msw";
import { describe, expect, it } from "vitest";
import { server } from "../msw/server.js";
import { Curviate, CurviateError, ERROR_CODES } from "../../src/index.js";

const BASE = "https://app.curviate.test";
const c = new Curviate({ apiKey: "cvt_test_mbx", baseUrl: BASE });

type Seen = { method: string; path: string; query: string; body: unknown };
async function call(run: () => Promise<unknown>, reply: unknown = {}): Promise<Seen> {
  let seen: Seen | undefined;
  server.use(
    http.all(`${BASE}/*`, async ({ request }) => {
      const url = new URL(request.url);
      const text = await request.text();
      seen = { method: request.method, path: url.pathname, query: url.search, body: text ? JSON.parse(text) : undefined };
      return HttpResponse.json(reply as Record<string, unknown>);
    }),
  );
  await run();
  return seen!;
}

describe("Mailbox, Domain and Team-policy operations", () => {
  const sends_for = { kind: "account" as const, account_id: "acc_1" };
  const mailbox = { connection: "imap_smtp" as const, address: "a@acme.example", imap: { host: "imap.acme.example", port: 993, security: "tls" as const }, smtp: { host: "smtp.acme.example", port: 465, security: "tls" as const } };
  const rows: Array<[string, () => Promise<unknown>, Partial<Seen>]> = [
    ["mailboxes.list", () => c.mailboxes.list({ state: "ramping", sends_for: "none", domain: "acme.example", limit: 5 }), { method: "GET", path: "/v1/mailboxes", query: "?state=ramping&sends_for=none&domain=acme.example&limit=5" }],
    ["mailboxes.get", () => c.mailboxes.get("mbx_1"), { method: "GET", path: "/v1/mailboxes/mbx_1" }],
    ["mailboxes.update", () => c.mailboxes.update("mbx_1", { sends_for, daily_cap: 30, signature: null }), { method: "PATCH", path: "/v1/mailboxes/mbx_1", body: { sends_for, daily_cap: 30, signature: null } }],
    ["mailboxes.update shared", () => c.mailboxes.update("mbx_1", { sends_for: { kind: "shared" } }), { method: "PATCH", body: { sends_for: { kind: "shared" } } }],
    ["mailboxes.pause", () => c.mailboxes.pause("mbx_1"), { method: "POST", path: "/v1/mailboxes/mbx_1/pause" }],
    ["mailboxes.resume", () => c.mailboxes.resume("mbx_1"), { method: "POST", path: "/v1/mailboxes/mbx_1/resume" }],
    ["mailboxes.remove", () => c.mailboxes.remove("mbx_1"), { method: "DELETE", path: "/v1/mailboxes/mbx_1" }],
    ["mailboxes.discover", () => c.mailboxes.discover("a+b@acme.example"), { method: "GET", path: "/v1/mailboxes/discover", query: "?address=a%2Bb%40acme.example" }],
    ["domains.check", () => c.domains.check("acme.example"), { method: "GET", path: "/v1/domains/acme.example/checks" }],
    ["domains.check now", () => c.domains.check("acme.example", { now: true }), { method: "POST", path: "/v1/domains/acme.example/checks" }],
    ["connectRequests.create mailbox", () => c.connectRequests.create({ mailbox }), { method: "POST", path: "/v1/auth/connect-requests", body: { mailbox } }],
    ["connectRequests.create reconnect + sealed credentials", () => c.connectRequests.create({ mailbox_id: "mbx_1", credentials: { password: "fake-not-a-password" } }), { method: "POST", body: { mailbox_id: "mbx_1", credentials: { password: "fake-not-a-password" } } }],
    ["connectRequests.create google_sign_in", () => c.connectRequests.create({ mailbox: { connection: "google_sign_in", address: "a@acme.example" } }), { method: "POST", body: { mailbox: { connection: "google_sign_in", address: "a@acme.example" } } }],
    ["accounts.getTeamSafetyPolicy", () => c.accounts.getTeamSafetyPolicy(), { method: "GET", path: "/v1/safety-policy" }],
    ["accounts.updateTeamSafetyPolicy email", () => c.accounts.updateTeamSafetyPolicy({ email: { default_daily_cap: 40, opt_out_scope: "email_only", opt_out_link_word: "Abmelden" } }), { method: "PATCH", path: "/v1/safety-policy", body: { email: { default_daily_cap: 40, opt_out_scope: "email_only", opt_out_link_word: "Abmelden" } } }],
  ];

  it.each(rows)("%s", async (_name, run, want) => {
    const seen = await call(run);
    for (const [k, v] of Object.entries(want)) expect(seen[k as keyof Seen], k).toEqual(v);
  });

  it("mailboxes.list: one HTTP call per page, the cursor is the only thing sent on", async () => {
    const urls: string[] = [];
    server.use(
      http.get(`${BASE}/v1/mailboxes`, ({ request }) => {
        urls.push(new URL(request.url).search);
        return HttpResponse.json(urls.length === 1 ? { items: [{ id: "mbx_1" }, { id: "mbx_2" }], cursor: "p2" } : { items: [{ id: "mbx_3" }], cursor: null });
      }),
    );
    const ids: string[] = [];
    for await (const m of c.paginate(c.mailboxes.list.bind(c.mailboxes), { limit: 2 })) ids.push((m as { id: string }).id);
    expect(ids).toEqual(["mbx_1", "mbx_2", "mbx_3"]);
    expect(urls).toEqual(["?limit=2", "?limit=2&cursor=p2"]);
  });

  it("the Mailbox and Domain codes are exported and decode to themselves, not INTERNAL", async () => {
    const codes = ["MAILBOX_NOT_FOUND", "DOMAIN_NOT_FOUND", "MAILBOX_STATE_CONFLICT", "MAILBOX_LIMIT_REACHED", "MAILBOX_ALREADY_CONNECTED", "MAILBOX_APP_PASSWORD_REQUIRED", "MAILBOX_CREDENTIAL_REJECTED", "MAILBOX_TLS_FAILED", "MAILBOX_ADMIN_APPROVAL_REQUIRED", "MAILBOX_ADDRESS_MISMATCH"];
    for (const code of codes) expect(ERROR_CODES, code).toContain(code);
    server.use(http.get(`${BASE}/v1/mailboxes/mbx_x`, () => HttpResponse.json({ code: "MAILBOX_NOT_FOUND", message: "No such Mailbox.", user_fixable: true, retry_likely_to_succeed: false }, { status: 404 })));
    const err = await c.mailboxes.get("mbx_x").catch((e: unknown) => e);
    expect(err).toBeInstanceOf(CurviateError);
    expect((err as CurviateError).code).toBe("MAILBOX_NOT_FOUND");
  });
});
