/**
 * Users resource: 9 methods (renamed from `profiles`).
 *
 * Account-scoped: the bound context injects `account_id` as the leading
 * `/v1/` path segment on every request (account-first grammar), never a
 * query param or body field.
 *
 * `user_id` accepts the sentinel `"me"` for the caller's own account, the old
 * standalone `getMe()` method is folded into `get()`; there is no separate
 * `getMe`.
 *
 * `listRelations` serves `GET /v1/{account_id}/profiles/relations`, the
 * served URL keeps the `profiles/` segment even though the namespace is
 * `users` (the URL is served truth, not "fixed").
 *
 * `getCompany` has no served equivalent, hard-moved to `companies.get()`
 * (already removed pre-0.15.0; stays absent here).
 */
import type { RequestContext } from "../internal/context.js";
import type { paths } from "../generated/types.js";
import { apiPath } from "../internal/path.js";

// ─── Type aliases from generated OpenAPI snapshot ──────────────────────────

export type UserProfile =
  paths["/v1/{account_id}/users/{user_id}"]["get"]["responses"]["200"]["content"]["application/json"];
export type UserGetQuery = NonNullable<
  paths["/v1/{account_id}/users/{user_id}"]["get"]["parameters"]["query"]
>;

export type UserUpdateBody =
  paths["/v1/{account_id}/users/{user_id}"]["patch"]["requestBody"]["content"]["application/json"];
export type UserUpdateResult =
  paths["/v1/{account_id}/users/{user_id}"]["patch"]["responses"]["200"]["content"]["application/json"];

export type RelationListPage =
  paths["/v1/{account_id}/profiles/relations"]["get"]["responses"]["200"]["content"]["application/json"];
export type RelationListQuery = NonNullable<
  paths["/v1/{account_id}/profiles/relations"]["get"]["parameters"]["query"]
>;

export type UserFollowerListPage =
  paths["/v1/{account_id}/users/{user_id}/followers"]["get"]["responses"]["200"]["content"]["application/json"];
export type UserFollowerListQuery = NonNullable<
  paths["/v1/{account_id}/users/{user_id}/followers"]["get"]["parameters"]["query"]
>;

export type UserFollowingListPage =
  paths["/v1/{account_id}/users/{user_id}/following"]["get"]["responses"]["200"]["content"]["application/json"];
export type UserFollowingListQuery = NonNullable<
  paths["/v1/{account_id}/users/{user_id}/following"]["get"]["parameters"]["query"]
>;

export type UserFollowResult =
  paths["/v1/{account_id}/users/{user_id}/follow"]["post"]["responses"]["200"]["content"]["application/json"];
export type UserUnfollowResult =
  paths["/v1/{account_id}/users/{user_id}/follow"]["delete"]["responses"]["200"]["content"]["application/json"];

export type InMailCreditsResult =
  paths["/v1/{account_id}/inmail-credits"]["get"]["responses"]["200"]["content"]["application/json"];
export type InMailCreditsQuery = NonNullable<
  paths["/v1/{account_id}/inmail-credits"]["get"]["parameters"]["query"]
>;

export type EndorseSkillBody =
  paths["/v1/{account_id}/users/{user_id}/endorse-skill"]["post"]["requestBody"]["content"]["application/json"];
export type EndorseSkillResult =
  paths["/v1/{account_id}/users/{user_id}/endorse-skill"]["post"]["responses"]["200"]["content"]["application/json"];

// ─── Resource class ───────────────────────────────────────────────────────────

export class UsersResource {
  constructor(protected readonly ctx: RequestContext) {}

  /**
   * Retrieve a user's profile. `GET /v1/{account_id}/users/{user_id}`
   * Pass `userId: "me"` for the caller's own account (folds in the old
   * standalone `getMe()`). Pass `{ linkedin_sections: [...] }` to request
   * enriched sections.
   */
  get(userId: string, params?: UserGetQuery): Promise<UserProfile> {
    return this.ctx.request<UserProfile>({
      method: "GET",
      path: apiPath`/v1/{account_id}/users/${userId}`,
      ...(params ? { query: params as Record<string, string | number | boolean | string[] | undefined | null> } : {}),
    });
  }

