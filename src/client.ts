/**
 * The Curviate client.
 *
 * `new Curviate({ apiKey })` is the single entry point. The instance is
 * immutable: config is resolved + frozen in the constructor, and the
 * constructor makes no network call. Resource namespaces are mounted
 * on the instance; `account(id)` returns an account-scoped view that fixes
 * `account_id` on every call.
 *
 * `paginate(method, params)` follows the `cursor` field transparently across
 * pages, yielding individual items as an `AsyncIterableIterator`.
 */
import {
  resolveConfig,
  type CurviateConfig,
  type ResolvedConfig,
} from "./config.js";
import { CurviateError } from "./errors.js";
import { createContext } from "./internal/context.js";
import {
  paginate as paginateImpl,
  type PaginatableMethod,
} from "./internal/paginate.js";
import {
  buildRootNamespaces,
  buildAccountScopedNamespaces,
  type AccountScopedNamespaces,
  type AccountsResource,
  type AuthResource,
  type WebhooksResource,
  type DraftsResource,
  type ConnectRequestsResource,
  type TeamsResource,
  type NotificationsResource,
  type ContactsResource,
  type ContactListsResource,
  type TagsResource,
  type MotionsResource,
  type EnrollmentsResource,
  type TierResource,
  type NetworkResource,
  type UniboxResource,
  type AnalyticsResource,
  type BillingResource,
  type DoNotContactResource,
  type ExportsResource,
} from "./resources/index.js";

export class Curviate {
  /** Frozen, fully-resolved config. */
  readonly config: ResolvedConfig;

  // Root-scoped namespaces only. Account-scoped namespaces (users, messaging,
  // posts, ...) are reachable exclusively via `account(id)`; they cannot build a
  // valid path without a bound `account_id`.
  readonly accounts: AccountsResource;
  readonly auth: AuthResource;
  readonly webhooks: WebhooksResource;
  readonly drafts: DraftsResource;
  readonly connectRequests: ConnectRequestsResource;
  readonly teams: TeamsResource;
  /**
   * Curviate's own Notifications (root). An account's LinkedIn notifications
   * are `curviate.account(id).notifications`.
   */
  readonly notifications: NotificationsResource;
  /** Your team's Contacts; `contacts.imports` for bulk imports. */
  readonly contacts: ContactsResource;
  readonly contactLists: ContactListsResource;
  readonly tags: TagsResource;
  /** Motions: a Sequence run for Contacts; accepts a `Sequence` builder. */
  readonly motions: MotionsResource;
  /** One Contact x Motion x account run of a Motion. */
  readonly enrollments: EnrollmentsResource;
  /** The Team's Tier and its features; `TIER_REQUIRED` explained. */
  readonly tier: TierResource;
  /** Your accounts' stored LinkedIn Connections and their sync. */
  readonly network: NetworkResource;
  /** One inbox over every account you can operate; full-inbox sync per account. */
  readonly unibox: UniboxResource;
  /** Read-only Motion results, activity in budget units, the Motion events feed. */
  readonly analytics: AnalyticsResource;
  /** Seat lending between your Teams, and the Team's invoices. */
  readonly billing: BillingResource;
  /** The Team-wide do-not-contact list every Motion and write respects. */
  readonly doNotContact: DoNotContactResource;
  /** Background exports and their files. */
  readonly exports: ExportsResource;

  constructor(config: CurviateConfig) {
    this.config = resolveConfig(config);
    const ctx = createContext(this.config);
    const ns = buildRootNamespaces(ctx);
    this.accounts = ns.accounts;
    this.auth = ns.auth;
    this.webhooks = ns.webhooks;
    this.drafts = ns.drafts;
    this.connectRequests = ns.connectRequests;
    this.teams = ns.teams;
    this.notifications = ns.notifications;
    this.contacts = ns.contacts;
    this.contactLists = ns.contactLists;
    this.tags = ns.tags;
    this.motions = ns.motions;
    this.enrollments = ns.enrollments;
    this.tier = ns.tier;
    this.network = ns.network;
    this.unibox = ns.unibox;
    this.analytics = ns.analytics;
    this.billing = ns.billing;
    this.doNotContact = ns.doNotContact;
    this.exports = ns.exports;
  }

  /**
   * Return an account-scoped accessor that fixes `account_id` on every call,
   * so callers need not repeat it per method.
   *
   * @param accountId - a Curviate account id (`acc_...`). Empty throws
   *   `CurviateError({ code: 'INVALID_REQUEST' })` synchronously, no network call.
   *
   * @example
   * await curviate.account("acc_123").messaging.listChats();
   */
  account(accountId: string): AccountScopedNamespaces {
    if (typeof accountId !== "string" || accountId.length === 0) {
      throw new CurviateError({
        code: "INVALID_REQUEST",
        message: "account(accountId) requires a non-empty account id.",
        userFixable: true,
        retryLikelyToSucceed: false,
      });
    }
    const ctx = createContext(this.config, accountId);
    return buildAccountScopedNamespaces(ctx);
  }

  /**
   * The same client acting in another Team: every call made through the
   * returned client sends `X-Curviate-Team: <team>`, overriding the `team`
   * client option. Use it per call with a key that works in all of your
   * Teams, which a Team-level operation otherwise refuses with
   * `TEAM_REQUIRED`. A Team key accepts only its own Team
   * (`TEAM_ACCESS_DENIED`). No network call; `team` is checked as in the
   * constructor.
   *
   * @param team - a Team id (`tnt_...`); `curviate.teams.list()` lists yours.
   *
   * @example
   * for (const team of (await curviate.teams.list()).items) {
   *   const { items } = await curviate.withTeam(team.id).motions.list({ status: ["active"] });
   * }
   */
  withTeam(team: string): Curviate {
    return new Curviate({ ...this.config, team });
  }

  /**
   * Transparent cursor-pagination iterator.
   *
   * Calls `fn` repeatedly, injecting the `cursor` from each response into the
   * next call, yielding individual items until `cursor` is null.
   *
   * @param fn     - a bound resource method (e.g. `users.listRelations.bind(users)`)
   * @param params - the initial params (minus cursor)
   *
   * @example
   * for await (const relation of curviate.paginate(
   *   curviate.account('acc_123').users.listRelations,
   *   { limit: 50 }
   * )) {
   *   console.log(relation);
   * }
   */
  paginate<TParams extends Record<string, unknown>, TPage extends { items?: unknown[]; data?: unknown[]; cursor?: string | null }>(
    fn: PaginatableMethod<TParams, TPage>,
    params: TParams,
  ): AsyncIterableIterator<TPage extends { items?: Array<infer I> | undefined } ? I : TPage extends { data?: Array<infer D> | undefined } ? D : unknown> {
    return paginateImpl(fn, params) as AsyncIterableIterator<TPage extends { items?: Array<infer I> | undefined } ? I : TPage extends { data?: Array<infer D> | undefined } ? D : unknown>;
  }
}
