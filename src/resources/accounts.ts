/**
 * Accounts resource: connected-account management (5 methods, root-scoped).
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
import { apiPath } from "../internal/path.js";

/** `GET /v1/accounts` 200 body, a page of connected accounts plus a cursor. */
export type AccountListPage =
  paths["/v1/accounts"]["get"]["responses"]["200"]["content"]["application/json"];

/** `GET /v1/accounts` query params. */
export type AccountListParams = NonNullable<
  paths["/v1/accounts"]["get"]["parameters"]["query"]
>;

/** `GET /v1/accounts/seats` 200 body, the workspace's live seats with their occupancy. */
export type SeatList =
  paths["/v1/accounts/seats"]["get"]["responses"]["200"]["content"]["application/json"];

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
   * List the workspace's live seats: each `seat_id`, whether an account
   * `occupied` it, and that `account_id` (`null` when free). Not paginated.
   *
   * Only live seats are listed, and an empty seat is listed only when
   * connecting an account to it would be accepted right now. So an empty seat
   * that is provisional, cancelling, on an ended trial, or blocked by billing
   * does not appear, and `items` can be `[]` even though the workspace has
   * seats. Any seat with `occupied: false` is a valid `seat_id` for connecting
   * a new account with `auth.intent`. Carries no billing fields.
   *
   * @returns `{ object: "seat_list", items: { seat_id, occupied, account_id }[] }`.
   *
   * @example
   * const { items } = await curviate.accounts.listSeats();
   * const free = items.find((seat) => !seat.occupied);
   * if (!free) throw new Error("No seat is free to connect to right now (add a seat, or check billing).");
   * await curviate.auth.intent({ seat_id: free.seat_id, auth_method: "cookie", cookie: { li_at }, user_agent });
   */
  listSeats(): Promise<SeatList> {
    return this.ctx.request<SeatList>({ method: "GET", path: "/v1/accounts/seats" });
  }

  /**
   * Return metadata and current state for one connected account, including the
   * central `quotas[]` account-safety view, `account_states[]` and `seat_id`
   * (the seat this account occupies, `null` for an admin seatless account).
   *
   * `quotas[]` REPLACED its earlier `quota_name` / `remaining` / `total` /
   * `reset_time` / `recommended_throttle_hint` shape. Each row now reports
   * `budget_row`, `kind`, `used`, `ceiling`, `effective_ceiling`, `band`,
   * `posture`, `over_default`, `halt` and the window fields. **Compare `used`
   * against `effective_ceiling`, not `ceiling`**: the effective one is the
   * ceiling with the account's warm-up ramp applied, and on a new account the
   * two differ by roughly a factor of seven. `posture` says what happens at the
   * ceiling and defaults to `warn`, so nothing here refuses until it is
   * configured to. Two rows are not counters and say so in `kind`:
   * `total_actions` (`tally`) and `pending_invites` (`gauge`, whose `used` is
   * `null` until something has observed it).
   *
   * The per-minute REQUEST ceiling is a different thing and is deliberately
   * NOT in this array: it protects Curviate's own servers rather than the
   * LinkedIn account, and it is always enforced with `429` whatever the
   * posture.
   *
   * `account_states[]` lists platform conditions the account is in right now,
   * additive to `status` and independent of it: `recruiter_session_evicted`,
   * `commercial_use_limited`, `profile_view_limited`. The last two are read on
   * calls that SUCCEEDED, so check them before concluding thin results are
   * wrong. Empty for an unaffected account.
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
      path: apiPath`/v1/accounts/${accountId}`,
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
      path: apiPath`/v1/accounts/${accountId}`,
      body,
    });
  }

  /**
   * Hard-disconnect a LinkedIn account; releases the attached seat.
   */
  disconnect(accountId: string): Promise<AccountDisconnectResult> {
    return this.ctx.request<AccountDisconnectResult>({
      method: "DELETE",
      path: apiPath`/v1/accounts/${accountId}`,
    });
  }
}