  /**
   * Update the caller's own profile. `PATCH /v1/{account_id}/users/{user_id}`
   * Only `first_name`, `last_name`, `bio`, `headline`, `skills`, `picture`,
   * `background_picture` are accepted; there is no `description` key.
   * `description` is not part of the update contract: TypeScript already
   * rejects it at the call site, but an untyped/JS caller (or an `as`-cast)
   * could still smuggle it onto the object, so it is also stripped
   * defensively at runtime before the request goes out, the caller's
   * object is never mutated.
   */
  update(userId: string, body: UserUpdateBody): Promise<UserUpdateResult> {
    const { description: _description, ...safeBody } = body as Record<string, unknown>;
    return this.ctx.request<UserUpdateResult>({
      method: "PATCH",
      path: apiPath`/v1/{account_id}/users/${userId}`,
      body: safeBody,
    });
  }

  /**
   * List the account's 1st-degree connections.
   * `GET /v1/{account_id}/profiles/relations` (served URL keeps `profiles/`).
   * Was `profiles.listConnections`.
   */
  listRelations(params?: RelationListQuery): Promise<RelationListPage> {
    return this.ctx.request<RelationListPage>({
      method: "GET",
      path: "/v1/{account_id}/profiles/relations",
      ...(params ? { query: params as Record<string, string | number | boolean | string[] | undefined | null> } : {}),
    });
  }

  /** List a user's followers. `GET /v1/{account_id}/users/{user_id}/followers` */
  listFollowers(userId: string, params?: UserFollowerListQuery): Promise<UserFollowerListPage> {
    return this.ctx.request<UserFollowerListPage>({
      method: "GET",
      path: apiPath`/v1/{account_id}/users/${userId}/followers`,
      ...(params ? { query: params as Record<string, string | number | boolean | string[] | undefined | null> } : {}),
    });
  }

  /** List who a user follows. `GET /v1/{account_id}/users/{user_id}/following` */
  listFollowing(userId: string, params?: UserFollowingListQuery): Promise<UserFollowingListPage> {
    return this.ctx.request<UserFollowingListPage>({
      method: "GET",
      path: apiPath`/v1/{account_id}/users/${userId}/following`,
      ...(params ? { query: params as Record<string, string | number | boolean | string[] | undefined | null> } : {}),
    });
  }

  /**
   * Follow a user (bodyless). `POST /v1/{account_id}/users/{user_id}/follow`
   * If the target's profile is private, sends a connect request instead and
   * returns `connect_request_sent`.
   */
  follow(userId: string): Promise<UserFollowResult> {
    return this.ctx.request<UserFollowResult>({
      method: "POST",
      path: apiPath`/v1/{account_id}/users/${userId}/follow`,
    });
  }

  /**
   * Unfollow a user (bodyless). `DELETE /v1/{account_id}/users/{user_id}/follow`
   * Idempotent: unfollowing a user this account does not currently follow
   * still returns 200.
   */
  unfollow(userId: string): Promise<UserUnfollowResult> {
    return this.ctx.request<UserUnfollowResult>({
      method: "DELETE",
      path: apiPath`/v1/{account_id}/users/${userId}/follow`,
    });
  }

  /**
   * Get remaining InMail credits across subscribed LinkedIn premium products.
   * `GET /v1/{account_id}/inmail-credits`
   * Relocated from `messaging.getInMailBalance`.
   */
  getInMailCredits(params?: InMailCreditsQuery): Promise<InMailCreditsResult> {
    return this.ctx.request<InMailCreditsResult>({
      method: "GET",
      path: "/v1/{account_id}/inmail-credits",
      ...(params ? { query: params as Record<string, string | number | boolean | string[] | undefined | null> } : {}),
    });
  }

  /**
   * Endorse one specific skill on a target member's profile.
   * `POST /v1/{account_id}/users/{user_id}/endorse-skill`
   * Body key is `endorsement_id` (was `skill_endorsement_id` on `profiles.endorse`).
   * Obtain it from `GET /v1/{account_id}/users/{user_id}?linkedin_sections=linkedin_skills`.
   */
  endorseSkill(userId: string, body: EndorseSkillBody): Promise<EndorseSkillResult> {
    return this.ctx.request<EndorseSkillResult>({
      method: "POST",
      path: apiPath`/v1/{account_id}/users/${userId}/endorse-skill`,
      body,
    });
  }
}
