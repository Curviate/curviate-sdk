/**
 * Recruiter resource: 23 methods (tier: recruiter), project-centric rebuild.
 *
 * Account-scoped: the bound context injects `account_id` as the leading
 * `/v1/` path segment on every request (account-first grammar), never a
 * query param, never a body field. Recruiter methods are verb-first.
 *
 * `startChat` is JSON-only (`application/json`), `signature` and `subject`
 * are REQUIRED for the InMail-based Recruiter surface; optional file / voice /
 * video attachments ride the body as base64-encoded objects (no multipart).
 * `searchParameters` is a POST with a `source`-discriminated oneOf body.
 * `createJob` opens a brand-new project (`project_name` required); the
 * project-scoped `createProjectJob` omits `project_name` (the project is in
 * the path). `publishJob`'s body is a `mode`-discriminated oneOf
 * (`FREE` | `PROMOTED` | `PROMOTED_PLUS`; `PROMOTED*` require `budget`, the
 * explicit opt-in to spend real money). `closeJob` is bodyless.
 * `searchTalentPool` and `listApplicants` require `channel_id` in the body.
 * The POST-as-search reads keep `limit`/`cursor`/`offset` as TOP-LEVEL query
 * params, never in the body. `downloadResume` returns raw bytes.
 *
 * `getJob` keeps its client-side convenience: a bare numeric job id or a full
 * LinkedIn job URL, resolved via {@link resolveJobId}; the wire request always
 * carries the numeric id. Its response is the recruiter-specific
 * `recruiter_job_posting` shape (carries `project_id`), derived here from the
 * Recruiter op, not aliased from the classic-jobs surface.
 */
import type { RequestContext } from "../internal/context.js";
import type { paths } from "../generated/types.js";
import { resolveJobId } from "../internal/job-id.js";
import { apiPath } from "../internal/path.js";

/** Query params that carry array values need the transport's array-aware shape. */
type QueryRecord = Record<string, string | number | boolean | string[] | undefined | null>;

// ─── Type aliases from generated OpenAPI snapshot ──────────────────────────

export type RecruiterGetProfileQuery = NonNullable<
  paths["/v1/{account_id}/recruiter/profiles/{user_id}"]["get"]["parameters"]["query"]
>;
export type RecruiterGetProfileResult =
  paths["/v1/{account_id}/recruiter/profiles/{user_id}"]["get"]["responses"]["200"]["content"]["application/json"];

export type RecruiterStartChatBody =
  paths["/v1/{account_id}/recruiter/chats"]["post"]["requestBody"]["content"]["application/json"];
export type RecruiterStartChatResult =
  paths["/v1/{account_id}/recruiter/chats"]["post"]["responses"]["201"]["content"]["application/json"];

export type RecruiterSearchPeopleBody =
  paths["/v1/{account_id}/recruiter/search/people"]["post"]["requestBody"]["content"]["application/json"];
export type RecruiterSearchPeopleQuery = NonNullable<
  paths["/v1/{account_id}/recruiter/search/people"]["post"]["parameters"]["query"]
>;
export type RecruiterSearchPeopleResult =
  paths["/v1/{account_id}/recruiter/search/people"]["post"]["responses"]["200"]["content"]["application/json"];

export type RecruiterSearchParametersBody =
  paths["/v1/{account_id}/recruiter/search/parameters"]["post"]["requestBody"]["content"]["application/json"];
export type RecruiterSearchParametersQuery = NonNullable<
  paths["/v1/{account_id}/recruiter/search/parameters"]["post"]["parameters"]["query"]
>;
export type RecruiterSearchParametersResult =
  paths["/v1/{account_id}/recruiter/search/parameters"]["post"]["responses"]["200"]["content"]["application/json"];

export type RecruiterSearchTalentPoolBody =
  paths["/v1/{account_id}/recruiter/projects/{project_id}/talent-pool/search"]["post"]["requestBody"]["content"]["application/json"];
export type RecruiterSearchTalentPoolQuery = NonNullable<
  paths["/v1/{account_id}/recruiter/projects/{project_id}/talent-pool/search"]["post"]["parameters"]["query"]
