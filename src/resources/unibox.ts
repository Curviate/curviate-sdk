/**
 * Unibox (root-scoped): `curviate.unibox` (6 methods) and
 * `curviate.unibox.accounts` (2 methods).
 *
 * The Unibox is one inbox over every account you can operate, served from
 * what Curviate has stored: its reads call nothing on LinkedIn and use no
 * limit. An account with full-inbox sync off shows only its Motion chats;
 * full-inbox sync is set per account by the person who connected it
 * (`accounts.update`). Read a chat's messages and act on it (send, react,
 * mark read) with `curviate.account(id).messaging`.
 *
 * A disconnected Account stays in the Unibox, read-only: it appears in
 * `unibox.accounts.list()` and its chats in `unibox.list()` (each item's
 * `account_status` says `disconnected`). Reading its messages answers from
 * Curviate's stored copy; a write on it (send, start a chat, InMail, mark
 * read, react, edit, delete) throws `REAUTH_REQUIRED` (409) until you
 * reconnect it. An archived Account is not listed.
 *
 * A send from the API (this SDK included) or the Unibox marks the chat read:
 * `unread` turns `false`, `marked_unread` clears, and a `chat.updated`
 * webhook reports it. A send from a Motion leaves the read state as it is.
 */
import type { RequestContext } from "../internal/context.js";
import type { paths } from "../generated/types.js";
import { apiPath } from "../internal/path.js";
import { commaLists } from "../internal/query.js";
import { pageable, type Pageable } from "../internal/paginate.js";

type ChatPath = "/v1/unibox/chats/{account_id}/{chat_id}";

export type UniboxChatListParams = NonNullable<paths["/v1/unibox/chats"]["get"]["parameters"]["query"]>;
export type UniboxChatListPage = paths["/v1/unibox/chats"]["get"]["responses"]["200"]["content"]["application/json"];
export type UniboxChat = paths[ChatPath]["get"]["responses"]["200"]["content"]["application/json"];
export type UniboxUnreadCountParams = NonNullable<paths["/v1/unibox/unread-count"]["get"]["parameters"]["query"]>;
export type UniboxUnreadCount = paths["/v1/unibox/unread-count"]["get"]["responses"]["200"]["content"]["application/json"];
export type UniboxRefreshBody = NonNullable<paths["/v1/unibox/refresh"]["post"]["requestBody"]>["content"]["application/json"];
export type UniboxRefreshResult = paths["/v1/unibox/refresh"]["post"]["responses"]["202"]["content"]["application/json"];
export type UniboxTagContactBody = NonNullable<paths[`${ChatPath}/contact`]["post"]["requestBody"]>["content"]["application/json"];
export type UniboxTagContactResult = paths[`${ChatPath}/contact`]["post"]["responses"]["200"]["content"]["application/json"];
export type UniboxEnrollBody = NonNullable<paths[`${ChatPath}/enrollments`]["post"]["requestBody"]>["content"]["application/json"];
export type UniboxEnrollResult = paths[`${ChatPath}/enrollments`]["post"]["responses"]["201"]["content"]["application/json"];
export type UniboxAccountList = paths["/v1/unibox/accounts"]["get"]["responses"]["200"]["content"]["application/json"];
export type UniboxAccount = paths["/v1/unibox/accounts/{account_id}"]["patch"]["responses"]["200"]["content"]["application/json"];
export type UniboxAccountUpdateBody = NonNullable<paths["/v1/unibox/accounts/{account_id}"]["patch"]["requestBody"]>["content"]["application/json"];

/** `curviate.unibox.accounts`: full-inbox sync per account. */
export class UniboxAccountsResource {
  constructor(private readonly ctx: RequestContext) {}

