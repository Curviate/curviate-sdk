/**
 * Groups resource: 3 methods (NEW namespace).
 *
 * Account-scoped: the bound context injects `account_id` as the leading
 * `/v1/` path segment on every request (account-first grammar), never a
 * query param or body field.
 *
 * Reads the LinkedIn groups a member belongs to, a single group's full
 * detail, and a group's member roster. `list()` reads the connected
 * account's own groups by default; pass `{ profile }` to read another
 * member's public group set. "Search group members" is not a separate
 * method; it is `members()` with a `{ name }` filter applied.
 */
import type { RequestContext } from "../internal/context.js";
import type { paths } from "../generated/types.js";
import { apiPath } from "../internal/path.js";

// ─── Type aliases from generated OpenAPI snapshot ──────────────────────────

export type GroupListPage =
  paths["/v1/{account_id}/profile/groups"]["get"]["responses"]["200"]["content"]["application/json"];
export type GroupListQuery = NonNullable<
  paths["/v1/{account_id}/profile/groups"]["get"]["parameters"]["query"]
>;

export type Group =
  paths["/v1/{account_id}/groups/{group}"]["get"]["responses"]["200"]["content"]["application/json"];

export type GroupMemberListPage =
  paths["/v1/{account_id}/groups/{group}/members"]["get"]["responses"]["200"]["content"]["application/json"];
export type GroupMemberListQuery = NonNullable<
  paths["/v1/{account_id}/groups/{group}/members"]["get"]["parameters"]["query"]
>;

// ─── Resource class ───────────────────────────────────────────────────────────

export class GroupsResource {
  constructor(protected readonly ctx: RequestContext) {}

  /**
   * List the LinkedIn groups a member belongs to, each enriched to full
   * group detail. `GET /v1/{account_id}/profile/groups`
   *
   * Reads the connected account's own groups by default; pass `{ profile }`
   * (a member's public identifier) to read another member's group set. The
   * `id` on each returned group is the same id `members()` consumes.
   *
   * @param params - optional `{ profile }` to target another member, plus
   *   `limit` and an opaque `cursor` for pagination.
   */
  list(params?: GroupListQuery): Promise<GroupListPage> {
    return this.ctx.request<GroupListPage>({
      method: "GET",
      path: `/v1/{account_id}/profile/groups`,
      ...(params ? { query: params as Record<string, string | number | boolean | string[] | undefined | null> } : {}),
    });
  }

  /**
   * Retrieve a single LinkedIn group's full detail: its name, description,
   * member count, membership status, and admin contact.
   * `GET /v1/{account_id}/groups/{group}`
   *
   * @param group - the group's id or LinkedIn group URL.
   */
  get(group: string): Promise<Group> {
    return this.ctx.request<Group>({
      method: "GET",
      path: apiPath`/v1/{account_id}/groups/${group}`,
    });
  }

  /**
   * List a group's members, cursor-paginated, each carrying its profile URL,
   * name, and headline. `GET /v1/{account_id}/groups/{group}/members`
   *
   * Pass `{ name }` to search the roster by member name, the folded-in
   * member search, not a separate endpoint.
   *
   * @param group - the group's id or LinkedIn group URL.
   * @param params - optional `{ name }` filter plus `limit` and an opaque
   *   `cursor` for pagination.
   */
  members(group: string, params?: GroupMemberListQuery): Promise<GroupMemberListPage> {
    return this.ctx.request<GroupMemberListPage>({
      method: "GET",
      path: apiPath`/v1/{account_id}/groups/${group}/members`,
      ...(params ? { query: params as Record<string, string | number | boolean | string[] | undefined | null> } : {}),
    });
  }
}
