/**
 * Comments resource: 9 methods (NEW namespace).
 *
 * Account-scoped: the bound context injects `account_id` as the leading
 * `/v1/` path segment on every request (account-first grammar), never a
 * query param or body field.
 *
 * The comment-write surface relocated here from `posts`; `create` was
 * `posts.comment`; `listUserComments` was `profiles.listComments`. Listing
 * the comments *on* a post (`GET /v1/{account_id}/posts/{post_id}/comments`)
 * stays on `posts.listComments`; it is a read the account scope already
 * owns; this namespace owns the comment-thread write/reply/reaction surface
 * plus reading a user's own authored comments.
 *
 * `reply` shares its path with `edit`, `POST .../comments/{comment_id}`
 * creates a reply under the target comment, `PATCH` edits the target
 * comment's own text.
 *
 * `removeReaction` is a **DELETE-with-body**:
 * `DELETE /v1/{account_id}/posts/{post_id}/comments/{comment_id}/reactions`
 * carries `{reaction}`, the same unified lowercase reaction enum as
 * `posts.react`/`posts.unreact`.
 */
import type { RequestContext } from "../internal/context.js";
import type { paths } from "../generated/types.js";
import { apiPath } from "../internal/path.js";

// ─── Type aliases from generated OpenAPI snapshot ──────────────────────────

export type UserCommentListPage =
  paths["/v1/{account_id}/users/{user_id}/comments"]["get"]["responses"]["200"]["content"]["application/json"];
export type UserCommentListQuery = NonNullable<
  paths["/v1/{account_id}/users/{user_id}/comments"]["get"]["parameters"]["query"]
>;

export type CreateCommentBody =
  paths["/v1/{account_id}/posts/{post_id}/comments"]["post"]["requestBody"]["content"]["application/json"];
export type CreateCommentResult =
  paths["/v1/{account_id}/posts/{post_id}/comments"]["post"]["responses"]["201"]["content"]["application/json"];

export type EditCommentBody =
  paths["/v1/{account_id}/posts/{post_id}/comments/{comment_id}"]["patch"]["requestBody"]["content"]["application/json"];
export type EditCommentResult =
  paths["/v1/{account_id}/posts/{post_id}/comments/{comment_id}"]["patch"]["responses"]["200"]["content"]["application/json"];

export type DeleteCommentResult =
  paths["/v1/{account_id}/posts/{post_id}/comments/{comment_id}"]["delete"]["responses"]["204"]["content"]["application/json"];

export type ReplyToCommentBody =
  paths["/v1/{account_id}/posts/{post_id}/comments/{comment_id}"]["post"]["requestBody"]["content"]["application/json"];
export type ReplyToCommentResult =
  paths["/v1/{account_id}/posts/{post_id}/comments/{comment_id}"]["post"]["responses"]["201"]["content"]["application/json"];

export type CommentReplyListPage =
  paths["/v1/{account_id}/posts/{post_id}/comments/{comment_id}/replies"]["get"]["responses"]["200"]["content"]["application/json"];
export type CommentReplyListQuery = NonNullable<
  paths["/v1/{account_id}/posts/{post_id}/comments/{comment_id}/replies"]["get"]["parameters"]["query"]
>;

export type CommentReactionListPage =
  paths["/v1/{account_id}/posts/{post_id}/comments/{comment_id}/reactions"]["get"]["responses"]["200"]["content"]["application/json"];
export type CommentReactionListQuery = NonNullable<
  paths["/v1/{account_id}/posts/{post_id}/comments/{comment_id}/reactions"]["get"]["parameters"]["query"]
>;

export type AddCommentReactionBody =
  paths["/v1/{account_id}/posts/{post_id}/comments/{comment_id}/reactions"]["post"]["requestBody"]["content"]["application/json"];
export type AddCommentReactionResult =
  paths["/v1/{account_id}/posts/{post_id}/comments/{comment_id}/reactions"]["post"]["responses"]["200"]["content"]["application/json"];

export type RemoveCommentReactionBody =
  paths["/v1/{account_id}/posts/{post_id}/comments/{comment_id}/reactions"]["delete"]["requestBody"]["content"]["application/json"];
export type RemoveCommentReactionResult =
  paths["/v1/{account_id}/posts/{post_id}/comments/{comment_id}/reactions"]["delete"]["responses"]["200"]["content"]["application/json"];

// ─── Resource class ───────────────────────────────────────────────────────────

export class CommentsResource {
  constructor(protected readonly ctx: RequestContext) {}

