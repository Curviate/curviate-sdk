// Rules the parity table cannot fail on: what goes on the wire for the new
// bytes, raw-body, list-array and no-argument calls, and the served `details`.
import { http, HttpResponse } from "msw";
import { describe, expect, it } from "vitest";
import { server } from "./msw/server.js";
import { Curviate, Sequence, isCurviateError, step } from "../src/index.js";
import type { LeadImportCreateBody } from "../src/resources/leads.js";

const BASE = "https://app.curviate.test";
const client = new Curviate({ apiKey: "cvt_test_ripple_b", baseUrl: BASE, maxRetries: 0 });
const text = (b: ArrayBuffer) => new TextDecoder("utf-8", { ignoreBOM: true }).decode(b);

describe("downloads resolve with bytes", () => {
  it("every file comes back as the exact bytes served, a json one included", async () => {
    server.use(
      http.get(`${BASE}/v1/exports/exp_json/file`, () => new HttpResponse('[ {"a": 1} ]', { headers: { "content-type": "application/json" } })),
      http.get(`${BASE}/v1/analytics/export`, () => new HttpResponse("﻿day,sent\n", { headers: { "content-type": "text/csv" } })),
      http.get(`${BASE}/v1/billing/invoices/INV-1/pdf`, () => new HttpResponse("%PDF-1.7", { headers: { "content-type": "application/pdf" } })),
    );
    const json = await client.exports.download("exp_json");
    expect(json).toBeInstanceOf(ArrayBuffer);
    expect(text(json)).toBe('[ {"a": 1} ]');
    expect(text(await client.analytics.export({ table: ["daily"] }))).toBe("﻿day,sent\n");
    expect(text(await client.billing.invoices.pdf("INV-1"))).toBe("%PDF-1.7");
  });
});

