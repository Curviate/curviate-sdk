// Path-grammar bank — the account-first `/v1/{account_id}/…` grammar proven at
// the resource-wrapper level (the seam itself is proven directly against
// `createContext` in test/internal/context.test.ts).
//
// Every account-scoped method must build a URL whose account id is the FIRST
// `/v1/` path segment; every root-scoped method must build a URL with NO
// account segment at all, and `account_id` must never leak into the query
// string for either. Table-driven: this file owns the runner (`CASES` + the
// `it.each` below); later resource chunks (messaging / users / recruiter /
// sales-navigator / jobs / comments / posts / invites / search / companies)
// append their own account-scoped rows to `CASES` as they realign, without
// touching the runner.
import { http, HttpResponse } from "msw";
import { describe, expect, it } from "vitest";
import { server } from "../msw/server.js";
import { Curviate } from "../../src/index.js";

const BASE = "https://app.curviate.test";
const ACCOUNT_ID = "acc_test";

interface CapturedRequest {
  path: string;
  search: URLSearchParams;
}

interface PathGrammarCase {
  /** `<namespace>.<method>` — purely descriptive, shows up in the test name. */
  name: string;
  /** `"account"` rows must lead with `/v1/acc_test/`; `"root"` rows must not. */
  scope: "root" | "account";
  /**
   * Register the matching MSW handler, issue the call against `client`, and
   * return the captured request's path + query. `client` is always the root
   * `Curviate` instance — an account-scoped row calls
   * `client.account(ACCOUNT_ID).<namespace>.<method>()` itself.
   */
  run: (client: Curviate) => Promise<CapturedRequest>;
}

