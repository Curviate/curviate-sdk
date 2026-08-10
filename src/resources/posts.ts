/**
 * Posts resource: 12 methods.
 *
 * Account-scoped: the bound context injects `account_id` as the leading
 * `/v1/` path segment on every request (account-first grammar), never a
 * query param or body field.
 *
 * `create` is pure `application/json`, the served surface has ZERO
 * multipart ops; media attachments travel as base64-encoded objects
 * (`{content,content_type,filename}`), not `FormData`.
 *
 * `listUserPosts` was `profiles.listPosts`; `listUserReactions` was
 * `profiles.listReactions` (relocated here, both realigns, not new).
 * `delete` and `unreact` are new. `unreact` is a **DELETE-with-body**:
 * `DELETE /v1/{account_id}/posts/{post_id}/reactions` carries `{reaction}`.
 *
 * The comment-write surface (`comment` + comment listing/editing) has
 * relocated to the dedicated `comments` namespace, `listComments` stays
 * here (it is a *read* of a post's comments, the served op the account
 * scope already owns), but creating/editing/replying to a comment is a
 * `comments.*` call now.
 *
 * `listSaved` / `save` / `unsave` manage the connected account's own
 * saved-posts bookmark list, a self resource, no `{user_id}`. `listSaved`
 * returns PREVIEWS only (`snippet` capped at <=140 chars), never the full
 * post body. `save` and `unsave` are two distinct product endpoints over
 * one underlying save-state toggle and are both idempotent: saving an
 * already-saved post re-asserts `saved:true`; unsaving a not-currently-saved
 * post re-asserts `saved:false`.
 */
import type { RequestContext } from "../internal/context.js";
import type { paths } from "../generated/types.js";
import { apiPath } from "../internal/path.js";

// ─── Type aliases from generated OpenAPI snapshot ──────────────────────────

export type PostCommentListPage =
  paths["/v1/{account_id}/posts/{post_id}/comments"]["get"]["responses"]["200"]["content"]["application/json"];
export type PostCommentListQuery = NonNullable<
  paths["/v1/{account_id}/posts/{post_id}/comments"]["get"]["parameters"]["query"]
>;

export type PostDetail =
  paths["/v1/{account_id}/posts/{post_id}"]["get"]["responses"]["200"]["content"]["application/json"];

export type PostDeleteResult =
  paths["/v1/{account_id}/posts/{post_id}"]["delete"]["responses"]["204"]["content"]["application/json"];

export type CreatePostBody =
  paths["/v1/{account_id}/posts"]["post"]["requestBody"]["content"]["application/json"];
export type CreatePostResult =
  paths["/v1/{account_id}/posts"]["post"]["responses"]["201"]["content"]["application/json"];

export type UserPostListPage =
  paths["/v1/{account_id}/users/{user_id}/posts"]["get"]["responses"]["200"]["content"]["application/json"];
export type UserPostListQuery = NonNullable<
  paths["/v1/{account_id}/users/{user_id}/posts"]["get"]["parameters"]["query"]
>;

export type PostReactionListPage =
  paths["/v1/{account_id}/posts/{post_id}/reactions"]["get"]["responses"]["200"]["content"]["application/json"];
export type PostReactionListQuery = NonNullable<
  paths["/v1/{account_id}/posts/{post_id}/reactions"]["get"]["parameters"]["query"]
>;

export type PostReactBody =
  paths["/v1/{account_id}/posts/{post_id}/reactions"]["post"]["requestBody"]["content"]["application/json"];
export type PostReactResult =
  paths["/v1/{account_id}/posts/{post_id}/reactions"]["post"]["responses"]["200"]["content"]["application/json"];

export type PostUnreactBody =
  paths["/v1/{account_id}/posts/{post_id}/reactions"]["delete"]["requestBody"]["content"]["application/json"];
export type PostUnreactResult =
  paths["/v1/{account_id}/posts/{post_id}/reactions"]["delete"]["responses"]["200"]["content"]["application/json"];

export type UserReactionListPage =
  paths["/v1/{account_id}/users/{user_id}/reactions"]["get"]["responses"]["200"]["content"]["application/json"];
export type UserReactionListQuery = NonNullable<
  paths["/v1/{account_id}/users/{user_id}/reactions"]["get"]["parameters"]["query"]
>;

export type SavedPostListPage =
  paths["/v1/{account_id}/saved-posts"]["get"]["responses"]["200"]["content"]["application/json"];
export type SavedPostListQuery = NonNullable<
  paths["/v1/{account_id}/saved-posts"]["get"]["parameters"]["query"]
>;

export type SavePostBody =
  paths["/v1/{account_id}/saved-posts"]["post"]["requestBody"]["content"]["application/json"];
export type SavePostResult =
  paths["/v1/{account_id}/saved-posts"]["post"]["responses"]["200"]["content"]["application/json"];

export type UnsavePostResult =
  paths["/v1/{account_id}/saved-posts/{post_id}"]["delete"]["responses"]["200"]["content"]["application/json"];

// ─── Resource class ───────────────────────────────────────────────────────────

export class PostsResource {
  constructor(protected readonly ctx: RequestContext) {}

  /** List comments on a post. `GET /v1/{account_id}/posts/{post_id}/comments` */
  listComments(postId: string, params?: PostCommentListQuery): Promise<PostCommentListPage> {
    return this.ctx.request<PostCommentListPage>({
      method: "GET",
      path: apiPath`/v1/{account_id}/posts/${postId}/comments`,
      ...(params ? { query: params as Record<string, string | number | boolean | string[] | undefined | null> } : {}),
    });
  }