describe("request shapes", () => {
  it("setLogo PUTs the PNG bytes raw as image/png", async () => {
    let seen: { method: string; type: string | null; bytes: number[] } | undefined;
    server.use(
      http.put(`${BASE}/v1/teams/current/logo`, async ({ request }) => {
        seen = { method: request.method, type: request.headers.get("content-type"), bytes: [...new Uint8Array(await request.arrayBuffer())] };
        return HttpResponse.json({ object: "team", team_id: "tnt_1", logo_url: "https://x/logo.png" });
      }),
    );
    await client.teams.setLogo(new Uint8Array([0x89, 0x50, 0x4e, 0x47]));
    expect(seen).toEqual({ method: "PUT", type: "image/png", bytes: [0x89, 0x50, 0x4e, 0x47] });
  });

  it("leads.list joins list_id and not_list_id arrays into comma lists", async () => {
    let url: URL | undefined;
    server.use(http.get(`${BASE}/v1/leads`, ({ request }) => { url = new URL(request.url); return HttpResponse.json({ object: "lead_page", items: [], cursor: null, total: 0 }); }));
    await client.leads.list({ list_id: ["cl_1", "cl_2"], not_list_id: ["cl_3"], list_match: "all", has_email: true, include_total: true });
    expect(Object.fromEntries(url!.searchParams)).toEqual({ list_id: "cl_1,cl_2", not_list_id: "cl_3", list_match: "all", has_email: "true", include_total: "true" });
  });

  it("each renamed method makes one HTTP call, at the renamed path", async () => {
    const calls: string[] = [];
    const ok = ({ request }: { request: Request }) => { calls.push(`${request.method} ${new URL(request.url).pathname}`); return HttpResponse.json({}); };
    server.use(
      http.get(`${BASE}/v1/leads/imports`, ok), http.get(`${BASE}/v1/lead-lists/cl_1`, ok), http.get(`${BASE}/v1/campaigns/mot_1`, ok),
      http.post(`${BASE}/v1/campaigns/mot_1/leads`, ok), http.post(`${BASE}/v1/campaigns/mot_1/leads/remove`, ok),
      http.get(`${BASE}/v1/analytics/campaigns/mot_1`, ok), http.post(`${BASE}/v1/unibox/chats/acc_1/c_1/lead`, ok),
    );
    await client.leads.imports.list();
    await client.leadLists.get("cl_1");
    await client.campaigns.get("mot_1");
    await client.campaigns.addLeads("mot_1", { lead_ids: ["con_1"] });
    await client.campaigns.removeLeads("mot_1", { lead_ids: ["con_1"] });
    await client.analytics.campaigns.get("mot_1");
    await client.unibox.tagLead("acc_1", "c_1");
    expect(calls).toEqual([
      "GET /v1/leads/imports", "GET /v1/lead-lists/cl_1", "GET /v1/campaigns/mot_1", "POST /v1/campaigns/mot_1/leads",
      "POST /v1/campaigns/mot_1/leads/remove", "GET /v1/analytics/campaigns/mot_1", "POST /v1/unibox/chats/acc_1/c_1/lead",
    ]);
  });

  it("each pass-2 method makes one call: method, path, query and body as served", async () => {
    const calls: unknown[] = [];
    server.use(
      http.all(`${BASE}/v1/*`, async ({ request }) => {
        const u = new URL(request.url);
        const raw = request.method === "GET" ? "" : await request.text();
        calls.push([request.method, u.pathname, Object.fromEntries(u.searchParams), raw ? JSON.parse(raw) : null]);
        return HttpResponse.json({});
      }),
    );
    await client.unibox.list({ reply_label: ["interested", "none"] });
    await client.unibox.getReplyLabel("m_1");
    await client.unibox.updateMessage("m_1", { reply_label: "out_of_office" });
    await client.teams.getReplyLabels();
    await client.teams.updateReplyLabels({ enabled: true, tags: { interested: "tag_1", other: null } });
    await client.leads.imports.create({ source: { kind: "people_search", account_id: "acc_1", filters: { keywords: "cto", network_distance: [2] } } });
    // IMP-25: `filters` is typed per kind from the served document; a key no kind offers does not compile.
    // @ts-expect-error not_a_filter is offered by no kind
    const typedFilters: LeadImportCreateBody = { source: { kind: "people_search", account_id: "acc_1", filters: { not_a_filter: 1 } } };
    void typedFilters;
    await client.leads.imports.pause("imp_1");
    await client.leads.imports.resume("imp_1");
    await client.leads.imports.stop("imp_1");
    await client.analytics.email({ range: "30d", campaign_id: ["mot_1", "mot_2"], include: ["weeks"] });
    await client.companies.get("1234567");
    await client.companies.update("1234567", { extra: { tier: "A", owner: null } });
    await client.account("acc_1").companies.get("acme", { mode: "cache_only" });
    await client.notifications.list({ channel: "email" });
    await client.billing.moveToCurrentPrice();
    await client.signals.list({ kind: "post_engaged", match: "lead", listed: false });
    await client.signals.get("sig_1");
    await client.signals.kinds();
    await client.signals.watch();
    await client.signals.updateSettings({ follow_up: { profile_viewed: false } });
    await client.signals.rules.list({ enabled: true });
    await client.signals.rules.create({ name: "r", kinds: ["profile_viewed"], outcomes: [{ type: "send_event" }] });
    await client.signals.rules.get("sgr_1");
    await client.signals.rules.update("sgr_1", { enabled: false });
    await client.signals.rules.delete("sgr_1");
    expect(calls).toEqual([
      ["GET", "/v1/unibox/chats", { reply_label: "interested,none" }, null],
      ["GET", "/v1/unibox/messages/m_1/reply-label", {}, null],
      ["PATCH", "/v1/unibox/messages/m_1", {}, { reply_label: "out_of_office" }],
      ["GET", "/v1/teams/current/reply-labels", {}, null],
      ["PATCH", "/v1/teams/current/reply-labels", {}, { enabled: true, tags: { interested: "tag_1", other: null } }],
      ["POST", "/v1/leads/imports", {}, { source: { kind: "people_search", account_id: "acc_1", filters: { keywords: "cto", network_distance: [2] } } }],
      ["POST", "/v1/leads/imports/imp_1/pause", {}, null],
      ["POST", "/v1/leads/imports/imp_1/resume", {}, null],
      ["POST", "/v1/leads/imports/imp_1/stop", {}, null],
      ["GET", "/v1/analytics/email", { range: "30d", campaign_id: "mot_1,mot_2", include: "weeks" }, null],
      ["GET", "/v1/companies/1234567", {}, null],
      ["PATCH", "/v1/companies/1234567", {}, { extra: { tier: "A", owner: null } }],
      ["GET", "/v1/acc_1/companies/acme", { mode: "cache_only" }, null],
      ["GET", "/v1/notifications", { channel: "email" }, null],
      ["POST", "/v1/billing/subscription/move-to-current-price", {}, null],
      ["GET", "/v1/signals", { kind: "post_engaged", match: "lead", listed: "false" }, null],
      ["GET", "/v1/signals/sig_1", {}, null],
      ["GET", "/v1/signals/kinds", {}, null],
      ["GET", "/v1/signals/watch", {}, null],
      ["PATCH", "/v1/signals/settings", {}, { follow_up: { profile_viewed: false } }],
      ["GET", "/v1/signals/rules", { enabled: "true" }, null],
      ["POST", "/v1/signals/rules", {}, { name: "r", kinds: ["profile_viewed"], outcomes: [{ type: "send_event" }] }],
      ["GET", "/v1/signals/rules/sgr_1", {}, null],
      ["PATCH", "/v1/signals/rules/sgr_1", {}, { enabled: false }],
      ["DELETE", "/v1/signals/rules/sgr_1", {}, null],
    ]);
  });

  it("each pass-3 method makes one call: method, path, query and body as served; an upload sends the bytes raw", async () => {
    const calls: unknown[] = [];
    server.use(
      http.all(`${BASE}/v1/*`, async ({ request }) => {
        const u = new URL(request.url);
        const raw = request.method === "GET" ? "" : request.headers.get("content-type") === "application/json" ? await request.text() : "";
        const bytes = request.method !== "GET" && !raw ? [...new Uint8Array(await request.arrayBuffer())] : null;
        calls.push([request.method, u.pathname, Object.fromEntries(u.searchParams), raw ? JSON.parse(raw) : bytes && { type: request.headers.get("content-type"), bytes }]);
        return HttpResponse.json({});
      }),
    );
    await client.signals.setWatch("acc_1", { signal_watch: true });
    await client.signals.actions({ outcome: "skipped", rule_id: "sgr_1" });
    await client.analytics.emailAttention({ campaign_id: "mot_1" });
    await client.unibox.getConversation("cnv_1");
    await client.unibox.listConversationMessages("cnv_1", { channel: "email", limit: 20 });
    await client.campaigns.attachments.upload(new Uint8Array([0x25, 0x50, 0x44, 0x46]), { filename: "pricing.pdf", contentType: "application/pdf" });
    await client.campaigns.attachments.get("cat_1");
    await client.unibox.markConversation("cnv_1", { read: false });
    await client.unibox.sendEmail("cnv_1", { text: "Thanks", thread_id: "thr_1" });
    await client.unibox.referralSearch("msg_1");
    await client.unibox.referralConfirm("msg_1", { provider_id: "ACo1" });
    await client.billing.switchPeriod();
    expect(calls).toEqual([
      ["PATCH", "/v1/signals/watch/acc_1", {}, { signal_watch: true }],
      ["GET", "/v1/signals/actions", { outcome: "skipped", rule_id: "sgr_1" }, null],
      ["GET", "/v1/analytics/email/attention", { campaign_id: "mot_1" }, null],
      ["GET", "/v1/unibox/conversations/cnv_1", {}, null],
      ["GET", "/v1/unibox/conversations/cnv_1/messages", { channel: "email", limit: "20" }, null],
      ["POST", "/v1/campaigns/attachments", { filename: "pricing.pdf" }, { type: "application/pdf", bytes: [0x25, 0x50, 0x44, 0x46] }],
      ["GET", "/v1/campaigns/attachments/cat_1", {}, null],
      ["PATCH", "/v1/unibox/conversations/cnv_1", {}, { read: false }],
      ["POST", "/v1/unibox/conversations/cnv_1/emails", {}, { text: "Thanks", thread_id: "thr_1" }],
      ["POST", "/v1/unibox/messages/msg_1/referral/search", {}, {}],
      ["POST", "/v1/unibox/messages/msg_1/referral/confirm", {}, { provider_id: "ACo1" }],
      ["POST", "/v1/billing/subscription/switch-period", {}, { to: "annual" }],
    ]);
  });

  it("network.resync() with no argument still sends a JSON body (Resync all)", async () => {
    let body: unknown;
    server.use(http.post(`${BASE}/v1/network/resync`, async ({ request }) => { body = await request.json(); return HttpResponse.json({ object: "network_resync_list", items: [] }, { status: 202 }); }));
    await client.network.resync();
    expect(body).toEqual({});
  });

  it("startChat sends a group (attendees, subject) and shared_content; sendMessage sends shared_content", async () => {
    const seen: Record<string, unknown> = {};
    server.use(
      http.post(`${BASE}/v1/acc_1/chats`, async ({ request }) => { seen["start"] = await request.json(); return HttpResponse.json({ chat_id: "c_1", message_id: "m_1" }, { status: 201 }); }),
      http.post(`${BASE}/v1/acc_1/chats/c_1/messages`, async ({ request }) => { seen["send"] = await request.json(); return HttpResponse.json({ message_id: "m_2", chat_id: "c_1" }, { status: 201 }); }),
    );
    const acc = client.account("acc_1");
    const job = { type: "job_posting", id: "4012345678" } as const;
    await acc.messaging.startChat({ attendees_ids: ["ACo_A", "ACo_B"], subject: "Q4 intro", text: "Hi both.", shared_content: job });
    await acc.messaging.sendMessage("c_1", { text: "See this.", shared_content: { type: "post", id: "7380123456789012345" } });
    expect(seen).toEqual({
      start: { attendees_ids: ["ACo_A", "ACo_B"], subject: "Q4 intro", text: "Hi both.", shared_content: job },
      send: { text: "See this.", shared_content: { type: "post", id: "7380123456789012345" } },
    });
  });
});

