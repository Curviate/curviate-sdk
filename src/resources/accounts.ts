/**
 * Accounts resource: connected-account and seat management (13 methods, root-scoped).
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
import { commaLists, type WithLists } from "../internal/query.js";

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

/** `POST /v1/billing/seats/add` request body. */
/** `PUT /v1/accounts/{account_id}/team-access` 200 body. */
export type AccountTeamAccessResult =
  paths["/v1/accounts/{account_id}/team-access"]["put"]["responses"]["200"]["content"]["application/json"];

export type SeatAddBody =
  paths["/v1/billing/seats/add"]["post"]["requestBody"]["content"]["application/json"];

/** `POST /v1/billing/seats/add` 200 body: the new `seat_ids` and what was charged today. */
export type SeatAddResult =
  paths["/v1/billing/seats/add"]["post"]["responses"]["200"]["content"]["application/json"];

/** `POST /v1/billing/seats/{seat_id}/cancel` 200 body. */
export type SeatCancelResult =
  paths["/v1/billing/seats/{seat_id}/cancel"]["post"]["responses"]["200"]["content"]["application/json"];

/** `POST /v1/billing/seats/{seat_id}/cancel/revert` 200 body. */
export type SeatCancelRevertResult =
  paths["/v1/billing/seats/{seat_id}/cancel/revert"]["post"]["responses"]["200"]["content"]["application/json"];

/** `GET /v1/accounts/{account_id}/metrics` query: `from`, `to`, `timezone`. */
export type AccountMetricsParams = NonNullable<
  paths["/v1/accounts/{account_id}/metrics"]["get"]["parameters"]["query"]
>;

/** `GET /v1/accounts/{account_id}/metrics` 200 body: one snapshot per day, oldest first. */
export type AccountMetricList =
  paths["/v1/accounts/{account_id}/metrics"]["get"]["responses"]["200"]["content"]["application/json"];

/** `GET /v1/{account_id}/safety-policy` 200 body: every configurable field per budget row, plus the derived `warm_up` and `activity_window`. */
export type SafetyPolicy =
  paths["/v1/{account_id}/safety-policy"]["get"]["responses"]["200"]["content"]["application/json"];

/** `PATCH /v1/{account_id}/safety-policy` request body: only the fields you are changing. */
export type SafetyPolicyUpdateBody =
  paths["/v1/{account_id}/safety-policy"]["patch"]["requestBody"]["content"]["application/json"];

/** `PATCH /v1/{account_id}/safety-policy` 200 body: the policy after the write. */
export type SafetyPolicyUpdateResult =
  paths["/v1/{account_id}/safety-policy"]["patch"]["responses"]["200"]["content"]["application/json"];

/** `GET /v1/accounts/{account_id}/overview` query. `motion_id`, `origin`, `include`, `fields` and `sort` take a comma list or an array. */
export type AccountOverviewParams = WithLists<
  NonNullable<paths["/v1/accounts/{account_id}/overview"]["get"]["parameters"]["query"]>,
  "motion_id" | "origin" | "include" | "fields" | "sort"
>;

/** `GET /v1/accounts/{account_id}/overview` 200 body. */
export type AccountOverview =
  paths["/v1/accounts/{account_id}/overview"]["get"]["responses"]["200"]["content"]["application/json"];

export class AccountsResource {
  constructor(private readonly ctx: RequestContext) {}

