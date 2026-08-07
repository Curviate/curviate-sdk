/**
 * Profile insights resource: 4 methods (NEW namespace).
 *
 * Account-scoped: the bound context injects `account_id` as the leading
 * `/v1/` path segment on every request (account-first grammar), never a
 * query param or body field.
 *
 * Every method is a self-read of the connected account's own insight
 * surface: its premium subscription, performance analytics, recent profile
 * viewers, and Social Selling Index. These reads target the authenticated
 * account only, never a third party, so they notify no one and affect no
 * reputation. Three return one typed scalar object; `visitors` is a
 * cursor-paginated list.
 *
 * The namespace name `profile` (singular) is distinct from the retired
 * `profiles` (plural, renamed to `users`); it mirrors the `/profile/*`
 * path segment 1:1.
 */
import type { RequestContext } from "../internal/context.js";
import type { paths } from "../generated/types.js";

// ─── Type aliases from generated OpenAPI snapshot ──────────────────────────

export type SubscriptionProfile =
  paths["/v1/{account_id}/profile/subscription"]["get"]["responses"]["200"]["content"]["application/json"];

export type ProfileAnalytics =
  paths["/v1/{account_id}/profile/analytics"]["get"]["responses"]["200"]["content"]["application/json"];

export type ProfileVisitorListPage =
  paths["/v1/{account_id}/profile/visitors"]["get"]["responses"]["200"]["content"]["application/json"];
export type ProfileVisitorListQuery = NonNullable<
  paths["/v1/{account_id}/profile/visitors"]["get"]["parameters"]["query"]
>;

export type ProfileSsi =
  paths["/v1/{account_id}/profile/ssi"]["get"]["responses"]["200"]["content"]["application/json"];

// ─── Resource class ───────────────────────────────────────────────────────────

export class ProfileResource {
  constructor(protected readonly ctx: RequestContext) {}

  /**
   * Read the connected account's premium subscription: its full entitlement
   * inventory, primary plan title, and LinkedIn management links.
   * `GET /v1/{account_id}/profile/subscription`
   *
   * A free account is a valid, non-error result: `has_premium` is `false`,
   * `plan_title` is `null`, and `subscriptions` is empty. Read
   * `subscriptions` for the complete set of active plans; the flat fields
   * mirror the primary plan only.
   */
  subscription(): Promise<SubscriptionProfile> {
    return this.ctx.request<SubscriptionProfile>({
      method: "GET",
      path: `/v1/{account_id}/profile/subscription`,
    });
  }

  /**
   * Read the connected account's performance headline metrics, profile
   * viewers, followers, post impressions, and search appearances.
   * `GET /v1/{account_id}/profile/analytics`
   *
   * Each metric is a headline scalar over a fixed reporting window set by
   * LinkedIn (viewers 90d, impressions 7d, search last completed week,
   * followers running total); there is no window selector. A `count` of `0`
   * is a real zero; a per-metric `null` means that one card was unavailable.
   */
  analytics(): Promise<ProfileAnalytics> {
    return this.ctx.request<ProfileAnalytics>({
      method: "GET",
      path: `/v1/{account_id}/profile/analytics`,
    });
  }

  /**
   * List the people who recently viewed the connected account's profile,
   * cursor-paginated and classified by disclosure fidelity.
   * `GET /v1/{account_id}/profile/visitors`
   *
   * Each item's `kind` is `identified`, `semi-anonymous`, or `aggregate`,
   * a Premium account sees identified viewers, a free account is capped at a
   * lower fidelity (still a `200`, never a permission error). Page with the
   * returned `cursor`: a non-null `cursor` means more may exist, even if a
   * page held zero identified individuals; `cursor: null` means exhausted.
   *
   * @param params - `limit` (1-100, default 20) and an opaque `cursor` from
   *   a prior response.
   */
  visitors(params?: ProfileVisitorListQuery): Promise<ProfileVisitorListPage> {
    return this.ctx.request<ProfileVisitorListPage>({
      method: "GET",
      path: `/v1/{account_id}/profile/visitors`,
      ...(params ? { query: params as Record<string, string | number | boolean | string[] | undefined | null> } : {}),
    });
  }

  /**
   * Read the connected account's Social Selling Index, the overall score,
   * its four pillar breakdowns, and industry/network percentile ranks.
   * `GET /v1/{account_id}/profile/ssi`
   *
   * A low score on a low-activity account is a normal `200`; a genuine
   * zero-activity account returns all scalars `null` with `active_seat`
   * `false`. Scores preserve full float precision.
   */
  ssi(): Promise<ProfileSsi> {
    return this.ctx.request<ProfileSsi>({
      method: "GET",
      path: `/v1/{account_id}/profile/ssi`,
    });
  }
}
