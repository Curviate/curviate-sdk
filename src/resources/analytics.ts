/**
 * Analytics (root-scoped): `curviate.analytics` (2 methods),
 * `curviate.analytics.campaigns` (2 methods) and `curviate.analytics.events`
 * (1 method).
 *
 * Read-only results from what Curviate recorded: no LinkedIn call, any Tier.
 * A window is `from` and `to` (dates, inclusive) or `range` (`7d`, `30d`,
 * `90d`, `12m`, `all`), read in `timezone` (default UTC), and `bucket` groups
 * the daily series (`auto`, `day`, `week`, `month`). `account_id`, `campaign_id`
 * and `origin` filter; each takes an array or a comma list. `origin` names who
 * sent an action: `campaign`, `unibox` (the Unibox) or `api` (any API key or MCP
 * grant: REST, CLI, MCP, SDK); `direct` stays valid as an alias for `unibox`
 * and `api`. `linkedin` (actions taken on LinkedIn itself) is never counted:
 * it is `400 INVALID_REQUEST`.
 *
 * Every rate is the outcome SO FAR over what was sent in the window, not over
 * old enough cohorts: it moves as replies and acceptances arrive. Read it
 * with `maturing` (sent under 7 days ago, still in the rate) and `low_sample`
 * (fewer than 30), and never combine rates into a score. Messages and InMails
 * are counted apart (`messages`/`reply` and `inmails`/`inmail_reply`).
 * Enrollments are counted by their current state (`queued`, `active`,
 * `paused`, `finished`, `failed`, `skipped`), which the window does not
 * change.
 */
import type { RequestContext } from "../internal/context.js";
import type { paths } from "../generated/types.js";
import { apiPath } from "../internal/path.js";
import { commaLists, type WithLists } from "../internal/query.js";
import { pageable, type Pageable } from "../internal/paginate.js";

/** `account_id`, `campaign_id`, `origin`, `include`, `fields` and `sort` take a comma list or an array. */
export type CampaignAnalyticsParams = WithLists<NonNullable<paths["/v1/analytics/campaigns"]["get"]["parameters"]["query"]>, "account_id" | "campaign_id" | "origin" | "include" | "fields" | "sort">;
export type CampaignAnalyticsOverview = paths["/v1/analytics/campaigns"]["get"]["responses"]["200"]["content"]["application/json"];
export type CampaignAnalyticsDetailParams = WithLists<NonNullable<paths["/v1/analytics/campaigns/{campaign_id}"]["get"]["parameters"]["query"]>, "account_id" | "origin" | "include" | "fields" | "sort">;
export type CampaignAnalyticsDetail = paths["/v1/analytics/campaigns/{campaign_id}"]["get"]["responses"]["200"]["content"]["application/json"];
export type ActivityParams = WithLists<NonNullable<paths["/v1/analytics/activity"]["get"]["parameters"]["query"]>, "account_id">;
export type Activity = paths["/v1/analytics/activity"]["get"]["responses"]["200"]["content"]["application/json"];
/** `table`, `account_id`, `campaign_id` and `origin` take a comma list or an array. */
export type AnalyticsExportParams = WithLists<NonNullable<paths["/v1/analytics/export"]["get"]["parameters"]["query"]>, "account_id" | "campaign_id" | "origin" | "table">;
/** `origin` takes a comma list or an array. */
export type AnalyticsEventListParams = WithLists<NonNullable<paths["/v1/analytics/events"]["get"]["parameters"]["query"]>, "origin">;
export type AnalyticsEventListPage = paths["/v1/analytics/events"]["get"]["responses"]["200"]["content"]["application/json"];
export type AnalyticsEvent = AnalyticsEventListPage["items"][number];
/** An account-safety budget row; each counts its own unit. */
export type BudgetRow = Activity["types"][number]["budget_row"];

/** `curviate.analytics.campaigns`: Campaign results. */
export class AnalyticsCampaignsResource {
  constructor(private readonly ctx: RequestContext) {}

  /**
   * Results of your Campaigns and direct actions (API, CLI, MCP, Unibox) in
   * total, per Campaign and per account: Enrollments by state right now (the
   * window does not apply), invitations and acceptance, messages and reply,
   * InMails and InMail reply (never mixed with messages), replies, engagement,
   * a daily series. Each Lead counts once per Account and source. Rates are
   * outcomes so far (`maturing` is the part sent under 7 days ago;
   * `low_sample` under 30); `compare: "previous_period"` adds `previous` and
   * `delta` to every rate. `origin` filters by source: `campaign`, `unibox`,
   * `api`, or `direct` (unibox and api).
   *
   * Grammar: `include` picks sections (`performance`, `daily`, `campaigns`,
   * `accounts`, `flags`), `fields` keeps dotted paths (`campaigns.reply.rate`),
   * `sort` and `limit` order and cut the Campaign and account lists (`-key`
   * is descending), and `flags` says what to read next. Give any of these
   * without `include` and the body is the summary: `performance`, the top 5
   * by sent, `flags`. Give none and you still get the full body, with a
   * `Deprecation` header: it becomes the summary later.
   *
   * Forecast: `include: "forecast"` (never in the summary) adds `forecast`,
   * what your Campaigns are expected to send and get per day (`invites_sent`,
   * `accepted`, `messages_sent`, `replies` with InMail replies included,
   * `inmails_sent`, `inmail_replies`) from today through `forecast_days`
   * (1-365, default 30) or the last day with activity (`through`). A
   * simulation of each Campaign's Sequence, limits, warm-up, schedule and
   * accounts with its observed rates: Campaigns only, the configuration frozen
   * as it is now (no new Enrollments, no edits). Cache it until `version`
   * changes. `status: "computing"`: an account of the scope has had no
   * simulation yet, so `daily` is today's zeros, not a forecast; read again in
   * a few minutes. `forecast_days` without the section is a `400`.
   *
   * Window: `from` and `to` reach back up to 3650 days (more is a `400` naming
   * `from`). Beyond 12 months you get daily counts only:
   * `window.counts_only_through` is the last day read from the daily counts
   * (`null` when the whole window has full detail), and
   * `window.paths_through` says `paths` covers only the days after it, so past
   * it `paths` does not add up to the totals.
   * `GET /v1/analytics/campaigns`
   *
   * @example
   * const { totals, campaigns } = await curviate.analytics.campaigns.list({ from: "2026-10-01", to: "2026-10-31" });
   *
   * @example
   * const summary = await curviate.analytics.campaigns.list({ range: "30d", compare: "previous_period", origin: ["campaign", "unibox"] });
   *
   * @example
   * const { forecast } = await curviate.analytics.campaigns.list({ include: "forecast", forecast_days: 14 });
   */
  list(params?: CampaignAnalyticsParams): Promise<CampaignAnalyticsOverview> {
    return this.ctx.request<CampaignAnalyticsOverview>({ method: "GET", path: "/v1/analytics/campaigns", query: commaLists(params, "account_id", "campaign_id", "origin", "include", "fields", "sort") });
  }