>;
export type RecruiterSearchTalentPoolResult =
  paths["/v1/{account_id}/recruiter/projects/{project_id}/talent-pool/search"]["post"]["responses"]["200"]["content"]["application/json"];

export type RecruiterSearchFromUrlBody =
  paths["/v1/{account_id}/recruiter/search"]["post"]["requestBody"]["content"]["application/json"];
export type RecruiterSearchFromUrlQuery = NonNullable<
  paths["/v1/{account_id}/recruiter/search"]["post"]["parameters"]["query"]
>;
export type RecruiterSearchFromUrlResult =
  paths["/v1/{account_id}/recruiter/search"]["post"]["responses"]["200"]["content"]["application/json"];

export type RecruiterListProjectsQuery = NonNullable<
  paths["/v1/{account_id}/recruiter/projects"]["get"]["parameters"]["query"]
>;
export type RecruiterListProjectsResult =
  paths["/v1/{account_id}/recruiter/projects"]["get"]["responses"]["200"]["content"]["application/json"];

export type RecruiterGetProjectResult =
  paths["/v1/{account_id}/recruiter/projects/{project_id}"]["get"]["responses"]["200"]["content"]["application/json"];

export type RecruiterUpdateProjectBody =
  paths["/v1/{account_id}/recruiter/projects/{project_id}"]["patch"]["requestBody"]["content"]["application/json"];
export type RecruiterUpdateProjectResult =
  paths["/v1/{account_id}/recruiter/projects/{project_id}"]["patch"]["responses"]["200"]["content"]["application/json"];

export type RecruiterListPipelineBody =
  paths["/v1/{account_id}/recruiter/projects/{project_id}/pipeline"]["post"]["requestBody"]["content"]["application/json"];
export type RecruiterListPipelineQuery = NonNullable<
  paths["/v1/{account_id}/recruiter/projects/{project_id}/pipeline"]["post"]["parameters"]["query"]
>;
export type RecruiterListPipelineResult =
  paths["/v1/{account_id}/recruiter/projects/{project_id}/pipeline"]["post"]["responses"]["200"]["content"]["application/json"];

export type RecruiterProjectJob =
  paths["/v1/{account_id}/recruiter/projects/{project_id}/jobs"]["get"]["responses"]["200"]["content"]["application/json"];

export type RecruiterCreateProjectJobBody =
  paths["/v1/{account_id}/recruiter/projects/{project_id}/jobs"]["post"]["requestBody"]["content"]["application/json"];
export type RecruiterCreateProjectJobResult =
  paths["/v1/{account_id}/recruiter/projects/{project_id}/jobs"]["post"]["responses"]["201"]["content"]["application/json"];

export type RecruiterProjectJobBudget =
  paths["/v1/{account_id}/recruiter/projects/{project_id}/jobs/{job_id}/budget"]["get"]["responses"]["200"]["content"]["application/json"];

export type RecruiterListJobsQuery = NonNullable<
  paths["/v1/{account_id}/recruiter/jobs"]["get"]["parameters"]["query"]
>;
export type RecruiterListJobsResult =
  paths["/v1/{account_id}/recruiter/jobs"]["get"]["responses"]["200"]["content"]["application/json"];

export type RecruiterCreateJobBody =
  paths["/v1/{account_id}/recruiter/jobs"]["post"]["requestBody"]["content"]["application/json"];
export type RecruiterCreateJobResult =
  paths["/v1/{account_id}/recruiter/jobs"]["post"]["responses"]["201"]["content"]["application/json"];

/** The Recruiter-specific job-posting shape (carries `project_id`). */
export type RecruiterJobDetail =
  paths["/v1/{account_id}/recruiter/jobs/{job_id}"]["get"]["responses"]["200"]["content"]["application/json"];

export type RecruiterUpdateProjectJobBody =
  paths["/v1/{account_id}/recruiter/projects/{project_id}/jobs/{job_id}"]["patch"]["requestBody"]["content"]["application/json"];
export type RecruiterUpdateProjectJobResult =
  paths["/v1/{account_id}/recruiter/projects/{project_id}/jobs/{job_id}"]["patch"]["responses"]["200"]["content"]["application/json"];

