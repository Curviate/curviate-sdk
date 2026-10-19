/**
 * Motions and Enrollments (root-scoped): `curviate.motions` (13 methods) and
 * `curviate.enrollments` (5 methods).
 *
 * A Motion runs one Sequence (see `Sequence`) for the Contacts of its Contact
 * lists, on its sending accounts, inside its schedule. It is created as a
 * `draft`; `start` moves it to `scheduled` or `active`, then `pause`, `resume`
 * and `archive` (irreversible). Each Contact x Motion x account pair is one
 * Enrollment. An operation the Motion's status does not allow is refused with
 * `MOTION_STATUS_CONFLICT`; one the Enrollment's status does not allow with
 * `ENROLLMENT_NOT_ACTIVE`.
 *
 * Every team role reads. Writes need motion-send on every sending account of
 * the Motion (`INSUFFICIENT_ROLE`, `ACCOUNT_NOT_SHARED`); Enrollment writes
 * need operate on the Enrollment's account. There is no validate or dry-run
 * option: check a Sequence offline with `validateSequence`, read what a Motion
 * would do with `preview`.
 */
import type { RequestContext } from "../internal/context.js";
import type { paths } from "../generated/types.js";
import { apiPath } from "../internal/path.js";
import { commaLists } from "../internal/query.js";
import { Sequence, type ResolvedSequence } from "../sequence/builder.js";
import type { SequenceDocument } from "../sequence/types.js";

// ─── Type aliases from generated OpenAPI snapshot ──────────────────────────

type GenCreateBody = NonNullable<paths["/v1/motions"]["post"]["requestBody"]>["content"]["application/json"];
type GenUpdateBody = NonNullable<paths["/v1/motions/{id}"]["patch"]["requestBody"]>["content"]["application/json"];

export type Motion = paths["/v1/motions/{id}"]["get"]["responses"]["200"]["content"]["application/json"];
export type MotionListParams = NonNullable<paths["/v1/motions"]["get"]["parameters"]["query"]>;
export type MotionListPage = paths["/v1/motions"]["get"]["responses"]["200"]["content"]["application/json"];
export type MotionPreviewParams = NonNullable<paths["/v1/motions/{id}/preview"]["get"]["parameters"]["query"]>;
export type MotionPreview = paths["/v1/motions/{id}/preview"]["get"]["responses"]["200"]["content"]["application/json"];
export type SequenceVersionParams = NonNullable<paths["/v1/motions/{id}/sequence"]["get"]["parameters"]["query"]>;
export type SequenceVersion = paths["/v1/motions/{id}/sequence"]["get"]["responses"]["200"]["content"]["application/json"];
export type MotionAddContactsBody = NonNullable<paths["/v1/motions/{id}/contacts"]["post"]["requestBody"]>["content"]["application/json"];
export type MotionRemoveContactsBody = NonNullable<paths["/v1/motions/{id}/contacts/remove"]["post"]["requestBody"]>["content"]["application/json"];
export type MotionContactsResult = paths["/v1/motions/{id}/contacts"]["post"]["responses"]["200"]["content"]["application/json"];
export type MotionRemoveContactsResult = paths["/v1/motions/{id}/contacts/remove"]["post"]["responses"]["200"]["content"]["application/json"];

export type Enrollment = paths["/v1/enrollments/{id}/stop"]["post"]["responses"]["200"]["content"]["application/json"];
export type EnrollmentDetail = paths["/v1/enrollments/{id}"]["get"]["responses"]["200"]["content"]["application/json"];
export type EnrollmentListParams = NonNullable<paths["/v1/enrollments"]["get"]["parameters"]["query"]>;
export type EnrollmentListPage = paths["/v1/enrollments"]["get"]["responses"]["200"]["content"]["application/json"];
export type EnrollmentResumeBody = NonNullable<paths["/v1/enrollments/{id}/resume"]["post"]["requestBody"]>["content"]["application/json"];
export type EnrollmentSignalBody = NonNullable<paths["/v1/enrollments/{id}/signal"]["post"]["requestBody"]>["content"]["application/json"];

