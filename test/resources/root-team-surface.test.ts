// The root `notifications`,
// `connectRequests` and `teams` namespaces, `accounts.setTeamAccess`, and the
// `team` client option, against a recorded transport (an injected `fetch`).
// One row per method: method, path, query and body on the wire.
import { describe, expect, it } from "vitest";
import { Curviate, ERROR_CODES, isCurviateError } from "../../src/index.js";

const BASE = "https://app.curviate.test";

interface Sent {
  method: string;
  path: string;
  query: Record<string, string>;
  body: unknown;
  team: string | null;
}

function recorder(status = 200, payload: unknown = { object: "ok" }) {
  const sent: Sent[] = [];
  const fetchImpl = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = new URL(String(input));
    const headers = new Headers(init?.headers);
    sent.push({
      method: init?.method ?? "GET",
      path: url.pathname,
      query: Object.fromEntries(url.searchParams),
      body: typeof init?.body === "string" ? JSON.parse(init.body) : undefined,
      team: headers.get("x-curviate-team"),
    });
    return new Response(JSON.stringify(payload), {
      status,
      headers: { "content-type": "application/json" },
    });
  }) as typeof fetch;
  return { sent, fetchImpl };
}

type Row = [
  name: string,
  call: (c: Curviate) => Promise<unknown>,
  method: string,
  path: string,
  query: Record<string, string>,
  body: unknown,
];

// A urn-ish id with the characters the path encoder exists for.
const ODD = "a/b?c";

const ROWS: Row[] = [
  // Curviate Notifications (root)
  ["notifications.list()", (c) => c.notifications.list(), "GET", "/v1/notifications", {}, undefined],
  [
    "notifications.list(query)",
    (c) => c.notifications.list({ filter: "unread", limit: 5, cursor: "cur_1" }),
    "GET",
    "/v1/notifications",
    { filter: "unread", limit: "5", cursor: "cur_1" },
    undefined,
  ],
  ["notifications.unreadCount", (c) => c.notifications.unreadCount(), "GET", "/v1/notifications/unread-count", {}, undefined],
  [
    "notifications.update",
    (c) => c.notifications.update("ntf_1", { archived: true }),
    "PATCH",
    "/v1/notifications/ntf_1",
    {},
    { archived: true },
  ],
  ["notifications.update encodes the id", (c) => c.notifications.update(ODD, { read: true }), "PATCH", "/v1/notifications/a%2Fb%3Fc", {}, { read: true }],
  ["notifications.markAllRead()", (c) => c.notifications.markAllRead(), "POST", "/v1/notifications/mark-all-read", {}, {}],
  [
    "notifications.markAllRead({before})",
    (c) => c.notifications.markAllRead({ before: "2026-10-01T00:00:00Z" }),
    "POST",
    "/v1/notifications/mark-all-read",
    {},
    { before: "2026-10-01T00:00:00Z" },
  ],
  // LinkedIn notifications stay account-scoped
  ["account(id).notifications.list", (c) => c.account("acc_1").notifications.list(), "GET", "/v1/acc_1/notifications", {}, undefined],

  // Connect requests
  ["connectRequests.create()", (c) => c.connectRequests.create(), "POST", "/v1/auth/connect-requests", {}, {}],
  [
    "connectRequests.create({account_id})",
    (c) => c.connectRequests.create({ account_id: "acc_1" }),
    "POST",
    "/v1/auth/connect-requests",
    {},
    { account_id: "acc_1" },
  ],
  ["connectRequests.get", (c) => c.connectRequests.get("cr_1"), "GET", "/v1/auth/connect-requests/cr_1", {}, undefined],
  ["connectRequests.cancel", (c) => c.connectRequests.cancel(ODD), "POST", "/v1/auth/connect-requests/a%2Fb%3Fc/cancel", {}, undefined],

  // Teams
  ["teams.list", (c) => c.teams.list({ limit: 2 }), "GET", "/v1/teams", { limit: "2" }, undefined],
  ["teams.getCurrent", (c) => c.teams.getCurrent(), "GET", "/v1/teams/current", {}, undefined],
  ["teams.updateCurrent", (c) => c.teams.updateCurrent({ name: "Ops" }), "PATCH", "/v1/teams/current", {}, { name: "Ops" }],
  ["teams.listMembers", (c) => c.teams.listMembers({ cursor: "cur_m" }), "GET", "/v1/teams/current/members", { cursor: "cur_m" }, undefined],
  [
    "teams.updateMember",
    (c) => c.teams.updateMember("usr_1", { role: "manager" }),
    "PATCH",
    "/v1/teams/current/members/usr_1",
    {},
    { role: "manager" },
  ],
  ["teams.removeMember", (c) => c.teams.removeMember("usr_1"), "DELETE", "/v1/teams/current/members/usr_1", {}, undefined],
  ["teams.removeMember('me') leaves", (c) => c.teams.removeMember("me"), "DELETE", "/v1/teams/current/members/me", {}, undefined],
  [
    "teams.createInvites",
    (c) => c.teams.createInvites({ invites: [{ email: "a@x.test", role: "member" }] }),
    "POST",
    "/v1/teams/current/invites",
    {},
    { invites: [{ email: "a@x.test", role: "member" }] },
  ],
  ["teams.listInvites", (c) => c.teams.listInvites({ status: "pending" }), "GET", "/v1/teams/current/invites", { status: "pending" }, undefined],
  ["teams.resendInvite", (c) => c.teams.resendInvite("inv_1"), "POST", "/v1/teams/current/invites/inv_1/resend", {}, undefined],
  ["teams.revokeInvite", (c) => c.teams.revokeInvite(ODD), "DELETE", "/v1/teams/current/invites/a%2Fb%3Fc", {}, undefined],

  // Account team access — identity/007 owed ripple
  [
    "accounts.setTeamAccess",
    (c) => c.accounts.setTeamAccess("acc_1", false),
    "PUT",
    "/v1/accounts/acc_1/team-access",
    {},
    { team_access: false },
  ],
];