export type RecruiterPublishJobBody =
  paths["/v1/{account_id}/recruiter/projects/{project_id}/jobs/{job_id}/publish"]["post"]["requestBody"]["content"]["application/json"];
export type RecruiterPublishJobResult =
  paths["/v1/{account_id}/recruiter/projects/{project_id}/jobs/{job_id}/publish"]["post"]["responses"]["200"]["content"]["application/json"];

export type RecruiterCloseJobResult =
  paths["/v1/{account_id}/recruiter/projects/{project_id}/jobs/{job_id}/close"]["post"]["responses"]["200"]["content"]["application/json"];

export type RecruiterSaveCandidateBody =
  paths["/v1/{account_id}/recruiter/projects/{project_id}/pipeline/candidate/save"]["post"]["requestBody"]["content"]["application/json"];
export type RecruiterSaveCandidateResult =
  paths["/v1/{account_id}/recruiter/projects/{project_id}/pipeline/candidate/save"]["post"]["responses"]["200"]["content"]["application/json"];

export type RecruiterListApplicantsBody =
  paths["/v1/{account_id}/recruiter/projects/{project_id}/talent-pool/applicants"]["post"]["requestBody"]["content"]["application/json"];
export type RecruiterListApplicantsQuery = NonNullable<
  paths["/v1/{account_id}/recruiter/projects/{project_id}/talent-pool/applicants"]["post"]["parameters"]["query"]
>;
export type RecruiterListApplicantsResult =
  paths["/v1/{account_id}/recruiter/projects/{project_id}/talent-pool/applicants"]["post"]["responses"]["200"]["content"]["application/json"];

export type RecruiterGetApplicantResult =
  paths["/v1/{account_id}/recruiter/projects/{project_id}/talent-pool/applicants/{applicant_id}"]["get"]["responses"]["200"]["content"]["application/json"];

// ─── Resource class ───────────────────────────────────────────────────────────

export class RecruiterResource {
  constructor(protected readonly ctx: RequestContext) {}

  /**
   * Retrieve a Recruiter-enriched profile. `{identifier}` is `'me'`, the
   * target's public identifier, or a member id. Request specific profile
   * sections via `with_sections` (repeatable query param).
   * `GET /v1/{account_id}/recruiter/profiles/{user_id}`
   */
  getProfile(identifier: string, params?: Partial<RecruiterGetProfileQuery>): Promise<RecruiterGetProfileResult> {
    return this.ctx.request<RecruiterGetProfileResult>({
      method: "GET",
      path: apiPath`/v1/{account_id}/recruiter/profiles/${identifier}`,
      ...(params ? { query: params as QueryRecord } : {}),
    });
  }

  /**
   * Start a Recruiter chat (InMail). JSON-only, `subject` and `signature`
   * are REQUIRED; optional attachments ride the body as base64-encoded
   * objects (no multipart). `POST /v1/{account_id}/recruiter/chats`
   */
  startChat(body: RecruiterStartChatBody): Promise<RecruiterStartChatResult> {
    return this.ctx.request<RecruiterStartChatResult>({
      method: "POST",
      path: "/v1/{account_id}/recruiter/chats",
      body,
    });
  }

  /**
   * Search LinkedIn members using Recruiter filters. `limit`/`cursor` stay
   * TOP-LEVEL query params. `POST /v1/{account_id}/recruiter/search/people`
   */
  searchPeople(body: RecruiterSearchPeopleBody, params?: Partial<RecruiterSearchPeopleQuery>): Promise<RecruiterSearchPeopleResult> {
    return this.ctx.request<RecruiterSearchPeopleResult>({
      method: "POST",
      path: "/v1/{account_id}/recruiter/search/people",
      body,
      ...(params ? { query: params as QueryRecord } : {}),
    });
  }