  /**
   * List the tenant's connected LinkedIn accounts, cursor-paginated. An
   * account disconnected when its free trial ended stays listed (`status_reason:
   * "trial_ended"`); one you disconnected does not.
   *
   * Each item carries enough to render an account row without a second call:
   * its profile (`full_name`, `headline`, `photo_url`, `profile_url`,
   * `public_identifier`, `location`; LinkedIn photo URLs expire), `status` and
   * `status_reason` (why it is disconnected or needs a reconnect: `trial_ended`
   * or `proxy`), `warm_up` (the active ramp), `inmail_balance` (the credits
   * LinkedIn last reported and when, `null` until observed), `motions_count`
   * with the first 20 Motions in `motion_refs`, and `quotas`: three of the
   * account's safety rows (`connection_requests_no_note`,
   * `messages_first_degree`, `inmail`) with `remaining`, absent on an account
   * you can see but not operate. `get` carries every row. Reading the list
   * never calls LinkedIn.
   *
   * Each item also carries `external_id` (your own id for the account's end
   * user, set on `auth.intent` or `update`) and `metadata`, both `null` when
   * unset.
   *
   * @param params - optional `limit` (1-250), `cursor` (from a prior page), and
   *   `external_id` (exact match: only that end user's accounts).
   * @returns a page of accounts and the next-page `cursor` (null when exhausted).
   *
   * @example
   * const page = await curviate.accounts.list({ limit: 50 });
   * for (const acc of page.items ?? []) console.log(acc.account_id);
   *
   * @example
   * const { items } = await curviate.accounts.list({ external_id: "usr_42" });
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
   * await curviate.auth.intent({ seat_id: free.seat_id, auth_method: "cookie", cookie: { li_at }, user_agent, country: "US" });
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
   * `over_default`, `halt` and the window fields. **Compare `used` against
   * `effective_ceiling`, not `ceiling`**: the effective one is the ceiling
   * with the account's warm-up ramp applied, and on a new account the two
   * differ by roughly a factor of seven. Limits are always enforced: at the
   * effective ceiling the action is refused with `BUDGET_EXHAUSTED`; to send
   * more, raise the limit. Two rows are not counters and say so in `kind`:
   * `total_actions` (`tally`) and `pending_invites` (`gauge`, whose `used` is
   * `null` until something has observed it).
   *
   * The per-minute REQUEST ceiling is a different thing and is deliberately
   * NOT in this array: it protects Curviate's own servers rather than the
   * LinkedIn account, and it is answered with `429 RATE_LIMIT_ACCOUNT`.
   *
   * `activity_window` says which time zone the account's active hours are
   * read in. Nobody sets it: it follows where the account connects from.
   * `effective_timezone` is that IANA zone, or `null` while it is unknown;
   * `source` says where it came from (`country`, `region`, `detected` or
   * `none`); `zone_state` is `known`, `pinned` (a check agreed on one zone,
   * kept until the next location change) or `unknown`, when the account acts
   * only in the hours every zone in `fallback_timezones` shares (an empty list
   * means the window is closed). A live write outside the window is refused
   * with `BUDGET_EXHAUSTED` (`safetyReason: "activity_window"`); reads are
   * never affected.
   *
   * `warm_up` is the account's ramp: `enabled` (the switch, default `true`;
   * set it with `PATCH /v1/{account_id}/safety-policy` and
   * `warm_up: { enabled }`), `dormant` (no action for more than 30 days),
   * `state` and the `triggers` that apply now (`connect`, `dormant`,
   * `post_restriction`). Off skips the connect and quiet ramps; recovery after
   * a LinkedIn restriction still applies.
   *
   * `connection_location` carries `checked_at` (the last location check, or
   * `null`), `detected_country` (where your own proxy was found to connect
   * from, or `null`) and `flags` (`country_mismatch`, `zone_moved`). It never
   * carries an IP.
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
   * `external_id` is your own id for the account's end user (1-255 chars, not
   * unique, `null` clears it); treat it as an opaque id, not an email.
   * `metadata` is a flat string->string map (at most 16 keys, key 40 chars,
   * value 500) that **replaces** the stored map wholesale; `null` clears it.
   * Both are stored by Curviate, read back on `get`/`list`, and a PATCH
   * carrying only them makes no LinkedIn call.
   *
   * `country` moves the account's connection location to that supported ISO
   * country. LinkedIn sees a new IP there and may ask the owner to verify, so
   * change it only when the current location is wrong. Strict unless
   * `allow_country_fallback: true`; `allow_country_fallback` alone changes the
   * strictness of the configured country. `proxy` sets your own proxy; `null`
   * returns to a managed location and **requires** a `country` in the same
   * call (else `CONNECTION_LOCATION_REQUIRED`), and an account on your own
   * proxy can only take a `country` together with `proxy: null`. The
   * `proxy.password`, if given, is never returned.
   *
   * `save_connections_as_contacts` (Automate; on by default) saves the
   * account's Connections as Contacts: each person becomes one Contact in your
   * team, an existing Contact is only filled in, do-not-contact people are
   * skipped. `true` also saves the Connections already synced; `false` keeps
   * the Contacts saved so far. Without Automate it throws `TIER_REQUIRED`, and
   * `get` omits the field. `save_connections_paused_reason` reads
   * `"contact_limit_reached"` while your team holds its 100,000 Contacts.
   *
   * Returns the account (as `get` returns it, without `quotas` and
   * `event_log`). After a location change its `connection_location` is re-read,
   * so it shows where the account really connects from now. A change that did
   * not land where asked throws `CONNECTION_LOCATION_UNAVAILABLE`, whose
   * `connectionLocation` carries the actual location. The account's time zone
   * follows its connection location: there is no zone to set.
   *
   * @example
   * await curviate.accounts.update("acc_123", { external_id: "usr_42", metadata: { plan: "pro" } });
   *
   * @example
   * const account = await curviate.accounts.update("acc_123", { country: "DE" });
   * console.log(account.connection_location?.country); // "DE"
   *
   * @example
   * await curviate.accounts.update("acc_123", { save_connections_as_contacts: false });
   */
  update(accountId: string, body: AccountUpdateBody): Promise<AccountUpdateResult> {
    return this.ctx.request<AccountUpdateResult>({
      method: "PATCH",
      path: apiPath`/v1/accounts/${accountId}`,
      body,
    });
  }

