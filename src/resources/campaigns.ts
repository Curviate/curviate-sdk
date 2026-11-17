/**
 * Campaigns and Enrollments (root-scoped): `curviate.campaigns` (13 methods, plus
 * `voiceClips` with 2) and `curviate.enrollments` (10 methods).
 *
 * A Campaign runs one Sequence (see `Sequence`) for the Leads of its Lead
 * lists, on its sending accounts, inside its schedule. It is created as a
 * `draft`; `start` moves it to `scheduled` or `active`, then `pause`, `resume`
 * and `archive` (irreversible). Each Lead x Campaign x account pair is one
 * Enrollment. An operation the Campaign's status does not allow is refused with
 * `CAMPAIGN_STATUS_CONFLICT`; one the Enrollment's status does not allow with
 * `ENROLLMENT_NOT_ACTIVE`.
 *
 * Every team role reads. Writes need campaign-send on every sending account of
 * the Campaign (`INSUFFICIENT_ROLE`, `ACCOUNT_NOT_SHARED`); Enrollment writes
 * need operate on the Enrollment's account. There is no validate or dry-run
 * option: check a Sequence offline with `validateSequence`, read what a Campaign
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

type GenCreateBody = NonNullable<paths["/v1/campaigns"]["post"]["requestBody"]>["content"]["application/json"];
type GenUpdateBody = NonNullable<paths["/v1/campaigns/{id}"]["patch"]["requestBody"]>["content"]["application/json"];

export type Campaign = paths["/v1/campaigns/{id}"]["get"]["responses"]["200"]["content"]["application/json"];
export type CampaignListParams = NonNullable<paths["/v1/campaigns"]["get"]["parameters"]["query"]>;
export type CampaignListPage = paths["/v1/campaigns"]["get"]["responses"]["200"]["content"]["application/json"];
export type CampaignPreviewParams = NonNullable<paths["/v1/campaigns/{id}/preview"]["get"]["parameters"]["query"]>;
export type CampaignPreview = paths["/v1/campaigns/{id}/preview"]["get"]["responses"]["200"]["content"]["application/json"];
export type SequenceVersionParams = NonNullable<paths["/v1/campaigns/{id}/sequence"]["get"]["parameters"]["query"]>;
export type SequenceVersion = paths["/v1/campaigns/{id}/sequence"]["get"]["responses"]["200"]["content"]["application/json"];
export type CampaignAddLeadsBody = NonNullable<paths["/v1/campaigns/{id}/leads"]["post"]["requestBody"]>["content"]["application/json"];
export type CampaignRemoveLeadsBody = NonNullable<paths["/v1/campaigns/{id}/leads/remove"]["post"]["requestBody"]>["content"]["application/json"];
export type CampaignLeadsResult = paths["/v1/campaigns/{id}/leads"]["post"]["responses"]["200"]["content"]["application/json"];
export type CampaignRemoveLeadsResult = paths["/v1/campaigns/{id}/leads/remove"]["post"]["responses"]["200"]["content"]["application/json"];

/** The audio types the upload route lists for its raw body. The API does not read the type: the decoder decides. */
export type VoiceClipContentType = keyof NonNullable<paths["/v1/campaigns/voice-clips"]["post"]["requestBody"]>["content"];
/** A stored Voice clip: `id` (`vc_...`) is the `clip_id` of a `voice.send` step. */
export type VoiceClip = paths["/v1/campaigns/voice-clips"]["post"]["responses"]["201"]["content"]["application/json"];

/** Options for {@link VoiceClipsResource.upload}. */
export interface VoiceClipUploadOptions {
  /** The file's name, kept with the clip. 1 to 255 characters, no `/` or `\`. */
  filename: string;
  /** The file's type. Optional: a `Blob`'s own type, else taken from the filename's extension. */
  contentType?: VoiceClipContentType;
}

const AUDIO_BY_EXTENSION: Record<string, VoiceClipContentType> = {
  mp3: "audio/mpeg", wav: "audio/wav", m4a: "audio/mp4", mp4: "audio/mp4", webm: "audio/webm", ogg: "audio/ogg", oga: "audio/ogg",
};

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

export type CampaignCreateBody<Q extends AnySequence = SequenceDocument | null> = Omit<GenCreateBody, "sequence"> & { sequence?: Q & SequenceInput<Q> };
export type CampaignUpdateBody<Q extends AnySequence = SequenceDocument | null> = Omit<GenUpdateBody, "sequence"> & { sequence?: Q & SequenceInput<Q> };