const CASES: PathGrammarCase[] = [
  // ─── Root-scoped: accounts ────────────────────────────────────────────────
  {
    name: "accounts.list",
    scope: "root",
    run: async (client) => {
      let captured: CapturedRequest | undefined;
      server.use(
        http.get(`${BASE}/v1/accounts`, ({ request }) => {
          const url = new URL(request.url);
          captured = { path: url.pathname, search: url.searchParams };
          return HttpResponse.json({ object: "account_list", items: [], cursor: null });
        }),
      );
      await client.accounts.list();
      return captured!;
    },
  },
  {
    name: "accounts.get",
    scope: "root",
    run: async (client) => {
      let captured: CapturedRequest | undefined;
      server.use(
        http.get(`${BASE}/v1/accounts/${ACCOUNT_ID}`, ({ request }) => {
          const url = new URL(request.url);
          captured = { path: url.pathname, search: url.searchParams };
          return HttpResponse.json({ object: "account", account_id: ACCOUNT_ID, status: "active", quotas: [] });
        }),
      );
      await client.accounts.get(ACCOUNT_ID);
      return captured!;
    },
  },

  // ─── Root-scoped: auth — account_id (when present) is a body field, never
  // a path segment or query param.
  {
    name: "auth.intent",
    scope: "root",
    run: async (client) => {
      let captured: CapturedRequest | undefined;
      server.use(
        http.post(`${BASE}/v1/auth/intent`, ({ request }) => {
          const url = new URL(request.url);
          captured = { path: url.pathname, search: url.searchParams };
          return HttpResponse.json(
            { object: "account", account_id: "acc_1", status: "active" },
            { status: 201 },
          );
        }),
      );
      await client.auth.intent({
        seat_id: "seat_1",
        auth_method: "credentials",
        credentials: { email: "u@x.com", password: "p" },
        country: "US",
      });
      return captured!;
    },
  },
  {
    name: "auth.getSession",
    scope: "root",
    run: async (client) => {
      let captured: CapturedRequest | undefined;
      server.use(
        http.get(`${BASE}/v1/auth/sessions/acc_prov`, ({ request }) => {
          const url = new URL(request.url);
          captured = { path: url.pathname, search: url.searchParams };
          return HttpResponse.json({
            object: "auth_session",
            session_id: "acc_prov",
            status: "done",
            account_id: "acc_1",
          });
        }),
      );
      await client.auth.getSession("acc_prov");
      return captured!;
    },
  },

  // ─── Root-scoped: webhooks ────────────────────────────────────────────────
  {
    name: "webhooks.list",
    scope: "root",
    run: async (client) => {
      let captured: CapturedRequest | undefined;
      server.use(
        http.get(`${BASE}/v1/webhooks`, ({ request }) => {
          const url = new URL(request.url);
          captured = { path: url.pathname, search: url.searchParams };
          return HttpResponse.json({ object: "webhook_list", items: [], cursor: null });
        }),
      );
      await client.webhooks.list();
      return captured!;
    },
  },
  {
    name: "webhooks.get",
    scope: "root",
    run: async (client) => {
      let captured: CapturedRequest | undefined;
      server.use(
        http.get(`${BASE}/v1/webhooks/wh_1`, ({ request }) => {
          const url = new URL(request.url);
          captured = { path: url.pathname, search: url.searchParams };
          return HttpResponse.json({ object: "webhook", id: "wh_1", source: "messaging" });
        }),
      );
      await client.webhooks.get("wh_1");
      return captured!;
    },
  },

  // ─── Account-scoped: users (SDK-C1) ─────────────────────────────────────
  {
    name: "users.get",
    scope: "account",
    run: async (client) => {
      let captured: CapturedRequest | undefined;
      server.use(
        http.get(`${BASE}/v1/${ACCOUNT_ID}/users/me`, ({ request }) => {
          const url = new URL(request.url);
          captured = { path: url.pathname, search: url.searchParams };
          return HttpResponse.json({ object: "user_profile", id: "u_1", type: "individual", display_name: "Alice", specifics: {} });
        }),
      );
      await client.account(ACCOUNT_ID).users.get("me");
      return captured!;
    },
  },
  {
    name: "users.update",
    scope: "account",
    run: async (client) => {
      let captured: CapturedRequest | undefined;
      server.use(
        http.patch(`${BASE}/v1/${ACCOUNT_ID}/users/me`, ({ request }) => {
          const url = new URL(request.url);
          captured = { path: url.pathname, search: url.searchParams };
          return HttpResponse.json({ object: "user_updated" });
        }),
      );
      await client.account(ACCOUNT_ID).users.update("me", { headline: "x" });
      return captured!;
    },
  },
  {
    name: "users.listRelations",
    scope: "account",
    run: async (client) => {
      let captured: CapturedRequest | undefined;
      server.use(
        http.get(`${BASE}/v1/${ACCOUNT_ID}/profiles/relations`, ({ request }) => {
          const url = new URL(request.url);
          captured = { path: url.pathname, search: url.searchParams };
          return HttpResponse.json({ object: "relation_list", items: [], cursor: null });
        }),
      );
      await client.account(ACCOUNT_ID).users.listRelations();
      return captured!;
    },
  },
  {
    name: "users.listFollowers",
    scope: "account",
    run: async (client) => {
      let captured: CapturedRequest | undefined;
      server.use(
        http.get(`${BASE}/v1/${ACCOUNT_ID}/users/ACo1/followers`, ({ request }) => {
          const url = new URL(request.url);
          captured = { path: url.pathname, search: url.searchParams };
          return HttpResponse.json({ object: "follower_list", items: [], cursor: null });
        }),
      );
      await client.account(ACCOUNT_ID).users.listFollowers("ACo1");
      return captured!;
    },
  },
  {
    name: "users.listFollowing",
    scope: "account",
    run: async (client) => {
      let captured: CapturedRequest | undefined;
      server.use(
        http.get(`${BASE}/v1/${ACCOUNT_ID}/users/ACo1/following`, ({ request }) => {
          const url = new URL(request.url);
          captured = { path: url.pathname, search: url.searchParams };
          return HttpResponse.json({ object: "following_list", items: [], cursor: null });
        }),
      );
      await client.account(ACCOUNT_ID).users.listFollowing("ACo1");
      return captured!;
    },
  },
  {
    name: "users.follow",
    scope: "account",
    run: async (client) => {
      let captured: CapturedRequest | undefined;
      server.use(
        http.post(`${BASE}/v1/${ACCOUNT_ID}/users/ACo1/follow`, ({ request }) => {
          const url = new URL(request.url);
          captured = { path: url.pathname, search: url.searchParams };
          return HttpResponse.json({ object: "user_followed" });
        }),
      );
      await client.account(ACCOUNT_ID).users.follow("ACo1");
      return captured!;
    },
  },
  {
    name: "users.unfollow",
    scope: "account",
    run: async (client) => {
      let captured: CapturedRequest | undefined;
      server.use(
        http.delete(`${BASE}/v1/${ACCOUNT_ID}/users/ACo1/follow`, ({ request }) => {
          const url = new URL(request.url);
          captured = { path: url.pathname, search: url.searchParams };
          return HttpResponse.json({ object: "user_unfollowed" });
        }),
      );
      await client.account(ACCOUNT_ID).users.unfollow("ACo1");
      return captured!;
    },
  },
  {
    name: "users.getInMailCredits",
    scope: "account",
    run: async (client) => {
      let captured: CapturedRequest | undefined;
      server.use(
        http.get(`${BASE}/v1/${ACCOUNT_ID}/inmail-credits`, ({ request }) => {
          const url = new URL(request.url);
          captured = { path: url.pathname, search: url.searchParams };
          return HttpResponse.json({ object: "inmail_credits", credits: { classic: null, recruiter: null, sales_navigator: null } });
        }),
      );
      await client.account(ACCOUNT_ID).users.getInMailCredits();
      return captured!;
    },
  },
  {
    name: "users.endorseSkill",
    scope: "account",
    run: async (client) => {
      let captured: CapturedRequest | undefined;
      server.use(
        http.post(`${BASE}/v1/${ACCOUNT_ID}/users/ACo1/endorse-skill`, ({ request }) => {
          const url = new URL(request.url);
          captured = { path: url.pathname, search: url.searchParams };
          return HttpResponse.json({ object: "skill_endorsed" });
        }),
      );
      await client.account(ACCOUNT_ID).users.endorseSkill("ACo1", { endorsement_id: "e_1" });
      return captured!;
    },
  },

  // ─── Account-scoped: companies ──────────────────────────────────────────
  {
    name: "companies.get",
    scope: "account",
    run: async (client) => {
      let captured: CapturedRequest | undefined;
      server.use(
        http.get(`${BASE}/v1/${ACCOUNT_ID}/companies/t-systems`, ({ request }) => {
          const url = new URL(request.url);
          captured = { path: url.pathname, search: url.searchParams };
          return HttpResponse.json({ object: "company_profile", id: "1", name: "T-Systems" });
        }),
      );
      await client.account(ACCOUNT_ID).companies.get("t-systems");
      return captured!;
    },
  },
  {
    name: "companies.employees",
    scope: "account",
    run: async (client) => {
      let captured: CapturedRequest | undefined;
      server.use(
        http.get(`${BASE}/v1/${ACCOUNT_ID}/companies/1/employees`, ({ request }) => {
          const url = new URL(request.url);
          captured = { path: url.pathname, search: url.searchParams };
          return HttpResponse.json({ object: "company_employee_list", items: [], paging: { total_count: 0 }, cursor: null });
        }),
      );
      await client.account(ACCOUNT_ID).companies.employees("1");
      return captured!;
    },
  },
  {
    name: "companies.posts",
    scope: "account",
    run: async (client) => {
      let captured: CapturedRequest | undefined;
      server.use(
        http.get(`${BASE}/v1/${ACCOUNT_ID}/companies/1/posts`, ({ request }) => {
          const url = new URL(request.url);
          captured = { path: url.pathname, search: url.searchParams };
          return HttpResponse.json({ object: "company_post_list", items: [], cursor: null });
        }),
      );
      await client.account(ACCOUNT_ID).companies.posts("1");
      return captured!;
    },
  },
  {
    name: "companies.jobs",
    scope: "account",
    run: async (client) => {
      let captured: CapturedRequest | undefined;
      server.use(
        http.get(`${BASE}/v1/${ACCOUNT_ID}/companies/1/jobs`, ({ request }) => {
          const url = new URL(request.url);
          captured = { path: url.pathname, search: url.searchParams };
          return HttpResponse.json({ object: "company_job_list", items: [], cursor: null });
        }),
      );
      await client.account(ACCOUNT_ID).companies.jobs("1");
      return captured!;
    },
  },

  // ─── Account-scoped: search ─────────────────────────────────────────────
  {
    name: "search.getParameters",
    scope: "account",
    run: async (client) => {
      let captured: CapturedRequest | undefined;
      server.use(
        http.get(`${BASE}/v1/${ACCOUNT_ID}/search/parameters`, ({ request }) => {
          const url = new URL(request.url);
          captured = { path: url.pathname, search: url.searchParams };
          return HttpResponse.json({ object: "search_parameter_list", items: [], cursor: null });
        }),
      );
      await client.account(ACCOUNT_ID).search.getParameters({ type: "SKILL", keywords: "eng" });
      return captured!;
    },
  },
  {
    name: "search.people",
    scope: "account",
    run: async (client) => {
      let captured: CapturedRequest | undefined;
      server.use(
        http.post(`${BASE}/v1/${ACCOUNT_ID}/search/people`, ({ request }) => {
          const url = new URL(request.url);
          captured = { path: url.pathname, search: url.searchParams };
          return HttpResponse.json({ object: "people_search_result", items: [], paging: { total_count: 0 }, cursor: null });
        }),
      );
      await client.account(ACCOUNT_ID).search.people({ keywords: "eng" });
      return captured!;
    },
  },
  {
    name: "search.companies",
    scope: "account",
    run: async (client) => {
      let captured: CapturedRequest | undefined;
      server.use(
        http.post(`${BASE}/v1/${ACCOUNT_ID}/search/companies`, ({ request }) => {
          const url = new URL(request.url);
          captured = { path: url.pathname, search: url.searchParams };
          return HttpResponse.json({ object: "company_search_result", items: [], paging: { total_count: 0 }, cursor: null });
        }),
      );
      await client.account(ACCOUNT_ID).search.companies({ keywords: "acme" });
      return captured!;
    },
  },
  {
    name: "search.posts",
    scope: "account",
    run: async (client) => {
      let captured: CapturedRequest | undefined;
      server.use(
        http.post(`${BASE}/v1/${ACCOUNT_ID}/search/posts`, ({ request }) => {
          const url = new URL(request.url);
          captured = { path: url.pathname, search: url.searchParams };
          return HttpResponse.json({ object: "post_search_result", items: [], paging: { total_count: 0 }, cursor: null });
        }),
      );
      await client.account(ACCOUNT_ID).search.posts({ keywords: "hiring" });
      return captured!;
    },
  },
  {
    name: "search.jobs",
    scope: "account",
    run: async (client) => {
      let captured: CapturedRequest | undefined;
      server.use(
        http.post(`${BASE}/v1/${ACCOUNT_ID}/search/jobs`, ({ request }) => {
          const url = new URL(request.url);
          captured = { path: url.pathname, search: url.searchParams };
          return HttpResponse.json({ object: "job_search_result", items: [], paging: { total_count: 0 }, cursor: null });
        }),
      );
      await client.account(ACCOUNT_ID).search.jobs({ keywords: "founder" });
      return captured!;
    },
  },
  {
    name: "search.fromUrl",
    scope: "account",
    run: async (client) => {
      let captured: CapturedRequest | undefined;
      server.use(
        http.post(`${BASE}/v1/${ACCOUNT_ID}/search`, ({ request }) => {
          const url = new URL(request.url);
          captured = { path: url.pathname, search: url.searchParams };
          return HttpResponse.json({ object: "search_result", items: [], cursor: null });
        }),
      );
      await client.account(ACCOUNT_ID).search.fromUrl({ url: "https://www.linkedin.com/search/results/people/" });
      return captured!;
    },
  },

  // ─── Account-scoped: messaging ──────────────────────────────────────────
  {
    name: "messaging.listChats",
    scope: "account",
    run: async (client) => {
      let captured: CapturedRequest | undefined;
      server.use(
        http.get(`${BASE}/v1/${ACCOUNT_ID}/chats`, ({ request }) => {
          const url = new URL(request.url);
          captured = { path: url.pathname, search: url.searchParams };
          return HttpResponse.json({ object: "chat_list", items: [], cursor: null });
        }),
      );
      await client.account(ACCOUNT_ID).messaging.listChats();
      return captured!;
    },
  },
  {
    name: "messaging.startChat",
    scope: "account",
    run: async (client) => {
      let captured: CapturedRequest | undefined;
      server.use(
        http.post(`${BASE}/v1/${ACCOUNT_ID}/chats`, ({ request }) => {
          const url = new URL(request.url);
          captured = { path: url.pathname, search: url.searchParams };
          return HttpResponse.json({ object: "chat_started", chat_id: "chat_1", message_id: "msg_1" }, { status: 201 });
        }),
      );
      await client.account(ACCOUNT_ID).messaging.startChat({ attendees_ids: ["ACo1"], text: "hi" });
      return captured!;
    },
  },
  {
    name: "messaging.getChat",
    scope: "account",
    run: async (client) => {
      let captured: CapturedRequest | undefined;
      server.use(
        http.get(`${BASE}/v1/${ACCOUNT_ID}/chats/chat_1`, ({ request }) => {
          const url = new URL(request.url);
          captured = { path: url.pathname, search: url.searchParams };
          return HttpResponse.json({ object: "chat", id: "chat_1" });
        }),
      );
      await client.account(ACCOUNT_ID).messaging.getChat("chat_1");
      return captured!;
    },
  },
  {
    name: "messaging.markChatRead",
    scope: "account",
    run: async (client) => {
      let captured: CapturedRequest | undefined;
      server.use(
        http.patch(`${BASE}/v1/${ACCOUNT_ID}/chats/chat_1`, ({ request }) => {
          const url = new URL(request.url);
          captured = { path: url.pathname, search: url.searchParams };
          return HttpResponse.json({ object: "chat_updated", chat_id: "chat_1", read: true });
        }),
      );
      await client.account(ACCOUNT_ID).messaging.markChatRead("chat_1", { read: true });
      return captured!;
    },
  },
  {
    name: "messaging.listMessages",
    scope: "account",
    run: async (client) => {
      let captured: CapturedRequest | undefined;
      server.use(
        http.get(`${BASE}/v1/${ACCOUNT_ID}/chats/chat_1/messages`, ({ request }) => {
          const url = new URL(request.url);
          captured = { path: url.pathname, search: url.searchParams };
          return HttpResponse.json({ object: "message_list", items: [], cursor: null });
        }),
      );
      await client.account(ACCOUNT_ID).messaging.listMessages("chat_1");
      return captured!;
    },
  },
  {
    name: "messaging.sendMessage",
    scope: "account",
    run: async (client) => {
      let captured: CapturedRequest | undefined;
      server.use(
        http.post(`${BASE}/v1/${ACCOUNT_ID}/chats/chat_1/messages`, ({ request }) => {
          const url = new URL(request.url);
          captured = { path: url.pathname, search: url.searchParams };
          return HttpResponse.json({ object: "message_sent", message_id: "msg_1" }, { status: 201 });
        }),
      );
      await client.account(ACCOUNT_ID).messaging.sendMessage("chat_1", { text: "hi" });
      return captured!;
    },
  },
  {
    name: "messaging.getMessage",
    scope: "account",
    run: async (client) => {
      let captured: CapturedRequest | undefined;
      server.use(
        http.get(`${BASE}/v1/${ACCOUNT_ID}/chats/chat_1/messages/msg_1`, ({ request }) => {
          const url = new URL(request.url);
          captured = { path: url.pathname, search: url.searchParams };
          return HttpResponse.json({ object: "message", id: "msg_1" });
        }),
      );
      await client.account(ACCOUNT_ID).messaging.getMessage("chat_1", "msg_1");
      return captured!;
    },
  },
  {
    name: "messaging.editMessage",
    scope: "account",
    run: async (client) => {
      let captured: CapturedRequest | undefined;
      server.use(
        http.patch(`${BASE}/v1/${ACCOUNT_ID}/chats/chat_1/messages/msg_1`, ({ request }) => {
          const url = new URL(request.url);
          captured = { path: url.pathname, search: url.searchParams };
          return HttpResponse.json({ object: "message_edited", message_id: "msg_1" });
        }),
      );
      await client.account(ACCOUNT_ID).messaging.editMessage("chat_1", "msg_1", { text: "edited" });
      return captured!;
    },
  },
  {
    name: "messaging.deleteMessage",
    scope: "account",
    run: async (client) => {
      let captured: CapturedRequest | undefined;
      server.use(
        http.delete(`${BASE}/v1/${ACCOUNT_ID}/chats/chat_1/messages/msg_1`, ({ request }) => {
          const url = new URL(request.url);
          captured = { path: url.pathname, search: url.searchParams };
          return HttpResponse.json({ object: "message_deleted", message_id: "msg_1" });
        }),
      );
      await client.account(ACCOUNT_ID).messaging.deleteMessage("chat_1", "msg_1");
      return captured!;
    },
  },
  {
    name: "messaging.addReaction",
    scope: "account",
    run: async (client) => {
      let captured: CapturedRequest | undefined;
      server.use(
        http.post(`${BASE}/v1/${ACCOUNT_ID}/chats/chat_1/messages/msg_1/reactions`, ({ request }) => {
          const url = new URL(request.url);
          captured = { path: url.pathname, search: url.searchParams };
          return HttpResponse.json({ object: "message_reaction_added", message_id: "msg_1", reaction: "👍" });
        }),
      );
      await client.account(ACCOUNT_ID).messaging.addReaction("chat_1", "msg_1", { reaction: "👍" });
      return captured!;
    },
  },
  {
    name: "messaging.getAttachment",
    scope: "account",
    run: async (client) => {
      let captured: CapturedRequest | undefined;
      server.use(
        http.get(`${BASE}/v1/${ACCOUNT_ID}/chats/chat_1/messages/msg_1/attachments/att_1`, ({ request }) => {
          const url = new URL(request.url);
          captured = { path: url.pathname, search: url.searchParams };
          return new HttpResponse(new Uint8Array([1]).buffer, {
            status: 200,
            headers: { "Content-Type": "application/octet-stream" },
          });
        }),
      );
      await client.account(ACCOUNT_ID).messaging.getAttachment("chat_1", "msg_1", "att_1");
      return captured!;
    },
  },
  {
    name: "messaging.sendInMail",
    scope: "account",
    run: async (client) => {
      let captured: CapturedRequest | undefined;
      server.use(
        http.post(`${BASE}/v1/${ACCOUNT_ID}/messages/inmail`, ({ request }) => {
          const url = new URL(request.url);
          captured = { path: url.pathname, search: url.searchParams };
          return HttpResponse.json({ object: "inmail_sent", message_id: "msg_1", chat_id: "chat_1" }, { status: 201 });
        }),
      );
      await client.account(ACCOUNT_ID).messaging.sendInMail({
        recipient_urn: "urn:li:member:1",
        subject: "Hi",
        text: "Hello",
      });
      return captured!;
    },
  },

  // ─── Account-scoped: invites ─────────────────────────────────────────────
  {
    name: "invites.send",
    scope: "account",
    run: async (client) => {
      let captured: CapturedRequest | undefined;
      server.use(
        http.post(`${BASE}/v1/${ACCOUNT_ID}/invites`, ({ request }) => {
          const url = new URL(request.url);
          captured = { path: url.pathname, search: url.searchParams };
          return HttpResponse.json({ object: "invitation_sent", id: "SENT_1", status: "sent" }, { status: 201 });
        }),
      );
      await client.account(ACCOUNT_ID).invites.send({ recipient_identifier: "ACo1" });
      return captured!;
    },
  },
  {
    name: "invites.listSent",
    scope: "account",
    run: async (client) => {
      let captured: CapturedRequest | undefined;
      server.use(
        http.get(`${BASE}/v1/${ACCOUNT_ID}/invites/sent`, ({ request }) => {
          const url = new URL(request.url);
          captured = { path: url.pathname, search: url.searchParams };
          return HttpResponse.json({ object: "invitation_list", items: [], cursor: null });
        }),
      );
      await client.account(ACCOUNT_ID).invites.listSent();
      return captured!;
    },
  },
  {
    name: "invites.listReceived",
    scope: "account",
    run: async (client) => {
      let captured: CapturedRequest | undefined;
      server.use(
        http.get(`${BASE}/v1/${ACCOUNT_ID}/invites/received`, ({ request }) => {
          const url = new URL(request.url);
          captured = { path: url.pathname, search: url.searchParams };
          return HttpResponse.json({ object: "invitation_list", items: [], cursor: null });
        }),
      );
      await client.account(ACCOUNT_ID).invites.listReceived();
      return captured!;
    },
  },
  {
    name: "invites.accept",
    scope: "account",
    run: async (client) => {
      let captured: CapturedRequest | undefined;
      server.use(
        http.post(`${BASE}/v1/${ACCOUNT_ID}/invites/received/inv_1/accept`, ({ request }) => {
          const url = new URL(request.url);
          captured = { path: url.pathname, search: url.searchParams };
          return HttpResponse.json({ object: "invitation_accepted", invitation_id: "inv_1", status: "accepted" });
        }),
      );
      await client.account(ACCOUNT_ID).invites.accept("inv_1");
      return captured!;
    },
  },
  {
    name: "invites.decline",
    scope: "account",
    run: async (client) => {
      let captured: CapturedRequest | undefined;
      server.use(
        http.post(`${BASE}/v1/${ACCOUNT_ID}/invites/received/inv_1/decline`, ({ request }) => {
          const url = new URL(request.url);
          captured = { path: url.pathname, search: url.searchParams };
          return HttpResponse.json({ object: "invitation_declined", invitation_id: "inv_1", status: "declined" });
        }),
      );
      await client.account(ACCOUNT_ID).invites.decline("inv_1");
      return captured!;
    },
  },
  {
    name: "invites.cancel",
    scope: "account",
    run: async (client) => {
      let captured: CapturedRequest | undefined;
      server.use(
        http.delete(`${BASE}/v1/${ACCOUNT_ID}/invites/sent/inv_1`, ({ request }) => {
          const url = new URL(request.url);
          captured = { path: url.pathname, search: url.searchParams };
          return HttpResponse.json({ object: "invitation_withdrawn", invitation_id: "inv_1", status: "withdrawn" });
        }),
      );
      await client.account(ACCOUNT_ID).invites.cancel("inv_1");
      return captured!;
    },
  },

  // ─── Account-scoped: posts (SDK-C2b) ────────────────────────────────────
  {
    name: "posts.listComments",
    scope: "account",
    run: async (client) => {
      let captured: CapturedRequest | undefined;
      server.use(
        http.get(`${BASE}/v1/${ACCOUNT_ID}/posts/post_1/comments`, ({ request }) => {
          const url = new URL(request.url);
          captured = { path: url.pathname, search: url.searchParams };
          return HttpResponse.json({ object: "comment_list", items: [], cursor: null });
        }),
      );
      await client.account(ACCOUNT_ID).posts.listComments("post_1");
      return captured!;
    },
  },
  {
    name: "posts.get",
    scope: "account",
    run: async (client) => {
      let captured: CapturedRequest | undefined;
      server.use(
        http.get(`${BASE}/v1/${ACCOUNT_ID}/posts/post_1`, ({ request }) => {
          const url = new URL(request.url);
          captured = { path: url.pathname, search: url.searchParams };
          return HttpResponse.json({ object: "post", id: "post_1" });
        }),
      );
      await client.account(ACCOUNT_ID).posts.get("post_1");
      return captured!;
    },
  },
  {
    name: "posts.delete",
    scope: "account",
    run: async (client) => {
      let captured: CapturedRequest | undefined;
      server.use(
        http.delete(`${BASE}/v1/${ACCOUNT_ID}/posts/post_1`, ({ request }) => {
          const url = new URL(request.url);
          captured = { path: url.pathname, search: url.searchParams };
          return new HttpResponse(null, { status: 204 });
        }),
      );
      await client.account(ACCOUNT_ID).posts.delete("post_1");
      return captured!;
    },
  },
  {
    name: "posts.create",
    scope: "account",
    run: async (client) => {
      let captured: CapturedRequest | undefined;
      server.use(
        http.post(`${BASE}/v1/${ACCOUNT_ID}/posts`, ({ request }) => {
          const url = new URL(request.url);
          captured = { path: url.pathname, search: url.searchParams };
          return HttpResponse.json({ object: "post_created", id: "post_1" }, { status: 201 });
        }),
      );
      await client.account(ACCOUNT_ID).posts.create({ text: "hi" });
      return captured!;
    },
  },
  {
    name: "posts.listUserPosts",
    scope: "account",
    run: async (client) => {
      let captured: CapturedRequest | undefined;
      server.use(
        http.get(`${BASE}/v1/${ACCOUNT_ID}/users/me/posts`, ({ request }) => {
          const url = new URL(request.url);
          captured = { path: url.pathname, search: url.searchParams };
          return HttpResponse.json({ object: "post_list", items: [], cursor: null });
        }),
      );
      await client.account(ACCOUNT_ID).posts.listUserPosts("me");
      return captured!;
    },
  },
  {
    name: "posts.listReactions",
    scope: "account",
    run: async (client) => {
      let captured: CapturedRequest | undefined;
      server.use(
        http.get(`${BASE}/v1/${ACCOUNT_ID}/posts/post_1/reactions`, ({ request }) => {
          const url = new URL(request.url);
          captured = { path: url.pathname, search: url.searchParams };
          return HttpResponse.json({ object: "reaction_list", items: [], cursor: null });
        }),
      );
      await client.account(ACCOUNT_ID).posts.listReactions("post_1");
      return captured!;
    },
  },
  {
    name: "posts.react",
    scope: "account",
    run: async (client) => {
      let captured: CapturedRequest | undefined;
      server.use(
        http.post(`${BASE}/v1/${ACCOUNT_ID}/posts/post_1/reactions`, ({ request }) => {
          const url = new URL(request.url);
          captured = { path: url.pathname, search: url.searchParams };
          return HttpResponse.json({ object: "reaction_added", reaction: "like" });
        }),
      );
      await client.account(ACCOUNT_ID).posts.react("post_1", { reaction: "like" });
      return captured!;
    },
  },
  {
    name: "posts.unreact",
    scope: "account",
    run: async (client) => {
      let captured: CapturedRequest | undefined;
      server.use(
        http.delete(`${BASE}/v1/${ACCOUNT_ID}/posts/post_1/reactions`, ({ request }) => {
          const url = new URL(request.url);
          captured = { path: url.pathname, search: url.searchParams };
          return HttpResponse.json({ object: "reaction_removed", reaction: "like" });
        }),
      );
      await client.account(ACCOUNT_ID).posts.unreact("post_1", { reaction: "like" });
      return captured!;
    },
  },
  {
    name: "posts.listUserReactions",
    scope: "account",
    run: async (client) => {
      let captured: CapturedRequest | undefined;
      server.use(
        http.get(`${BASE}/v1/${ACCOUNT_ID}/users/me/reactions`, ({ request }) => {
          const url = new URL(request.url);
          captured = { path: url.pathname, search: url.searchParams };
          return HttpResponse.json({ object: "reaction_list", items: [], cursor: null });
        }),
      );
      await client.account(ACCOUNT_ID).posts.listUserReactions("me");
      return captured!;
    },
  },

  // ─── Account-scoped: salesNavigator (SDK-C2b) ───────────────────────────
  {
    name: "salesNavigator.searchPeople",
    scope: "account",
    run: async (client) => {
      let captured: CapturedRequest | undefined;
      server.use(
        http.post(`${BASE}/v1/${ACCOUNT_ID}/sales-navigator/search/people`, ({ request }) => {
          const url = new URL(request.url);
          captured = { path: url.pathname, search: url.searchParams };
          return HttpResponse.json({ object: "sn_people_search_result", items: [], cursor: null });
        }),
      );
      await client.account(ACCOUNT_ID).salesNavigator.searchPeople({ keywords: "eng" });
      return captured!;
    },
  },
  {
    name: "salesNavigator.searchCompanies",
    scope: "account",
    run: async (client) => {
      let captured: CapturedRequest | undefined;
      server.use(
        http.post(`${BASE}/v1/${ACCOUNT_ID}/sales-navigator/search/companies`, ({ request }) => {
          const url = new URL(request.url);
          captured = { path: url.pathname, search: url.searchParams };
          return HttpResponse.json({ object: "sn_company_search_result", items: [], cursor: null });
        }),
      );
      await client.account(ACCOUNT_ID).salesNavigator.searchCompanies({ keywords: "acme" });
      return captured!;
    },
  },
  {
    name: "salesNavigator.getParameters",
    scope: "account",
    run: async (client) => {
      let captured: CapturedRequest | undefined;
      server.use(
        http.get(`${BASE}/v1/${ACCOUNT_ID}/sales-navigator/search/parameters`, ({ request }) => {
          const url = new URL(request.url);
          captured = { path: url.pathname, search: url.searchParams };
          return HttpResponse.json({ object: "sn_search_parameter_list", items: [], cursor: null });
        }),
      );
      await client.account(ACCOUNT_ID).salesNavigator.getParameters({ type: "INDUSTRY" });
      return captured!;
    },
  },
  {
    name: "salesNavigator.startChat",
    scope: "account",
    run: async (client) => {
      let captured: CapturedRequest | undefined;
      server.use(
        http.post(`${BASE}/v1/${ACCOUNT_ID}/sales-navigator/chats`, ({ request }) => {
          const url = new URL(request.url);
          captured = { path: url.pathname, search: url.searchParams };
          return HttpResponse.json({ object: "chat_started", chat_id: "sn_chat_1", message_id: "msg_1" }, { status: 201 });
        }),
      );
      await client.account(ACCOUNT_ID).salesNavigator.startChat({ attendees_ids: ["ACw_1"], text: "hi", subject: "s" });
      return captured!;
    },
  },
  {
    name: "salesNavigator.getProfile",
    scope: "account",
    run: async (client) => {
      let captured: CapturedRequest | undefined;
      server.use(
        http.get(`${BASE}/v1/${ACCOUNT_ID}/sales-navigator/profiles/ACw_1`, ({ request }) => {
          const url = new URL(request.url);
          captured = { path: url.pathname, search: url.searchParams };
          return HttpResponse.json({ object: "profile", id: "ACw_1", type: "individual", display_name: "Alice", provider: "linkedin", specifics: {} });
        }),
      );
      await client.account(ACCOUNT_ID).salesNavigator.getProfile("ACw_1");
      return captured!;
    },
  },
  {
    name: "salesNavigator.accountLists",
    scope: "account",
    run: async (client) => {
      let captured: CapturedRequest | undefined;
      server.use(
        http.get(`${BASE}/v1/${ACCOUNT_ID}/sales-navigator/account-lists`, ({ request }) => {
          const url = new URL(request.url);
          captured = { path: url.pathname, search: url.searchParams };
          return HttpResponse.json({ object: "sn_account_list_result", items: [], cursor: null });
        }),
      );
      await client.account(ACCOUNT_ID).salesNavigator.accountLists();
      return captured!;
    },
  },
  {
    name: "salesNavigator.leadLists",
    scope: "account",
    run: async (client) => {
      let captured: CapturedRequest | undefined;
      server.use(
        http.get(`${BASE}/v1/${ACCOUNT_ID}/sales-navigator/lead-lists`, ({ request }) => {
          const url = new URL(request.url);
          captured = { path: url.pathname, search: url.searchParams };
          return HttpResponse.json({ object: "sn_lead_list_result", items: [], cursor: null });
        }),
      );
      await client.account(ACCOUNT_ID).salesNavigator.leadLists();
      return captured!;
    },
  },
  {
    name: "salesNavigator.browseAccountList",
    scope: "account",
    run: async (client) => {
      let captured: CapturedRequest | undefined;
      server.use(
        http.post(`${BASE}/v1/${ACCOUNT_ID}/sales-navigator/account-lists/list_1`, ({ request }) => {
          const url = new URL(request.url);
          captured = { path: url.pathname, search: url.searchParams };
          return HttpResponse.json({ object: "sn_saved_account_result", items: [], cursor: null });
        }),
      );
      await client.account(ACCOUNT_ID).salesNavigator.browseAccountList("list_1");
      return captured!;
    },
  },
  {
    name: "salesNavigator.browseLeadList",
    scope: "account",
    run: async (client) => {
      let captured: CapturedRequest | undefined;
      server.use(
        http.post(`${BASE}/v1/${ACCOUNT_ID}/sales-navigator/lead-lists/list_2`, ({ request }) => {
          const url = new URL(request.url);
          captured = { path: url.pathname, search: url.searchParams };
          return HttpResponse.json({ object: "sn_saved_lead_result", items: [], cursor: null });
        }),
      );
      await client.account(ACCOUNT_ID).salesNavigator.browseLeadList("list_2");
      return captured!;
    },
  },
  {
    name: "salesNavigator.saveAccount",
    scope: "account",
    run: async (client) => {
      let captured: CapturedRequest | undefined;
      server.use(
        http.post(`${BASE}/v1/${ACCOUNT_ID}/sales-navigator/account-lists/list_1/save`, ({ request }) => {
          const url = new URL(request.url);
          captured = { path: url.pathname, search: url.searchParams };
          return HttpResponse.json({ object: "sn_account_saved" });
        }),
      );
      await client.account(ACCOUNT_ID).salesNavigator.saveAccount({ list_id: "list_1", company_id: "co_1" });
      return captured!;
    },
  },
  {
    name: "salesNavigator.saveLead",
    scope: "account",
    run: async (client) => {
      let captured: CapturedRequest | undefined;
      server.use(
        http.post(`${BASE}/v1/${ACCOUNT_ID}/sales-navigator/lead-lists/list_2/save`, ({ request }) => {
          const url = new URL(request.url);
          captured = { path: url.pathname, search: url.searchParams };
          return HttpResponse.json({ object: "sn_lead_saved" });
        }),
      );
      await client.account(ACCOUNT_ID).salesNavigator.saveLead({ list_id: "list_2", user_id: "ACw_1" });
      return captured!;
    },
  },
  {
    name: "salesNavigator.searchFromUrl",
    scope: "account",
    run: async (client) => {
      let captured: CapturedRequest | undefined;
      server.use(
        http.post(`${BASE}/v1/${ACCOUNT_ID}/sales-navigator/search`, ({ request }) => {
          const url = new URL(request.url);
          captured = { path: url.pathname, search: url.searchParams };
          return HttpResponse.json({ object: "sn_search_result", items: [], cursor: null });
        }),
      );
      await client.account(ACCOUNT_ID).salesNavigator.searchFromUrl({ url: "https://www.linkedin.com/sales/search/people" });
      return captured!;
    },
  },

  // ─── Account-scoped: comments (SDK-D1) ──────────────────────────────────
  {
    name: "comments.listUserComments",
    scope: "account",
    run: async (client) => {
      let captured: CapturedRequest | undefined;
      server.use(
        http.get(`${BASE}/v1/${ACCOUNT_ID}/users/me/comments`, ({ request }) => {
          const url = new URL(request.url);
          captured = { path: url.pathname, search: url.searchParams };
          return HttpResponse.json({ object: "comment_list", items: [], cursor: null });
        }),
      );
      await client.account(ACCOUNT_ID).comments.listUserComments("me");
      return captured!;
    },
  },
  {
    name: "comments.create",
    scope: "account",
    run: async (client) => {
      let captured: CapturedRequest | undefined;
      server.use(
        http.post(`${BASE}/v1/${ACCOUNT_ID}/posts/post_1/comments`, ({ request }) => {
          const url = new URL(request.url);
          captured = { path: url.pathname, search: url.searchParams };
          return HttpResponse.json({ object: "comment", id: "c_1" }, { status: 201 });
        }),
      );
      await client.account(ACCOUNT_ID).comments.create("post_1", { text: "Nice post!" });
      return captured!;
    },
  },
  {
    name: "comments.edit",
    scope: "account",
    run: async (client) => {
      let captured: CapturedRequest | undefined;
      server.use(
        http.patch(`${BASE}/v1/${ACCOUNT_ID}/posts/post_1/comments/c_1`, ({ request }) => {
          const url = new URL(request.url);
          captured = { path: url.pathname, search: url.searchParams };
          return HttpResponse.json({ object: "comment", id: "c_1" });
        }),
      );
      await client.account(ACCOUNT_ID).comments.edit("post_1", "c_1", { text: "Edited." });
      return captured!;
    },
  },
  {
    name: "comments.delete",
    scope: "account",
    run: async (client) => {
      let captured: CapturedRequest | undefined;
      server.use(
        http.delete(`${BASE}/v1/${ACCOUNT_ID}/posts/post_1/comments/c_1`, ({ request }) => {
          const url = new URL(request.url);
          captured = { path: url.pathname, search: url.searchParams };
          return new HttpResponse(null, { status: 204 });
        }),
      );
      await client.account(ACCOUNT_ID).comments.delete("post_1", "c_1");
      return captured!;
    },
  },
  {
    name: "comments.reply",
    scope: "account",
    run: async (client) => {
      let captured: CapturedRequest | undefined;
      server.use(
        http.post(`${BASE}/v1/${ACCOUNT_ID}/posts/post_1/comments/c_1`, ({ request }) => {
          const url = new URL(request.url);
          captured = { path: url.pathname, search: url.searchParams };
          return HttpResponse.json({ object: "comment", id: "c_2" }, { status: 201 });
        }),
      );
      await client.account(ACCOUNT_ID).comments.reply("post_1", "c_1", { text: "Agreed!" });
      return captured!;
    },
  },
  {
    name: "comments.listReplies",
    scope: "account",
    run: async (client) => {
      let captured: CapturedRequest | undefined;
      server.use(
        http.get(`${BASE}/v1/${ACCOUNT_ID}/posts/post_1/comments/c_1/replies`, ({ request }) => {
          const url = new URL(request.url);
          captured = { path: url.pathname, search: url.searchParams };
          return HttpResponse.json({ object: "reply_list", items: [], cursor: null });
        }),
      );
      await client.account(ACCOUNT_ID).comments.listReplies("post_1", "c_1");
      return captured!;
    },
  },
  {
    name: "comments.listReactions",
    scope: "account",
    run: async (client) => {
      let captured: CapturedRequest | undefined;
      server.use(
        http.get(`${BASE}/v1/${ACCOUNT_ID}/posts/post_1/comments/c_1/reactions`, ({ request }) => {
          const url = new URL(request.url);
          captured = { path: url.pathname, search: url.searchParams };
          return HttpResponse.json({ object: "reaction_list", items: [], cursor: null });
        }),
      );
      await client.account(ACCOUNT_ID).comments.listReactions("post_1", "c_1");
      return captured!;
    },
  },
  {
    name: "comments.addReaction",
    scope: "account",
    run: async (client) => {
      let captured: CapturedRequest | undefined;
      server.use(
        http.post(`${BASE}/v1/${ACCOUNT_ID}/posts/post_1/comments/c_1/reactions`, ({ request }) => {
          const url = new URL(request.url);
          captured = { path: url.pathname, search: url.searchParams };
          return HttpResponse.json({ object: "comment_reaction_added", comment_id: "c_1", reaction: "like" });
        }),
      );
      await client.account(ACCOUNT_ID).comments.addReaction("post_1", "c_1", { reaction: "like" });
      return captured!;
    },
  },
  {
    name: "comments.removeReaction",
    scope: "account",
    run: async (client) => {
      let captured: CapturedRequest | undefined;
      server.use(
        http.delete(`${BASE}/v1/${ACCOUNT_ID}/posts/post_1/comments/c_1/reactions`, ({ request }) => {
          const url = new URL(request.url);
          captured = { path: url.pathname, search: url.searchParams };
          return HttpResponse.json({ object: "comment_reaction_removed", comment_id: "c_1", reaction: "like" });
        }),
      );
      await client.account(ACCOUNT_ID).comments.removeReaction("post_1", "c_1", { reaction: "like" });
      return captured!;
    },
  },

  // ─── Account-scoped: jobs (SDK-D1) ──────────────────────────────────────
  {
    name: "jobs.list",
    scope: "account",
    run: async (client) => {
      let captured: CapturedRequest | undefined;
      server.use(
        http.get(`${BASE}/v1/${ACCOUNT_ID}/jobs`, ({ request }) => {
          const url = new URL(request.url);
          captured = { path: url.pathname, search: url.searchParams };
          return HttpResponse.json({ object: "job_posting_list", items: [], cursor: null });
        }),
      );
      await client.account(ACCOUNT_ID).jobs.list({ state: "OPEN" });
      return captured!;
    },
  },
  {
    name: "jobs.get",
    scope: "account",
    run: async (client) => {
      let captured: CapturedRequest | undefined;
      server.use(
        http.get(`${BASE}/v1/${ACCOUNT_ID}/jobs/4428113858`, ({ request }) => {
          const url = new URL(request.url);
          captured = { path: url.pathname, search: url.searchParams };
          return HttpResponse.json({ object: "job_posting", id: "4428113858", title: "Eng", company: {}, state: "DRAFT", is_repost: false, is_application_limit_reached: false, created_at: "2026-01-01T00:00:00.000Z", description: "d", applications_count: 0, workplace_type: "REMOTE", employment_status: "FULL_TIME" });
        }),
      );
      await client.account(ACCOUNT_ID).jobs.get("4428113858");
      return captured!;
    },
  },
  {
    name: "jobs.close",
    scope: "account",
    run: async (client) => {
      let captured: CapturedRequest | undefined;
      server.use(
        http.post(`${BASE}/v1/${ACCOUNT_ID}/jobs/job_1/close`, ({ request }) => {
          const url = new URL(request.url);
          captured = { path: url.pathname, search: url.searchParams };
          return HttpResponse.json({ object: "job_posting_closed" });
        }),
      );
      await client.account(ACCOUNT_ID).jobs.close("job_1");
      return captured!;
    },
  },
  {
    name: "jobs.listApplicants",
    scope: "account",
    run: async (client) => {
      let captured: CapturedRequest | undefined;
      server.use(
        http.post(`${BASE}/v1/${ACCOUNT_ID}/jobs/job_1/applicants`, ({ request }) => {
          const url = new URL(request.url);
          captured = { path: url.pathname, search: url.searchParams };
          return HttpResponse.json({ object: "job_applicant_list", items: [], cursor: null });
        }),
      );
      await client.account(ACCOUNT_ID).jobs.listApplicants("job_1");
      return captured!;
    },
  },

  // ─── Account-scoped: recruiter (SDK-D2) ─────────────────────────────────
  // Representative rows covering every distinct account-first path shape in
  // the project-centric namespace: id-GET, POST (incl. the was-GET
  // searchParameters), PATCH, deep project-scoped GET/POST, the deepest
  // publish path, bodyless POST, client-side-resolved getJob, and binary GET.
  {
    name: "recruiter.getProfile",
    scope: "account",
    run: async (client) => {
      let captured: CapturedRequest | undefined;
      server.use(
        http.get(`${BASE}/v1/${ACCOUNT_ID}/recruiter/profiles/ACo1`, ({ request }) => {
          const url = new URL(request.url);
          captured = { path: url.pathname, search: url.searchParams };
          return HttpResponse.json({ object: "recruiter_profile", id: "ACo1", type: "individual", display_name: "Alice", provider: "linkedin", recruiting_profile: {} });
        }),
      );
      await client.account(ACCOUNT_ID).recruiter.getProfile("ACo1");
      return captured!;
    },
  },
  {
    name: "recruiter.startChat",
    scope: "account",
    run: async (client) => {
      let captured: CapturedRequest | undefined;
      server.use(
        http.post(`${BASE}/v1/${ACCOUNT_ID}/recruiter/chats`, ({ request }) => {
          const url = new URL(request.url);
          captured = { path: url.pathname, search: url.searchParams };
          return HttpResponse.json({ object: "chat_started", chat_id: "chat_1", message_id: "msg_1" }, { status: 201 });
        }),
      );
      await client.account(ACCOUNT_ID).recruiter.startChat({ attendees_ids: ["AEo1"], text: "hi", subject: "s", signature: "— A" });
      return captured!;
    },
  },
  {
    name: "recruiter.searchParameters",
    scope: "account",
    run: async (client) => {
      let captured: CapturedRequest | undefined;
      server.use(
        http.post(`${BASE}/v1/${ACCOUNT_ID}/recruiter/search/parameters`, ({ request }) => {
          const url = new URL(request.url);
          captured = { path: url.pathname, search: url.searchParams };
          return HttpResponse.json({ object: "recruiter_search_parameter_list", data: [] });
        }),
      );
      await client.account(ACCOUNT_ID).recruiter.searchParameters({ source: "SEARCH", type: "JOB_TITLE" });
      return captured!;
    },
  },
  {
    name: "recruiter.searchFromUrl",
    scope: "account",
    run: async (client) => {
      let captured: CapturedRequest | undefined;
      server.use(
        http.post(`${BASE}/v1/${ACCOUNT_ID}/recruiter/search`, ({ request }) => {
          const url = new URL(request.url);
          captured = { path: url.pathname, search: url.searchParams };
          return HttpResponse.json({ object: "recruiter_people_search_result", data: [], cursor: null });
        }),
      );
      await client.account(ACCOUNT_ID).recruiter.searchFromUrl({ url: "https://www.linkedin.com/talent/search" });
      return captured!;
    },
  },
  {
    name: "recruiter.listProjects",
    scope: "account",
    run: async (client) => {
      let captured: CapturedRequest | undefined;
      server.use(
        http.get(`${BASE}/v1/${ACCOUNT_ID}/recruiter/projects`, ({ request }) => {
          const url = new URL(request.url);
          captured = { path: url.pathname, search: url.searchParams };
          return HttpResponse.json({ object: "recruiter_project_list", data: [], cursor: null });
        }),
      );
      await client.account(ACCOUNT_ID).recruiter.listProjects();
      return captured!;
    },
  },
  {
    name: "recruiter.updateProject",
    scope: "account",
    run: async (client) => {
      let captured: CapturedRequest | undefined;
      server.use(
        http.patch(`${BASE}/v1/${ACCOUNT_ID}/recruiter/projects/proj_1`, ({ request }) => {
          const url = new URL(request.url);
          captured = { path: url.pathname, search: url.searchParams };
          return HttpResponse.json({ object: "recruiter_project_edited" });
        }),
      );
      await client.account(ACCOUNT_ID).recruiter.updateProject("proj_1", { name: "Renamed" });
      return captured!;
    },
  },
  {
    name: "recruiter.searchTalentPool",
    scope: "account",
    run: async (client) => {
      let captured: CapturedRequest | undefined;
      server.use(
        http.post(`${BASE}/v1/${ACCOUNT_ID}/recruiter/projects/proj_1/talent-pool/search`, ({ request }) => {
          const url = new URL(request.url);
          captured = { path: url.pathname, search: url.searchParams };
          return HttpResponse.json({ object: "recruiter_people_search_result", data: [], cursor: null });
        }),
      );
      await client.account(ACCOUNT_ID).recruiter.searchTalentPool("proj_1", { channel_id: "chan_1" });
      return captured!;
    },
  },
  {
    name: "recruiter.createProjectJob",
    scope: "account",
    run: async (client) => {
      let captured: CapturedRequest | undefined;
      server.use(
        http.post(`${BASE}/v1/${ACCOUNT_ID}/recruiter/projects/proj_1/jobs`, ({ request }) => {
          const url = new URL(request.url);
          captured = { path: url.pathname, search: url.searchParams };
          return HttpResponse.json({ object: "recruiter_job_posting_created", job_id: "job_1", project_id: "proj_1" }, { status: 201 });
        }),
      );
      await client.account(ACCOUNT_ID).recruiter.createProjectJob("proj_1", {
        job_title: { id: "title_1", name: "Eng" },
        company: { name: "Acme" },
        workplace_type: "REMOTE",
        location: "l",
        employment_status: "FULL_TIME",
        seniority_level: "MID_SENIOR_LEVEL",
        description: "d".repeat(200),
        industry: ["4"],
        job_function: ["eng"],
        apply_method: { method: "linkedin", notification_email: "jobs@acme.test" },
      });
      return captured!;
    },
  },
  {
    name: "recruiter.getProjectJobBudget",
    scope: "account",
    run: async (client) => {
      let captured: CapturedRequest | undefined;
      server.use(
        http.get(`${BASE}/v1/${ACCOUNT_ID}/recruiter/projects/proj_1/jobs/job_1/budget`, ({ request }) => {
          const url = new URL(request.url);
          captured = { path: url.pathname, search: url.searchParams };
          return HttpResponse.json({ object: "recruiter_job_posting_budget" });
        }),
      );
      await client.account(ACCOUNT_ID).recruiter.getProjectJobBudget("proj_1", "job_1");
      return captured!;
    },
  },
  {
    name: "recruiter.getJob",
    scope: "account",
    run: async (client) => {
      let captured: CapturedRequest | undefined;
      server.use(
        http.get(`${BASE}/v1/${ACCOUNT_ID}/recruiter/jobs/4428113858`, ({ request }) => {
          const url = new URL(request.url);
          captured = { path: url.pathname, search: url.searchParams };
          return HttpResponse.json({ object: "recruiter_job_posting", id: "4428113858", project_id: "proj_1" });
        }),
      );
      await client.account(ACCOUNT_ID).recruiter.getJob("https://www.linkedin.com/jobs/view/4428113858");
      return captured!;
    },
  },
  {
    name: "recruiter.publishJob",
    scope: "account",
    run: async (client) => {
      let captured: CapturedRequest | undefined;
      server.use(
        http.post(`${BASE}/v1/${ACCOUNT_ID}/recruiter/projects/proj_1/jobs/job_1/publish`, ({ request }) => {
          const url = new URL(request.url);
          captured = { path: url.pathname, search: url.searchParams };
          return HttpResponse.json({ object: "recruiter_job_posting_published", job_state: "LISTED" });
        }),
      );
      await client.account(ACCOUNT_ID).recruiter.publishJob("proj_1", "job_1", { mode: "FREE" });
      return captured!;
    },
  },
  {
    name: "recruiter.closeJob",
    scope: "account",
    run: async (client) => {
      let captured: CapturedRequest | undefined;
      server.use(
        http.post(`${BASE}/v1/${ACCOUNT_ID}/recruiter/projects/proj_1/jobs/job_1/close`, ({ request }) => {
          const url = new URL(request.url);
          captured = { path: url.pathname, search: url.searchParams };
          return HttpResponse.json({ object: "recruiter_job_posting_closed" });
        }),
      );
      await client.account(ACCOUNT_ID).recruiter.closeJob("proj_1", "job_1");
      return captured!;
    },
  },
  {
    name: "recruiter.saveCandidate",
    scope: "account",
    run: async (client) => {
      let captured: CapturedRequest | undefined;
      server.use(
        http.post(`${BASE}/v1/${ACCOUNT_ID}/recruiter/projects/proj_1/pipeline/candidate/save`, ({ request }) => {
          const url = new URL(request.url);
          captured = { path: url.pathname, search: url.searchParams };
          return HttpResponse.json({ object: "recruiter_candidate_saved" });
        }),
      );
      await client.account(ACCOUNT_ID).recruiter.saveCandidate("proj_1", { stage_id: "s", candidate_id: "c" });
      return captured!;
    },
  },
  {
    name: "recruiter.listApplicants",
    scope: "account",
    run: async (client) => {
      let captured: CapturedRequest | undefined;
      server.use(
        http.post(`${BASE}/v1/${ACCOUNT_ID}/recruiter/projects/proj_1/talent-pool/applicants`, ({ request }) => {
          const url = new URL(request.url);
          captured = { path: url.pathname, search: url.searchParams };
          return HttpResponse.json({ object: "recruiter_job_applicant_list", data: [], cursor: null, total_count: 0 });
        }),
      );
      await client.account(ACCOUNT_ID).recruiter.listApplicants("proj_1", { channel_id: "chan_1" });
      return captured!;
    },
  },
  {
    name: "recruiter.downloadResume",
    scope: "account",
    run: async (client) => {
      let captured: CapturedRequest | undefined;
      server.use(
        http.get(`${BASE}/v1/${ACCOUNT_ID}/recruiter/projects/proj_1/talent-pool/applicants/app_1/resume`, ({ request }) => {
          const url = new URL(request.url);
          captured = { path: url.pathname, search: url.searchParams };
          return new HttpResponse(new Uint8Array([1]).buffer, { status: 200, headers: { "Content-Type": "application/octet-stream" } });
        }),
      );
      await client.account(ACCOUNT_ID).recruiter.downloadResume("proj_1", "app_1");
      return captured!;
    },
  },

  // ─── Account-scoped: profile (M2 / F1) ──────────────────────────────────
  {
    name: "profile.subscription",
    scope: "account",
    run: async (client) => {
      let captured: CapturedRequest | undefined;
      server.use(
        http.get(`${BASE}/v1/${ACCOUNT_ID}/profile/subscription`, ({ request }) => {
          const url = new URL(request.url);
          captured = { path: url.pathname, search: url.searchParams };
          return HttpResponse.json({ object: "profile_subscription", has_premium: false, plan_title: null, subscriptions: [], actions: {} });
        }),
      );
      await client.account(ACCOUNT_ID).profile.subscription();
      return captured!;
    },
  },
  {
    name: "profile.analytics",
    scope: "account",
    run: async (client) => {
      let captured: CapturedRequest | undefined;
      server.use(
        http.get(`${BASE}/v1/${ACCOUNT_ID}/profile/analytics`, ({ request }) => {
          const url = new URL(request.url);
          captured = { path: url.pathname, search: url.searchParams };
          return HttpResponse.json({ object: "profile_analytics", profile_viewers: { count: 0 }, followers: { count: 0 }, post_impressions: { count: 0 }, search_appearances: { count: 0 } });
        }),
      );
      await client.account(ACCOUNT_ID).profile.analytics();
      return captured!;
    },
  },
  {
    name: "profile.visitors",
    scope: "account",
    run: async (client) => {
      let captured: CapturedRequest | undefined;
      server.use(
        http.get(`${BASE}/v1/${ACCOUNT_ID}/profile/visitors`, ({ request }) => {
          const url = new URL(request.url);
          captured = { path: url.pathname, search: url.searchParams };
          return HttpResponse.json({ object: "profile_visitor_list", items: [], cursor: null });
        }),
      );
      await client.account(ACCOUNT_ID).profile.visitors({ limit: 20 });
      return captured!;
    },
  },
  {
    name: "profile.ssi",
    scope: "account",
    run: async (client) => {
      let captured: CapturedRequest | undefined;
      server.use(
        http.get(`${BASE}/v1/${ACCOUNT_ID}/profile/ssi`, ({ request }) => {
          const url = new URL(request.url);
          captured = { path: url.pathname, search: url.searchParams };
          return HttpResponse.json({ object: "profile_ssi", overall: null, pillars: {}, active_seat: false });
        }),
      );
      await client.account(ACCOUNT_ID).profile.ssi();
      return captured!;
    },
  },

  // ─── Account-scoped: groups (M2 / F1) ───────────────────────────────────
  {
    name: "groups.list",
    scope: "account",
    run: async (client) => {
      let captured: CapturedRequest | undefined;
      server.use(
        http.get(`${BASE}/v1/${ACCOUNT_ID}/profile/groups`, ({ request }) => {
          const url = new URL(request.url);
          captured = { path: url.pathname, search: url.searchParams };
          return HttpResponse.json({ object: "group_list", items: [], paging: { total_count: null }, cursor: null });
        }),
      );
      await client.account(ACCOUNT_ID).groups.list();
      return captured!;
    },
  },
  {
    name: "groups.get",
    scope: "account",
    run: async (client) => {
      let captured: CapturedRequest | undefined;
      server.use(
        http.get(`${BASE}/v1/${ACCOUNT_ID}/groups/grp_1`, ({ request }) => {
          const url = new URL(request.url);
          captured = { path: url.pathname, search: url.searchParams };
          return HttpResponse.json({ object: "group", id: "grp_1", name: "AI Engineers" });
        }),
      );
      await client.account(ACCOUNT_ID).groups.get("grp_1");
      return captured!;
    },
  },
  {
    name: "groups.members",
    scope: "account",
    run: async (client) => {
      let captured: CapturedRequest | undefined;
      server.use(
        http.get(`${BASE}/v1/${ACCOUNT_ID}/groups/grp_1/members`, ({ request }) => {
          const url = new URL(request.url);
          captured = { path: url.pathname, search: url.searchParams };
          return HttpResponse.json({ object: "group_member_list", items: [], paging: { total_count: 0 }, cursor: null });
        }),
      );
      await client.account(ACCOUNT_ID).groups.members("grp_1", { name: "dana" });
      return captured!;
    },
  },

  // ─── Account-scoped: feed (M2 / F1) ─────────────────────────────────────
  {
    name: "feed.home",
    scope: "account",
    run: async (client) => {
      let captured: CapturedRequest | undefined;
      server.use(
        http.get(`${BASE}/v1/${ACCOUNT_ID}/feed/home`, ({ request }) => {
          const url = new URL(request.url);
          captured = { path: url.pathname, search: url.searchParams };
          return HttpResponse.json({ object: "feed_post_list", items: [], cursor: null });
        }),
      );
      await client.account(ACCOUNT_ID).feed.home({ sort: "recent" });
      return captured!;
    },
  },

  // ─── Account-scoped: companies extension (insights + company inbox) ────
  {
    name: "companies.managed",
    scope: "account",
    run: async (client) => {
      let captured: CapturedRequest | undefined;
      server.use(
        http.get(`${BASE}/v1/${ACCOUNT_ID}/companies/managed`, ({ request }) => {
          const url = new URL(request.url);
          captured = { path: url.pathname, search: url.searchParams };
          return HttpResponse.json({ object: "managed_company_list", items: [], paging: { total_count: 0 }, cursor: null });
        }),
      );
      await client.account(ACCOUNT_ID).companies.managed();
      return captured!;
    },
  },
  {
    name: "companies.followers",
    scope: "account",
    run: async (client) => {
      let captured: CapturedRequest | undefined;
      server.use(
        http.get(`${BASE}/v1/${ACCOUNT_ID}/companies/1/followers`, ({ request }) => {
          const url = new URL(request.url);
          captured = { path: url.pathname, search: url.searchParams };
          return HttpResponse.json({ object: "company_follower_list", items: [], cursor: null });
        }),
      );
      await client.account(ACCOUNT_ID).companies.followers("1");
      return captured!;
    },
  },
  {
    name: "companies.invitableFollowers",
    scope: "account",
    run: async (client) => {
      let captured: CapturedRequest | undefined;
      server.use(
        http.get(`${BASE}/v1/${ACCOUNT_ID}/companies/1/invitable-followers`, ({ request }) => {
          const url = new URL(request.url);
          captured = { path: url.pathname, search: url.searchParams };
          return HttpResponse.json({ object: "invitable_connection_list", items: [], cursor: null });
        }),
      );
      await client.account(ACCOUNT_ID).companies.invitableFollowers("1");
      return captured!;
    },
  },
  {
    name: "companies.followInvite",
    scope: "account",
    run: async (client) => {
      let captured: CapturedRequest | undefined;
      server.use(
        http.post(`${BASE}/v1/${ACCOUNT_ID}/companies/1/follow-invite`, ({ request }) => {
          const url = new URL(request.url);
          captured = { path: url.pathname, search: url.searchParams };
          return HttpResponse.json({ object: "company_follow_invite_result", results: [] });
        }),
      );
      await client.account(ACCOUNT_ID).companies.followInvite("1", { invitee_ids: ["ACo1"] });
      return captured!;
    },
  },
  {
    name: "companies.chats",
    scope: "account",
    run: async (client) => {
      let captured: CapturedRequest | undefined;
      server.use(
        http.get(`${BASE}/v1/${ACCOUNT_ID}/companies/1/chats`, ({ request }) => {
          const url = new URL(request.url);
          captured = { path: url.pathname, search: url.searchParams };
          return HttpResponse.json({ object: "company_chat_list", items: [], cursor: null });
        }),
      );
      await client.account(ACCOUNT_ID).companies.chats("1");
      return captured!;
    },
  },
  {
    name: "companies.chat",
    scope: "account",
    run: async (client) => {
      let captured: CapturedRequest | undefined;
      server.use(
        http.get(`${BASE}/v1/${ACCOUNT_ID}/companies/1/chats/chat_1`, ({ request }) => {
          const url = new URL(request.url);
          captured = { path: url.pathname, search: url.searchParams };
          return HttpResponse.json({ object: "company_chat", id: "chat_1", is_group_chat: false, unread_count: 0 });
        }),
      );
      await client.account(ACCOUNT_ID).companies.chat("1", "chat_1");
      return captured!;
    },
  },
  {
    name: "companies.messages",
    scope: "account",
    run: async (client) => {
      let captured: CapturedRequest | undefined;
      server.use(
        http.get(`${BASE}/v1/${ACCOUNT_ID}/companies/1/chats/chat_1/messages`, ({ request }) => {
          const url = new URL(request.url);
          captured = { path: url.pathname, search: url.searchParams };
          return HttpResponse.json({ object: "company_chat_message_list", items: [], cursor: null });
        }),
      );
      await client.account(ACCOUNT_ID).companies.messages("1", "chat_1");
      return captured!;
    },
  },
  {
    name: "companies.message",
    scope: "account",
    run: async (client) => {
      let captured: CapturedRequest | undefined;
      server.use(
        http.get(`${BASE}/v1/${ACCOUNT_ID}/companies/1/chats/chat_1/messages/msg_1`, ({ request }) => {
          const url = new URL(request.url);
          captured = { path: url.pathname, search: url.searchParams };
          return HttpResponse.json({ object: "company_chat_message", id: "msg_1", conversation_id: "chat_1", sender: { id: "ACo1" }, sent_at: 1 });
        }),
      );
      await client.account(ACCOUNT_ID).companies.message("1", "chat_1", "msg_1");
      return captured!;
    },
  },
  {
    name: "companies.searchChats",
    scope: "account",
    run: async (client) => {
      let captured: CapturedRequest | undefined;
      server.use(
        http.get(`${BASE}/v1/${ACCOUNT_ID}/companies/1/chats/search`, ({ request }) => {
          const url = new URL(request.url);
          captured = { path: url.pathname, search: url.searchParams };
          return HttpResponse.json({ object: "company_chat_list", items: [], cursor: null });
        }),
      );
      await client.account(ACCOUNT_ID).companies.searchChats("1", { topic: "1" });
      return captured!;
    },
  },
  {
    name: "companies.sendMessage",
    scope: "account",
    run: async (client) => {
      let captured: CapturedRequest | undefined;
      server.use(
        http.post(`${BASE}/v1/${ACCOUNT_ID}/companies/1/chats/COMPANY_1_2-abc/messages`, ({ request }) => {
          const url = new URL(request.url);
          captured = { path: url.pathname, search: url.searchParams };
          return HttpResponse.json({
            object: "message_sent",
            message_id: "COMPANY_1_1-xyz",
            sent_as: { kind: "company", company_id: "1", name: "Acme" },
          });
        }),
      );
      await client.account(ACCOUNT_ID).companies.sendMessage("1", "COMPANY_1_2-abc", { text: "hi" });
      return captured!;
    },
  },

  // ─── Account-scoped: search extension (groups, services, parameters) ───
  {
    name: "search.groups",
    scope: "account",
    run: async (client) => {
      let captured: CapturedRequest | undefined;
      server.use(
        http.get(`${BASE}/v1/${ACCOUNT_ID}/search/groups`, ({ request }) => {
          const url = new URL(request.url);
          captured = { path: url.pathname, search: url.searchParams };
          return HttpResponse.json({ object: "group_search_result", items: [], cursor: null });
        }),
      );
      await client.account(ACCOUNT_ID).search.groups({ keywords: "gtm" });
      return captured!;
    },
  },
  {
    name: "search.services",
    scope: "account",
    run: async (client) => {
      let captured: CapturedRequest | undefined;
      server.use(
        http.post(`${BASE}/v1/${ACCOUNT_ID}/search/services`, ({ request }) => {
          const url = new URL(request.url);
          captured = { path: url.pathname, search: url.searchParams };
          return HttpResponse.json({ object: "service_search_result", items: [], paging: { total_count: 0 }, cursor: null });
        }),
      );
      await client.account(ACCOUNT_ID).search.services({ keywords: "marketing" });
      return captured!;
    },
  },
  {
    name: "search.getServiceParameters",
    scope: "account",
    run: async (client) => {
      let captured: CapturedRequest | undefined;
      server.use(
        http.get(`${BASE}/v1/${ACCOUNT_ID}/search/services/parameters`, ({ request }) => {
          const url = new URL(request.url);
          captured = { path: url.pathname, search: url.searchParams };
          return HttpResponse.json({ object: "search_parameter_list", items: [], cursor: null });
        }),
      );
      await client.account(ACCOUNT_ID).search.getServiceParameters({ type: "service_category", keywords: "marke" });
      return captured!;
    },
  },

  // ─── Account-scoped: messaging extension (inbox search) ────────────────
  {
    name: "messaging.searchChats",
    scope: "account",
    run: async (client) => {
      let captured: CapturedRequest | undefined;
      server.use(
        http.get(`${BASE}/v1/${ACCOUNT_ID}/chats/search`, ({ request }) => {
          const url = new URL(request.url);
          captured = { path: url.pathname, search: url.searchParams };
          return HttpResponse.json({ object: "chat_list", items: [], cursor: null });
        }),
      );
      await client.account(ACCOUNT_ID).messaging.searchChats({ query: "sophie" });
      return captured!;
    },
  },

  // ─── Account-scoped: posts extension — saved posts ──────────────────────
  {
    name: "posts.listSaved",
    scope: "account",
    run: async (client) => {
      let captured: CapturedRequest | undefined;
      server.use(
        http.get(`${BASE}/v1/${ACCOUNT_ID}/saved-posts`, ({ request }) => {
          const url = new URL(request.url);
          captured = { path: url.pathname, search: url.searchParams };
          return HttpResponse.json({ object: "saved_post_list", items: [], cursor: null });
        }),
      );
      await client.account(ACCOUNT_ID).posts.listSaved();
      return captured!;
    },
  },
  {
    name: "posts.save",
    scope: "account",
    run: async (client) => {
      let captured: CapturedRequest | undefined;
      server.use(
        http.post(`${BASE}/v1/${ACCOUNT_ID}/saved-posts`, ({ request }) => {
          const url = new URL(request.url);
          captured = { path: url.pathname, search: url.searchParams };
          return HttpResponse.json({ object: "save_result", saved: true, post_id: "1" });
        }),
      );
      await client.account(ACCOUNT_ID).posts.save("1");
      return captured!;
    },
  },
  {
    name: "posts.unsave",
    scope: "account",
    run: async (client) => {
      let captured: CapturedRequest | undefined;
      server.use(
        http.delete(`${BASE}/v1/${ACCOUNT_ID}/saved-posts/1`, ({ request }) => {
          const url = new URL(request.url);
          captured = { path: url.pathname, search: url.searchParams };
          return HttpResponse.json({ object: "save_result", saved: false, post_id: "1" });
        }),
      );
      await client.account(ACCOUNT_ID).posts.unsave("1");
      return captured!;
    },
  },

  // ─── Account-scoped: notifications (NEW namespace) ──────────────────────
  {
    name: "notifications.list",
    scope: "account",
    run: async (client) => {
      let captured: CapturedRequest | undefined;
      server.use(
        http.get(`${BASE}/v1/${ACCOUNT_ID}/notifications`, ({ request }) => {
          const url = new URL(request.url);
          captured = { path: url.pathname, search: url.searchParams };
          return HttpResponse.json({
            object: "notification_list",
            items: [],
            cursor: null,
            unread_count: 0,
            latest_published_at: null,
          });
        }),
      );
      await client.account(ACCOUNT_ID).notifications.list();
      return captured!;
    },
  },
  {
    name: "notifications.delete",
    scope: "account",
    run: async (client) => {
      let captured: CapturedRequest | undefined;
      server.use(
        http.delete(`${BASE}/v1/${ACCOUNT_ID}/notifications/:cardUrn`, ({ request }) => {
          const url = new URL(request.url);
          captured = { path: url.pathname, search: url.searchParams };
          return HttpResponse.json({ object: "notification_deleted", card_urn: "urn:li:fsd_notificationCard:(x)" });
        }),
      );
      await client.account(ACCOUNT_ID).notifications.delete("urn:li:fsd_notificationCard:(x)");
      return captured!;
    },
  },
  {
    name: "notifications.showLess",
    scope: "account",
    run: async (client) => {
      let captured: CapturedRequest | undefined;
      server.use(
        http.post(`${BASE}/v1/${ACCOUNT_ID}/notifications/:cardUrn/show-less`, ({ request }) => {
          const url = new URL(request.url);
          captured = { path: url.pathname, search: url.searchParams };
          return HttpResponse.json({
            object: "notification_show_less_applied",
            card_urn: "urn:li:fsd_notificationCard:(x)",
          });
        }),
      );
      await client.account(ACCOUNT_ID).notifications.showLess("urn:li:fsd_notificationCard:(x)");
      return captured!;
    },
  },

  // ─── Account-scoped: inboxes (Beta) ─────────────────────────────────────
  {
    name: "inboxes.list",
    scope: "account",
    run: async (client) => {
      let captured: CapturedRequest | undefined;
      server.use(
        http.get(`${BASE}/v1/${ACCOUNT_ID}/inboxes`, ({ request }) => {
          const url = new URL(request.url);
          captured = { path: url.pathname, search: url.searchParams };
          return HttpResponse.json({ object: "inbox_list", items: [] });
        }),
      );
      await client.account(ACCOUNT_ID).inboxes.list();
      return captured!;
    },
  },
  {
    name: "inboxes.listChats",
    scope: "account",
    run: async (client) => {
      let captured: CapturedRequest | undefined;
      server.use(
        http.get(`${BASE}/v1/${ACCOUNT_ID}/inboxes/CLASSIC_PRIMARY/chats`, ({ request }) => {
          const url = new URL(request.url);
          captured = { path: url.pathname, search: url.searchParams };
          return HttpResponse.json({ object: "inbox_chat_list", items: [], cursor: null });
        }),
      );
      await client.account(ACCOUNT_ID).inboxes.listChats("CLASSIC_PRIMARY");
      return captured!;
    },
  },
];

describe("path grammar — account-first for account-scoped, verbatim for root", () => {
  it.each(CASES.map((c): [string, PathGrammarCase] => [c.name, c]))("%s", async (_name, c) => {
    const client = new Curviate({ apiKey: "cvt_test_pathgrammar", baseUrl: BASE });
    const { path, search } = await c.run(client);

    if (c.scope === "account") {
      expect(path.startsWith(`/v1/${ACCOUNT_ID}/`)).toBe(true);
    } else {
      // Root-scoped: the account id (this bank never binds one via
      // `account(id)`) must never appear as the leading path segment.
      expect(path.startsWith(`/v1/${ACCOUNT_ID}/`)).toBe(false);
    }
    // account_id is never a query param — for either scope.
    expect(search.has("account_id")).toBe(false);
  });
});
