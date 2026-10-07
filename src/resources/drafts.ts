/**
 * Drafts resource: 7 methods (root-scoped).
 *
 * A Draft is a stored, editable, unpublished post. Give it an account and a
 * `scheduled_at` and Curviate publishes it for you at that time. Scheduling
 * never changes the id, so one Draft is one object from first save to publish.
 *
 * Root-scoped like `webhooks`: a Draft's account is optional, so there is no
 * `account_id` path segment. `account_id` is a field of the Draft.
 *
 * `POST /v1/{account_id}/posts` (`posts.create`) publishes immediately and does
 * not schedule. To schedule, create a Draft with `scheduled_at`.
 *
 * `delete` resolves with nothing (the API answers 204). `list` returns Drafts
 * and, with `status: ["published"]`, publish records (never Drafts).
 */
import type { RequestContext } from "../internal/context.js";
import type { paths } from "../generated/types.js";
import { apiPath } from "../internal/path.js";

// ─── Type aliases from generated OpenAPI snapshot ──────────────────────────

export type DraftCreateBody =
  paths["/v1/drafts"]["post"]["requestBody"]["content"]["application/json"];
export type DraftCreateResult =
  paths["/v1/drafts"]["post"]["responses"]["201"]["content"]["application/json"];

export type DraftListParams = NonNullable<paths["/v1/drafts"]["get"]["parameters"]["query"]>;
export type DraftListResult =
  paths["/v1/drafts"]["get"]["responses"]["200"]["content"]["application/json"];

export type DraftGetResult =
  paths["/v1/drafts/{id}"]["get"]["responses"]["200"]["content"]["application/json"];

export type DraftUpdateBody =
  paths["/v1/drafts/{id}"]["patch"]["requestBody"]["content"]["application/json"];
export type DraftUpdateResult =
  paths["/v1/drafts/{id}"]["patch"]["responses"]["200"]["content"]["application/json"];

/** Delete-draft resolves with nothing: the API answers 204 with no body. */
export type DraftDeleteResult = void;

export type DraftPublishResult =
  paths["/v1/drafts/{id}/publish"]["post"]["responses"]["201"]["content"]["application/json"];

/** The file types the upload route accepts as the raw body. */
export type DraftAttachmentContentType = keyof NonNullable<
  paths["/v1/drafts/{id}/attachments"]["post"]["requestBody"]
>["content"];
export type DraftUploadResult =
  paths["/v1/drafts/{id}/attachments"]["post"]["responses"]["201"]["content"]["application/json"];

/** Options for {@link DraftsResource.uploadAttachment}. */
export interface DraftUploadOptions {
  /** The file's name, kept with the attachment. 1 to 255 characters. */
  filename: string;
  /**
   * The file's type. Optional when `data` is a `Blob`/`File` that carries one.
   * Anything outside {@link DraftAttachmentContentType} is refused with
   * `415 UNSUPPORTED_MEDIA_TYPE`.
   */
  contentType?: DraftAttachmentContentType;
}

// ─── Resource class ───────────────────────────────────────────────────────────

export class DraftsResource {
  constructor(protected readonly ctx: RequestContext) {}

  /**
   * Store a Draft. Every field is optional, `account_id` and `text` included.
   * `POST /v1/drafts`
   *
   * With `scheduled_at` (ISO 8601 with offset, between 5 minutes and 365 days
   * ahead) the Draft is scheduled in the same call and needs an account and
   * publishable text. Up to 50 Drafts and 2 GiB of media per account, and per
   * no-account. A retry creates a second Draft.
   *
   * @example
   * const draft = await curviate.drafts.create({
   *   account_id: "acc_01J8Z3K9P0Q1R2S3T4V5W6X7Y8",
   *   text: "Three things we learned shipping our first agent integration.",
   *   scheduled_at: "2026-10-12T09:00:00+02:00",
   * });
   * // draft.status === "scheduled"
   */
  create(body: DraftCreateBody = {}): Promise<DraftCreateResult> {
    return this.ctx.request<DraftCreateResult>({
      method: "POST",
      path: "/v1/drafts",
      body,
    });
  }

