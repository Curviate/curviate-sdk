/**
 * Signals (root-scoped): `curviate.signals` (5 methods) and
 * `curviate.signals.rules` (5 methods).
 *
 * A Signal is something a person did around one of your Accounts: reacted to
 * or commented on a post (`post_engaged`), reposted, posted in its network,
 * viewed its profile, followed it, mentioned it, or became a Connection. Only
 * Accounts whose Signal watch is on catch Signals (`watch()` says which), and
 * only Signals at most 7 days old are served. Every read here is Curviate's
 * own store: no LinkedIn call. A rule says what happens to the person when a
 * Signal of a kind arrives: add them to a Lead list, or send `signal.matched`
 * to your webhooks.
 */
import type { RequestContext } from "../internal/context.js";
import type { paths } from "../generated/types.js";
import { apiPath } from "../internal/path.js";
import { pageable, type Pageable } from "../internal/paginate.js";

export type SignalListParams = NonNullable<paths["/v1/signals"]["get"]["parameters"]["query"]>;
export type SignalListPage = paths["/v1/signals"]["get"]["responses"]["200"]["content"]["application/json"];
export type Signal = paths["/v1/signals/{id}"]["get"]["responses"]["200"]["content"]["application/json"];
export type SignalKindList = paths["/v1/signals/kinds"]["get"]["responses"]["200"]["content"]["application/json"];
export type SignalWatchStatus = paths["/v1/signals/watch"]["get"]["responses"]["200"]["content"]["application/json"];
export type SignalSettingsUpdateBody = NonNullable<paths["/v1/signals/settings"]["patch"]["requestBody"]>["content"]["application/json"];
export type SignalSettings = paths["/v1/signals/settings"]["patch"]["responses"]["200"]["content"]["application/json"];
export type SignalRuleListParams = NonNullable<paths["/v1/signals/rules"]["get"]["parameters"]["query"]>;
export type SignalRuleListPage = paths["/v1/signals/rules"]["get"]["responses"]["200"]["content"]["application/json"];
export type SignalRuleCreateBody = NonNullable<paths["/v1/signals/rules"]["post"]["requestBody"]>["content"]["application/json"];
export type SignalRule = paths["/v1/signals/rules/{id}"]["get"]["responses"]["200"]["content"]["application/json"];
export type SignalRuleUpdateBody = NonNullable<paths["/v1/signals/rules/{id}"]["patch"]["requestBody"]>["content"]["application/json"];

/** `curviate.signals.rules`: what happens to a person when a Signal arrives. */
export class SignalRulesResource {
  constructor(private readonly ctx: RequestContext) {}

  /**
   * This team's rules, newest first; `enabled` filters. `await` it for one
   * page; `for await` it for every rule. Every role reads.
   * `GET /v1/signals/rules`
   *
   * @example
   * for await (const rule of curviate.signals.rules.list({ enabled: true })) console.log(rule.summary);
   */
  list(params?: SignalRuleListParams): Pageable<SignalRuleListPage> {
    return pageable(
      (p) => this.ctx.request<SignalRuleListPage>({ method: "GET", path: "/v1/signals/rules", ...(p ? { query: p } : {}) }),
      params,
    );
  }

  /**
   * Create a rule: for these `kinds` on these Accounts (`account_ids`,
   * `null` for every Account), do its `outcomes` (1 to 3, each type once):
   * `add_to_list` adds the person to a Lead list, `send_event` sends
   * `signal.matched` to your webhooks. `unknown_people` is `skip` (default)
   * or `visit_profile`, which reads the profile of a person Curviate does not
   * know, once; the person may see the visit. The answer's `summary` is the
   * rule as one sentence.
   * `POST /v1/signals/rules`
   *
   * @example
   * await curviate.signals.rules.create({
   *   name: "Engagers to list",
   *   kinds: ["post_engaged"],
   *   account_ids: null,
   *   outcomes: [{ type: "add_to_list", list_id: "cl_123" }],
   * });
   */
  create(body: SignalRuleCreateBody): Promise<SignalRule> {
    return this.ctx.request<SignalRule>({ method: "POST", path: "/v1/signals/rules", body });
  }