  /**
   * Resolve human-readable terms to opaque Recruiter filter ids. POST (was
   * GET): the body is a `source`-discriminated oneOf, `APPLICANTS`/`PIPELINE`
   * require `project_id`. `POST /v1/{account_id}/recruiter/search/parameters`
   */
  searchParameters(body: RecruiterSearchParametersBody, params?: Partial<RecruiterSearchParametersQuery>): Promise<RecruiterSearchParametersResult> {
    return this.ctx.request<RecruiterSearchParametersResult>({
      method: "POST",
      path: "/v1/{account_id}/recruiter/search/parameters",
      body,
      ...(params ? { query: params as QueryRecord } : {}),
    });
  }

  /**
   * Search a project's talent pool. `channel_id` (the project's own
   * `RECRUITER_SEARCH` talent-pool channel) is REQUIRED. `limit`/`cursor` stay
   * TOP-LEVEL query params.
   * `POST /v1/{account_id}/recruiter/projects/{project_id}/talent-pool/search`
   */
  searchTalentPool(projectId: string, body: RecruiterSearchTalentPoolBody, params?: Partial<RecruiterSearchTalentPoolQuery>): Promise<RecruiterSearchTalentPoolResult> {
    return this.ctx.request<RecruiterSearchTalentPoolResult>({
      method: "POST",
      path: apiPath`/v1/{account_id}/recruiter/projects/${projectId}/talent-pool/search`,
      body,
      ...(params ? { query: params as QueryRecord } : {}),
    });
  }

  /**
   * Search from a pasted Recruiter search / talent-pool / applicant URL,
   * nothing else in the body. The response is a 3-way oneOf (people-search,
   * job-applicant list, or pipeline-candidate list) keyed by the URL kind.
   * `POST /v1/{account_id}/recruiter/search`
   */
  searchFromUrl(body: RecruiterSearchFromUrlBody, params?: Partial<RecruiterSearchFromUrlQuery>): Promise<RecruiterSearchFromUrlResult> {
    return this.ctx.request<RecruiterSearchFromUrlResult>({
      method: "POST",
      path: "/v1/{account_id}/recruiter/search",
      body,
      ...(params ? { query: params as QueryRecord } : {}),
    });
  }

  /**
   * List Recruiter hiring projects visible to the account.
   * `GET /v1/{account_id}/recruiter/projects`
   */
  listProjects(params?: Partial<RecruiterListProjectsQuery>): Promise<RecruiterListProjectsResult> {
    return this.ctx.request<RecruiterListProjectsResult>({
      method: "GET",
      path: "/v1/{account_id}/recruiter/projects",
      ...(params ? { query: params as QueryRecord } : {}),
    });
  }

  /**
   * Get a single Recruiter hiring project (owner, metadata, talent_pool,
   * pipeline). `GET /v1/{account_id}/recruiter/projects/{project_id}`
   */
  getProject(projectId: string): Promise<RecruiterGetProjectResult> {
    return this.ctx.request<RecruiterGetProjectResult>({
      method: "GET",
      path: apiPath`/v1/{account_id}/recruiter/projects/${projectId}`,
    });
  }

  /**
   * Edit a Recruiter project's config: all fields optional; omitted fields
   * are left unchanged. Returns a thin acknowledgement only.
   * `PATCH /v1/{account_id}/recruiter/projects/{project_id}`
   */
  updateProject(projectId: string, body: RecruiterUpdateProjectBody): Promise<RecruiterUpdateProjectResult> {
    return this.ctx.request<RecruiterUpdateProjectResult>({
      method: "PATCH",
      path: apiPath`/v1/{account_id}/recruiter/projects/${projectId}`,
      body,
    });
  }

  /**
   * List candidates in a project's pipeline (POST-as-list; the body carries
   * an all-optional filter set, no state mutates). `limit`/`cursor` stay
   * TOP-LEVEL query params.
   * `POST /v1/{account_id}/recruiter/projects/{project_id}/pipeline`
   */
  listPipeline(projectId: string, body: RecruiterListPipelineBody = {}, params?: Partial<RecruiterListPipelineQuery>): Promise<RecruiterListPipelineResult> {
    return this.ctx.request<RecruiterListPipelineResult>({
      method: "POST",
      path: apiPath`/v1/{account_id}/recruiter/projects/${projectId}/pipeline`,
      body,
      ...(params ? { query: params as QueryRecord } : {}),
    });
  }