  /** Get a single post. `GET /v1/{account_id}/posts/{post_id}` */
  get(postId: string): Promise<PostDetail> {
    return this.ctx.request<PostDetail>({
      method: "GET",
      path: apiPath`/v1/{account_id}/posts/${postId}`,
    });
  }

  /** Delete a post (bodyless, 204). `DELETE /v1/{account_id}/posts/{post_id}` */
  delete(postId: string): Promise<PostDeleteResult> {
    return this.ctx.request<PostDeleteResult>({
      method: "DELETE",
      path: apiPath`/v1/{account_id}/posts/${postId}`,
    });
  }

  /**
   * Publish a new post. Always `application/json`; attachments (if any) are
   * base64-encoded objects, never `FormData`/multipart.
   * `POST /v1/{account_id}/posts`
   */
  create(body: CreatePostBody): Promise<CreatePostResult> {
    return this.ctx.request<CreatePostResult>({
      method: "POST",
      path: "/v1/{account_id}/posts",
      body,
    });
  }

  /**
   * List a user's own posts. `GET /v1/{account_id}/users/{user_id}/posts`
   * Was `profiles.listPosts`.
   */
  listUserPosts(userId: string, params?: UserPostListQuery): Promise<UserPostListPage> {
    return this.ctx.request<UserPostListPage>({
      method: "GET",
      path: apiPath`/v1/{account_id}/users/${userId}/posts`,
      ...(params ? { query: params as Record<string, string | number | boolean | string[] | undefined | null> } : {}),
    });
  }

  /** List reactions on a post. `GET /v1/{account_id}/posts/{post_id}/reactions` */
  listReactions(postId: string, params?: PostReactionListQuery): Promise<PostReactionListPage> {
    return this.ctx.request<PostReactionListPage>({
      method: "GET",
      path: apiPath`/v1/{account_id}/posts/${postId}/reactions`,
      ...(params ? { query: params as Record<string, string | number | boolean | string[] | undefined | null> } : {}),
    });
  }

  /** React to a post. `POST /v1/{account_id}/posts/{post_id}/reactions` */
  react(postId: string, body: PostReactBody): Promise<PostReactResult> {
    return this.ctx.request<PostReactResult>({
      method: "POST",
      path: apiPath`/v1/{account_id}/posts/${postId}/reactions`,
      body,
    });
  }

  /**
   * Remove this account's reaction from a post, a **DELETE-with-body**:
   * the reaction value to remove travels in the JSON body, not the path.
   * `DELETE /v1/{account_id}/posts/{post_id}/reactions`
   */
  unreact(postId: string, body: PostUnreactBody): Promise<PostUnreactResult> {
    return this.ctx.request<PostUnreactResult>({
      method: "DELETE",
      path: apiPath`/v1/{account_id}/posts/${postId}/reactions`,
      body,
    });
  }

  /**
   * List a user's reactions. `GET /v1/{account_id}/users/{user_id}/reactions`
   * Was `profiles.listReactions`.
   */
  listUserReactions(userId: string, params?: UserReactionListQuery): Promise<UserReactionListPage> {
    return this.ctx.request<UserReactionListPage>({
      method: "GET",
      path: apiPath`/v1/{account_id}/users/${userId}/reactions`,
      ...(params ? { query: params as Record<string, string | number | boolean | string[] | undefined | null> } : {}),
    });
  }

  /**
   * List the connected account's own saved posts (a private bookmark list),
   * newest-saved-first. A self resource: there is no other-member
   * saved-posts view, so this takes no target param. Each item is a
   * PREVIEW, `snippet` capped at <=140 chars, never the full post body.
   * `GET /v1/{account_id}/saved-posts`
   *
   * @param params - optional `limit` (default 20, a page-aligned lower
   *   bound) and an opaque `cursor` from a prior response.
   */
  listSaved(params?: SavedPostListQuery): Promise<SavedPostListPage> {
    return this.ctx.request<SavedPostListPage>({
      method: "GET",
      path: "/v1/{account_id}/saved-posts",
      ...(params ? { query: params as Record<string, string | number | boolean | string[] | undefined | null> } : {}),
    });
  }

  /**
   * Save a post to the connected account's private bookmark list. Any post
   * may be saved; it does not notify the author and is never visible to
   * third parties. Idempotent: saving an already-saved post re-asserts
   * `saved:true`.
   * `POST /v1/{account_id}/saved-posts`
   *
   * @param postId - the post to save. Accepts `urn:li:activity:<id>` or a
   *   bare numeric `<id>`, both normalize to the same target. Any other
   *   shape (`urn:li:ugcPost:...`, `urn:li:share:...`, a URL) is rejected with
   *   `400 INVALID_REQUEST`.
   */
  save(postId: string): Promise<SavePostResult> {
    const body: SavePostBody = { post_id: postId };
    return this.ctx.request<SavePostResult>({
      method: "POST",
      path: "/v1/{account_id}/saved-posts",
      body,
    });
  }

  /**
   * Unsave a post, the reverse of {@link save}, over the SAME underlying
   * save-state call (a distinct product endpoint, one substrate call).
   * Idempotent: unsaving a not-currently-saved post re-asserts
   * `saved:false`.
   * `DELETE /v1/{account_id}/saved-posts/{post_id}`
   *
   * @param postId - the post to unsave, same accepted shapes as {@link save}.
   */
  unsave(postId: string): Promise<UnsavePostResult> {
    return this.ctx.request<UnsavePostResult>({
      method: "DELETE",
      path: apiPath`/v1/{account_id}/saved-posts/${postId}`,
    });
  }
}
