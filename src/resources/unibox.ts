/**
 * Unibox (root-scoped): `curviate.unibox` (14 methods) and
 * `curviate.unibox.accounts` (2 methods).
 *
 * The Unibox is one inbox over every account you can operate, served from
 * what Curviate has stored: its reads call nothing on LinkedIn and use no
 * limit. An account with full-inbox sync off shows only its Campaign chats;
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
 * A conversation is one person on one account across LinkedIn and email:
 * each chat carries its `conversation_id`, and `getConversation` and
 * `listConversationMessages` read it, both channels in one timeline.
 *
 * A send from the API (this SDK included) or the Unibox marks the chat read:
 * `unread` turns `false`, `marked_unread` clears, and a `chat.updated`
 * webhook reports it. A send from a Campaign leaves the read state as it is.
 */
import type { RequestContext } from "../internal/context.js";
import type { paths } from "../generated/types.js";
import { apiPath } from "../internal/path.js";
import { commaLists } from "../internal/query.js";
import { pageable, type Pageable } from "../internal/paginate.js";

type ChatPath = "/v1/unibox/chats/{account_id}/{chat_id}";
type ConversationPath = "/v1/unibox/conversations/{conversation_id}";

export type UniboxChatListParams = NonNullable<paths["/v1/unibox/chats"]["get"]["parameters"]["query"]>;
export type UniboxChatListPage = paths["/v1/unibox/chats"]["get"]["responses"]["200"]["content"]["application/json"];
export type UniboxChat = paths[ChatPath]["get"]["responses"]["200"]["content"]["application/json"];
export type UniboxUnreadCountParams = NonNullable<paths["/v1/unibox/unread-count"]["get"]["parameters"]["query"]>;
export type UniboxUnreadCount = paths["/v1/unibox/unread-count"]["get"]["responses"]["200"]["content"]["application/json"];
export type UniboxRefreshBody = NonNullable<paths["/v1/unibox/refresh"]["post"]["requestBody"]>["content"]["application/json"];
export type UniboxRefreshResult = paths["/v1/unibox/refresh"]["post"]["responses"]["202"]["content"]["application/json"];
export type UniboxTagLeadBody = NonNullable<paths[`${ChatPath}/lead`]["post"]["requestBody"]>["content"]["application/json"];
export type UniboxTagLeadResult = paths[`${ChatPath}/lead`]["post"]["responses"]["200"]["content"]["application/json"];
export type UniboxEnrollBody = NonNullable<paths[`${ChatPath}/enrollments`]["post"]["requestBody"]>["content"]["application/json"];
export type UniboxEnrollResult = paths[`${ChatPath}/enrollments`]["post"]["responses"]["201"]["content"]["application/json"];
export type UniboxAccountList = paths["/v1/unibox/accounts"]["get"]["responses"]["200"]["content"]["application/json"];
export type UniboxAccount = paths["/v1/unibox/accounts/{account_id}"]["patch"]["responses"]["200"]["content"]["application/json"];
export type ReplyLabelHistory = paths["/v1/unibox/messages/{message_id}/reply-label"]["get"]["responses"]["200"]["content"]["application/json"];
export type ReplyLabelUpdateBody = NonNullable<paths["/v1/unibox/messages/{message_id}"]["patch"]["requestBody"]>["content"]["application/json"];
export type ReplyLabelUpdateResult = paths["/v1/unibox/messages/{message_id}"]["patch"]["responses"]["200"]["content"]["application/json"];
/** A Reply label: `interested`, `not_now`, `not_interested`, `opt_out`, `out_of_office`, `referral`, `other`, or `unsure` (Curviate could not tell). */
export type ReplyLabel = NonNullable<ReplyLabelHistory["current"]>["label"];
export type UniboxConversation = paths[ConversationPath]["get"]["responses"]["200"]["content"]["application/json"];
export type UniboxConversationMessagesParams = NonNullable<paths[`${ConversationPath}/messages`]["get"]["parameters"]["query"]>;
export type UniboxConversationMessagesPage = paths[`${ConversationPath}/messages`]["get"]["responses"]["200"]["content"]["application/json"];
export type UniboxConversationMarkBody = NonNullable<paths[ConversationPath]["patch"]["requestBody"]>["content"]["application/json"];
export type UniboxConversationMarkResult = paths[ConversationPath]["patch"]["responses"]["200"]["content"]["application/json"];
export type UniboxSendEmailBody = NonNullable<paths[`${ConversationPath}/emails`]["post"]["requestBody"]>["content"]["application/json"];
export type UniboxSentEmail = paths[`${ConversationPath}/emails`]["post"]["responses"]["201"]["content"]["application/json"];
export type ReferralSearchBody = NonNullable<paths["/v1/unibox/messages/{message_id}/referral/search"]["post"]["requestBody"]>["content"]["application/json"];
export type ReferralSearchResult = paths["/v1/unibox/messages/{message_id}/referral/search"]["post"]["responses"]["200"]["content"]["application/json"];
export type ReferralConfirmBody = NonNullable<paths["/v1/unibox/messages/{message_id}/referral/confirm"]["post"]["requestBody"]>["content"]["application/json"];
export type ReferralConfirmResult = paths["/v1/unibox/messages/{message_id}/referral/confirm"]["post"]["responses"]["201"]["content"]["application/json"];
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
   * that still has Campaign chats is polled for them, yet reads `off` with
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
   * off hides the account's non-Campaign chats at once and deletes them within
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
   * activity first. Filters: `account_ids`, `campaign_ids`, `tags` (several
   * each), `person`, `unread`, `last_message_from`, `type`, `q` (3+
   * characters), `reply_label` (the chat's latest Reply label, several;
   * `"none"` adds the chats with no label). `await` it for one page; `for await` it for every chat
   * across pages.
   * `GET /v1/unibox/chats`
   *
   * `person` is one Lead id (`con_...`) or LinkedIn id (`ACo...`), not a
   * list; an unknown id matches nothing. `campaign_ids` also takes `"none"`:
   * the chats no Campaign links, alone or beside Campaign ids. `include_total:
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
   * const { total } = await curviate.unibox.list({ person: "con_123", campaign_ids: ["none"], include_total: true });
   */
  list(params?: UniboxChatListParams): Pageable<UniboxChatListPage> {
    return pageable(
      (p) =>
        this.ctx.request<UniboxChatListPage>({ method: "GET", path: "/v1/unibox/chats", query: commaLists(p, "account_ids", "campaign_ids", "tags", "reply_label") }),
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
   * One conversation: one person on one account, across LinkedIn and email,
   * as the list serves it (`conversation_id` on each chat). From what
   * Curviate has stored: no LinkedIn call, no mailbox read.
   * `GET /v1/unibox/conversations/{conversation_id}`
   *
   * @example
   * const conversation = await curviate.unibox.getConversation("cnv_123");
   */
  getConversation(conversationId: string): Promise<UniboxConversation> {
    return this.ctx.request<UniboxConversation>({ method: "GET", path: apiPath`/v1/unibox/conversations/${conversationId}` });
  }

  /**
   * A conversation's timeline, newest first: its LinkedIn messages (the same
   * ids as `account(id).messaging`), its emails, and Campaign events (a
   * bounce, an unsubscribe, the Enrollment's end) as items with `channel`
   * `null`. `counts` cover the whole conversation. A page holds `limit`
   * LinkedIn messages and every email and event since the oldest of them;
   * `channel: "email"` serves every email at once. Email is read from what
   * Curviate kept: no mailbox read. `await` it for one page; `for await` it
   * for every item.
   * `GET /v1/unibox/conversations/{conversation_id}/messages`
   *
   * @example
   * for await (const item of curviate.unibox.listConversationMessages("cnv_123")) console.log(item.channel);
   */
  listConversationMessages(conversationId: string, params?: UniboxConversationMessagesParams): Pageable<UniboxConversationMessagesPage> {
    return pageable(
      (p) => this.ctx.request<UniboxConversationMessagesPage>({ method: "GET", path: apiPath`/v1/unibox/conversations/${conversationId}/messages`, ...(p ? { query: p } : {}) }),
      params,
    );
  }

  /**
   * Mark a conversation read (`{ read: true }`) or unread: its LinkedIn chat
   * on LinkedIn, and its email in Curviate (the Mailbox itself is never
   * changed). An email from them makes it unread again.
   * `PATCH /v1/unibox/conversations/{conversation_id}`
   *
   * @example
   * await curviate.unibox.markConversation("cnv_123", { read: false }); // hand it to a person
   */
  markConversation(conversationId: string, body: UniboxConversationMarkBody): Promise<UniboxConversationMarkResult> {
    return this.ctx.request<UniboxConversationMarkResult>({ method: "PATCH", path: apiPath`/v1/unibox/conversations/${conversationId}`, body });
  }

  /**
   * Send one plain-text email to the conversation's Lead, at once: a reply in
   * one of its threads (`thread_id`), or a new thread (`subject`, and
   * `mailbox_id` when more than one Mailbox can send). It goes to the Lead's
   * one address with no signature and no opt-out line, counts against the
   * Mailbox's daily limit, and ends the Lead's open Enrollments on that
   * Account as a reply would. Read `email` on `getConversation` first: it
   * says whether email is available and from which Mailboxes; otherwise
   * `EMAIL_UNAVAILABLE` (422, with `reason`). One HTTP call, never retried by
   * the SDK: a retry after a timeout can send the email twice, so read the
   * conversation before you send again.
   * `POST /v1/unibox/conversations/{conversation_id}/emails`
   *
   * @example
   * await curviate.unibox.sendEmail("cnv_123", { thread_id: "thr_123", text: "Thanks, Thursday works." });
   */
  sendEmail(conversationId: string, body: UniboxSendEmailBody): Promise<UniboxSentEmail> {
    return this.ctx.request<UniboxSentEmail>({ method: "POST", path: apiPath`/v1/unibox/conversations/${conversationId}/emails`, body });
  }

  /**
   * For a reply labelled Referral: one LinkedIn people search, as the
   * conversation's Account, for the referred person (the name Curviate
   * suggests from the reply, or `name`), at most 10 candidates, each counted
   * against the Account's search limit. A message labelled otherwise is
   * `NOT_A_REFERRAL` (409) and nothing is searched.
   * `POST /v1/unibox/messages/{message_id}/referral/search`
   *
   * @example
   * const { items } = await curviate.unibox.referralSearch("msg_123");
   */
  referralSearch(messageId: string, body: ReferralSearchBody = {}): Promise<ReferralSearchResult> {
    return this.ctx.request<ReferralSearchResult>({ method: "POST", path: apiPath`/v1/unibox/messages/${messageId}/referral/search`, body });
  }

  /**
   * For a reply labelled Referral: save the person you picked (`provider_id`
   * from the search, or `linkedin_url`) as a Lead, or get the Lead you
   * already hold (`outcome`). It never enrolls them.
   * `POST /v1/unibox/messages/{message_id}/referral/confirm`
   *
   * @example
   * const lead = await curviate.unibox.referralConfirm("msg_123", { provider_id: "ACoAAB1234567" });
   */
  referralConfirm(messageId: string, body: ReferralConfirmBody): Promise<ReferralConfirmResult> {
    return this.ctx.request<ReferralConfirmResult>({ method: "POST", path: apiPath`/v1/unibox/messages/${messageId}/referral/confirm`, body });
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
   * It covers every account the poll covers: full-inbox sync on, or Campaign
   * chats or Campaign outreach without it (only those chats are kept). An
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
   * Save the other person of a one-to-one chat as a Lead (or find the one
   * you hold) and add `tags`, never removing any.
   * `POST /v1/unibox/chats/{account_id}/{chat_id}/lead`
   *
   * Needs Automate: a Team below that Tier is refused with `TIER_REQUIRED`.
   *
   * @example
   * const { lead_id } = await curviate.unibox.tagLead("acc_123", "chat_123", { tags: ["warm"] });
   */
  tagLead(accountId: string, chatId: string, body: UniboxTagLeadBody = {}): Promise<UniboxTagLeadResult> {
    return this.ctx.request<UniboxTagLeadResult>({ method: "POST", path: apiPath`/v1/unibox/chats/${accountId}/${chatId}/lead`, body });
  }

  /**
   * Save the other person of a one-to-one chat as a Lead and enroll them
   * in a Campaign through this chat's account (one of the Campaign's sending
   * accounts). A direct add: the rule that skips people you already chat
   * with does not apply; every other rule does.
   * `POST /v1/unibox/chats/{account_id}/{chat_id}/enrollments`
   *
   * Needs Automate: a Team below that Tier is refused with `TIER_REQUIRED`.
   *
   * @example
   * const enrollment = await curviate.unibox.enroll("acc_123", "chat_123", { campaign_id: "mot_123" });
   */
  enroll(accountId: string, chatId: string, body: UniboxEnrollBody): Promise<UniboxEnrollResult> {
    return this.ctx.request<UniboxEnrollResult>({ method: "POST", path: apiPath`/v1/unibox/chats/${accountId}/${chatId}/enrollments`, body });
  }

  /**
   * The Reply label of one message: `current` (or `null`) and every label it
   * has had, newest first; a correction is a new entry and the earlier ones
   * stay. From what Curviate has stored: no LinkedIn call. A message that
   * takes no label (a direct conversation, your own message, a warm-up
   * message) throws `REPLY_NOT_LABELLABLE`.
   * `GET /v1/unibox/messages/{message_id}/reply-label`
   *
   * @example
   * const { current } = await curviate.unibox.getReplyLabel("msg_123");
   */
  getReplyLabel(messageId: string): Promise<ReplyLabelHistory> {
    return this.ctx.request<ReplyLabelHistory>({ method: "GET", path: apiPath`/v1/unibox/messages/${messageId}/reply-label` });
  }

  /**
   * Set, correct, or resolve an `unsure` Reply label on a reply to a
   * Campaign. Stored as a correction (who set it, the label it replaces). The
   * label acts as when Curviate sets it: `opt_out` puts the person on your
   * Do-not-contact list (a later correction leaves the entry), and so does
   * `not_interested` when your team turned that on; `out_of_office` makes the
   * Lead wait 7 days, then the Campaign goes on (correcting it away ends the
   * wait and counts the reply); your team's Tag for the label is added to the
   * Lead. No LinkedIn call. Needs Automate.
   * `PATCH /v1/unibox/messages/{message_id}`
   *
   * @example
   * await curviate.unibox.updateMessage("msg_123", { reply_label: "interested" });
   */
  updateMessage(messageId: string, body: ReplyLabelUpdateBody): Promise<ReplyLabelUpdateResult> {
    return this.ctx.request<ReplyLabelUpdateResult>({ method: "PATCH", path: apiPath`/v1/unibox/messages/${messageId}`, body });
  }
}
