/**
 * Companies resource: 14 methods.
 *
 * Account-scoped: the bound context injects `account_id` as the leading
 * `/v1/` path segment on every request (account-first grammar), the 0.14.1
 * query-param `account_id` is dropped entirely.
 *
 * `get()` accepts a public handle or numeric id (the retrieve's own broader
 * contract). `employees()` / `posts()` / `jobs()` require the company's
 * numeric provider_id only, the same `id` field `get()` returns.
 *
 * `managed()` lists the pages the connected account administers.
 * `followers()`, re-added under a different item shape (`company_follower`,
 * carrying `degree`/`followed_at`) than the pre-0.15.0 method of the same
 * name. `invitableFollowers()` lists connections the account can invite to
 * follow the page; `followInvite()` sends the invitation,
 * pass the `AC...` member ids `invitableFollowers()` returned. All four require
 * the account to administer the target page (`managed()` for the caller's
 * own set; `followers`/`invitableFollowers`/`followInvite` take the target
 * company's numeric provider_id, same as `employees`/`posts`/`jobs`).
 *
 * `chats()` / `chat()` / `messages()` / `message()` / `searchChats()` are the
 * company page's admin message inbox, a distinct conversation surface from
 * the account's own `messaging` namespace, scoped to one administered page.
 * **Beta:** single-page listing and termination are verified; deep pagination
 * (many pages / large cursor round-trips) is still being validated against a
 * busier inbox.
 *
 * `sendMessage()` is the inbox's one write: reply to an existing
 * conversation AS THE PAGE. It takes the same `2-...` chat id that
 * `chats()` / `searchChats()` return; the endpoint resolves the page
 * mailbox internally from `identifier`. Reply-only, same admin
 * requirement as the reads.
 */
import type { RequestContext } from "../internal/context.js";
import type { paths } from "../generated/types.js";

// ─── Type aliases from generated OpenAPI snapshot ──────────────────────────

export type CompanyProfile =
  paths["/v1/{account_id}/companies/{identifier}"]["get"]["responses"]["200"]["content"]["application/json"];

export type CompanyEmployeeListPage =
  paths["/v1/{account_id}/companies/{identifier}/employees"]["get"]["responses"]["200"]["content"]["application/json"];
export type CompanyEmployeeListQuery = NonNullable<
  paths["/v1/{account_id}/companies/{identifier}/employees"]["get"]["parameters"]["query"]
>;

export type CompanyPostListPage =
  paths["/v1/{account_id}/companies/{identifier}/posts"]["get"]["responses"]["200"]["content"]["application/json"];
export type CompanyPostListQuery = NonNullable<
  paths["/v1/{account_id}/companies/{identifier}/posts"]["get"]["parameters"]["query"]
>;

export type CompanyJobListPage =
  paths["/v1/{account_id}/companies/{identifier}/jobs"]["get"]["responses"]["200"]["content"]["application/json"];
export type CompanyJobListQuery = NonNullable<
  paths["/v1/{account_id}/companies/{identifier}/jobs"]["get"]["parameters"]["query"]
>;

export type ManagedCompanyListPage =
  paths["/v1/{account_id}/companies/managed"]["get"]["responses"]["200"]["content"]["application/json"];
export type ManagedCompanyListQuery = NonNullable<
  paths["/v1/{account_id}/companies/managed"]["get"]["parameters"]["query"]
>;

export type CompanyFollowerListPage =
  paths["/v1/{account_id}/companies/{identifier}/followers"]["get"]["responses"]["200"]["content"]["application/json"];
export type CompanyFollowerListQuery = NonNullable<
  paths["/v1/{account_id}/companies/{identifier}/followers"]["get"]["parameters"]["query"]
>;

export type CompanyInvitableFollowerListPage =
  paths["/v1/{account_id}/companies/{identifier}/invitable-followers"]["get"]["responses"]["200"]["content"]["application/json"];
export type CompanyInvitableFollowerListQuery = NonNullable<
  paths["/v1/{account_id}/companies/{identifier}/invitable-followers"]["get"]["parameters"]["query"]
>;

export type CompanyFollowInviteBody =
  paths["/v1/{account_id}/companies/{identifier}/follow-invite"]["post"]["requestBody"]["content"]["application/json"];
