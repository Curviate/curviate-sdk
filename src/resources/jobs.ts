/**
 * Jobs resource: 10 methods (1 realign + 9 new, the whole Core Jobs write
 * surface).
 *
 * Account-scoped: the bound context injects `account_id` as the leading
 * `/v1/` path segment on every request (account-first grammar).
 *
 * `get` keeps its pre-existing client-side convenience: a bare numeric job
 * id or a full LinkedIn job URL, resolved via {@link resolveJobId}, the
 * wire request always carries the numeric id. The 9 new methods take the
 * numeric id only, as already returned by `get`/`list`/`create`; they do
 * not accept a job URL.
 *
 * `create`/`update`'s `job_title`/`company` are **objects** (`{id?,name?}`),
 * never scalars; `apply_method` is a `method`-discriminated oneOf
 * (`{method:'linkedin',notification_email}` | `{method:'external',website_url}`).
 * `publish`'s body is a `mode`-discriminated oneOf (`FREE` | `PROMOTED` |
 * `PROMOTED_PLUS`; `PROMOTED*` require `budget{currency,amount,scope}`, the
 * explicit opt-in to spend real money). `close` is bodyless.
 * `listApplicants` is POST-as-search (matches the `/search/*` convention):
 * the filter body is all-optional; `limit`/`cursor` stay TOP-LEVEL query
 * params, never in the body. `downloadResume` returns raw bytes.
 */
import type { RequestContext } from "../internal/context.js";
import type { paths } from "../generated/types.js";
import { resolveJobId } from "../internal/job-id.js";

// ─── Type aliases from generated OpenAPI snapshot ──────────────────────────

export type JobListPage =
  paths["/v1/{account_id}/jobs"]["get"]["responses"]["200"]["content"]["application/json"];
export type JobListQuery =
  paths["/v1/{account_id}/jobs"]["get"]["parameters"]["query"];

export type CreateJobBody =
  paths["/v1/{account_id}/jobs"]["post"]["requestBody"]["content"]["application/json"];
export type CreateJobResult =
  paths["/v1/{account_id}/jobs"]["post"]["responses"]["201"]["content"]["application/json"];

export type JobDetail =
  paths["/v1/{account_id}/jobs/{job_id}"]["get"]["responses"]["200"]["content"]["application/json"];
export type JobGetQuery = NonNullable<
  paths["/v1/{account_id}/jobs/{job_id}"]["get"]["parameters"]["query"]
>;

export type UpdateJobBody =
  paths["/v1/{account_id}/jobs/{job_id}"]["patch"]["requestBody"]["content"]["application/json"];
export type UpdateJobResult =
  paths["/v1/{account_id}/jobs/{job_id}"]["patch"]["responses"]["200"]["content"]["application/json"];

export type JobBudget =
  paths["/v1/{account_id}/jobs/{job_id}/budget"]["get"]["responses"]["200"]["content"]["application/json"];

export type PublishJobBody =
  paths["/v1/{account_id}/jobs/{job_id}/publish"]["post"]["requestBody"]["content"]["application/json"];
export type PublishJobResult =
  paths["/v1/{account_id}/jobs/{job_id}/publish"]["post"]["responses"]["200"]["content"]["application/json"];

export type CloseJobResult =
  paths["/v1/{account_id}/jobs/{job_id}/close"]["post"]["responses"]["200"]["content"]["application/json"];

export type ListApplicantsBody =
  paths["/v1/{account_id}/jobs/{job_id}/applicants"]["post"]["requestBody"]["content"]["application/json"];
export type ListApplicantsQuery = NonNullable<
  paths["/v1/{account_id}/jobs/{job_id}/applicants"]["post"]["parameters"]["query"]
>;
export type ListApplicantsResult =
  paths["/v1/{account_id}/jobs/{job_id}/applicants"]["post"]["responses"]["200"]["content"]["application/json"];

export type JobApplicant =
  paths["/v1/{account_id}/jobs/{job_id}/applicants/{applicant_id}"]["get"]["responses"]["200"]["content"]["application/json"];

// ─── Resource class ───────────────────────────────────────────────────────────

export class JobsResource {
  constructor(protected readonly ctx: RequestContext) {}

  /**
   * List the connected account's own classic job postings.
   * `GET /v1/{account_id}/jobs`
   * `state` is REQUIRED, filtering is LinkedIn-side and best-effort (see
   * the generated type's own field description).
   */
  list(params: JobListQuery): Promise<JobListPage> {
    return this.ctx.request<JobListPage>({
      method: "GET",
      path: "/v1/{account_id}/jobs",
      query: params as Record<string, string | number | boolean | string[] | undefined | null>,
    });
  }

  /**
   * Create a classic job posting DRAFT. Never publishes, never spends money.
   * `POST /v1/{account_id}/jobs`
   */
  create(body: CreateJobBody): Promise<CreateJobResult> {
    return this.ctx.request<CreateJobResult>({
      method: "POST",
      path: "/v1/{account_id}/jobs",
      body,
    });
  }