/**
 * What `sequence` takes: a document (sent verbatim, unvalidated), `null`
 * (clears a draft's), or a `Sequence` builder whose every literal target is an
 * added step or `"end"` (converted with `toDocument()` before any request).
 */
export type SequenceInput<Q> = Q extends Sequence<infer S, infer R, infer O> ? ResolvedSequence<S, R, O> : SequenceDocument | null;
// `any` here admits every builder; `SequenceInput` then applies the G13 check.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnySequence = SequenceDocument | null | Sequence<any, any, any>;

export type MotionCreateBody<Q extends AnySequence = SequenceDocument | null> = Omit<GenCreateBody, "sequence"> & { sequence?: Q & SequenceInput<Q> };
export type MotionUpdateBody<Q extends AnySequence = SequenceDocument | null> = Omit<GenUpdateBody, "sequence"> & { sequence?: Q & SequenceInput<Q> };

/** A builder becomes its document here: an invalid one rejects (callers are `async`) before any request. */
function withDocument<B extends { sequence?: unknown }>(body: B): B {
  return body.sequence instanceof Sequence ? { ...body, sequence: (body.sequence as Sequence).toDocument() } : body;
}

// ─── Resource classes ─────────────────────────────────────────────────────────

export class MotionsResource {
  constructor(private readonly ctx: RequestContext) {}

  /**
   * Create a Motion, always as a `draft`. `sequence` takes a `Sequence`
   * builder (an invalid one throws `SEQUENCE_INVALID` and sends nothing) or a
   * document, sent as is: the API validates it whole and answers
   * `SEQUENCE_INVALID` with every error in `err.errors`. For an offline check
   * of hand-written JSON pass `Sequence.fromDocument(json)`.
   * `POST /v1/motions`
   *
   * @example
   * const motion = await curviate.motions.create({
   *   name: "Q4 webinar follow-up",
   *   contact_list_ids: ["cl_123"],
   *   account_ids: ["acc_123"],
   *   sequence: Sequence.create({ on_reply: "end" }).add(step.do("invite", "invite.send", { with: { note: null }, next: "end" })),
   * });
   */
  async create<Q extends AnySequence = SequenceDocument | null>(body: MotionCreateBody<Q>): Promise<Motion> {
    return this.ctx.request<Motion>({ method: "POST", path: "/v1/motions", body: withDocument(body) });
  }

  /**
   * List Motions, most recently updated first. `status` (any of them; default
   * all but `archived`), `account_id`, `q` (name substring). Items carry no
   * `sequence`: read it with `get`. Pages with an opaque `cursor` until it is
   * `null`.
   * `GET /v1/motions`
   *
   * @example
   * const { items } = await curviate.motions.list({ status: ["active", "paused"] });
   */
  list(params?: MotionListParams): Promise<MotionListPage> {
    return this.ctx.request<MotionListPage>({ method: "GET", path: "/v1/motions", query: commaLists(params, "status") });
  }

  /**
   * One Motion with its current `sequence` and lint `warnings`. Load the
   * document into a builder with `Sequence.fromDocument(motion.sequence)`.
   * `GET /v1/motions/{id}`
   *
   * @example
   * const motion = await curviate.motions.get("mot_123");
   */
  get(motionId: string): Promise<Motion> {
    return this.ctx.request<Motion>({ method: "GET", path: apiPath`/v1/motions/${motionId}` });
  }

  /**
   * Change a Motion. Objects (`schedule`, `settings`) merge by key; arrays,
   * `where` and `sequence` replace whole; `null` clears. `sequence` takes a
   * builder or a document, as in `create`. After start, a structural Sequence
   * change makes a new version; running Enrollments keep theirs.
   * `PATCH /v1/motions/{id}`
   *
   * @example
   * const motion = await curviate.motions.get("mot_123");
   * await curviate.motions.update("mot_123", {
   *   sequence: Sequence.fromDocument(motion.sequence).replace("pause", step.wait("pause", "3d", { next: "end" })),
   * });
   */
  async update<Q extends AnySequence = SequenceDocument | null>(motionId: string, body: MotionUpdateBody<Q>): Promise<Motion> {
    return this.ctx.request<Motion>({ method: "PATCH", path: apiPath`/v1/motions/${motionId}`, body: withDocument(body) });
  }