/** A builder becomes its document here: an invalid one rejects (callers are `async`) before any request. */
function withDocument<B extends { sequence?: unknown }>(body: B): B {
  return body.sequence instanceof Sequence ? { ...body, sequence: (body.sequence as Sequence).toDocument() } : body;
}

// ─── Resource classes ─────────────────────────────────────────────────────────

/** `curviate.campaigns.voiceClips`: the audio a `voice.send` step plays. */
export class VoiceClipsResource {
  constructor(private readonly ctx: RequestContext) {}

  /**
   * Upload one audio file (MP3, WAV, M4A, WebM or Ogg) as the raw request body
   * and resolve with the stored clip; its `id` is the `clip_id` of a
   * `voice.send` step. The file is converted once to a voice note format and
   * the original is not kept. `Content-Length` is sent (a chunked upload is
   * refused with `411`), so pass the bytes, not a stream.
   * `POST /v1/campaigns/voice-clips?filename=...`
   *
   * Needs Automate: a Team below that Tier is refused with `TIER_REQUIRED`.
   *
   * Limits: 1 to 120 seconds (a clip is never shortened: otherwise
   * `VOICE_CLIP_INVALID`, 422, naming the reason), up to 20 MiB
   * (`PAYLOAD_TOO_LARGE`, 413), 100 uploads per Team per 24 hours
   * (`RATE_LIMIT_TENANT`, 429, `Retry-After` is the wait). A retry stores a
   * second clip. A clip no Sequence version uses is deleted 30 days after its
   * upload.
   *
   * @example
   * const bytes = await readFile("intro.mp3");
   * const clip = await curviate.campaigns.voiceClips.upload(bytes, { filename: "intro.mp3" });
   * // step.do("voice", "voice.send", { with: { clip_id: clip.id, fallback: "Hi, thanks for connecting." } })
   */
  upload(data: Blob | ArrayBuffer | Uint8Array, options: VoiceClipUploadOptions): Promise<VoiceClip> {
    const ext = options.filename.split(".").pop()?.toLowerCase() ?? "";
    const contentType = options.contentType ?? ((data instanceof Blob && data.type) || AUDIO_BY_EXTENSION[ext] || "application/octet-stream");
    return this.ctx.request<VoiceClip>({
      method: "POST",
      path: "/v1/campaigns/voice-clips",
      query: { filename: options.filename },
      rawBody: { data, contentType },
    });
  }

  /**
   * One clip: `id`, `duration_ms`, `bytes`, `filename`, `created_at`. No
   * download link. Another Team's id is `RESOURCE_NOT_FOUND`, the same as an
   * unknown one. Reads pass below Automate, as every Campaign read.
   * `GET /v1/campaigns/voice-clips/{id}`
   *
   * @example
   * const clip = await curviate.campaigns.voiceClips.get("vc_01J8Z3K9P0Q1R2S3T4V5W6X7Y8");
   */
  get(clipId: string): Promise<VoiceClip> {
    return this.ctx.request<VoiceClip>({ method: "GET", path: apiPath`/v1/campaigns/voice-clips/${clipId}` });
  }
}

export class CampaignsResource {
  /** Voice clips for `voice.send` steps. */
  readonly voiceClips: VoiceClipsResource;

  constructor(private readonly ctx: RequestContext) {
    this.voiceClips = new VoiceClipsResource(ctx);
  }