  /**
   * Get the single job posting attached to a Recruiter project (the surface
   * returns one posting, not a list; a project with no attached job 404s).
   * `GET /v1/{account_id}/recruiter/projects/{project_id}/jobs`
   */
  getProjectJob(projectId: string): Promise<RecruiterProjectJob> {
    return this.ctx.request<RecruiterProjectJob>({
      method: "GET",
      path: apiPath`/v1/{account_id}/recruiter/projects/${projectId}/jobs`,
    });
  }

  /**
   * Create a job-posting DRAFT attached to an EXISTING project, `project_name`
   * is not accepted (the project comes from the path). Never publishes, never
   * spends money. `POST /v1/{account_id}/recruiter/projects/{project_id}/jobs`
   */
  createProjectJob(projectId: string, body: RecruiterCreateProjectJobBody): Promise<RecruiterCreateProjectJobResult> {
    return this.ctx.request<RecruiterCreateProjectJobResult>({
      method: "POST",
      path: apiPath`/v1/{account_id}/recruiter/projects/${projectId}/jobs`,
      body,
    });
  }

  /**
   * Get pricing to publish a project's job posting; price a publish before
   * committing any money.
   * `GET /v1/{account_id}/recruiter/projects/{project_id}/jobs/{job_id}/budget`
   */
  getProjectJobBudget(projectId: string, jobId: string): Promise<RecruiterProjectJobBudget> {
    return this.ctx.request<RecruiterProjectJobBudget>({
      method: "GET",
      path: apiPath`/v1/{account_id}/recruiter/projects/${projectId}/jobs/${jobId}/budget`,
    });
  }

  /**
   * Create a job-posting DRAFT together with a brand-new hiring project,
   * `project_name` is REQUIRED; `description` must be >= 200 characters. Never
   * publishes, never spends money. `POST /v1/{account_id}/recruiter/jobs`
   */
  createJob(body: RecruiterCreateJobBody): Promise<RecruiterCreateJobResult> {
    return this.ctx.request<RecruiterCreateJobResult>({
      method: "POST",
      path: "/v1/{account_id}/recruiter/jobs",
      body,
    });
  }

  /**
   * List Recruiter job postings. `limit`/`cursor` stay TOP-LEVEL query params.
   * `GET /v1/{account_id}/recruiter/jobs`
   */
  listJobs(params?: Partial<RecruiterListJobsQuery>): Promise<RecruiterListJobsResult> {
    return this.ctx.request<RecruiterListJobsResult>({
      method: "GET",
      path: "/v1/{account_id}/recruiter/jobs",
      ...(params ? { query: params as QueryRecord } : {}),
    });
  }

  /**
   * Get one Recruiter job posting's full detail (the recruiter-specific
   * `recruiter_job_posting` shape, carrying `project_id`).
   * `GET /v1/{account_id}/recruiter/jobs/{job_id}`
   *
   * Accepts a bare numeric job id or a full LinkedIn job URL
   * (`https://www.linkedin.com/jobs/view/{id}`); the id is extracted
   * client-side; the wire request always carries the numeric id. Throws
   * `CurviateError({ code: 'INVALID_REQUEST' })` synchronously if neither
   * form can be recognized.
   */
  getJob(jobIdOrUrl: string): Promise<RecruiterJobDetail> {
    const jobId = resolveJobId(jobIdOrUrl);
    return this.ctx.request<RecruiterJobDetail>({
      method: "GET",
      path: apiPath`/v1/{account_id}/recruiter/jobs/${jobId}`,
    });
  }

  /**
   * Apply a partial update to a project's job posting, only included fields
   * change. MONEY WARNING: editing an already-published (LISTED) posting
   * mutates a live, money-spending listing.
   * `PATCH /v1/{account_id}/recruiter/projects/{project_id}/jobs/{job_id}`
   */
  updateProjectJob(projectId: string, jobId: string, body: RecruiterUpdateProjectJobBody): Promise<RecruiterUpdateProjectJobResult> {
    return this.ctx.request<RecruiterUpdateProjectJobResult>({
      method: "PATCH",
      path: apiPath`/v1/{account_id}/recruiter/projects/${projectId}/jobs/${jobId}`,
      body,
    });
  }