  /**
   * Turn team access on or off for an account you connected. `false` opts it
   * out: nobody else in the team can operate it (`ACCOUNT_NOT_SHARED`), it
   * leaves every Motion that held it, and its queued enrichment visits are
   * dropped. `true` shares it again (it does not rejoin a Motion). Only the
   * person who connected the account can do this (`ACCOUNT_OWNER_ONLY`).
   * `PUT /v1/accounts/{account_id}/team-access`
   *
   * @example
   * await curviate.accounts.setTeamAccess("acc_123", false);
   */
  setTeamAccess(accountId: string, teamAccess: boolean): Promise<AccountTeamAccessResult> {
    return this.ctx.request<AccountTeamAccessResult>({
      method: "PUT",
      path: apiPath`/v1/accounts/${accountId}/team-access`,
      body: { team_access: teamAccess },
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

  /**
   * Buy seats on the workspace's active subscription. Returns the new
   * `seat_ids`; connect an account into one with `auth.intent({ seat_id, country, ... })`.
   *
   * Every call buys the `qty` it asks for, so a repeated call buys again.
   * The SDK never retries it for you. A
   * `CurviateError(code: "SUBSCRIPTION_BUSY")` (503) means the purchase could
   * not be confirmed while another change was in progress: check the seat
   * count with `listSeats()` before trying again. A trialing workspace
   * throws `CurviateError(code: "TRIAL_ACTIVE_SEAT_LIMIT")`: buy a seat to
   * convert first.
   *
   * @param body - `{ qty }`, 1-50.
   *
   * @example
   * const { seat_ids } = await curviate.accounts.addSeats({ qty: 1 });
   */
  addSeats(body: SeatAddBody): Promise<SeatAddResult> {
    return this.ctx.request<SeatAddResult>({ method: "POST", path: "/v1/billing/seats/add", body });
  }

  /**
   * Schedule a seat's cancellation at the end of the current period.
   * `effective_at` is when access ends; until then the seat keeps working
   * and `revertSeatCancellation()` can undo it. Repeating the call on an
   * already-scheduled seat returns the same `effective_at`; a seat whose
   * cancellation already took effect throws
   * `CurviateError(code: "ALREADY_CANCELLED")`.
   *
   * @param seatId - a `seat_...` id from `listSeats()`.
   *
   * @example
   * const { effective_at } = await curviate.accounts.cancelSeat("seat_123");
   */
  cancelSeat(seatId: string): Promise<SeatCancelResult> {
    return this.ctx.request<SeatCancelResult>({
      method: "POST",
      path: apiPath`/v1/billing/seats/${seatId}/cancel`,
    });
  }

  /**
   * Undo a scheduled seat cancellation before it takes effect. A seat with
   * nothing scheduled (never cancelled, already reverted, or already
   * effective) throws `CurviateError(code: "CANCELLATION_ALREADY_EFFECTIVE")`;
   * a seat covered by a whole-subscription cancellation throws
   * `CurviateError(code: "INVALID_CANCELLATION_SOURCE")`.
   *
   * @param seatId - the `seat_...` id passed to `cancelSeat()`.
   *
   * @example
   * await curviate.accounts.revertSeatCancellation("seat_123");
   */
  revertSeatCancellation(seatId: string): Promise<SeatCancelRevertResult> {
    return this.ctx.request<SeatCancelRevertResult>({
      method: "POST",
      path: apiPath`/v1/billing/seats/${seatId}/cancel/revert`,
    });
  }

  /**
   * The account's own numbers, one snapshot per day, oldest first: 1st-degree
   * `connections`, `followers`, `profile_viewers_90d`,
   * `search_appearances_week`, `post_impressions_7d`, and `ssi` (Sales
   * Navigator accounts only, else `null`). Read once a day inside the
   * account's activity window and stored: this makes no LinkedIn call. `from`
   * and `to` are the account's local days (default the last 90 days; at most
   * 366 days across); a day with no snapshot has no item. One response holds
   * the whole range (`cursor` is always `null`).
   * `GET /v1/accounts/{account_id}/metrics`
   *
   * @example
   * const { items } = await curviate.accounts.metrics("acc_123", { from: "2026-08-01", to: "2026-10-28" });
   */
  metrics(accountId: string, params?: AccountMetricsParams): Promise<AccountMetricList> {
    return this.ctx.request<AccountMetricList>({
      method: "GET",
      path: apiPath`/v1/accounts/${accountId}/metrics`,
      ...(params !== undefined ? { query: params } : {}),
    });
  }

  /**
   * One account at a glance, with no LinkedIn call: `profile`, its daily
   * `metrics` snapshot (`null` before the first one, or when you may not
   * operate the account), `limits` (its three outreach rows now),
   * `activity` (its latest 10 actions and their outcomes, metadata only), and
   * its results in the window (`performance`, `daily`, its `motions`) as the
   * team overview reads them scoped to it. `profile`, `metrics`, `limits` and
   * `activity` do not follow the window. The window, `motion_id`, `origin`,
   * `include`, `fields`, `sort`, `limit` and `compare` work as on
   * `analytics.motions.list`; with none of `include` and `fields` the body is
   * trimmed to a summary. `flags` includes `account_attention` and
   * `limit_reached` for this account.
   * `GET /v1/accounts/{account_id}/overview`
   *
   * @example
   * const { performance, flags } = await curviate.accounts.overview("acc_123", { range: "30d" });
   */
  overview(accountId: string, params?: AccountOverviewParams): Promise<AccountOverview> {
    return this.ctx.request<AccountOverview>({
      method: "GET",
      path: apiPath`/v1/accounts/${accountId}/overview`,
      query: commaLists(params, "motion_id", "origin", "include", "fields", "sort"),
    });
  }

  /**
   * Read an account's safety policy: every configurable field for every
   * budget row, and where each value was inherited from. Also carries the
   * derived `warm_up` (`enabled`, `dormant`, `state`, `factor`, `triggers`)
   * and `activity_window` (the zone the hours are read in, from where the
   * account connects). Limits are always enforced.
   * `GET /v1/{account_id}/safety-policy`
   *
   * @example
   * const { warm_up } = await curviate.accounts.getSafetyPolicy("acc_123");
   */
  getSafetyPolicy(accountId: string): Promise<SafetyPolicy> {
    return this.ctx.request<SafetyPolicy>({
      method: "GET",
      path: apiPath`/v1/${accountId}/safety-policy`,
    });
  }

  /**
   * Update an account's safety policy. Send only the fields you are changing;
   * `null` clears an override back to the Team or Curviate default. Limits are
   * always enforced: to send more, raise the limit. Returns the policy as
   * `getSafetyPolicy` reads it.
   *
   * `warm_up: { enabled }` turns the account's warm-up ramp on or off (default
   * on; off skips the connect and quiet ramps, recovery after a LinkedIn
   * restriction still applies). `active_hours` sets the account's own days and
   * local hours; a row's own `activity_window_start` / `activity_window_end`
   * win over it. Read-only fields (`activity_window`, a row's
   * `effective_ceiling`, `over_default`, `warm_up_state` ...) are accepted and
   * ignored, so a read document can be sent back unchanged. A time zone is not
   * a setting: `timezone` and a row's `activity_window_timezone` other than
   * `null` are `400 INVALID_REQUEST`; change the account's `country` or own
   * `proxy` instead.
   * `PATCH /v1/{account_id}/safety-policy`
   *
   * @example
   * await curviate.accounts.updateSafetyPolicy("acc_123", { warm_up: { enabled: false } });
   */
  updateSafetyPolicy(accountId: string, body: SafetyPolicyUpdateBody): Promise<SafetyPolicyUpdateResult> {
    return this.ctx.request<SafetyPolicyUpdateResult>({
      method: "PATCH",
      path: apiPath`/v1/${accountId}/safety-policy`,
      body,
    });
  }
}
