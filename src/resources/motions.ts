/**
 * Motions and Enrollments (root-scoped): `curviate.motions` (13 methods) and
 * `curviate.enrollments` (10 methods).
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
import { CurviateError, KNOWN_ERROR_CODES, type ErrorCode } from "../errors.js";
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
export type EnrollmentEventBody = NonNullable<paths["/v1/enrollments/{id}/events"]["post"]["requestBody"]>["content"]["application/json"];
/** @deprecated Use {@link EnrollmentEventBody} with `enrollments.events`. */
export type EnrollmentSignalBody = NonNullable<paths["/v1/enrollments/{id}/signal"]["post"]["requestBody"]>["content"]["application/json"];
export type EnrollmentReassignBody = NonNullable<paths["/v1/enrollments/{id}/reassign"]["post"]["requestBody"]>["content"]["application/json"];
export type EnrollmentReassignResult = paths["/v1/enrollments/{id}/reassign"]["post"]["responses"]["200"]["content"]["application/json"];
export type EnrollmentBulkBody = NonNullable<paths["/v1/enrollments/bulk"]["post"]["requestBody"]>["content"]["application/json"];
export type EnrollmentBulkResult = paths["/v1/enrollments/bulk"]["post"]["responses"]["200"]["content"]["application/json"];
/** One Enrollment's result in a bulk call; what `enrollments.retry` resolves with. */
export type EnrollmentBulkItem = EnrollmentBulkResult["results"][number];
/** A reason code of the catalogue (skip, finish or Step reasons), as `reason` and the list's `reason` filter carry it. */
export type EnrollmentReason = NonNullable<EnrollmentListParams["reason"]>[number];

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
   * Needs Automate: a Team below that Tier is refused with `TIER_REQUIRED`.
   *
   * Days and hours in `schedule` are read in each sending account's own time
   * zone. `schedule.timezone` and `settings.stop_on_engagement` are retired:
   * accepted with warning W13 until 2027-01-25, never stored or returned
   * (`stop_on_engagement: true` with an acting reply route is a 400).
   * `settings.acceptance_floor` defaults to `null` (off). With
   * `settings.accounts_per_contact` above 1 (Several mode) the settings gain
   * `on_reply_elsewhere` (`stop` or `continue`), `withdraw_on_reply_elsewhere`
   * and `account_gap` (`1d` to `30d`), served only in that mode;
   * `accounts_per_contact` is locked once the Motion has started.
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
   * List Motions. `status` (any of them; default all but `archived`),
   * `account_id` (one or several accounts as a comma list, up to 50: Motions
   * sending from any of them), `q` (name substring), `sort`: `updated`
   * (default, latest edit first) or `activity` (latest step record first,
   * else `updated_at`). Items carry `last_activity_at` (or `null`) but no
   * `sequence`: read it with `get`. Pages with an opaque `cursor` until it is
   * `null`; a cursor belongs to its sort.
   * `GET /v1/motions`
   *
   * @example
   * const { items } = await curviate.motions.list({ status: ["active", "paused"], account_id: "acc_1,acc_2", sort: "activity" });
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
   * change makes a new version; running Enrollments keep theirs. Send
   * `if_sequence_revision` (the `sequence_revision` you read) to refuse the
   * save when someone saved the Sequence since: `SEQUENCE_CONFLICT`, nothing
   * saved, the stored document in `err.current`. Omitted: the last write wins.
   * `PATCH /v1/motions/{id}`
   *
   * Needs Automate: a Team below that Tier is refused with `TIER_REQUIRED`.
   *
   * @example
   * const motion = await curviate.motions.get("mot_123");
   * await curviate.motions.update("mot_123", {
   *   sequence: Sequence.fromDocument(motion.sequence).replace("pause", step.wait("pause", "3d", { next: "end" })),
   *   if_sequence_revision: motion.sequence_revision,
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
   * Needs Automate: a Team below that Tier is refused with `TIER_REQUIRED`.
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
   * Needs Automate: a Team below that Tier is refused with `TIER_REQUIRED`.
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
   *
   * `projection.audience` is `{ total, skipped, to_enroll }`, `skipped`
   * counted per reason (`do_not_contact`, `excluded`, `other_motion`,
   * `known_chat`, `filtered`; a Contact counts under the first that applies);
   * `projection.contacts` equals `to_enroll`. In
   * Several mode `accounts[].contacts` counts Enrollments, not people, and
   * `projection.fits_before_end_at` is counted per account zone.
   * `GET /v1/motions/{id}/preview`
   *
   * @example
   * const { paths, samples, projection } = await curviate.motions.preview("mot_123", { sample: 3 });
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
   * const v1 = await curviate.motions.getSequenceVersion("mot_123", { version: 1 });
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
   * Needs Automate: a Team below that Tier is refused with `TIER_REQUIRED`.
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
   * `account_id` (one or several as a comma list, up to 50), `status` (any of
   * them), `step_id` (at any of these Steps now, up to 10), `version`; by Step outcome: `done_step` with `outcome` (how that Step
   * ended), `reason` (catalogue codes, any of them), `variant_id`,
   * `relationship_at_enrollment` (any of them). Pages with an opaque `cursor`
   * until it is `null`.
   * `GET /v1/enrollments`
   *
   * A finished Enrollment's `finish_reason` may be `engaged_elsewhere`: the
   * Contact replied to, or was messaged from, another account of the Motion
   * (Several mode).
   *
   * @example
   * const { items } = await curviate.enrollments.list({ motion_id: "mot_123", done_step: "opener", outcome: "failed" });
   * const atEither = await curviate.enrollments.list({ motion_id: "mot_123", step_id: ["opener", "bump"] });
   */
  list(params?: EnrollmentListParams): Promise<EnrollmentListPage> {
    return this.ctx.request<EnrollmentListPage>({
      method: "GET",
      path: "/v1/enrollments",
      query: commaLists(params, "status", "reason", "relationship_at_enrollment"),
    });
  }

  /**
   * One Enrollment with its `history` of Steps (metadata only, no rendered
   * text). `history` reaches back 12 months, plus the entries `retry` reads
   * at any age; `history_truncated: true` says older entries are not listed.
   * The Enrollment's state has no such limit.
   * `GET /v1/enrollments/{id}`
   *
   * @example
   * const { history } = await curviate.enrollments.get("enr_123");
   */
  get(enrollmentId: string): Promise<EnrollmentDetail> {
    return this.ctx.request<EnrollmentDetail>({ method: "GET", path: apiPath`/v1/enrollments/${enrollmentId}` });
  }

  /**
   * Stop a `queued`, `active` or `paused` Enrollment (it ends `finished`,
   * `finish_reason: "stopped"`); else `ENROLLMENT_NOT_ACTIVE`.
   * `POST /v1/enrollments/{id}/stop`
   *
   * @example
   * await curviate.enrollments.stop("enr_123");
   */
  stop(enrollmentId: string): Promise<Enrollment> {
    return this.ctx.request<Enrollment>({ method: "POST", path: apiPath`/v1/enrollments/${enrollmentId}/stop` });
  }

  /**
   * Hold one `queued`, `active` or `paused` Enrollment until you `resume` it
   * (`waiting.kind: "paused_by_user"`); its waits freeze. A Step being sent
   * right now is `STEP_IN_FLIGHT`: retry in a minute. Works on every plan.
   * `POST /v1/enrollments/{id}/pause`
   *
   * @example
   * await curviate.enrollments.pause("enr_123");
   */
  pause(enrollmentId: string): Promise<Enrollment> {
    return this.ctx.request<Enrollment>({ method: "POST", path: apiPath`/v1/enrollments/${enrollmentId}/pause` });
  }

  /**
   * Without `at`: lift your own pause; the Enrollment continues where it was,
   * with the time its wait had left. With `at`: an explicit jump to that Step
   * of its Sequence version, `on_reply` re-armed (the out-of-office path).
   * The jump is not guarded: it re-enters the Step you name even when that
   * Step already sent, so a message can go out again. To retry a failed Step,
   * use `enrollments.retry(id)`, which acts only on a failure. Works on
   * `active`, `paused` and most `finished` Enrollments; else
   * `ENROLLMENT_NOT_ACTIVE`.
   * `POST /v1/enrollments/{id}/resume`
   *
   * Needs Automate: a Team below that Tier is refused with `TIER_REQUIRED`.
   *
   * @example
   * await curviate.enrollments.resume("enr_123"); // lift your pause
   * await curviate.enrollments.resume("enr_123", { at: "bump" }); // jump to a Step after an out-of-office reply
   */
  resume(enrollmentId: string, body?: EnrollmentResumeBody): Promise<Enrollment> {
    return this.ctx.request<Enrollment>({ method: "POST", path: apiPath`/v1/enrollments/${enrollmentId}/resume`, body });
  }

  /**
   * Send a custom event to an `active` or `paused` Enrollment whose Sequence
   * waits for it (`until event.<name>`), for example once your agent wrote
   * the researched text to the Contact's custom fields. Input only: fires no
   * webhook. A name no Step of its version awaits is `INVALID_REQUEST`,
   * listing the awaited names.
   * `POST /v1/enrollments/{id}/events`
   *
   * Needs Automate: a Team below that Tier is refused with `TIER_REQUIRED`.
   *
   * @example
   * await curviate.enrollments.events("enr_123", { name: "research_ready" });
   */
  events(enrollmentId: string, body: EnrollmentEventBody): Promise<Enrollment> {
    return this.ctx.request<Enrollment>({ method: "POST", path: apiPath`/v1/enrollments/${enrollmentId}/events`, body });
  }

  /**
   * Move an Enrollment to another sending account of its Motion; it restarts
   * there at the first Step of its Sequence version (one you paused stays
   * paused until you resume it). `warnings` names each Step that will be
   * skipped. Refused, nothing changed, with `ACCOUNT_ALREADY_ENGAGED` (its
   * account already contacted the person beyond a profile view),
   * `ALREADY_ENROLLED_ON_ACCOUNT`, `KNOWN_CHAT` or `STEP_IN_FLIGHT`.
   * `POST /v1/enrollments/{id}/reassign`
   *
   * Needs Automate: a Team below that Tier is refused with `TIER_REQUIRED`.
   *
   * @example
   * const { warnings } = await curviate.enrollments.reassign("enr_123", { account_id: "acc_456" });
   */
  reassign(enrollmentId: string, body: EnrollmentReassignBody): Promise<EnrollmentReassignResult> {
    return this.ctx.request<EnrollmentReassignResult>({ method: "POST", path: apiPath`/v1/enrollments/${enrollmentId}/reassign`, body });
  }

  /**
   * Pause, resume, stop, retry, send an event to or reassign up to 1,000
   * Enrollments, by `ids` or by a `filter` of the list's fields (`motion_id`
   * required). Each is decided alone, as its single call would be, with its
   * own result (`ok`, or `error` with that call's code; a server error on one
   * is `INTERNAL` for it); not atomic. List with the same filter to see the
   * matches first. Below Automate only `pause` and `stop` run.
   * `POST /v1/enrollments/bulk`
   *
   * @example
   * const { results } = await curviate.enrollments.bulk({
   *   action: "retry",
   *   filter: { motion_id: "mot_123", done_step: "opener", outcome: "failed" },
   * });
   */
  bulk(body: EnrollmentBulkBody): Promise<EnrollmentBulkResult> {
    return this.ctx.request<EnrollmentBulkResult>({ method: "POST", path: "/v1/enrollments/bulk", body });
  }

  /**
   * Retry the failed Step of one Enrollment: the guarded Retry. It acts only
   * while that Step's latest outcome is `failed`, so a repeated or looped
   * call never sends a delivered message again. Resolves with the
   * Enrollment's result when it was resumed; otherwise throws its refusal as
   * a `CurviateError` (`NOTHING_TO_RETRY` when nothing failed,
   * `STEP_IN_FLIGHT`, `ENROLLMENT_NOT_ACTIVE`, `RESOURCE_NOT_FOUND`, ...),
   * with no `httpStatus`. Sent as `bulk` with this one id.
   * `POST /v1/enrollments/bulk`
   *
   * Needs Automate: a Team below that Tier is refused with `TIER_REQUIRED`.
   *
   * @example
   * try {
   *   await curviate.enrollments.retry("enr_123");
   * } catch (err) {
   *   if (isCurviateError(err) && err.code === "NOTHING_TO_RETRY") console.log("nothing failed");
   * }
   */
  async retry(enrollmentId: string): Promise<EnrollmentBulkItem> {
    const res = await this.bulk({ action: "retry", ids: [enrollmentId] });
    const item = res.results[0];
    if (item?.outcome === "ok") return item;
    const known = item?.error && KNOWN_ERROR_CODES.has(item.error.code);
    const code = (known ? item.error!.code : "INTERNAL") as ErrorCode;
    throw new CurviateError({
      code,
      message: item?.error?.message ?? `No retry result for ${enrollmentId}.`,
      userFixable: false,
      retryLikelyToSucceed: code === "STEP_IN_FLIGHT",
    });
  }

  /**
   * Deprecated alias of {@link EnrollmentsResource.events}, answered the same
   * plus a `Deprecation` header and warning W13; accepted until 2027-01-19.
   * `POST /v1/enrollments/{id}/signal`
   *
   * Needs Automate: a Team below that Tier is refused with `TIER_REQUIRED`.
   *
   * @deprecated Use `enrollments.events`; `signal` stops working on 2027-01-19.
   *
   * @example
   * await curviate.enrollments.events("enr_123", { name: "demo_booked" }); // instead of signal
   */
  signal(enrollmentId: string, body: EnrollmentSignalBody): Promise<Enrollment> {
    return this.ctx.request<Enrollment>({ method: "POST", path: apiPath`/v1/enrollments/${enrollmentId}/signal`, body });
  }
}
