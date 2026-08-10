/**
 * Sales Navigator resource: 12 methods (tier: sn).
 *
 * Account-scoped: the bound context injects `account_id` as the leading
 * `/v1/` path segment on every request (account-first grammar), never a
 * query param or body field. The v2 list surface (`accountLists`,
 * `leadLists`, `browseAccountList`, `browseLeadList`, `saveAccount`,
 * `saveLead`) already stopped carrying `account_id` in the body/query once
 * it moved into the path, so those bodies shrink to just their own fields
 * (`company_id` / `user_id` for the two saves).
 *
 * `startChat` is pure `application/json`, the served surface has ZERO
 * multipart ops; file/voice/video attachments travel as base64-encoded
 * objects (`{content,content_type,filename,send_mode?,metadata?}`).
 *
 * `searchFromUrl` is new. `syncMessages` has no served equivalent and is
 * removed. Naming stays `Sales*`-family / `salesNavigator` namespace per
 * the established convention.
 */
import type { RequestContext } from "../internal/context.js";
import type { paths } from "../generated/types.js";
import { apiPath } from "../internal/path.js";

// ─── Type aliases from generated OpenAPI snapshot ──────────────────────────

export type SNSearchPeopleBody =
  paths["/v1/{account_id}/sales-navigator/search/people"]["post"]["requestBody"]["content"]["application/json"];
export type SNSearchPeopleQuery = NonNullable<
  paths["/v1/{account_id}/sales-navigator/search/people"]["post"]["parameters"]["query"]
>;
export type SNSearchPeopleResult =
  paths["/v1/{account_id}/sales-navigator/search/people"]["post"]["responses"]["200"]["content"]["application/json"];

export type SNSearchCompaniesBody =
  paths["/v1/{account_id}/sales-navigator/search/companies"]["post"]["requestBody"]["content"]["application/json"];
export type SNSearchCompaniesQuery = NonNullable<
  paths["/v1/{account_id}/sales-navigator/search/companies"]["post"]["parameters"]["query"]
>;
export type SNSearchCompaniesResult =
  paths["/v1/{account_id}/sales-navigator/search/companies"]["post"]["responses"]["200"]["content"]["application/json"];

export type SNGetParametersQuery =
  paths["/v1/{account_id}/sales-navigator/search/parameters"]["get"]["parameters"]["query"];
export type SNGetParametersResult =
  paths["/v1/{account_id}/sales-navigator/search/parameters"]["get"]["responses"]["200"]["content"]["application/json"];

export type SNStartChatBody =
  paths["/v1/{account_id}/sales-navigator/chats"]["post"]["requestBody"]["content"]["application/json"];
export type SNStartChatResult =
  paths["/v1/{account_id}/sales-navigator/chats"]["post"]["responses"]["201"]["content"]["application/json"];

export type SNGetProfileQuery = NonNullable<
  paths["/v1/{account_id}/sales-navigator/profiles/{identifier}"]["get"]["parameters"]["query"]
>;
export type SNGetProfileResult =
  paths["/v1/{account_id}/sales-navigator/profiles/{identifier}"]["get"]["responses"]["200"]["content"]["application/json"];

export type SNAccountListsQuery = NonNullable<
  paths["/v1/{account_id}/sales-navigator/account-lists"]["get"]["parameters"]["query"]
>;
export type SNAccountListsResult =
  paths["/v1/{account_id}/sales-navigator/account-lists"]["get"]["responses"]["200"]["content"]["application/json"];

export type SNLeadListsQuery = NonNullable<
  paths["/v1/{account_id}/sales-navigator/lead-lists"]["get"]["parameters"]["query"]
>;
export type SNLeadListsResult =
  paths["/v1/{account_id}/sales-navigator/lead-lists"]["get"]["responses"]["200"]["content"]["application/json"];

export type SNBrowseAccountListQuery = NonNullable<
  paths["/v1/{account_id}/sales-navigator/account-lists/{list_id}"]["post"]["parameters"]["query"]
>;
export type SNBrowseAccountListBody =
  paths["/v1/{account_id}/sales-navigator/account-lists/{list_id}"]["post"]["requestBody"]["content"]["application/json"];
export type SNBrowseAccountListResult =
  paths["/v1/{account_id}/sales-navigator/account-lists/{list_id}"]["post"]["responses"]["200"]["content"]["application/json"];

export type SNBrowseLeadListQuery = NonNullable<
  paths["/v1/{account_id}/sales-navigator/lead-lists/{list_id}"]["post"]["parameters"]["query"]
>;
export type SNBrowseLeadListBody =
  paths["/v1/{account_id}/sales-navigator/lead-lists/{list_id}"]["post"]["requestBody"]["content"]["application/json"];
