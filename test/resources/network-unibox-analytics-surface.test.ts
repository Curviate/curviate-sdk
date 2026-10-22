// The root `network`, `unibox` and `analytics` namespaces, against a recorded transport (an injected `fetch`). One
// row per method: method, path, query and body on the wire. The comma-list
// rows cover every filter the API reads as one comma list (`explode: false`)
// and the empty-array fold. The paging block drives the list iterators over a
// two-page fixture typed against the generated page.
import { describe, expect, it } from "vitest";
import { Curviate, type BudgetRow } from "../../src/index.js";
import type { paths } from "../../src/generated/types.js";

const BASE = "https://app.curviate.test";

interface Sent {
  method: string;
  path: string;
  search: string;
  body: unknown;
}

function recorder(pages: unknown[] = [{ object: "ok", items: [], cursor: null }]) {
  const sent: Sent[] = [];
  const fetchImpl = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = new URL(String(input));
    sent.push({
      method: init?.method ?? "GET",
      path: url.pathname,
      search: decodeURIComponent(url.search),
      body: typeof init?.body === "string" ? JSON.parse(init.body) : undefined,
    });
    const payload = pages[Math.min(sent.length - 1, pages.length - 1)];
    return new Response(JSON.stringify(payload), { status: 200, headers: { "content-type": "application/json" } });
  }) as typeof fetch;
  return { sent, fetchImpl };
}

const client = (fetchImpl: typeof fetch) =>
  new Curviate({ apiKey: "cvt_test_network", baseUrl: BASE, fetch: fetchImpl, maxRetries: 0 });

type Row = [name: string, call: (c: Curviate) => Promise<unknown>, method: string, path: string, search: string, body: unknown];

const ODD = "a/b?c";
const ODD_PATH = "a%2Fb%3Fc";

const ROWS: Row[] = [
  // Network
  ["network.connections.list()", (c) => c.network.connections.list(), "GET", "/v1/network/connections", "", undefined],
  [
    "network.connections.list(filters) sends account_id as one comma list",
    (c) => c.network.connections.list({ account_id: ["acc_1", "acc_2"], q: "ada", include_removed: true, limit: 50, cursor: "cur_1" }),
    "GET",
    "/v1/network/connections",
    "?account_id=acc_1,acc_2&q=ada&include_removed=true&limit=50&cursor=cur_1",
    undefined,
  ],
  ["network.connections.list(account_id: []) omits it", (c) => c.network.connections.list({ account_id: [] }), "GET", "/v1/network/connections", "", undefined],
  ["network.syncStatus()", (c) => c.network.syncStatus(), "GET", "/v1/network/sync-status", "", undefined],
  ["network.syncStatus(account_id)", (c) => c.network.syncStatus({ account_id: ["acc_2", "acc_1"] }), "GET", "/v1/network/sync-status", "?account_id=acc_2,acc_1", undefined],
  ["network.resync", (c) => c.network.resync({ account_id: "acc_1" }), "POST", "/v1/network/resync", "", { account_id: "acc_1" }],

  // Unibox
  ["unibox.list()", (c) => c.unibox.list(), "GET", "/v1/unibox/chats", "", undefined],
  [
    "unibox.list(filters) sends account_ids, motion_ids, tags as comma lists",
    (c) =>
      c.unibox.list({
        account_ids: ["acc_1", "acc_2"],
        motion_ids: ["mot_1"],
        tags: ["vip", "q4"],
        unread: true,
        last_message_from: "them",
        type: "classic",
        q: "demo",
        limit: 20,
        cursor: "cur_1",
      }),
    "GET",
    "/v1/unibox/chats",
    "?account_ids=acc_1,acc_2&motion_ids=mot_1&tags=vip,q4&unread=true&last_message_from=them&type=classic&q=demo&limit=20&cursor=cur_1",
    undefined,
  ],
  ["unibox.list(empty lists) omits them", (c) => c.unibox.list({ account_ids: [], motion_ids: [], tags: [], unread: false }), "GET", "/v1/unibox/chats", "?unread=false", undefined],
  ["unibox.get", (c) => c.unibox.get(ODD, ODD), "GET", `/v1/unibox/chats/${ODD_PATH}/${ODD_PATH}`, "", undefined],
  ["unibox.unreadCount()", (c) => c.unibox.unreadCount(), "GET", "/v1/unibox/unread-count", "", undefined],
  ["unibox.unreadCount(account_ids)", (c) => c.unibox.unreadCount({ account_ids: ["acc_1", "acc_2"] }), "GET", "/v1/unibox/unread-count", "?account_ids=acc_1,acc_2", undefined],
  ["unibox.refresh()", (c) => c.unibox.refresh(), "POST", "/v1/unibox/refresh", "", {}],
  ["unibox.refresh(account_ids)", (c) => c.unibox.refresh({ account_ids: ["acc_1"] }), "POST", "/v1/unibox/refresh", "", { account_ids: ["acc_1"] }],
  ["unibox.tagContact()", (c) => c.unibox.tagContact(ODD, ODD), "POST", `/v1/unibox/chats/${ODD_PATH}/${ODD_PATH}/contact`, "", {}],
  ["unibox.tagContact(tags)", (c) => c.unibox.tagContact("acc_1", "chat_1", { tags: ["vip"] }), "POST", "/v1/unibox/chats/acc_1/chat_1/contact", "", { tags: ["vip"] }],
  ["unibox.enroll", (c) => c.unibox.enroll(ODD, ODD, { motion_id: "mot_1" }), "POST", `/v1/unibox/chats/${ODD_PATH}/${ODD_PATH}/enrollments`, "", { motion_id: "mot_1" }],
  ["unibox.accounts.list", (c) => c.unibox.accounts.list(), "GET", "/v1/unibox/accounts", "", undefined],
  ["unibox.accounts.update", (c) => c.unibox.accounts.update(ODD, { sync_full_inbox: true }), "PATCH", `/v1/unibox/accounts/${ODD_PATH}`, "", { sync_full_inbox: true }],

  // Analytics
  ["analytics.motions.list()", (c) => c.analytics.motions.list(), "GET", "/v1/analytics/motions", "", undefined],
  [
    "analytics.motions.list(window)",
    (c) => c.analytics.motions.list({ from: "2026-10-01", to: "2026-10-14", timezone: "Europe/Berlin", account_id: "acc_1" }),
    "GET",
    "/v1/analytics/motions",
    "?from=2026-10-01&to=2026-10-14&timezone=Europe/Berlin&account_id=acc_1",
    undefined,
  ],
  ["analytics.motions.get", (c) => c.analytics.motions.get(ODD), "GET", `/v1/analytics/motions/${ODD_PATH}`, "", undefined],
  ["analytics.motions.get(version)", (c) => c.analytics.motions.get("mot_1", { version: 2, from: "2026-10-01" }), "GET", "/v1/analytics/motions/mot_1", "?version=2&from=2026-10-01", undefined],
  ["analytics.activity()", (c) => c.analytics.activity(), "GET", "/v1/analytics/activity", "", undefined],
  ["analytics.activity(account_id)", (c) => c.analytics.activity({ account_id: "acc_1", timezone: "UTC" }), "GET", "/v1/analytics/activity", "?account_id=acc_1&timezone=UTC", undefined],
  ["analytics.events.list()", (c) => c.analytics.events.list(), "GET", "/v1/analytics/events", "", undefined],
  [
    "analytics.events.list(kind) sends one comma list",
    (c) => c.analytics.events.list({ motion_id: "mot_1", kind: ["invite.accepted", "message.replied"], limit: 10 }),
    "GET",
    "/v1/analytics/events",
    "?motion_id=mot_1&kind=invite.accepted,message.replied&limit=10",
    undefined,
  ],
  ["analytics.events.list(kind: []) omits it", (c) => c.analytics.events.list({ kind: [] }), "GET", "/v1/analytics/events", "", undefined],
];