  /**
   * Create a Campaign, always as a `draft`. `sequence` takes a `Sequence`
   * builder (an invalid one throws `SEQUENCE_INVALID` and sends nothing) or a
   * document, sent as is: the API validates it whole and answers
   * `SEQUENCE_INVALID` with every error in `err.errors`. For an offline check
   * of hand-written JSON pass `Sequence.fromDocument(json)`.
   * `POST /v1/campaigns`
   *
   * Needs Automate: a Team below that Tier is refused with `TIER_REQUIRED`.
   *
   * Days and hours in `schedule` are read in each sending account's own time
   * zone. `schedule.timezone` and `settings.stop_on_engagement` are retired:
   * accepted with warning W13 until 2027-01-25, never stored or returned
   * (`stop_on_engagement: true` with an acting reply route is a 400).
   * `settings.acceptance_floor` defaults to `null` (off). With
   * `settings.accounts_per_lead` above 1 (Several mode) the settings gain
   * `on_reply_elsewhere` (`stop` or `continue`), `withdraw_on_reply_elsewhere`
   * and `account_gap` (`1d` to `30d`), served only in that mode;
   * `accounts_per_lead` is locked once the Campaign has started.
   *
   * `settings.priority` (`normal`, the default, or `prioritized`) is the
   * Campaign's weight in each sending account's budgets: `normal` weighs 1,
   * `prioritized` 1.5, on every budget. Every Campaign with work due still
   * progresses, a limit is never exceeded, and a share nobody uses flows to
   * the others the same day. Curviate paces all Campaigns on an account against
   * one budget, so there is no per-Campaign start cap. `settings.new_enrollments_per_account_per_day`
   * and `settings.assign: "even"` are retired: accepted and ignored until
   * 2027-01-28 with a `SETTING_REMOVED` entry in `notices[]` and
   * `Deprecation: true`, never returned, then a `400`. A pending Enrollment
   * waits unassigned (`account_id: null`) until an account with room takes it.
   *
   * @example
   * const campaign = await curviate.campaigns.create({
   *   name: "Q4 webinar follow-up",
   *   lead_list_ids: ["cl_123"],
   *   account_ids: ["acc_123"],
   *   sequence: Sequence.create({ on_reply: "end" }).add(step.do("invite", "invite.send", { with: { note: null }, next: "end" })),
   * });
   */
  async create<Q extends AnySequence = SequenceDocument | null>(body: CampaignCreateBody<Q>): Promise<Campaign> {
    return this.ctx.request<Campaign>({ method: "POST", path: "/v1/campaigns", body: withDocument(body) });
  }

  /**
   * List Campaigns. `status` (any of them; default all but `archived`),
   * `account_id` (one or several accounts as a comma list, up to 50: Campaigns
   * sending from any of them), `q` (name substring), `sort`: `updated`
   * (default, latest edit first) or `activity` (latest step record first,
   * else `updated_at`). Items carry `last_activity_at` (or `null`) but no
   * `sequence`: read it with `get`. Pages with an opaque `cursor` until it is
   * `null`; a cursor belongs to its sort.
   * `GET /v1/campaigns`
   *
   * @example
   * const { items } = await curviate.campaigns.list({ status: ["active", "paused"], account_id: "acc_1,acc_2", sort: "activity" });
   */
  list(params?: CampaignListParams): Promise<CampaignListPage> {
    return this.ctx.request<CampaignListPage>({ method: "GET", path: "/v1/campaigns", query: commaLists(params, "status") });
  }

  /**
   * One Campaign with its current `sequence` and lint `warnings`. Load the
   * document into a builder with `Sequence.fromDocument(campaign.sequence)`.
   * `GET /v1/campaigns/{id}`
   *
   * @example
   * const campaign = await curviate.campaigns.get("mot_123");
   */
  get(campaignId: string): Promise<Campaign> {
    return this.ctx.request<Campaign>({ method: "GET", path: apiPath`/v1/campaigns/${campaignId}` });
  }

  /**
   * Change a Campaign. Objects (`schedule`, `settings`) merge by key; arrays,
   * `where` and `sequence` replace whole; `null` clears. `sequence` takes a
   * builder or a document, as in `create`. After start, a structural Sequence
   * change makes a new version; running Enrollments keep theirs. Send
   * `if_sequence_revision` (the `sequence_revision` you read) to refuse the
   * save when someone saved the Sequence since: `SEQUENCE_CONFLICT`, nothing
   * saved, the stored document in `err.current`. Omitted: the last write wins.
   * `PATCH /v1/campaigns/{id}`
   *
   * Needs Automate: a Team below that Tier is refused with `TIER_REQUIRED`.
   *
   * @example
   * const campaign = await curviate.campaigns.get("mot_123");
   * await curviate.campaigns.update("mot_123", {
   *   sequence: Sequence.fromDocument(campaign.sequence).replace("pause", step.wait("pause", "3d", { next: "end" })),
   *   if_sequence_revision: campaign.sequence_revision,
   * });
   */
  async update<Q extends AnySequence = SequenceDocument | null>(campaignId: string, body: CampaignUpdateBody<Q>): Promise<Campaign> {
    return this.ctx.request<Campaign>({ method: "PATCH", path: apiPath`/v1/campaigns/${campaignId}`, body: withDocument(body) });
  }