export type SNBrowseLeadListResult =
  paths["/v1/{account_id}/sales-navigator/lead-lists/{list_id}"]["post"]["responses"]["200"]["content"]["application/json"];

export type SNSaveAccountBody =
  paths["/v1/{account_id}/sales-navigator/account-lists/{list_id}/save"]["post"]["requestBody"]["content"]["application/json"];
export type SNSaveAccountResult =
  paths["/v1/{account_id}/sales-navigator/account-lists/{list_id}/save"]["post"]["responses"]["200"]["content"]["application/json"];
/** Caller-facing input for `saveAccount()`, `list_id` addresses the path, `company_id` is the body. */
export type SNSaveAccountInput = SNSaveAccountBody & { list_id: string };

export type SNSaveLeadBody =
  paths["/v1/{account_id}/sales-navigator/lead-lists/{list_id}/save"]["post"]["requestBody"]["content"]["application/json"];
export type SNSaveLeadResult =
  paths["/v1/{account_id}/sales-navigator/lead-lists/{list_id}/save"]["post"]["responses"]["200"]["content"]["application/json"];
/** Caller-facing input for `saveLead()`, `list_id` addresses the path, `user_id` is the body. */
export type SNSaveLeadInput = SNSaveLeadBody & { list_id: string };

export type SNSearchFromUrlBody =
  paths["/v1/{account_id}/sales-navigator/search"]["post"]["requestBody"]["content"]["application/json"];
export type SNSearchFromUrlQuery = NonNullable<
  paths["/v1/{account_id}/sales-navigator/search"]["post"]["parameters"]["query"]
>;
export type SNSearchFromUrlResult =
  paths["/v1/{account_id}/sales-navigator/search"]["post"]["responses"]["200"]["content"]["application/json"];

// ─── Resource class ───────────────────────────────────────────────────────────

export class SalesNavigatorResource {
  constructor(protected readonly ctx: RequestContext) {}

  /**
   * Search LinkedIn members using the full Sales Navigator filter set.
   * `POST /v1/{account_id}/sales-navigator/search/people`
   * Requires tier `sn`. Returns `TIER_NOT_ACTIVE` (403) when the seat lacks it.
   */
  searchPeople(body: SNSearchPeopleBody, query?: Partial<SNSearchPeopleQuery>): Promise<SNSearchPeopleResult> {
    return this.ctx.request<SNSearchPeopleResult>({
      method: "POST",
      path: "/v1/{account_id}/sales-navigator/search/people",
      body,
      ...(query ? { query: query as Record<string, string | number | boolean | string[] | undefined | null> } : {}),
    });
  }

  /**
   * Search LinkedIn companies using the full Sales Navigator company filter set.
   * `POST /v1/{account_id}/sales-navigator/search/companies`
   */
  searchCompanies(
    body: SNSearchCompaniesBody,
    query?: Partial<SNSearchCompaniesQuery>,
  ): Promise<SNSearchCompaniesResult> {
    return this.ctx.request<SNSearchCompaniesResult>({
      method: "POST",
      path: "/v1/{account_id}/sales-navigator/search/companies",
      body,
      ...(query ? { query: query as Record<string, string | number | boolean | string[] | undefined | null> } : {}),
    });
  }

  /**
   * Resolve human-readable terms to opaque Sales Navigator filter IDs.
   * `GET /v1/{account_id}/sales-navigator/search/parameters`
   */
  getParameters(query: SNGetParametersQuery): Promise<SNGetParametersResult> {
    return this.ctx.request<SNGetParametersResult>({
      method: "GET",
      path: "/v1/{account_id}/sales-navigator/search/parameters",
      query: query as Record<string, string | number | boolean | string[] | undefined | null>,
    });
  }

  /**
   * Start a new Sales Navigator chat. `attachments[]`, when supplied, carry
   * base64-encoded file bytes, always sent as JSON, never multipart.
   * `POST /v1/{account_id}/sales-navigator/chats`
   */
  startChat(body: SNStartChatBody): Promise<SNStartChatResult> {
    return this.ctx.request<SNStartChatResult>({
      method: "POST",
      path: "/v1/{account_id}/sales-navigator/chats",
      body,
    });
  }

  /**
   * Retrieve a LinkedIn profile with Sales Navigator enrichment.
   * `GET /v1/{account_id}/sales-navigator/profiles/{identifier}`
   */
  getProfile(identifier: string, query?: Partial<SNGetProfileQuery>): Promise<SNGetProfileResult> {
    return this.ctx.request<SNGetProfileResult>({
      method: "GET",
      path: apiPath`/v1/{account_id}/sales-navigator/profiles/${identifier}`,
      // cast needed: with_sections is string[] but transport encodes arrays as repeated params
      ...(query ? { query: query as Record<string, string | number | boolean | string[] | undefined | null> } : {}),
    });
  }

