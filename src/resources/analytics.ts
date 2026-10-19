/**
 * Analytics (root-scoped): `curviate.analytics` (1 method),
 * `curviate.analytics.motions` (2 methods) and `curviate.analytics.events`
 * (1 method).
 *
 * Read-only results from what Curviate recorded: no LinkedIn call, any Tier.
 * Windows take `from` and `to` (dates) and a `timezone` for the day buckets;
 * `account_id` narrows to one account. Rates are over cohorts at least 7 days
 * old and are never combined into a score.
 */
import type { RequestContext } from "../internal/context.js";
import type { paths } from "../generated/types.js";
import { apiPath } from "../internal/path.js";
import { commaLists } from "../internal/query.js";
import { pageable, type Pageable } from "../internal/paginate.js";

export type MotionAnalyticsParams = NonNullable<paths["/v1/analytics/motions"]["get"]["parameters"]["query"]>;
export type MotionAnalyticsOverview = paths["/v1/analytics/motions"]["get"]["responses"]["200"]["content"]["application/json"];
export type MotionAnalyticsDetailParams = NonNullable<paths["/v1/analytics/motions/{motion_id}"]["get"]["parameters"]["query"]>;
export type MotionAnalyticsDetail = paths["/v1/analytics/motions/{motion_id}"]["get"]["responses"]["200"]["content"]["application/json"];
export type ActivityParams = NonNullable<paths["/v1/analytics/activity"]["get"]["parameters"]["query"]>;
export type Activity = paths["/v1/analytics/activity"]["get"]["responses"]["200"]["content"]["application/json"];
export type AnalyticsEventListParams = NonNullable<paths["/v1/analytics/events"]["get"]["parameters"]["query"]>;
export type AnalyticsEventListPage = paths["/v1/analytics/events"]["get"]["responses"]["200"]["content"]["application/json"];
export type AnalyticsEvent = AnalyticsEventListPage["items"][number];
/** An account-safety budget row; each counts its own unit. */
export type BudgetRow = Activity["types"][number]["budget_row"];

/** `curviate.analytics.motions`: Motion results. */
export class AnalyticsMotionsResource {
  constructor(private readonly ctx: RequestContext) {}

  /**
   * Results of your Motions in total, per Motion and per account:
   * Enrollments by state, invitations, messages, replies, engagement and a
   * daily series.
   * `GET /v1/analytics/motions`
   *
   * @example
   * const { totals, motions } = await curviate.analytics.motions.list({ from: "2026-10-01", to: "2026-10-31" });
   */
  list(params?: MotionAnalyticsParams): Promise<MotionAnalyticsOverview> {
    return this.ctx.request<MotionAnalyticsOverview>({ method: "GET", path: "/v1/analytics/motions", query: params });
  }

  /**
   * One Motion's results with a row per step and per variant (document
   * order, never ranked); `version` picks a Sequence version.
   * `GET /v1/analytics/motions/{motion_id}`
   *
   * @example
   * const { steps } = await curviate.analytics.motions.get("mot_123");
   */
  get(motionId: string, params?: MotionAnalyticsDetailParams): Promise<MotionAnalyticsDetail> {
    return this.ctx.request<MotionAnalyticsDetail>({ method: "GET", path: apiPath`/v1/analytics/motions/${motionId}`, query: params });
  }
}

/** `curviate.analytics.events`: the Motion events feed. */
export class AnalyticsEventsResource {
  constructor(private readonly ctx: RequestContext) {}

  /**
   * Recent Motion events, newest first: steps executed, skipped or failed,
   * invitations accepted and replies. Filters: `account_id`, `motion_id`,
   * `kind` (several). Keyset paging: events recorded after your first page
   * never shift later pages. `await` it for one page; `for await` it for
   * every event across pages.
   * `GET /v1/analytics/events`
   *
   * @example
   * for await (const event of curviate.analytics.events.list({ kind: ["message.replied"] })) console.log(event.motion_name);
   */
  list(params?: AnalyticsEventListParams): Pageable<AnalyticsEventListPage> {
    return pageable(
      (p) => this.ctx.request<AnalyticsEventListPage>({ method: "GET", path: "/v1/analytics/events", query: commaLists(p, "kind") }),
      params,
    );
  }
}

export class AnalyticsResource {
  readonly motions: AnalyticsMotionsResource;
  readonly events: AnalyticsEventsResource;

  constructor(private readonly ctx: RequestContext) {
    this.motions = new AnalyticsMotionsResource(ctx);
    this.events = new AnalyticsEventsResource(ctx);
  }

  /**
   * Every budgeted LinkedIn call your accounts made, by budget row, account
   * and day: used, failed and refused, beside each account's current budget.
   * Each row counts its own unit; never add rows together.
   * `GET /v1/analytics/activity`
   *
   * @example
   * const { types } = await curviate.analytics.activity({ account_id: "acc_123" });
   */
  activity(params?: ActivityParams): Promise<Activity> {
    return this.ctx.request<Activity>({ method: "GET", path: "/v1/analytics/activity", query: params });
  }
}
