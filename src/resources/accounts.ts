/**
 * Accounts resource: connected-account management (4 methods, root-scoped).
 *
 * Pattern followed by all resource namespaces:
 *   - take a {@link RequestContext} in the constructor,
 *   - map each method to exactly one `/v1/*` operation,
 *   - type request/response from the generated OpenAPI types,
 *   - never re-declare a response interface by hand.
 *
 * The 5 connect/checkpoint ops (`link`, `solveCheckpoint`, `requestCheckpoint`,
 * `pollCheckpoint`, `getConnectSession`) moved to the root-scoped `auth`
 * namespace ({@link ../auth.js}), connecting/re-authenticating an account is
 * conceptually distinct from managing one already connected. The hosted-link
 * flow (`createConnectLink`, `createReconnectLink`) and in-place `reconnect`
 * have no served equivalent and are removed; a client authenticates via
 * `auth.intent` (optionally passing `account_id` to re-authenticate an
 * existing account in place).
 */
import type { RequestContext } from "../internal/context.js";
import type { paths } from "../generated/types.js";

/** `GET /v1/accounts` 200 body, a page of connected accounts plus a cursor. */
export type AccountListPage =
  paths["/v1/accounts"]["get"]["responses"]["200"]["content"]["application/json"];

/** `GET /v1/accounts` query params. */
export type AccountListParams = NonNullable<
  paths["/v1/accounts"]["get"]["parameters"]["query"]
>;

/** `GET /v1/accounts/{account_id}` 200 body. */
export type AccountDetail =
  paths["/v1/accounts/{account_id}"]["get"]["responses"]["200"]["content"]["application/json"];

/** `PATCH /v1/accounts/{account_id}` request body. */
export type AccountUpdateBody =
  paths["/v1/accounts/{account_id}"]["patch"]["requestBody"]["content"]["application/json"];

/** `PATCH /v1/accounts/{account_id}` 200 body. */
export type AccountUpdateResult =
  paths["/v1/accounts/{account_id}"]["patch"]["responses"]["200"]["content"]["application/json"];

/** `DELETE /v1/accounts/{account_id}` 200 body. */
export type AccountDisconnectResult =
  paths["/v1/accounts/{account_id}"]["delete"]["responses"]["200"]["content"]["application/json"];

export class AccountsResource {
  constructor(private readonly ctx: RequestContext) {}

  /**
   * List the tenant's connected LinkedIn accounts, cursor-paginated.
   *
   * Each item also carries a small set of cached account-detail fields
   * (`username`, `premium_id`, `public_identifier`, `substrate_created_at`,
   * `signatures`, `groups`) populated by an async background enrichment,
   * `null`/`[]` until the account's first enrichment pass completes.
   *
   * @param params - optional `limit` (1-250) and `cursor` (from a prior page).
   * @returns a page of accounts and the next-page `cursor` (null when exhausted).
   *
   * @example
   * const page = await curviate.accounts.list({ limit: 50 });
   * for (const acc of page.items ?? []) console.log(acc.account_id);
   */
  list(params?: AccountListParams): Promise<AccountListPage> {
    return this.ctx.request<AccountListPage>({
      method: "GET",
      path: "/v1/accounts",
      ...(params !== undefined ? { query: params } : {}),
    });
  }

  /**
   * Return metadata and current state for one connected account, including the
   * central `quotas[]` view for all tracked quota families and `seat_id` (the
   * seat this account occupies, `null` for an admin seatless account).
   *
   * This is a stale-while-revalidate read; it always returns immediately
   * from the cached row (never blocks on a live substrate call). The cached
   * enrichment fields `full_name` and `substrate_created_at` are populated by
   * a background enrichment pass; `username`, `premium_id`,
   * `public_identifier`, `signatures`, and `groups` are not sourced on the
   * current connection surface and read `null`/`[]`.
   */
  get(accountId: string): Promise<AccountDetail> {
    return this.ctx.request<AccountDetail>({
      method: "GET",
      path: `/v1/accounts/${accountId}`,
    });
  }

  /**
   * Update an account's configuration.
   *
   * `metadata` is a flat string->string map that **replaces** the account's
   * custom-data store wholesale (keys not provided are removed). `proxy` sets a
   * custom egress proxy, or clears it (reverting to automatic proxy protection)
   * when passed as `null`. The `proxy.password`, if given, is stored securely
   * and never returned.
   */
  update(accountId: string, body: AccountUpdateBody): Promise<AccountUpdateResult> {
    return this.ctx.request<AccountUpdateResult>({
      method: "PATCH",
      path: `/v1/accounts/${accountId}`,
      body,
    });
  }

  /**
   * Hard-disconnect a LinkedIn account; releases the attached seat.
   */
  disconnect(accountId: string): Promise<AccountDisconnectResult> {
    return this.ctx.request<AccountDisconnectResult>({
      method: "DELETE",
      path: `/v1/accounts/${accountId}`,
    });
  }
}