export type CompanyFollowInviteResult =
  paths["/v1/{account_id}/companies/{identifier}/follow-invite"]["post"]["responses"]["200"]["content"]["application/json"];

export type CompanyChatListPage =
  paths["/v1/{account_id}/companies/{identifier}/chats"]["get"]["responses"]["200"]["content"]["application/json"];
export type CompanyChatListQuery = NonNullable<
  paths["/v1/{account_id}/companies/{identifier}/chats"]["get"]["parameters"]["query"]
>;

export type CompanyChat =
  paths["/v1/{account_id}/companies/{identifier}/chats/{chat_id}"]["get"]["responses"]["200"]["content"]["application/json"];

export type CompanyChatMessageListPage =
  paths["/v1/{account_id}/companies/{identifier}/chats/{chat_id}/messages"]["get"]["responses"]["200"]["content"]["application/json"];
export type CompanyChatMessageListQuery = NonNullable<
  paths["/v1/{account_id}/companies/{identifier}/chats/{chat_id}/messages"]["get"]["parameters"]["query"]
>;

export type CompanyChatMessage =
  paths["/v1/{account_id}/companies/{identifier}/chats/{chat_id}/messages/{message_id}"]["get"]["responses"]["200"]["content"]["application/json"];

export type CompanyChatSearchPage =
  paths["/v1/{account_id}/companies/{identifier}/chats/search"]["get"]["responses"]["200"]["content"]["application/json"];
export type CompanyChatSearchQuery = NonNullable<
  paths["/v1/{account_id}/companies/{identifier}/chats/search"]["get"]["parameters"]["query"]
>;

export type CompanySendMessageBody =
  paths["/v1/{account_id}/companies/{identifier}/chats/{chat_id}/messages"]["post"]["requestBody"]["content"]["application/json"];
export type CompanySendMessageResult =
  paths["/v1/{account_id}/companies/{identifier}/chats/{chat_id}/messages"]["post"]["responses"]["201"]["content"]["application/json"];

// ─── Resource class ───────────────────────────────────────────────────────────

export class CompaniesResource {
  constructor(protected readonly ctx: RequestContext) {}

  /**
   * Retrieve a company's full LinkedIn profile.
   * `GET /v1/{account_id}/companies/{identifier}`
   *
   * Accepts a public handle (the slug in `linkedin.com/company/<handle>`,
   * e.g. `t-systems`) or a numeric id (e.g. `1234567`). A URN is not accepted.
   */
  get(identifier: string): Promise<CompanyProfile> {
    return this.ctx.request<CompanyProfile>({
      method: "GET",
      path: `/v1/{account_id}/companies/${identifier}`,
    });
  }

  /**
   * List people who currently work at the company.
   * `GET /v1/{account_id}/companies/{identifier}/employees`
   *
   * A facade over people search with the company filter applied, filter
   * further with `keywords` or `location`. `identifier` must be the
   * company's numeric provider_id (the same `id` field `get()` returns),
   * a handle or URN is rejected before any upstream call.
   */
  employees(identifier: string, params?: CompanyEmployeeListQuery): Promise<CompanyEmployeeListPage> {
    return this.ctx.request<CompanyEmployeeListPage>({
      method: "GET",
      path: `/v1/{account_id}/companies/${identifier}/employees`,
      ...(params ? { query: params as Record<string, string | number | boolean | string[] | undefined | null> } : {}),
    });
  }

  /**
   * List the company's posts.
   * `GET /v1/{account_id}/companies/{identifier}/posts`
   *
   * A facade over post search with the company filter applied. `identifier`
   * must be the company's numeric provider_id.
   */
  posts(identifier: string, params?: CompanyPostListQuery): Promise<CompanyPostListPage> {
    return this.ctx.request<CompanyPostListPage>({
      method: "GET",
      path: `/v1/{account_id}/companies/${identifier}/posts`,
      ...(params ? { query: params as Record<string, string | number | boolean | string[] | undefined | null> } : {}),
    });
  }