  /**
   * For every account you can operate: whether its whole inbox is copied into
   * the Unibox, and how far the chat-list sync is. A disconnected account is
   * listed too (`account_status: "disconnected"`), read-only.
   * `GET /v1/unibox/accounts`
   *
   * Read `sync` before trusting an empty Unibox: `off` and `pending` mean
   * nothing was listed yet. `sync.next_run_at` is when the next read of the
   * account happens: once the first listing is `complete`, the next poll
   * (every 5 to 10 minutes while the Unibox is open in the dashboard,
   * otherwise 30 to 60, slower at weekends, inside the account's active hours
   * only); while `paused`, when the pause ends; `null` when none can be
   * scheduled or full-inbox sync is off. An account without full-inbox sync
   * that still has Motion chats is polled for them, yet reads `off` with
   * `next_run_at: null`.
   *
   * @example
   * const { items } = await curviate.unibox.accounts.list();
   */
  list(): Promise<UniboxAccountList> {
    return this.ctx.request<UniboxAccountList>({ method: "GET", path: "/v1/unibox/accounts" });
  }

  /**
   * Turn full-inbox sync on or off for one account. Only the person who
   * connected the account can. On starts a paced listing that takes hours;
   * off hides the account's non-Motion chats at once and deletes them within
   * 15 minutes.
   * `PATCH /v1/unibox/accounts/{account_id}`
   *
   * Needs Automate to turn it on: a Team below that Tier is refused with
   * `TIER_REQUIRED`. Turning it off passes on any Tier.
   *
   * @example
   * await curviate.unibox.accounts.update("acc_123", { sync_full_inbox: true });
   */
  update(accountId: string, body: UniboxAccountUpdateBody): Promise<UniboxAccount> {
    return this.ctx.request<UniboxAccount>({ method: "PATCH", path: apiPath`/v1/unibox/accounts/${accountId}`, body });
  }
}

export class UniboxResource {
  readonly accounts: UniboxAccountsResource;

  constructor(private readonly ctx: RequestContext) {
    this.accounts = new UniboxAccountsResource(ctx);
  }

  /**
   * List the chats of every account you can operate in one inbox, newest
   * activity first. Filters: `account_ids`, `motion_ids`, `tags` (several
   * each), `person`, `unread`, `last_message_from`, `type`, `q` (3+
   * characters). `await` it for one page; `for await` it for every chat
   * across pages.
   * `GET /v1/unibox/chats`
   *
   * `person` is one Contact id (`con_...`) or LinkedIn id (`ACo...`), not a
   * list; an unknown id matches nothing. `motion_ids` also takes `"none"`:
   * the chats no Motion links, alone or beside Motion ids. `include_total:
   * true` adds `total` to the page, the chats that match the filters (not
   * the page); without it the body has no `total`.
   *
   * A chat of a disconnected account is listed (`account_status:
   * "disconnected"`), read-only. `unread` is LinkedIn's state for the
   * account, the same for every viewer. `marked_unread` is `{origin, at}`
   * (`origin`: `unibox`, `api` or `linkedin`) when the chat was made unread
   * without a newer message from the other person, else `null`.
   *
   * A group chat has `is_group: true`, `counterpart: null` and a `group`
   * object: `title` (null when it has none: name it from its members),
   * `members[]` (the others, never the account's own person; each with
   * `name`, `first_name`, `picture_url`, `profile_url`, `headline` and
   * `do_not_contact`, which is `null` when nothing names them yet),
   * `members_known` (`false` until a read has listed the members, then
   * `members` is empty) and `preview_sender` (who wrote `preview`, when
   * someone other than the account did). `group` is `null` on a one-to-one
   * chat.
   *
   * @example
   * for await (const chat of curviate.unibox.list({ unread: true })) console.log(chat.chat_id);
   * const { total } = await curviate.unibox.list({ person: "con_123", motion_ids: ["none"], include_total: true });
   */
  list(params?: UniboxChatListParams): Pageable<UniboxChatListPage> {
    return pageable(
      (p) =>
        this.ctx.request<UniboxChatListPage>({ method: "GET", path: "/v1/unibox/chats", query: commaLists(p, "account_ids", "motion_ids", "tags") }),
      params,
    );
  }