  /**
   * List Drafts, cursor-paginated. `GET /v1/drafts`
   *
   * `status` defaults to `["draft", "scheduled", "failed"]`; add `"published"`
   * to include publish records (`object: "publish_record"`, never Drafts).
   * `account_id` is an `acc_` id or `"none"`. `from`/`to` are a half-open
   * `[from, to)` range on each item's own date.
   *
   * @example
   * const page = await curviate.drafts.list({ status: ["scheduled"], order: "asc" });
   */
  list(params?: DraftListParams): Promise<DraftListResult> {
    // The API takes `status` as one comma-separated value; the typed array is joined here.
    const { status, ...rest } = params ?? {};
    return this.ctx.request<DraftListResult>({
      method: "GET",
      path: "/v1/drafts",
      query: { ...rest, ...(status !== undefined ? { status: status.join(",") } : {}) },
    });
  }

  /**
   * Return one Draft, with a fresh signed link (valid 1 hour) per attachment.
   * `GET /v1/drafts/{id}`
   *
   * @example
   * const draft = await curviate.drafts.get("drf_01J8Z3K9P0Q1R2S3T4V5W6X7Y8");
   */
  get(id: string): Promise<DraftGetResult> {
    return this.ctx.request<DraftGetResult>({
      method: "GET",
      path: apiPath`/v1/drafts/${id}`,
    });
  }

  /**
   * Partial update: an omitted field is left as is, `null` clears it.
   * `PATCH /v1/drafts/{id}`
   *
   * `attachments` replaces the whole list (`{ id }` keeps a file, a base64
   * object adds one, anything left out is deleted). `scheduled_at` schedules,
   * reschedules or, with `null`, unschedules. Editing a `failed` Draft clears
   * its `failure`. A Draft being published answers `409 DRAFT_PUBLISHING`.
   *
   * @example
   * await curviate.drafts.update(id, { scheduled_at: null }); // unschedule
   */
  update(id: string, body: DraftUpdateBody): Promise<DraftUpdateResult> {
    return this.ctx.request<DraftUpdateResult>({
      method: "PATCH",
      path: apiPath`/v1/drafts/${id}`,
      body,
    });
  }

  /**
   * Delete the Draft and its stored media (bodyless, 204).
   * `DELETE /v1/drafts/{id}`
   *
   * @example
   * await curviate.drafts.delete(id);
   */
  async delete(id: string): Promise<DraftDeleteResult> {
    // The transport hands a bodyless 204 back as an empty buffer; the contract is `void`.
    await this.ctx.request<unknown>({
      method: "DELETE",
      path: apiPath`/v1/drafts/${id}`,
    });
  }

  /**
   * Publish the Draft now, under the same rules and safety limits as
   * `posts.create`. `POST /v1/drafts/{id}/publish`
   *
   * Success deletes the Draft and its media, writes a publish record and
   * returns `{ object: "post_created", id }`; no webhook is sent. A known
   * failure leaves the Draft unchanged. A `504` or `502` whose message says
   * the outcome is unknown means the post may be live: check the account's
   * posts before retrying.
   *
   * @example
   * const { id: postId } = await curviate.drafts.publish(draftId);
   */
  publish(id: string): Promise<DraftPublishResult> {
    return this.ctx.request<DraftPublishResult>({
      method: "POST",
      path: apiPath`/v1/drafts/${id}/publish`,
    });
  }

  /**
   * Add one file to the Draft as the raw request body, for media too large to
   * send inline (a video or PDF up to 50 MiB, or an image). One file per call.
   * `POST /v1/drafts/{id}/attachments?filename=...`
   *
   * Small files (up to 5 MiB) can instead ride inline in `create` / `update`
   * as base64. Resolves with the Draft, the new attachment last.
   *
   * @example
   * const bytes = await readFile("clip.mp4");
   * const draft = await curviate.drafts.uploadAttachment(id, bytes, {
   *   filename: "clip.mp4",
   *   contentType: "video/mp4",
   * });
   */
  uploadAttachment(
    id: string,
    data: Blob | ArrayBuffer | Uint8Array,
    options: DraftUploadOptions,
  ): Promise<DraftUploadResult> {
    const contentType = options.contentType ?? (data instanceof Blob ? data.type : "");
    return this.ctx.request<DraftUploadResult>({
      method: "POST",
      path: apiPath`/v1/drafts/${id}/attachments`,
      query: { filename: options.filename },
      rawBody: { data, contentType },
    });
  }
}