  /**
   * List the company's open job postings.
   * `GET /v1/{account_id}/companies/{identifier}/jobs`
   *
   * A facade over job search with the company filter applied, filter
   * further with `keywords`. An empty `items[]` is a valid result (the
   * company currently has no open postings). `identifier` must be the
   * company's numeric provider_id.
   */
  jobs(identifier: string, params?: CompanyJobListQuery): Promise<CompanyJobListPage> {
    return this.ctx.request<CompanyJobListPage>({
      method: "GET",
      path: `/v1/{account_id}/companies/${identifier}/jobs`,
      ...(params ? { query: params as Record<string, string | number | boolean | string[] | undefined | null> } : {}),
    });
  }

  /**
   * List the pages the connected account administers.
   * `GET /v1/{account_id}/companies/managed`
   *
   * The `id` on each returned page is the numeric provider_id `followers()`,
   * `invitableFollowers()`, `employees()`, `posts()`, and `jobs()` consume.
   * An empty `items[]` is valid; the account administers no pages.
   */
  managed(params?: ManagedCompanyListQuery): Promise<ManagedCompanyListPage> {
    return this.ctx.request<ManagedCompanyListPage>({
      method: "GET",
      path: `/v1/{account_id}/companies/managed`,
      ...(params ? { query: params as Record<string, string | number | boolean | string[] | undefined | null> } : {}),
    });
  }

  /**
   * List a company page's followers, newest first.
   * `GET /v1/{account_id}/companies/{identifier}/followers`
   *
   * The connected account must administer the page (see `managed()`).
   * `identifier` must be the company's numeric provider_id.
   */
  followers(identifier: string, params?: CompanyFollowerListQuery): Promise<CompanyFollowerListPage> {
    return this.ctx.request<CompanyFollowerListPage>({
      method: "GET",
      path: `/v1/{account_id}/companies/${identifier}/followers`,
      ...(params ? { query: params as Record<string, string | number | boolean | string[] | undefined | null> } : {}),
    });
  }

  /**
   * List the connected account's connections who are invitable to follow the
   * company page. `GET /v1/{account_id}/companies/{identifier}/invitable-followers`
   *
   * The connected account must administer the page. `identifier` must be the
   * company's numeric provider_id. An empty `items[]` is valid; nobody is
   * currently invitable.
   */
  invitableFollowers(
    identifier: string,
    params?: CompanyInvitableFollowerListQuery,
  ): Promise<CompanyInvitableFollowerListPage> {
    return this.ctx.request<CompanyInvitableFollowerListPage>({
      method: "GET",
      path: `/v1/{account_id}/companies/${identifier}/invitable-followers`,
      ...(params ? { query: params as Record<string, string | number | boolean | string[] | undefined | null> } : {}),
    });
  }

  /**
   * Invite the connected account's 1st-degree connections to follow the
   * company page. `POST /v1/{account_id}/companies/{identifier}/follow-invite`
   *
   * The account must administer the page with the invite-to-follow
   * entitlement (see `managed()`). `identifier` must be the company's numeric
   * provider_id. Pass the `AC...` member ids from an `invitableFollowers()`
   * read. All-or-nothing: for an all-valid request, resolves to one outcome
   * per requested invitee, in request order. If any invitee id is invalid,
   * the whole request rejects with a 404, not a partial result.
   * Re-inviting an already-invited member is a safe no-op, the same
   * invitation id, never a duplicate.
   */
  followInvite(identifier: string, body: CompanyFollowInviteBody): Promise<CompanyFollowInviteResult> {
    return this.ctx.request<CompanyFollowInviteResult>({
      method: "POST",
      path: `/v1/{account_id}/companies/${identifier}/follow-invite`,
      body,
    });
  }

  /**
   * List the conversations in a company page's admin message inbox,
   * newest-activity-first.
   * `GET /v1/{account_id}/companies/{identifier}/chats`
   *
   * The connected account must administer the page. `identifier` must be the
   * company's numeric provider_id. Content passes through verbatim and is
   * never stored. Beta: single-page listing and termination are verified;
   * deep pagination (many pages / large cursor round-trips) is provisional
   * until validated against a busier inbox.
   */
  chats(identifier: string, params?: CompanyChatListQuery): Promise<CompanyChatListPage> {
    return this.ctx.request<CompanyChatListPage>({
      method: "GET",
      path: `/v1/{account_id}/companies/${identifier}/chats`,
      ...(params ? { query: params as Record<string, string | number | boolean | string[] | undefined | null> } : {}),
    });
  }