  /**
   * One Campaign's results with a row per step and per variant (document
   * order, never ranked); `version` picks a Sequence version. The window,
   * `origin`, `include`, `fields`, `sort`, `limit` and `compare` work as on
   * {@link AnalyticsCampaignsResource.list}; here the summary is `performance`,
   * `accounts` and `flags`, and `steps`, `variants` and `paths` come with
   * `include`. `paths` splits the Campaign by the Lead's relationship to the
   * account when the Enrollment started (provisional); it covers only the
   * days after `window.paths_through`. `include: "forecast"` adds this
   * Campaign's forecast; a draft reads as if turned on now with its picked
   * accounts (`forecast: null` with none).
   * `GET /v1/analytics/campaigns/{campaign_id}`
   *
   * @example
   * const { steps } = await curviate.analytics.campaigns.get("mot_123");
   */
  get(campaignId: string, params?: CampaignAnalyticsDetailParams): Promise<CampaignAnalyticsDetail> {
    return this.ctx.request<CampaignAnalyticsDetail>({ method: "GET", path: apiPath`/v1/analytics/campaigns/${campaignId}`, query: commaLists(params, "account_id", "origin", "include", "fields", "sort") });
  }
}

/** `curviate.analytics.events`: the Campaign events feed. */
export class AnalyticsEventsResource {
  constructor(private readonly ctx: RequestContext) {}

  /**
   * Recent Campaign events, newest first: steps executed, skipped or failed,
   * invitations accepted and replies, plus the direct actions (Unibox, API).
   * Filters: `account_id`, `campaign_id`, `lead_id`, `kind` and `origin`
   * (several). `origin` is `campaign`, `unibox`, `api` or `direct` (an alias
   * for `unibox` and `api`). `lead_id` (`con_...`) keeps one person's
   * events, their Enrollments' and the direct actions with them; an unknown
   * id, another team's, or one merged into another Lead throws
   * `RESOURCE_NOT_FOUND` (404). Keyset paging: events recorded after your first page
   * never shift later pages. `await` it for one page; `for await` it for
   * every event across pages. A direct action's `person_name` names the
   * person (they may not be a Lead); `null` for a Campaign event.
   * `GET /v1/analytics/events`
   *
   * @example
   * for await (const event of curviate.analytics.events.list({ kind: ["message.replied"] })) console.log(event.campaign_name);
   */
  list(params?: AnalyticsEventListParams): Pageable<AnalyticsEventListPage> {
    return pageable(
      (p) => this.ctx.request<AnalyticsEventListPage>({ method: "GET", path: "/v1/analytics/events", query: commaLists(p, "kind", "origin") }),
      params,
    );
  }
}

export class AnalyticsResource {
  readonly campaigns: AnalyticsCampaignsResource;
  readonly events: AnalyticsEventsResource;

  constructor(private readonly ctx: RequestContext) {
    this.campaigns = new AnalyticsCampaignsResource(ctx);
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
    return this.ctx.request<Activity>({ method: "GET", path: "/v1/analytics/activity", query: commaLists(params, "account_id") });
  }

  /**
   * The Analytics tables as one download, now, any size and no row limit,
   * never message text: `table` picks `daily`, `accounts`, `campaigns` and
   * `enrollments` (default all; several come as one ZIP), `format` is `csv`
   * (default; UTF-8 with a BOM, formula-guarded), `json` or `ndjson` (one
   * table only), under the overview's filters (window, `account_id`,
   * `campaign_id`, `origin`). Resolves with the file's bytes. Owners and
   * Managers. For a file to fetch later, `exports.create`.
   * `GET /v1/analytics/export`
   *
   * @example
   * const csv = await curviate.analytics.export({ table: "daily", range: "90d" });
   */
  async export(params?: AnalyticsExportParams): Promise<ArrayBuffer> {
    return this.ctx.request<ArrayBuffer>({ bytes: true, method: "GET", path: "/v1/analytics/export", query: commaLists(params, "account_id", "campaign_id", "origin", "table") });
  }
}