  /**
   * One rule of this team.
   * `GET /v1/signals/rules/{id}`
   *
   * @example
   * const rule = await curviate.signals.rules.get("sgr_123");
   */
  get(ruleId: string): Promise<SignalRule> {
    return this.ctx.request<SignalRule>({ method: "GET", path: apiPath`/v1/signals/rules/${ruleId}` });
  }

  /**
   * Change any field of a rule; send only what changes. `{ enabled: false }`
   * switches it off.
   * `PATCH /v1/signals/rules/{id}`
   *
   * @example
   * await curviate.signals.rules.update("sgr_123", { enabled: false });
   */
  update(ruleId: string, body: SignalRuleUpdateBody): Promise<SignalRule> {
    return this.ctx.request<SignalRule>({ method: "PATCH", path: apiPath`/v1/signals/rules/${ruleId}`, body });
  }

  /**
   * Delete a rule. What it did stays: the Leads, their list memberships and
   * the records of its actions.
   * `DELETE /v1/signals/rules/{id}`
   *
   * @example
   * await curviate.signals.rules.delete("sgr_123");
   */
  async delete(ruleId: string): Promise<void> {
    await this.ctx.request<unknown>({ method: "DELETE", path: apiPath`/v1/signals/rules/${ruleId}` });
  }
}

export class SignalsResource {
  readonly rules: SignalRulesResource;

  constructor(private readonly ctx: RequestContext) {
    this.rules = new SignalRulesResource(ctx);
  }

  /**
   * The Signals of the Accounts you may operate, newest first. Filters:
   * `kind` (a kind, or `post_engaged.reaction` / `post_engaged.comment`),
   * `account_id`, `match` (`lead`, `connection`, `followed`, `unknown`,
   * `anonymous`), `listed` (on your Do-not-contact list) and `since`
   * (written after a time). `await` it for one page; `for await` it for every
   * Signal.
   * `GET /v1/signals`
   *
   * @example
   * for await (const signal of curviate.signals.list({ kind: "profile_viewed", match: "lead" })) console.log(signal.id);
   */
  list(params?: SignalListParams): Pageable<SignalListPage> {
    return pageable(
      (p) => this.ctx.request<SignalListPage>({ method: "GET", path: "/v1/signals", ...(p ? { query: p } : {}) }),
      params,
    );
  }

  /**
   * One Signal, while it is at most 7 days old; an older or unknown one is
   * `RESOURCE_NOT_FOUND`.
   * `GET /v1/signals/{id}`
   *
   * @example
   * const signal = await curviate.signals.get("sig_123");
   */
  get(signalId: string): Promise<Signal> {
    return this.ctx.request<Signal>({ method: "GET", path: apiPath`/v1/signals/${signalId}` });
  }

  /**
   * Every Signal kind with its sub-kinds, the follow-up read a card of that
   * kind can trigger (`engagers`, `viewers` or `none`), whether that read is
   * on for your team, and the limit rows it uses.
   * `GET /v1/signals/kinds`
   *
   * @example
   * const { items } = await curviate.signals.kinds();
   */
  kinds(): Promise<SignalKindList> {
    return this.ctx.request<SignalKindList>({ method: "GET", path: "/v1/signals/kinds" });
  }

  /**
   * For each Account you may operate: whether its Signal watch is on, its
   * `state` (`watching`, `paused` with a `pause_reason`, or `off`, the
   * default), its last visit and today's visits and reads.
   * `GET /v1/signals/watch`
   *
   * @example
   * const { items } = await curviate.signals.watch();
   */
  watch(): Promise<SignalWatchStatus> {
    return this.ctx.request<SignalWatchStatus>({ method: "GET", path: "/v1/signals/watch" });
  }

  /**
   * Turn the team's follow-up reads on or off: `follow_up.post_engaged`
   * (read a post's reactions or comments when a card shows someone engaged)
   * and `follow_up.profile_viewed` (read the viewer list when a card shows
   * views), both on by default. Owners and Managers.
   * `PATCH /v1/signals/settings`
   *
   * @example
   * await curviate.signals.updateSettings({ follow_up: { profile_viewed: false } });
   */
  updateSettings(body: SignalSettingsUpdateBody): Promise<SignalSettings> {
    return this.ctx.request<SignalSettings>({ method: "PATCH", path: "/v1/signals/settings", body });
  }
}