  /**
   * List comments authored by a user, each embedding the post it was made
   * on. `GET /v1/{account_id}/users/{user_id}/comments`
   * Was `profiles.listComments`.
   */
  listUserComments(userId: string, params?: UserCommentListQuery): Promise<UserCommentListPage> {
    return this.ctx.request<UserCommentListPage>({
      method: "GET",
      path: apiPath`/v1/{account_id}/users/${userId}/comments`,
      ...(params ? { query: params as Record<string, string | number | boolean | string[] | undefined | null> } : {}),
    });
  }

  /**
   * Publish a comment on a post. `POST /v1/{account_id}/posts/{post_id}/comments`
   * Was `posts.comment`. Attachments (at most one) travel as a base64
   * object, never `FormData`.
   */
  create(postId: string, body: CreateCommentBody): Promise<CreateCommentResult> {
    return this.ctx.request<CreateCommentResult>({
      method: "POST",
      path: apiPath`/v1/{account_id}/posts/${postId}/comments`,
      body,
    });
  }

  /**
   * Edit the text of this account's own comment.
   * `PATCH /v1/{account_id}/posts/{post_id}/comments/{comment_id}`
   */
  edit(postId: string, commentId: string, body: EditCommentBody): Promise<EditCommentResult> {
    return this.ctx.request<EditCommentResult>({
      method: "PATCH",
      path: apiPath`/v1/{account_id}/posts/${postId}/comments/${commentId}`,
      body,
    });
  }

  /**
   * Delete this account's own comment (bodyless, 204).
   * `DELETE /v1/{account_id}/posts/{post_id}/comments/{comment_id}`
   */
  delete(postId: string, commentId: string): Promise<DeleteCommentResult> {
    return this.ctx.request<DeleteCommentResult>({
      method: "DELETE",
      path: apiPath`/v1/{account_id}/posts/${postId}/comments/${commentId}`,
    });
  }

  /**
   * Reply to a comment. Shares its path with `edit`; POST creates a reply
   * under the target comment, PATCH edits the target comment's own text.
   * `POST /v1/{account_id}/posts/{post_id}/comments/{comment_id}`
   */
  reply(postId: string, commentId: string, body: ReplyToCommentBody): Promise<ReplyToCommentResult> {
    return this.ctx.request<ReplyToCommentResult>({
      method: "POST",
      path: apiPath`/v1/{account_id}/posts/${postId}/comments/${commentId}`,
      body,
    });
  }

  /**
   * List replies to a comment, most-recent-first.
   * `GET /v1/{account_id}/posts/{post_id}/comments/{comment_id}/replies`
   */
  listReplies(postId: string, commentId: string, params?: CommentReplyListQuery): Promise<CommentReplyListPage> {
    return this.ctx.request<CommentReplyListPage>({
      method: "GET",
      path: apiPath`/v1/{account_id}/posts/${postId}/comments/${commentId}/replies`,
      ...(params ? { query: params as Record<string, string | number | boolean | string[] | undefined | null> } : {}),
    });
  }

  /**
   * List reactions on a comment.
   * `GET /v1/{account_id}/posts/{post_id}/comments/{comment_id}/reactions`
   */
  listReactions(postId: string, commentId: string, params?: CommentReactionListQuery): Promise<CommentReactionListPage> {
    return this.ctx.request<CommentReactionListPage>({
      method: "GET",
      path: apiPath`/v1/{account_id}/posts/${postId}/comments/${commentId}/reactions`,
      ...(params ? { query: params as Record<string, string | number | boolean | string[] | undefined | null> } : {}),
    });
  }

  /**
   * React to a comment. `POST /v1/{account_id}/posts/{post_id}/comments/{comment_id}/reactions`
   */
  addReaction(postId: string, commentId: string, body: AddCommentReactionBody): Promise<AddCommentReactionResult> {
    return this.ctx.request<AddCommentReactionResult>({
      method: "POST",
      path: apiPath`/v1/{account_id}/posts/${postId}/comments/${commentId}/reactions`,
      body,
    });
  }

  /**
   * Remove this account's reaction from a comment, a **DELETE-with-body**:
   * the reaction value to remove travels in the JSON body, not the path.
   * `DELETE /v1/{account_id}/posts/{post_id}/comments/{comment_id}/reactions`
   */
  removeReaction(postId: string, commentId: string, body: RemoveCommentReactionBody): Promise<RemoveCommentReactionResult> {
    return this.ctx.request<RemoveCommentReactionResult>({
      method: "DELETE",
      path: apiPath`/v1/{account_id}/posts/${postId}/comments/${commentId}/reactions`,
      body,
    });
  }
}