describe("network, unibox, analytics: method -> wire request", () => {
  it.each(ROWS)("%s", async (_name, call, method, path, search, body) => {
    const { sent, fetchImpl } = recorder();
    await call(client(fetchImpl));
    expect(sent).toEqual([{ method, path, search, body }]);
  });
});

// ─── Paging ────────────────────────────────────────────────────────────────

type EventsPage = paths["/v1/analytics/events"]["get"]["responses"]["200"]["content"]["application/json"];
type ConnectionsPage = paths["/v1/network/connections"]["get"]["responses"]["200"]["content"]["application/json"];
type ChatsPage = paths["/v1/unibox/chats"]["get"]["responses"]["200"]["content"]["application/json"];

const event = (i: number): EventsPage["items"][number] => ({
  object: "analytics_event",
  id: `ane_${i}`,
  kind: "step.executed",
  occurred_at: "2026-10-19T10:00:00Z",
  motion_id: "mot_1",
  motion_name: "Q4 follow-up",
  enrollment_id: `enr_${i}`,
  account_id: "acc_1",
  step_id: "invite",
  action: "invite.send",
  variant_id: null,
  outcome: "executed",
  reason: null,
  reason_message: null,
  contact: { id: `con_${i}`, full_name: "Test Person", linkedin_url: "https://www.linkedin.com/in/test-person" },
});

// Two pages of the served shape: 20, then 5 with the closing `null` cursor.
const EVENT_PAGES: EventsPage[] = [
  { object: "analytics_event_list", items: Array.from({ length: 20 }, (_, i) => event(i)), cursor: "cur_p2" },
  { object: "analytics_event_list", items: Array.from({ length: 5 }, (_, i) => event(20 + i)), cursor: null },
];