  /**
   * Delete a `draft` Motion with its Sequence versions (bodyless, 204). Any
   * other status is `MOTION_STATUS_CONFLICT`: archive it instead.
   * `DELETE /v1/motions/{id}`
   *
   * @example
   * await curviate.motions.delete("mot_123");
   */
  async delete(motionId: string): Promise<void> {
    // The transport hands a bodyless 204 back as an empty buffer; the contract is `void`.
    await this.ctx.request<unknown>({ method: "DELETE", path: apiPath`/v1/motions/${motionId}` });
  }

  /**
   * Start a `draft`: `scheduled` when `schedule.start_at` is ahead, else
   * `active`. Freezes Sequence version 1. A Motion missing what it needs to
   * run is refused with `MOTION_NOT_STARTABLE`, every gap in `err.errors`.
   * `POST /v1/motions/{id}/start`
   *
   * @example
   * const motion = await curviate.motions.start("mot_123");
   */
  start(motionId: string): Promise<Motion> {
    return this.ctx.request<Motion>({ method: "POST", path: apiPath`/v1/motions/${motionId}/start` });
  }

  /**
   * Pause an `active` or `scheduled` Motion: no Step runs until `resume`.
   * `POST /v1/motions/{id}/pause`
   *
   * @example
   * await curviate.motions.pause("mot_123");
   */
  pause(motionId: string): Promise<Motion> {
    return this.ctx.request<Motion>({ method: "POST", path: apiPath`/v1/motions/${motionId}/pause` });
  }

  /**
   * Resume a `paused` Motion. Runs `start`'s checks again
   * (`MOTION_NOT_STARTABLE`).
   * `POST /v1/motions/{id}/resume`
   *
   * @example
   * await curviate.motions.resume("mot_123");
   */
  resume(motionId: string): Promise<Motion> {
    return this.ctx.request<Motion>({ method: "POST", path: apiPath`/v1/motions/${motionId}/resume` });
  }

  /**
   * Archive a Motion: irreversible; its open Enrollments end
   * (`motion_archived`).
   * `POST /v1/motions/{id}/archive`
   *
   * @example
   * await curviate.motions.archive("mot_123");
   */
  archive(motionId: string): Promise<Motion> {
    return this.ctx.request<Motion>({ method: "POST", path: apiPath`/v1/motions/${motionId}/archive` });
  }

  /**
   * What the Motion would do, in any status: every path through the
   * Sequence, rendered messages for `sample` Contacts (1 to 20, default 5) or
   * the `contact_ids` you name (up to 20, not with `sample`), and the budget
   * projection. A read: never reaches LinkedIn, spends nothing.
   * `GET /v1/motions/{id}/preview`
   *
   * @example
   * const { paths, samples, projection } = await curviate.motions.preview("mot_123", { sample: "3" });
   */
  preview(motionId: string, params?: MotionPreviewParams): Promise<MotionPreview> {
    return this.ctx.request<MotionPreview>({
      method: "GET",
      path: apiPath`/v1/motions/${motionId}/preview`,
      query: commaLists(params, "contact_ids"),
    });
  }

  /**
   * One Sequence version of a Motion: `document`, and how many Enrollments
   * still run on it. Default: the current version.
   * `GET /v1/motions/{id}/sequence`
   *
   * @example
   * const v1 = await curviate.motions.getSequenceVersion("mot_123", { version: "1" });
   * const builder = Sequence.fromDocument(v1.document);
   */
  getSequenceVersion(motionId: string, params?: SequenceVersionParams): Promise<SequenceVersion> {
    return this.ctx.request<SequenceVersion>({
      method: "GET",
      path: apiPath`/v1/motions/${motionId}/sequence`,
      query: params,
    });
  }