  /**
   * Delete a `draft` Campaign with its Sequence versions (bodyless, 204). Any
   * other status is `CAMPAIGN_STATUS_CONFLICT`: archive it instead.
   * `DELETE /v1/campaigns/{id}`
   *
   * @example
   * await curviate.campaigns.delete("mot_123");
   */
  async delete(campaignId: string): Promise<void> {
    // The transport hands a bodyless 204 back as an empty buffer; the contract is `void`.
    await this.ctx.request<unknown>({ method: "DELETE", path: apiPath`/v1/campaigns/${campaignId}` });
  }

  /**
   * Start a `draft`: `scheduled` when `schedule.start_at` is ahead, else
   * `active`. Freezes Sequence version 1. A Campaign missing what it needs to
   * run is refused with `CAMPAIGN_NOT_STARTABLE`, every gap in `err.errors`.
   * `POST /v1/campaigns/{id}/start`
   *
   * Needs Automate: a Team below that Tier is refused with `TIER_REQUIRED`.
   *
   * @example
   * const campaign = await curviate.campaigns.start("mot_123");
   */
  start(campaignId: string): Promise<Campaign> {
    return this.ctx.request<Campaign>({ method: "POST", path: apiPath`/v1/campaigns/${campaignId}/start` });
  }

  /**
   * Pause an `active` or `scheduled` Campaign: no Step runs until `resume`.
   * `POST /v1/campaigns/{id}/pause`
   *
   * @example
   * await curviate.campaigns.pause("mot_123");
   */
  pause(campaignId: string): Promise<Campaign> {
    return this.ctx.request<Campaign>({ method: "POST", path: apiPath`/v1/campaigns/${campaignId}/pause` });
  }

  /**
   * Resume a `paused` Campaign. Runs `start`'s checks again
   * (`CAMPAIGN_NOT_STARTABLE`).
   * `POST /v1/campaigns/{id}/resume`
   *
   * Needs Automate: a Team below that Tier is refused with `TIER_REQUIRED`.
   *
   * @example
   * await curviate.campaigns.resume("mot_123");
   */
  resume(campaignId: string): Promise<Campaign> {
    return this.ctx.request<Campaign>({ method: "POST", path: apiPath`/v1/campaigns/${campaignId}/resume` });
  }

  /**
   * Archive a Campaign: irreversible; its open Enrollments end
   * (`campaign_archived`).
   * `POST /v1/campaigns/{id}/archive`
   *
   * @example
   * await curviate.campaigns.archive("mot_123");
   */
  archive(campaignId: string): Promise<Campaign> {
    return this.ctx.request<Campaign>({ method: "POST", path: apiPath`/v1/campaigns/${campaignId}/archive` });
  }

  /**
   * What the Campaign would do, in any status: every path through the
   * Sequence, rendered messages for `sample` Leads (1 to 20, default 5) or
   * the `lead_ids` you name (up to 20, not with `sample`), and the budget
   * projection. A read: never reaches LinkedIn, spends nothing.
   *
   * `projection.audience` is `{ total, skipped, to_enroll }`, `skipped`
   * counted per reason (`do_not_contact`, `excluded`, `other_campaign`,
   * `known_chat`, `pending_invite`, `filtered`, `not_connected`; a Lead
   * counts under the first that applies);
   * `projection.leads` equals `to_enroll`. `projection.accounts[]` names the
   * pool that binds each account's pace (`binding`), its
   * `expected_actions_per_day` (a draft: the mean daily invitations, messages
   * and InMails of the first 7 days of its forecast, as if turned on now; a
   * started Campaign: an upper estimate at that pace) and `projection.warnings[]`
   * (`hours_below_share`, `no_sending_account`: no account of the Campaign can
   * send its InMail step). There is no `daily_cap`. In
   * Several mode `accounts[].leads` counts Enrollments, not people, and
   * `projection.fits_before_end_at` is counted per account zone.
   * `GET /v1/campaigns/{id}/preview`
   *
   * @example
   * const { paths, samples, projection } = await curviate.campaigns.preview("mot_123", { sample: 3 });
   */
  preview(campaignId: string, params?: CampaignPreviewParams): Promise<CampaignPreview> {
    return this.ctx.request<CampaignPreview>({
      method: "GET",
      path: apiPath`/v1/campaigns/${campaignId}/preview`,
      query: commaLists(params, "lead_ids"),
    });
  }

