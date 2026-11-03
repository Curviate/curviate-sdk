/**
 * Network (root-scoped): `curviate.network` (2 methods) and
 * `curviate.network.connections` (1 method).
 *
 * Curviate keeps a copy of each account's LinkedIn Connections, filled by a
 * paced background sync. Reads come from that copy: they call nothing on
 * LinkedIn and use no limit, and a new Connection can take hours to appear.
 * Read `coverage` (on a list page) or `syncStatus` before trusting an empty
 * result. `account_id` filters take several accounts as one list.
 */
import type { RequestContext } from "../internal/context.js";
import type { paths } from "../generated/types.js";
import { commaLists } from "../internal/query.js";
import { pageable, type Pageable } from "../internal/paginate.js";

export type ConnectionListParams = NonNullable<paths["/v1/network/connections"]["get"]["parameters"]["query"]>;
export type ConnectionListPage = paths["/v1/network/connections"]["get"]["responses"]["200"]["content"]["application/json"];
/** One item: per account and person (`object: "connection"`) or, with `group: "person"`, one per person (`"connection_person"`). */
export type Connection = ConnectionListPage["items"][number];
export type NetworkSyncStatusParams = NonNullable<paths["/v1/network/sync-status"]["get"]["parameters"]["query"]>;
export type NetworkSyncStatus = paths["/v1/network/sync-status"]["get"]["responses"]["200"]["content"]["application/json"];
export type NetworkResyncBody = NonNullable<paths["/v1/network/resync"]["post"]["requestBody"]>["content"]["application/json"];
export type NetworkResyncResult = paths["/v1/network/resync"]["post"]["responses"]["202"]["content"]["application/json"];

/** `curviate.network.connections`: the stored Connections of your accounts. */
export class NetworkConnectionsResource {
  constructor(private readonly ctx: RequestContext) {}

  /**
   * List the stored Connections of the accounts you can operate, newest
   * first. `account_id` (several allowed), `q` (name or headline, 3+
   * characters), `include_removed` (Connections that left), `limit` (up to
   * 1,000). `await` it for one page; `for await` it for every Connection
   * across pages.
   *
   * By default an item is one account and one person (`object: "connection"`),
   * so someone connected to three of your accounts appears three times.
   * `group: "person"` lists one item per person (`object: "connection_person"`)
   * with `accounts`, each of your accounts they are connected to, and `contact`,
   * their Contact summary (`id`, `list_count`, up to 10 `lists`; `null` when
   * they are not a Contact); `account_id` then picks which people are
   * listed. `include_total: true` (only with `group: "person"`) adds `total`,
   * the number of people that match across all pages. Branch on `object`.
   * `GET /v1/network/connections`
   *
   * @example
   * const { items, coverage } = await curviate.network.connections.list({ account_id: ["acc_123"] });
   * for await (const connection of curviate.network.connections.list({ q: "founder" })) console.log(connection);
   */
  list(params?: ConnectionListParams): Pageable<ConnectionListPage> {
    return pageable(
      (p) => this.ctx.request<ConnectionListPage>({ method: "GET", path: "/v1/network/connections", query: commaLists(p, "account_id") }),
      params,
    );
  }
}

export class NetworkResource {
  readonly connections: NetworkConnectionsResource;

  constructor(private readonly ctx: RequestContext) {
    this.connections = new NetworkConnectionsResource(ctx);
  }

  /**
   * Per account, how far Connection sync is: its state, why it is paused,
   * how many Connections are stored, when the last full sync finished and
   * when the next read can happen. `account_id` narrows it (several allowed).
   * `GET /v1/network/sync-status`
   *
   * @example
   * const { items } = await curviate.network.syncStatus({ account_id: ["acc_123"] });
   */
  syncStatus(params?: NetworkSyncStatusParams): Promise<NetworkSyncStatus> {
    return this.ctx.request<NetworkSyncStatus>({ method: "GET", path: "/v1/network/sync-status", query: commaLists(params, "account_id") });
  }

  /**
   * Start a full re-read of one account's Connections, paced and inside the
   * account's activity window (hours to days for a large network). Once per
   * account per 24 hours; follow it with `syncStatus`. With an `account_id` it
   * resolves with that account's answer (`object: "network_resync"`). With no
   * argument (or no `account_id`) it is Resync all: every account you can
   * operate that can start one now, one after another in a random order, each
   * 20 to 90 seconds after the previous; it resolves with
   * `object: "network_resync_list"`, one item per account with its `status`
   * (`queued`, `cooldown`, `in_progress` or `paused`: answers, not errors) and
   * `starts_at`. Branch on `object`.
   * `POST /v1/network/resync`
   *
   * Needs Automate: a Team below that Tier is refused with `TIER_REQUIRED`.
   *
   * @example
   * await curviate.network.resync({ account_id: "acc_123" });
   * const all = await curviate.network.resync(); // Resync all
   */
  resync(body?: NetworkResyncBody): Promise<NetworkResyncResult> {
    return this.ctx.request<NetworkResyncResult>({ method: "POST", path: "/v1/network/resync", body: body ?? {} });
  }
}