describe("root team surface: method -> wire request", () => {
  it.each(ROWS)("%s", async (_name, call, method, path, query, body) => {
    const { sent, fetchImpl } = recorder();
    const client = new Curviate({ apiKey: "cvt_test_team", baseUrl: BASE, fetch: fetchImpl });
    await call(client);
    expect(sent).toEqual([{ method, path, query, body, team: null }]);
  });

  it("is unreachable from an account scope (root-only namespaces)", () => {
    const acc = new Curviate({ apiKey: "k" }).account("acc_1") as unknown as Record<string, unknown>;
    expect(acc.teams).toBeUndefined();
    expect(acc.connectRequests).toBeUndefined();
  });
});

describe("`team` option sends X-Curviate-Team", () => {
  it.each([
    ["set: root call", "team_b", (c: Curviate) => c.teams.getCurrent(), "team_b"],
    ["set: account-scoped call", "team_b", (c: Curviate) => c.account("acc_1").notifications.list(), "team_b"],
    ["unset: no header", undefined, (c: Curviate) => c.teams.getCurrent(), null],
  ] as const)("%s", async (_n, team, call, expected) => {
    const { sent, fetchImpl } = recorder();
    const client = new Curviate({
      apiKey: "jwt",
      baseUrl: BASE,
      fetch: fetchImpl,
      ...(team !== undefined ? { team } : {}),
    });
    await call(client);
    expect(sent[0]!.team).toBe(expected);
  });

  it("an empty team is refused at construction, no request", () => {
    expect(() => new Curviate({ apiKey: "k", team: "" })).toThrow(/team/);
  });
});

describe("team and connect-request refusals decode to their own code, not INTERNAL", () => {
  const CODES = [
    "TEAM_ACCESS_DENIED",
    "ACCOUNT_NOT_SHARED",
    "ACCOUNT_OWNER_ONLY",
    "ALREADY_MEMBER",
    "BILLING_OWNER_REQUIRED",
    "DEFAULT_TEAM_PROTECTED",
    "INVITE_ALREADY_PENDING",
    "INVITE_LIMIT_REACHED",
    "INVITE_NOT_PENDING",
    "LAST_OWNER",
    "CONNECT_REQUEST_IN_USE",
    "CONNECT_REQUEST_NOT_PENDING",
    "LINKEDIN_ACCOUNT_MISMATCH",
  ];
  it.each(CODES)("%s", async (code) => {
    expect(ERROR_CODES).toContain(code);
    const { fetchImpl } = recorder(409, {
      object: "error",
      code,
      message: "refused",
      user_fixable: true,
      retry_likely_to_succeed: false,
    });
    const client = new Curviate({ apiKey: "k", baseUrl: BASE, fetch: fetchImpl, maxRetries: 0 });
    const err = await client.teams.getCurrent().catch((e: unknown) => e);
    expect(isCurviateError(err) && err.code).toBe(code);
  });

  it("POSITIVE CONTROL: an unknown code still decodes to INTERNAL", async () => {
    const { fetchImpl } = recorder(409, { object: "error", code: "NOT_A_CODE", message: "x" });
    const client = new Curviate({ apiKey: "k", baseUrl: BASE, fetch: fetchImpl, maxRetries: 0 });
    const err = await client.teams.getCurrent().catch((e: unknown) => e);
    expect(isCurviateError(err) && err.code).toBe("INTERNAL");
  });
});