  /**
   * Retrieve one conversation from a company page's admin inbox.
   * `GET /v1/{account_id}/companies/{identifier}/chats/{chat_id}`
   *
   * The connected account must administer the page. Beta: see `chats()`.
   */
  chat(identifier: string, chatId: string): Promise<CompanyChat> {
    return this.ctx.request<CompanyChat>({
      method: "GET",
      path: `/v1/{account_id}/companies/${identifier}/chats/${chatId}`,
    });
  }

  /**
   * List a company-inbox conversation's messages, newest first.
   * `GET /v1/{account_id}/companies/{identifier}/chats/{chat_id}/messages`
   *
   * The connected account must administer the page. Content passes through
   * verbatim and is never stored. Beta: see `chats()`.
   */
  messages(
    identifier: string,
    chatId: string,
    params?: CompanyChatMessageListQuery,
  ): Promise<CompanyChatMessageListPage> {
    return this.ctx.request<CompanyChatMessageListPage>({
      method: "GET",
      path: `/v1/{account_id}/companies/${identifier}/chats/${chatId}/messages`,
      ...(params ? { query: params as Record<string, string | number | boolean | string[] | undefined | null> } : {}),
    });
  }

  /**
   * Retrieve one message from a company-inbox conversation.
   * `GET /v1/{account_id}/companies/{identifier}/chats/{chat_id}/messages/{message_id}`
   *
   * The connected account must administer the page. Beta: see `chats()`.
   */
  message(identifier: string, chatId: string, messageId: string): Promise<CompanyChatMessage> {
    return this.ctx.request<CompanyChatMessage>({
      method: "GET",
      path: `/v1/{account_id}/companies/${identifier}/chats/${chatId}/messages/${messageId}`,
    });
  }

  /**
   * Search or filter a company page's admin inbox.
   * `GET /v1/{account_id}/companies/{identifier}/chats/search`
   *
   * Exactly one mode per call: free-text `query` (matches participant names
   * and message content), a `topic` card, or `unread`-only; the three are
   * mutually exclusive and enforced server-side. The connected account must
   * administer the page. Beta: see `chats()`.
   */
  searchChats(identifier: string, params?: CompanyChatSearchQuery): Promise<CompanyChatSearchPage> {
    return this.ctx.request<CompanyChatSearchPage>({
      method: "GET",
      path: `/v1/{account_id}/companies/${identifier}/chats/search`,
      ...(params ? { query: params as Record<string, string | number | boolean | string[] | undefined | null> } : {}),
    });
  }

  /**
   * Reply to a company-inbox conversation, AS THE PAGE.
   * `POST /v1/{account_id}/companies/{identifier}/chats/{chat_id}/messages`
   *
   * `chatId` is the `2-...` conversation id that `chats()` / `chat()` /
   * `searchChats()` return for this page. The endpoint resolves the page
   * mailbox internally from `identifier`, so no special send-ready id is
   * needed: pass the id straight from the company chat reads.
   *
   * Reply-only: this method can only answer an existing conversation, it
   * cannot start a new one on the page's behalf. The connected account
   * must administer the page (`managed()`). `attachments[]`, when
   * supplied, carry base64-encoded file bytes, always sent as JSON, never
   * multipart. At least one of `text`/`attachments` is required (enforced
   * server-side). Message content passes through verbatim and is never
   * stored.
   *
   * The response echoes `sent_as`, the acting identity actually used:
   * `{ kind: "company", company_id, name }` (`company_id` is `null` when
   * the page could not be correlated to a managed page on Curviate).
   *
   * @example
   * const acc = curviate.account("acc_YOUR_ACCOUNT_ID");
   * const { items: chats } = await acc.companies.chats("112013061");
   *
   * const result = await acc.companies.sendMessage("112013061", chats[0]!.id, {
   *   text: "Thanks for reaching out, happy to help!",
   * });
   * console.log(result.sent_as); // { kind: "company", company_id: "112013061", name: "RedHire" }
   */
  sendMessage(
    identifier: string,
    chatId: string,
    body: CompanySendMessageBody,
  ): Promise<CompanySendMessageResult> {
    return this.ctx.request<CompanySendMessageResult>({
      method: "POST",
      path: `/v1/{account_id}/companies/${identifier}/chats/${chatId}/messages`,
      body,
    });
  }
}