  /**
   * One Sequence version of a Campaign: `document`, and how many Enrollments
   * still run on it. Default: the current version.
   * `GET /v1/campaigns/{id}/sequence`
   *
   * @example
   * const v1 = await curviate.campaigns.getSequenceVersion("mot_123", { version: 1 });
   * const builder = Sequence.fromDocument(v1.document);
   */
  getSequenceVersion(campaignId: string, params?: SequenceVersionParams): Promise<SequenceVersion> {
    return this.ctx.request<SequenceVersion>({
      method: "GET",
      path: apiPath`/v1/campaigns/${campaignId}/sequence`,
      query: params,
    });
  }

  /**
   * Enroll Leads directly (up to 1,000), on an `account_id` of the Campaign
   * or one Curviate assigns. Every exclusion and `where` rule applies; each
   * Lead's `outcome` says what happened (`queued`, `already_enrolled`,
   * `filtered_out`, ...). Not on an `archived` Campaign.
   * `POST /v1/campaigns/{id}/leads`
   *
   * Needs Automate: a Team below that Tier is refused with `TIER_REQUIRED`.
   *
   * @example
   * const { results } = await curviate.campaigns.addLeads("mot_123", { lead_ids: ["con_123"] });
   */
  addLeads(campaignId: string, body: CampaignAddLeadsBody): Promise<CampaignLeadsResult> {
    return this.ctx.request<CampaignLeadsResult>({ method: "POST", path: apiPath`/v1/campaigns/${campaignId}/leads`, body });
  }

  /**
   * Take Leads out of the Campaign (up to 1,000): their open Enrollments end
   * (`removed`).
   * `POST /v1/campaigns/{id}/leads/remove`
   *
   * @example
   * await curviate.campaigns.removeLeads("mot_123", { lead_ids: ["con_123"] });
   */
  removeLeads(campaignId: string, body: CampaignRemoveLeadsBody): Promise<CampaignRemoveLeadsResult> {
    return this.ctx.request<CampaignRemoveLeadsResult>({
      method: "POST",
      path: apiPath`/v1/campaigns/${campaignId}/leads/remove`,
      body,
    });
  }
}

export class EnrollmentsResource {
  constructor(private readonly ctx: RequestContext) {}

  /**
   * List Enrollments, newest first. Filters: `campaign_id`, `lead_id`,
   * `account_id` (one or several as a comma list, up to 50), `status` (any of
   * them), `step_id` (at any of these Steps now, up to 10), `version`; by Step outcome: `done_step` with `outcome` (how that Step
   * ended), `reason` (catalogue codes, any of them), `variant_id`,
   * `relationship_at_enrollment` (any of them). Pages with an opaque `cursor`
   * until it is `null`.
   * `GET /v1/enrollments`
   *
   * A finished Enrollment's `finish_reason` may be `engaged_elsewhere`: the
   * Lead replied to, or was messaged from, another account of the Campaign
   * (Several mode).
   *
   * @example
   * const { items } = await curviate.enrollments.list({ campaign_id: "mot_123", done_step: "opener", outcome: "failed" });
   * const atEither = await curviate.enrollments.list({ campaign_id: "mot_123", step_id: ["opener", "bump"] });
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
   * The Enrollment's state has no such limit. `values` are what the
   * Sequence's `save` maps took from an incoming event (name to value; read
   * them as `{{enrollment.<name>}}` and `if enrollment.<name>`); they are
   * empty once it finishes, and after a resume.
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
   * the researched text to the Lead's custom fields. Input only: fires no
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
   * Move an Enrollment to another sending account of its Campaign; it restarts
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
   * Enrollments, by `ids` or by a `filter` of the list's fields (`campaign_id`
   * required). Each is decided alone, as its single call would be, with its
   * own result (`ok`, or `error` with that call's code; a server error on one
   * is `INTERNAL` for it); not atomic. List with the same filter to see the
   * matches first. Below Automate only `pause` and `stop` run.
   * `POST /v1/enrollments/bulk`
   *
   * @example
   * const { results } = await curviate.enrollments.bulk({
   *   action: "retry",
   *   filter: { campaign_id: "mot_123", done_step: "opener", outcome: "failed" },
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