describe("served error details", () => {
  it("TIER_REQUIRED surfaces details.account_id", async () => {
    server.use(
      http.post(`${BASE}/v1/do-not-contact`, () =>
        HttpResponse.json(
          { code: "TIER_REQUIRED", message: "x", user_fixable: true, retry_likely_to_succeed: false, details: { account_id: "acc_9" } },
          { status: 403 },
        ),
      ),
    );
    const err = await client.doNotContact.add({ lead_id: "con_1" }).catch((e: unknown) => e);
    expect(isCurviateError(err) && err.details).toEqual({ account_id: "acc_9" });
  });
});

describe("do-not-contact file", () => {
  it("export asks for the format and resolves json as entries, csv as bytes; import posts the rows and resolves the report", async () => {
    let posted: unknown;
    server.use(
      http.get(`${BASE}/v1/do-not-contact/export`, ({ request }) =>
        new URL(request.url).searchParams.get("format") === "json"
          ? HttpResponse.json([{ linkedin_url: "https://www.linkedin.com/in/ana/", reason: null, added_by: null, via: "api", created_at: "2026-11-08T10:00:00.000Z", id: "dnc_1" }])
          : new HttpResponse("﻿linkedin_url,reason\r\n", { headers: { "content-type": "text/csv" } }),
      ),
      http.post(`${BASE}/v1/do-not-contact/import`, async ({ request }) => {
        posted = await request.json();
        return HttpResponse.json({ object: "do_not_contact_import", total_rows: 1, counts: { created: 1, unchanged: 0, skipped: 0 }, report: [] });
      }),
    );
    expect((await client.doNotContact.export({ format: "json" }))[0]?.id).toBe("dnc_1");
    expect(text(await client.doNotContact.export({ format: "csv" }))).toBe("﻿linkedin_url,reason\r\n");
    const rows = [{ linkedin_url: "https://www.linkedin.com/in/ana/", reason: "asked_to_stop" as const }];
    expect((await client.doNotContact.import({ rows })).counts?.created).toBe(1);
    expect(posted).toEqual({ rows });
  });
});