  /**
   * One chat as the Unibox lists it, with the same `group` object for a
   * group chat (see `list`).
   * `GET /v1/unibox/chats/{account_id}/{chat_id}`
   *
   * @example
   * const chat = await curviate.unibox.get("acc_123", "chat_123");
   */
  get(accountId: string, chatId: string): Promise<UniboxChat> {
    return this.ctx.request<UniboxChat>({ method: "GET", path: apiPath`/v1/unibox/chats/${accountId}/${chatId}` });
  }

  /**
   * Count unread chats (chats, not messages); cheap to poll. `account_ids`
   * narrows it.
   * `GET /v1/unibox/unread-count`
   *
   * @example
   * const { unread_chats } = await curviate.unibox.unreadCount();
   */
  unreadCount(params?: UniboxUnreadCountParams): Promise<UniboxUnreadCount> {
    return this.ctx.request<UniboxUnreadCount>({ method: "GET", path: "/v1/unibox/unread-count", query: commaLists(params, "account_ids") });
  }

  /**
   * Queue a re-read of the newest chats (up to 100) of each account with
   * full-inbox sync on, or of `account_ids`. Runs within minutes. Once per
   * account per 2 minutes; a repeat answers `cooldown` with `next_allowed_at`.
   * `POST /v1/unibox/refresh`
   *
   * It covers every account the poll covers: full-inbox sync on, or Motion
   * chats or Motion outreach without it (only those chats are kept). An
   * account's `status` is `queued`, `cooldown`, `paused` (it runs when the
   * pause ends) or `not_synced`, which means none of those apply (or the
   * first full listing is still running), so there is nothing to refresh.
   * `next_allowed_at` is when the next manual refresh is allowed (while
   * `paused`, when the pause ends, `null` if unknown). A disconnected account
   * named here is ignored and claims no cooldown.
   *
   * Needs Automate: a Team below that Tier is refused with `TIER_REQUIRED`.
   *
   * @example
   * const { accounts } = await curviate.unibox.refresh();
   */
  refresh(body: UniboxRefreshBody = {}): Promise<UniboxRefreshResult> {
    return this.ctx.request<UniboxRefreshResult>({ method: "POST", path: "/v1/unibox/refresh", body });
  }

  /**
   * Save the other person of a one-to-one chat as a Contact (or find the one
   * you hold) and add `tags`, never removing any.
   * `POST /v1/unibox/chats/{account_id}/{chat_id}/contact`
   *
   * Needs Automate: a Team below that Tier is refused with `TIER_REQUIRED`.
   *
   * @example
   * const { contact_id } = await curviate.unibox.tagContact("acc_123", "chat_123", { tags: ["warm"] });
   */
  tagContact(accountId: string, chatId: string, body: UniboxTagContactBody = {}): Promise<UniboxTagContactResult> {
    return this.ctx.request<UniboxTagContactResult>({ method: "POST", path: apiPath`/v1/unibox/chats/${accountId}/${chatId}/contact`, body });
  }

  /**
   * Save the other person of a one-to-one chat as a Contact and enroll them
   * in a Motion through this chat's account (one of the Motion's sending
   * accounts). A direct add: the rule that skips people you already chat
   * with does not apply; every other rule does.
   * `POST /v1/unibox/chats/{account_id}/{chat_id}/enrollments`
   *
   * Needs Automate: a Team below that Tier is refused with `TIER_REQUIRED`.
   *
   * @example
   * const enrollment = await curviate.unibox.enroll("acc_123", "chat_123", { motion_id: "mot_123" });
   */
  enroll(accountId: string, chatId: string, body: UniboxEnrollBody): Promise<UniboxEnrollResult> {
    return this.ctx.request<UniboxEnrollResult>({ method: "POST", path: apiPath`/v1/unibox/chats/${accountId}/${chatId}/enrollments`, body });
  }
}