  /**
   * List the saved-account (company) lists on the operator's Sales Navigator seat.
   * `GET /v1/{account_id}/sales-navigator/account-lists`
   */
  accountLists(query?: Partial<SNAccountListsQuery>): Promise<SNAccountListsResult> {
    return this.ctx.request<SNAccountListsResult>({
      method: "GET",
      path: "/v1/{account_id}/sales-navigator/account-lists",
      ...(query ? { query: query as Record<string, string | number | boolean | string[] | undefined | null> } : {}),
    });
  }

  /**
   * List the saved-lead (member) lists on the operator's Sales Navigator seat.
   * `GET /v1/{account_id}/sales-navigator/lead-lists`
   */
  leadLists(query?: Partial<SNLeadListsQuery>): Promise<SNLeadListsResult> {
    return this.ctx.request<SNLeadListsResult>({
      method: "GET",
      path: "/v1/{account_id}/sales-navigator/lead-lists",
      ...(query ? { query: query as Record<string, string | number | boolean | string[] | undefined | null> } : {}),
    });
  }

  /**
   * Browse the saved accounts (companies) in one account list. Pass optional
   * `persona` / `filter` / `sort_by` / `sort_order` filters in the body.
   * `POST /v1/{account_id}/sales-navigator/account-lists/{list_id}`
   */
  browseAccountList(
    listId: string,
    body?: SNBrowseAccountListBody,
    query?: Partial<SNBrowseAccountListQuery>,
  ): Promise<SNBrowseAccountListResult> {
    return this.ctx.request<SNBrowseAccountListResult>({
      method: "POST",
      path: apiPath`/v1/{account_id}/sales-navigator/account-lists/${listId}`,
      body: body ?? {},
      ...(query ? { query: query as Record<string, string | number | boolean | string[] | undefined | null> } : {}),
    });
  }

  /**
   * Browse the saved leads (members) in one lead list. Pass optional
   * `spotlight` / `sort_by` / `sort_order` filters in the body.
   * `POST /v1/{account_id}/sales-navigator/lead-lists/{list_id}`
   */
  browseLeadList(
    listId: string,
    body?: SNBrowseLeadListBody,
    query?: Partial<SNBrowseLeadListQuery>,
  ): Promise<SNBrowseLeadListResult> {
    return this.ctx.request<SNBrowseLeadListResult>({
      method: "POST",
      path: apiPath`/v1/{account_id}/sales-navigator/lead-lists/${listId}`,
      body: body ?? {},
      ...(query ? { query: query as Record<string, string | number | boolean | string[] | undefined | null> } : {}),
    });
  }

  /**
   * Save a LinkedIn company into an account list. Body is just `{company_id}`;
   * `account_id` lives in the path, not the body.
   * `POST /v1/{account_id}/sales-navigator/account-lists/{list_id}/save`
   *
   * No `saved` boolean is invented; a `2xx` response body is the success
   * signal (the substrate returns no success flag).
   */
  saveAccount(input: SNSaveAccountInput): Promise<SNSaveAccountResult> {
    const { list_id, ...body } = input;
    return this.ctx.request<SNSaveAccountResult>({
      method: "POST",
      path: apiPath`/v1/{account_id}/sales-navigator/account-lists/${list_id}/save`,
      body,
    });
  }

  /**
   * Save a Sales Navigator member into a lead list. Body is just `{user_id}`;
   * `account_id` lives in the path, not the body.
   * `POST /v1/{account_id}/sales-navigator/lead-lists/{list_id}/save`
   */
  saveLead(input: SNSaveLeadInput): Promise<SNSaveLeadResult> {
    const { list_id, ...body } = input;
    return this.ctx.request<SNSaveLeadResult>({
      method: "POST",
      path: apiPath`/v1/{account_id}/sales-navigator/lead-lists/${list_id}/save`,
      body,
    });
  }

  /**
   * Run a pasted Sales Navigator search/list URL directly.
   * `POST /v1/{account_id}/sales-navigator/search`
   * `url` is the only accepted body field. Response items are polymorphic,
   * each discriminated individually by its own `object`.
   */
  searchFromUrl(body: SNSearchFromUrlBody, query?: Partial<SNSearchFromUrlQuery>): Promise<SNSearchFromUrlResult> {
    return this.ctx.request<SNSearchFromUrlResult>({
      method: "POST",
      path: "/v1/{account_id}/sales-navigator/search",
      body,
      ...(query ? { query: query as Record<string, string | number | boolean | string[] | undefined | null> } : {}),
    });
  }
}