describe("list iterators page through the cursor", () => {
  it("analytics.events.list auto-pages: 25 items over two pages, filters kept, cursor followed", async () => {
    const { sent, fetchImpl } = recorder(EVENT_PAGES);
    const ids: string[] = [];
    for await (const e of client(fetchImpl).analytics.events.list({ motion_id: "mot_1", kind: ["step.executed"], limit: 20 })) {
      ids.push(e.id);
    }
    expect(ids).toEqual(Array.from({ length: 25 }, (_, i) => `ane_${i}`));
    expect(sent.map((s) => s.search)).toEqual([
      "?motion_id=mot_1&kind=step.executed&limit=20",
      "?motion_id=mot_1&kind=step.executed&limit=20&cursor=cur_p2",
    ]);
  });

  it("awaiting the same call returns the first page only (one request)", async () => {
    const { sent, fetchImpl } = recorder(EVENT_PAGES);
    const page = await client(fetchImpl).analytics.events.list();
    expect(page.items).toHaveLength(20);
    expect(page.cursor).toBe("cur_p2");
    expect(sent).toHaveLength(1);
  });

  it("iterating does not refetch the first page", async () => {
    const { sent, fetchImpl } = recorder(EVENT_PAGES);
    let n = 0;
    for await (const _ of client(fetchImpl).analytics.events.list()) n += 1;
    expect([n, sent.length]).toEqual([25, 2]);
  });

  it("a one-page list with a null cursor stops after one request; an empty page yields nothing", async () => {
    const one = recorder([EVENT_PAGES[1]]);
    let n = 0;
    for await (const _ of client(one.fetchImpl).analytics.events.list()) n += 1;
    expect([n, one.sent.length]).toEqual([5, 1]);

    const empty = recorder([{ object: "analytics_event_list", items: [], cursor: null }]);
    let m = 0;
    for await (const _ of client(empty.fetchImpl).analytics.events.list()) m += 1;
    expect([m, empty.sent.length]).toEqual([0, 1]);
  });

  it("a failed first page rejects the iterator (no unhandled rejection)", async () => {
    const fetchImpl = (async () =>
      new Response(JSON.stringify({ code: "INVALID_REQUEST", message: "bad", user_fixable: true, retry_likely_to_succeed: false }), {
        status: 400,
        headers: { "content-type": "application/json" },
      })) as typeof fetch;
    const run = async () => {
      for await (const _ of client(fetchImpl).analytics.events.list()) void _;
    };
    await expect(run()).rejects.toMatchObject({ code: "INVALID_REQUEST" });
  });

  it("a failed first page iterated later (or never) raises no unhandled rejection", async () => {
    const unhandled: unknown[] = [];
    const onUnhandled = (r: unknown) => unhandled.push(r);
    process.on("unhandledRejection", onUnhandled);
    try {
      const fetchImpl = (async () =>
        new Response(JSON.stringify({ code: "UNAUTHORIZED", message: "no", user_fixable: true, retry_likely_to_succeed: false }), {
          status: 401,
          headers: { "content-type": "application/json" },
        })) as typeof fetch;
      const later = client(fetchImpl).unibox.list();
      client(fetchImpl).unibox.list(); // never used
      await new Promise((r) => setTimeout(r, 20));
      const run = async () => {
        for await (const _ of later) void _;
      };
      await expect(run()).rejects.toMatchObject({ code: "UNAUTHORIZED" });
      await new Promise((r) => setTimeout(r, 20));
      expect(unhandled).toEqual([]);
    } finally {
      process.off("unhandledRejection", onUnhandled);
    }
  });

  it("network.connections.list and unibox.list iterate the same way", async () => {
    const conn = (cursor: string | null, id: string) => ({ object: "connection_list", items: [{ member_id: id }], cursor, coverage: {} }) as unknown as ConnectionsPage;
    const c = recorder([conn("n2", "c1"), conn(null, "c2")]);
    const got: unknown[] = [];
    for await (const item of client(c.fetchImpl).network.connections.list({ account_id: ["acc_1"] })) got.push(item.member_id);
    expect(got).toEqual(["c1", "c2"]);
    expect(c.sent.map((s) => s.search)).toEqual(["?account_id=acc_1", "?account_id=acc_1&cursor=n2"]);

    const chats = (cursor: string | null, id: string) => ({ object: "unibox_chat_list", items: [{ chat_id: id }], cursor, coverage: {} }) as unknown as ChatsPage;
    const u = recorder([chats("u2", "ch1"), chats(null, "ch2")]);
    const seen: unknown[] = [];
    for await (const item of client(u.fetchImpl).unibox.list()) seen.push(item.chat_id);
    expect(seen).toEqual(["ch1", "ch2"]);
    expect(u.sent.map((s) => s.search)).toEqual(["", "?cursor=u2"]);
  });
});

describe("BudgetRow regen: the served enum carries the sync-only rows", () => {
  it("connections_sync and inbox_sync are budget_row members (compile time)", () => {
    const rows: BudgetRow[] = ["connections_sync", "inbox_sync"];
    // @ts-expect-error a row the API does not serve is not a BudgetRow
    const bogus: BudgetRow = "unibox_sync";
    expect([...rows, bogus]).toHaveLength(3);
  });
});
