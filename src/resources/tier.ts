/**
 * Tier resource: 1 method (root-scoped), `curviate.tier`: whether the Team
 * holds the plan.
 *
 * Drafts, Leads, Campaigns, Network and Unibox need a subscription. A write in one of those groups on a Team
 * without one is refused with `TIER_REQUIRED` (see {@link CurviateError}'s
 * `feature`, `requiredTier`, `currentTier`, `upgradeUrl`); reads, exports,
 * deletes and stopping running work pass without one. Read it before a call
 * to branch on it instead of waiting for the refusal.
 */
import type { RequestContext } from "../internal/context.js";
import type { paths } from "../generated/types.js";

export type TierResult = paths["/v1/billing/tier"]["get"]["responses"]["200"]["content"]["application/json"];
/** The plan's code on the wire (`"automate"`, or `"build"` for a previous price). */
export type TierName = NonNullable<TierResult["tier"]>;
/** A feature the plan includes. */
export type TierFeature = TierResult["features"][number];

export class TierResource {
  constructor(private readonly ctx: RequestContext) {}

  /**
   * Whether your Team holds the plan now and where it comes from: its
   * subscription, the free trial while it runs, or a grant from Curviate, plus
   * the `features` it has. `tier` is `"automate"` while the Team holds the
   * plan and `null` when it does not.
   * Any member can read it. It reports no prices.
   * `GET /v1/billing/tier`
   *
   * A Team's first call starts its free trial when one is due.
   *
   * @example
   * const { tier, features } = await curviate.tier.get();
   * if (!features.includes("campaigns")) console.log(`Campaigns need a subscription${tier ? "" : "; your Team has none"}.`);
   */
  get(): Promise<TierResult> {
    return this.ctx.request<TierResult>({ method: "GET", path: "/v1/billing/tier" });
  }
}