  /**
   * Retrieve one classic LinkedIn job posting's full detail.
   * `GET /v1/{account_id}/jobs/{job_id}`
   *
   * Accepts a bare numeric job id or a full job URL
   * (`https://www.linkedin.com/jobs/view/{id}`); the id is extracted
   * client-side; the wire request always carries the numeric id. Throws
   * `CurviateError({ code: 'INVALID_REQUEST' })` synchronously if neither
   * form can be recognized.
   */
  get(jobIdOrUrl: string, params?: JobGetQuery): Promise<JobDetail> {
    const jobId = resolveJobId(jobIdOrUrl);
    return this.ctx.request<JobDetail>({
      method: "GET",
      path: `/v1/{account_id}/jobs/${jobId}`,
      ...(params ? { query: params as Record<string, string | number | boolean | string[] | undefined | null> } : {}),
    });
  }

  /**
   * Apply a partial update to a job posting this account owns, only
   * included fields change. Can affect real money on an already-published
   * (LISTED) posting. `PATCH /v1/{account_id}/jobs/{job_id}`
   */
  update(jobId: string, body: UpdateJobBody): Promise<UpdateJobResult> {
    return this.ctx.request<UpdateJobResult>({
      method: "PATCH",
      path: `/v1/{account_id}/jobs/${jobId}`,
      body,
    });
  }

  /**
   * Get pricing to publish a job posting; price a publish before
   * committing any money. `GET /v1/{account_id}/jobs/{job_id}/budget`
   */
  getBudget(jobId: string): Promise<JobBudget> {
    return this.ctx.request<JobBudget>({
      method: "GET",
      path: `/v1/{account_id}/jobs/${jobId}/budget`,
    });
  }

  /**
   * Publish a classic job posting draft. `mode` is a discriminated oneOf:
   * `FREE` (requires free-posting eligibility, spends nothing) or
   * `PROMOTED`/`PROMOTED_PLUS` (requires `budget`; THIS SPENDS REAL MONEY
   * on the connected account's LinkedIn payment method; supplying `budget`
   * IS the explicit opt-in). `POST /v1/{account_id}/jobs/{job_id}/publish`
   */
  publish(jobId: string, body: PublishJobBody): Promise<PublishJobResult> {
    return this.ctx.request<PublishJobResult>({
      method: "POST",
      path: `/v1/{account_id}/jobs/${jobId}/publish`,
      body,
    });
  }

  /**
   * Close a job posting so it stops accepting applications (bodyless).
   * Closing an already-published (LISTED) posting cannot be undone.
   * `POST /v1/{account_id}/jobs/{job_id}/close`
   */
  close(jobId: string): Promise<CloseJobResult> {
    return this.ctx.request<CloseJobResult>({
      method: "POST",
      path: `/v1/{account_id}/jobs/${jobId}/close`,
    });
  }

  /**
   * List applicants to a job posting this account owns, a read; POST
   * carries the filter body, matching the `/search/*` convention. Omit
   * `ratings` to see the full applicant funnel. `limit`/`cursor` stay
   * TOP-LEVEL query params, never in the body.
   * `POST /v1/{account_id}/jobs/{job_id}/applicants`
   */
  listApplicants(
    jobId: string,
    params: ListApplicantsBody & ListApplicantsQuery = {},
  ): Promise<ListApplicantsResult> {
    const { cursor, limit, ...body } = params;
    const hasQuery = cursor !== undefined || limit !== undefined;
    return this.ctx.request<ListApplicantsResult>({
      method: "POST",
      path: `/v1/{account_id}/jobs/${jobId}/applicants`,
      body,
      ...(hasQuery
        ? {
            query: {
              ...(cursor !== undefined ? { cursor } : {}),
              ...(limit !== undefined ? { limit } : {}),
            },
          }
        : {}),
    });
  }

  /**
   * Get full detail for one applicant, including contact information.
   * `GET /v1/{account_id}/jobs/{job_id}/applicants/{applicant_id}`
   */
  getApplicant(jobId: string, applicantId: string): Promise<JobApplicant> {
    return this.ctx.request<JobApplicant>({
      method: "GET",
      path: `/v1/{account_id}/jobs/${jobId}/applicants/${applicantId}`,
    });
  }

  /**
   * Download an applicant's résumé. Returns raw binary.
   * `GET /v1/{account_id}/jobs/{job_id}/applicants/{applicant_id}/resume`
   * Returns `ArrayBuffer`; the SDK does not cache or store it.
   */
  downloadResume(jobId: string, applicantId: string): Promise<ArrayBuffer> {
    return this.ctx.request<ArrayBuffer>({
      method: "GET",
      path: `/v1/{account_id}/jobs/${jobId}/applicants/${applicantId}/resume`,
    });
  }
}