  /**
   * Enroll Contacts directly (up to 1,000), on an `account_id` of the Motion
   * or one Curviate assigns. Every exclusion and `where` rule applies; each
   * Contact's `outcome` says what happened (`queued`, `already_enrolled`,
   * `filtered_out`, ...). Not on an `archived` Motion.
   * `POST /v1/motions/{id}/contacts`
   *
   * @example
   * const { results } = await curviate.motions.addContacts("mot_123", { contact_ids: ["con_123"] });
   */
  addContacts(motionId: string, body: MotionAddContactsBody): Promise<MotionContactsResult> {
    return this.ctx.request<MotionContactsResult>({ method: "POST", path: apiPath`/v1/motions/${motionId}/contacts`, body });
  }

  /**
   * Take Contacts out of the Motion (up to 1,000): their open Enrollments end
   * (`removed`).
   * `POST /v1/motions/{id}/contacts/remove`
   *
   * @example
   * await curviate.motions.removeContacts("mot_123", { contact_ids: ["con_123"] });
   */
  removeContacts(motionId: string, body: MotionRemoveContactsBody): Promise<MotionRemoveContactsResult> {
    return this.ctx.request<MotionRemoveContactsResult>({
      method: "POST",
      path: apiPath`/v1/motions/${motionId}/contacts/remove`,
      body,
    });
  }
}

export class EnrollmentsResource {
  constructor(private readonly ctx: RequestContext) {}

  /**
   * List Enrollments, newest first. Filters: `motion_id`, `contact_id`,
   * `account_id`, `status` (any of them), `step_id`. Pages with an opaque
   * `cursor` until it is `null`.
   * `GET /v1/enrollments`
   *
   * @example
   * const { items } = await curviate.enrollments.list({ motion_id: "mot_123", status: ["active"] });
   */
  list(params?: EnrollmentListParams): Promise<EnrollmentListPage> {
    return this.ctx.request<EnrollmentListPage>({ method: "GET", path: "/v1/enrollments", query: commaLists(params, "status") });
  }

  /**
   * One Enrollment with its `history` of Steps (metadata only, no rendered
   * text).
   * `GET /v1/enrollments/{id}`
   *
   * @example
   * const { history } = await curviate.enrollments.get("enr_123");
   */
  get(enrollmentId: string): Promise<EnrollmentDetail> {
    return this.ctx.request<EnrollmentDetail>({ method: "GET", path: apiPath`/v1/enrollments/${enrollmentId}` });
  }

  /**
   * Stop a `pending`, `active` or `paused` Enrollment (`finished`,
   * `stopped`); else `ENROLLMENT_NOT_ACTIVE`.
   * `POST /v1/enrollments/{id}/stop`
   *
   * @example
   * await curviate.enrollments.stop("enr_123");
   */
  stop(enrollmentId: string): Promise<Enrollment> {
    return this.ctx.request<Enrollment>({ method: "POST", path: apiPath`/v1/enrollments/${enrollmentId}/stop` });
  }

  /**
   * Continue an Enrollment at Step `at` of its Sequence version, `on_reply`
   * re-armed: the out-of-office path. Works on `active`, `paused` and most
   * `finished` Enrollments; else `ENROLLMENT_NOT_ACTIVE`.
   * `POST /v1/enrollments/{id}/resume`
   *
   * @example
   * await curviate.enrollments.resume("enr_123", { at: "bump" });
   */
  resume(enrollmentId: string, body: EnrollmentResumeBody): Promise<Enrollment> {
    return this.ctx.request<Enrollment>({ method: "POST", path: apiPath`/v1/enrollments/${enrollmentId}/resume`, body });
  }

  /**
   * Send the signal a Step waits for (`until signal.<name>`), on an `active`
   * or `paused` Enrollment. A name no Step of its version awaits is
   * `INVALID_REQUEST`, listing the awaited names.
   * `POST /v1/enrollments/{id}/signal`
   *
   * @example
   * await curviate.enrollments.signal("enr_123", { name: "demo_booked" });
   */
  signal(enrollmentId: string, body: EnrollmentSignalBody): Promise<Enrollment> {
    return this.ctx.request<Enrollment>({ method: "POST", path: apiPath`/v1/enrollments/${enrollmentId}/signal`, body });
  }
}