describe("pass 19: email only", () => {
  it("the docs guide's four calls (Email only), as written there: one request each, typed", async () => {
    const calls: unknown[] = [];
    server.use(
      http.all(`${BASE}/v1/*`, async ({ request }) => {
        const u = new URL(request.url);
        const raw = request.method === "GET" ? "" : await request.text();
        calls.push([request.method, u.pathname, raw ? JSON.parse(raw) : null]);
        if (u.pathname === "/v1/leads") return HttpResponse.json({ object: "lead", id: "con_1", list_ids: ["cl_1"], outcome: "created" }, { status: 201 });
        return HttpResponse.json({ object: "campaign", id: "mot_1", status: "draft" });
      }),
    );
    // ── the guide's SDK block, byte for byte below this line ──
    const lead = await client.leads.upsert({ email: "ana@acme.example", first_name: "Ana", list_name: "Q4 email" });
    const campaign = await client.campaigns.create({
      name: "Q4 email",
      lead_list_ids: lead.list_ids,
      shared_mailbox_ids: ["mbx_123"],
      schedule: { timezone: "Europe/Berlin" },
      sequence: Sequence.create({ on_reply: "end" }).add(
        step.do("email_1", "email.send", { with: { subject: "Quick question", text: "Hi {{first_name|there}}, ..." }, next: "end" }),
      ),
    });
    await client.campaigns.check(campaign.id);
    await client.campaigns.start(campaign.id);
    // ── end of the guide's block ──
    await client.leads.update("con_1", { sources: { job_title: null } });
    await client.doNotContact.add({ email: "bo@acme.example" });
    await client.unibox.markConversation("cnv_team_1", { read: true });
    expect(calls).toEqual([
      ["POST", "/v1/leads", { email: "ana@acme.example", first_name: "Ana", list_name: "Q4 email" }],
      ["POST", "/v1/campaigns", {
        name: "Q4 email", lead_list_ids: ["cl_1"], shared_mailbox_ids: ["mbx_123"], schedule: { timezone: "Europe/Berlin" },
        sequence: { $schema: "https://docs.curviate.com/schemas/sequence/v1.json", on_reply: "end", steps: [{ id: "email_1", do: "email.send", with: { subject: "Quick question", text: "Hi {{first_name|there}}, ..." }, next: "end" }] },
      }],
      ["POST", "/v1/campaigns/mot_1/check", null],
      ["POST", "/v1/campaigns/mot_1/start", null],
      ["PATCH", "/v1/leads/con_1", { sources: { job_title: null } }],
      ["POST", "/v1/do-not-contact", { email: "bo@acme.example" }],
      ["PATCH", "/v1/unibox/conversations/cnv_team_1", { read: true }],
    ]);
  });

  it.each(["BILLING_NOT_AVAILABLE", "TEAM_MEMBERSHIP_LOCKED"])("%s reaches the caller as itself, not INTERNAL", async (code) => {
    server.use(http.post(`${BASE}/v1/teams`, () => HttpResponse.json({ code, message: "x", user_fixable: false, retry_likely_to_succeed: false }, { status: 403 })));
    const err = await client.teams.create({ name: "B" }).catch((e: unknown) => e);
    expect(isCurviateError(err) && err.code).toBe(code);
  });
});
