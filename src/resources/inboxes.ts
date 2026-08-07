/**
 * Inboxes resource, 2 methods (Beta).
 *
 * Account-scoped: the bound context injects `account_id` as the leading
 * `/v1/` path segment on every request (account-first grammar), never a
 * query param or body field.
 *
 * The reply-as-a-page pattern, in three steps:
 *   1. `list()` discovers the account's inboxes: its own personal inbox,
 *      plus one entry per connected company page (when the company product
 *      is attached).
 *   2. `listChats(inboxId)` reads that inbox's conversations. Each chat's
 *      `id` is already send-ready.
 *   3. `messaging.sendMessage(chatId, { text })` sends into it. Pass a
 *      personal chat id (`CLASSIC_...`) to reply as yourself, or a company
 *      chat id (`COMPANY_...`) to reply as the page. No separate parameter
 *      switches identity, the chat id alone decides it, and the response's
 *      `sent_as` field echoes which one actually happened.
 *
 * Company inboxes are reply-only (`reply_only: true` on the inbox): a page
 * can answer an existing conversation but never start a new one. Starting a
 * conversation (`messaging.startChat()`) only works for personal
 * (`CLASSIC_`) inboxes.
 *
 * Beta: this namespace is new. Single-page listing is verified; deep
 * pagination against a busier inbox is still being validated.
 */
import type { RequestContext } from "../internal/context.js";
import type { paths } from "../generated/types.js";

// ─── Type aliases from generated OpenAPI snapshot ──────────────────────────

export type InboxListPage =
  paths["/v1/{account_id}/inboxes"]["get"]["responses"]["200"]["content"]["application/json"];
export type InboxListQuery = NonNullable<
  paths["/v1/{account_id}/inboxes"]["get"]["parameters"]["query"]
>;

export type InboxChatListPage =
  paths["/v1/{account_id}/inboxes/{inbox_id}/chats"]["get"]["responses"]["200"]["content"]["application/json"];
export type InboxChatListQuery = NonNullable<
  paths["/v1/{account_id}/inboxes/{inbox_id}/chats"]["get"]["parameters"]["query"]
>;

// ─── Resource class ───────────────────────────────────────────────────────────

export class InboxesResource {
  constructor(protected readonly ctx: RequestContext) {}

  /**
   * List the account's inboxes: its own personal inbox, plus, when the
   * company product is attached, one entry per company page (id like
   * `"COMPANY_83734124_PRIMARY"`). `GET /v1/{account_id}/inboxes`
   *
   * Company inboxes carry `reply_only: true`: reply to an existing
   * conversation via `messaging.sendMessage()`, never `startChat()`.
   * `company_id` is resolved by correlating the page name against the
   * account's managed pages. An uncorrelatable page reports
   * `company_id: null`, never a fabricated id. When no company inbox
   * exists, `hint` names the Company Pages reconnect requirement instead of
   * an empty list.
   *
   * Beta.
   *
   * @param params - optional `{ kind }` (`"personal"` or `"company"`)
   *   and/or `{ company_id }` filters. Omit to list every inbox.
   *
   * @example
   * const acc = curviate.account("acc_YOUR_ACCOUNT_ID");
   * const { items, hint } = await acc.inboxes.list({ kind: "company" });
   * const companyPage = (items ?? []).find((i) => i.kind === "company");
   * console.log(companyPage?.id, companyPage?.name, hint);
   * // companyPage?.id is what you pass to listChats(), e.g. "COMPANY_83734124_PRIMARY"
   */
  list(params?: InboxListQuery): Promise<InboxListPage> {
    return this.ctx.request<InboxListPage>({
      method: "GET",
      path: `/v1/{account_id}/inboxes`,
      ...(params ? { query: params as Record<string, string | number | boolean | string[] | undefined | null> } : {}),
    });
  }

  /**
   * List an inbox's conversations, newest-activity-first, cursor-paginated.
   * `GET /v1/{account_id}/inboxes/{inbox_id}/chats`
   *
   * Every chat's `id` is already send-ready: pass it directly to
   * `messaging.sendMessage(chatId, { text })` to reply. A company inbox's
   * chat id (e.g. `"COMPANY_83734124_2-YTQ3ODU3Njgt"`) replies AS THE PAGE,
   * no separate parameter needed. This is the full reply-as-a-page flow:
   *
   * ```ts
   * const { items: inboxes } = await acc.inboxes.list({ kind: "company" });
   * const pageInbox = inboxes[0]!; // e.g. id "COMPANY_83734124_PRIMARY", reply_only: true
   *
   * const { items: chats } = await acc.inboxes.listChats(pageInbox.id);
   * const chatId = chats[0]!.id as string; // e.g. "COMPANY_83734124_2-YTQ3ODU3Njgt"
   *
   * const sent = await acc.messaging.sendMessage(chatId, { text: "Thanks for reaching out!" });
   * console.log(sent.sent_as); // { kind: "company", company_id: "112013061", name: "Acme Inc" }
   * ```
   *
   * Works identically for personal (`CLASSIC_`) inboxes: pass a `CLASSIC_`
   * chat id and the send goes out as the connected member. An unknown
   * `inbox_id` returns `RESOURCE_NOT_FOUND` (404). Beta.
   *
   * @param inboxId - the inbox id from `list()` (e.g. `"CLASSIC_PRIMARY"`
   *   or `"COMPANY_83734124_PRIMARY"`).
   * @param params - optional `limit` (1-25, default 20) and an opaque
   *   `cursor` for pagination.
   */
  listChats(inboxId: string, params?: InboxChatListQuery): Promise<InboxChatListPage> {
    return this.ctx.request<InboxChatListPage>({
      method: "GET",
      path: `/v1/{account_id}/inboxes/${inboxId}/chats`,
      ...(params ? { query: params as Record<string, string | number | boolean | string[] | undefined | null> } : {}),
    });
  }
}