  /**
   * Publish a project's job posting draft. `mode` is a discriminated oneOf:
   * `FREE` (requires free-posting eligibility, spends nothing) or
   * `PROMOTED`/`PROMOTED_PLUS` (requires `budget`; THIS SPENDS REAL MONEY on
   * the connected account's LinkedIn payment method; supplying `budget` IS the
   * explicit opt-in).
   * `POST /v1/{account_id}/recruiter/projects/{project_id}/jobs/{job_id}/publish`
   */
  publishJob(projectId: string, jobId: string, body: RecruiterPublishJobBody): Promise<RecruiterPublishJobResult> {
    return this.ctx.request<RecruiterPublishJobResult>({
      method: "POST",
      path: apiPath`/v1/{account_id}/recruiter/projects/${projectId}/jobs/${jobId}/publish`,
      body,
    });
  }

  /**
   * Close a project's job posting so it stops accepting applications
   * (bodyless). Closing an already-published (LISTED) posting cannot be
   * undone; there is no re-open operation.
   * `POST /v1/{account_id}/recruiter/projects/{project_id}/jobs/{job_id}/close`
   */
  closeJob(projectId: string, jobId: string): Promise<RecruiterCloseJobResult> {
    return this.ctx.request<RecruiterCloseJobResult>({
      method: "POST",
      path: apiPath`/v1/{account_id}/recruiter/projects/${projectId}/jobs/${jobId}/close`,
    });
  }

  /**
   * Save a candidate (or user profile) to a project's pipeline at the given
   * stage, the sole surviving pipeline write.
   * `POST /v1/{account_id}/recruiter/projects/{project_id}/pipeline/candidate/save`
   */
  saveCandidate(projectId: string, body: RecruiterSaveCandidateBody): Promise<RecruiterSaveCandidateResult> {
    return this.ctx.request<RecruiterSaveCandidateResult>({
      method: "POST",
      path: apiPath`/v1/{account_id}/recruiter/projects/${projectId}/pipeline/candidate/save`,
      body,
    });
  }

  /**
   * List applicants in a project's talent pool (POST-as-list; the body carries
   * filters, no state mutates). `channel_id` (a `JOB_POSTING` talent-pool
   * channel) is REQUIRED. `limit`/`cursor` stay TOP-LEVEL query params.
   * `POST /v1/{account_id}/recruiter/projects/{project_id}/talent-pool/applicants`
   */
  listApplicants(projectId: string, body: RecruiterListApplicantsBody, params?: Partial<RecruiterListApplicantsQuery>): Promise<RecruiterListApplicantsResult> {
    return this.ctx.request<RecruiterListApplicantsResult>({
      method: "POST",
      path: apiPath`/v1/{account_id}/recruiter/projects/${projectId}/talent-pool/applicants`,
      body,
      ...(params ? { query: params as QueryRecord } : {}),
    });
  }

  /**
   * Get full detail for one talent-pool applicant (profile guaranteed full,
   * includes PII). `GET /v1/{account_id}/recruiter/projects/{project_id}/talent-pool/applicants/{applicant_id}`
   */
  getApplicant(projectId: string, applicantId: string): Promise<RecruiterGetApplicantResult> {
    return this.ctx.request<RecruiterGetApplicantResult>({
      method: "GET",
      path: apiPath`/v1/{account_id}/recruiter/projects/${projectId}/talent-pool/applicants/${applicantId}`,
    });
  }

  /**
   * Download a talent-pool applicant's résumé as raw binary.
   * `GET /v1/{account_id}/recruiter/projects/{project_id}/talent-pool/applicants/{applicant_id}/resume`
   * Returns `ArrayBuffer`; the SDK does not cache or store it.
   */
  downloadResume(projectId: string, applicantId: string): Promise<ArrayBuffer> {
    return this.ctx.request<ArrayBuffer>({
      method: "GET",
      path: apiPath`/v1/{account_id}/recruiter/projects/${projectId}/talent-pool/applicants/${applicantId}/resume`,
    });
  }
}
