/**
 * Tier resource: 1 method (root-scoped), `curviate.tier`.
 *
 * A Team's Tier decides which features it has: Drafts, Contacts, Motions,
 * Network and Unibox need Automate. A write in one of those groups on a Team
 * below the Tier is refused with `TIER_REQUIRED` (see {@link CurviateError}'s
 * `feature`, `requiredTier`, `currentTier`, `upgradeUrl`); reads, exports,
 * deletes and stopping running work pass on any Tier. Read the Tier before a
 * call to branch on it instead of waiting for the refusal.
 */
import type { RequestContext } from "../internal/context.js";
import type { paths } from "../generated/types.js";

export type TierResult = paths["/v1/billing/tier"]["get"]["responses"]["200"]["content"]["application/json"];
/** A Tier's name. */
export type TierName = NonNullable<TierResult["tier"]>;
/** A feature a Tier can include. */
export type TierFeature = TierResult["features"][number];

export class TierResource {
  constructor(private readonly ctx: RequestContext) {}

  /**
   * The Tier your Team has now and where it comes from: the Tier it bought,
   * the free trial while it runs, or a Tier Curviate granted, plus the
   * `features` that include. `tier` is `null` when the Team has none.
   * Any member can read it. It reports no prices.
   * `GET /v1/billing/tier`
   *
   * A Team's first call starts its free trial when one is due.
   *
   * @example
   * const { tier, features } = await curviate.tier.get();
   * if (!features.includes("motions")) console.log(`Motions need Automate; you are on ${tier ?? "no Tier"}.`);
   */
  get(): Promise<TierResult> {
    return this.ctx.request<TierResult>({ method: "GET", path: "/v1/billing/tier" });
  }
}
