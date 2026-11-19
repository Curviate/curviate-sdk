/**
 * Leads resource: 9 methods plus `imports` (7 methods), root-scoped,
 * `curviate.leads`.
 *
 * A Lead is a person your team keeps: a LinkedIn URL plus your own fields
 * (`job_title`, `email`, `extra`, ...), Tags and Lead list memberships.
 * `email` is what you supplied, else the first email a LinkedIn profile read
 * returned (yours is never overwritten). `company_linkedin_url` is read-only:
 * the current company's LinkedIn page (`https://www.linkedin.com/company/<id>/`),
 * filled with `company` from a profile read, `null` when LinkedIn gave none.
 * Leads belong to the team, not to an account. Any spelling of one person's
 * profile or Sales Navigator URL resolves to the same Lead, so writing the
 * same person twice updates one Lead rather than creating a second.
 *
 * Profile reads through Curviate keep matching Leads up to date
 * (`enrichment`); {@link LeadsResource.enrich} asks for it explicitly.
 * Deleting Leads, lists or Tags is for Owners and Managers; a Member gets
 * `INSUFFICIENT_ROLE`. A cap (100,000 Leads, 50 Tags per Lead, ...)
 * refuses with `LEAD_LIMIT_REACHED`.
 */
import type { RequestContext } from "../internal/context.js";
import type { paths } from "../generated/types.js";
import { apiPath } from "../internal/path.js";
import { commaLists, type WithLists } from "../internal/query.js";

// ─── Type aliases from generated OpenAPI snapshot ──────────────────────────

/** `list_id`, `not_list_id` and `account_id` take a comma list of up to 20 Lead list ids, or an array of them. */
export type LeadListParams = WithLists<NonNullable<paths["/v1/leads"]["get"]["parameters"]["query"]>, "list_id" | "not_list_id" | "account_id">;
export type LeadListPage = paths["/v1/leads"]["get"]["responses"]["200"]["content"]["application/json"];
export type Lead = paths["/v1/leads/{id}"]["get"]["responses"]["200"]["content"]["application/json"];
export type LeadUpsertBody = NonNullable<paths["/v1/leads"]["post"]["requestBody"]>["content"]["application/json"];
/** `201` when the Lead was created, `200` when updated or unchanged; `outcome` says which. */
export type LeadUpsertResult =
  | paths["/v1/leads"]["post"]["responses"]["200"]["content"]["application/json"]
  | paths["/v1/leads"]["post"]["responses"]["201"]["content"]["application/json"];
export type LeadUpdateBody = NonNullable<paths["/v1/leads/{id}"]["patch"]["requestBody"]>["content"]["application/json"];
export type LeadUpdateResult = paths["/v1/leads/{id}"]["patch"]["responses"]["200"]["content"]["application/json"];
export type LeadDeleteManyBody = NonNullable<paths["/v1/leads/delete"]["post"]["requestBody"]>["content"]["application/json"];
export type LeadDeleteManyResult = paths["/v1/leads/delete"]["post"]["responses"]["200"]["content"]["application/json"];
export type LeadUpdateManyBody = NonNullable<paths["/v1/leads/update"]["post"]["requestBody"]>["content"]["application/json"];
export type LeadUpdateManyResult = paths["/v1/leads/update"]["post"]["responses"]["200"]["content"]["application/json"];
export type LeadEnrichBody = NonNullable<paths["/v1/leads/enrich"]["post"]["requestBody"]>["content"]["application/json"];
export type LeadEnrichResult = paths["/v1/leads/enrich"]["post"]["responses"]["200"]["content"]["application/json"];
export type LeadExportParams = WithLists<NonNullable<paths["/v1/leads/export"]["get"]["parameters"]["query"]>, "list_id" | "not_list_id" | "account_id">;

export type LeadImportCreateBody = NonNullable<paths["/v1/leads/imports"]["post"]["requestBody"]>["content"]["application/json"];
/** `201` with the finished report for a small import, `202` with a `queued` import for a large one. */
export type LeadImport =
  | paths["/v1/leads/imports"]["post"]["responses"]["201"]["content"]["application/json"]
  | paths["/v1/leads/imports"]["post"]["responses"]["202"]["content"]["application/json"];
export type LeadImportListParams = NonNullable<paths["/v1/leads/imports"]["get"]["parameters"]["query"]>;
export type LeadImportListPage = paths["/v1/leads/imports"]["get"]["responses"]["200"]["content"]["application/json"];
export type LeadImportGetResult = paths["/v1/leads/imports/{id}"]["get"]["responses"]["200"]["content"]["application/json"];
export type LeadImportControlResult = paths["/v1/leads/imports/{id}/pause"]["post"]["responses"]["200"]["content"]["application/json"];
export type LeadImportRowsParams = NonNullable<paths["/v1/leads/imports/{id}/rows"]["get"]["parameters"]["query"]>;
export type LeadImportRowsPage = paths["/v1/leads/imports/{id}/rows"]["get"]["responses"]["200"]["content"]["application/json"];

// ─── Resource classes ─────────────────────────────────────────────────────────

/**
 * Lead imports, `curviate.leads.imports`: up to 10,000 rows (body up to
 * 9 MiB) per import, as JSON `rows` or a `csv` string. Up to 500 rows run
 * inline; larger imports run in the background, one at a time per team, at
 * most 5 queued or running (`IMPORT_QUEUE_FULL` beyond that, retry later).
 * Imports and their per-row reports are kept 30 days after they finish.
 */
export class LeadImportsResource {
  constructor(private readonly ctx: RequestContext) {}

  /**
   * Import Leads. Send exactly one of `rows` (objects with `linkedin_url`,
   * the standard fields, `extra`, `tags`; an exported JSON file re-imports
   * as is) or `csv` (the file as text; `delimiter` and a header `mapping`
   * are optional). `list_id` or `list_name` adds every row's Lead to a
   * list, `tags`/`remove_tags` add or remove Tags on every row's Lead.
   * `apply_lists: true` also adds each row's Lead to the Lead lists named
   * in its `lists` (a JSON array of names, or the CSV export's `lists` column),
   * creating a missing list by name; it only adds, and a row past the Team's
   * list limit is skipped (`list_limit_reached`). Off by default, `lists` is
   * ignored. A JSON export names lists only when `fields` includes `lists`.
   * `POST /v1/leads/imports`
   *
   * Or send `source`: a LinkedIn source Curviate reads page by page from
   * `source.account_id`, inside that Account's limits and Active hours
   * (answers `queued`). `kind` is `people_search`, `sales_nav_search` or
   * `recruiter_search` (a pasted search `url` or built `filters`, typed per
   * kind; a key the kind does not offer is a 400 naming it),
   * `company_people` (a company search plus `titles`, required),
   * `sales_nav_lead_list` (`list_id`), `post_engagers` (`post_id`) or
   * `group_members` (`group_id`); `max` caps it. A source read before
   * continues where it stopped by default; `continue_from: "imp_..."` names
   * the import to continue (`IMPORT_CANNOT_CONTINUE` when it read
   * LinkedIn's last results), `restart: true` reads from the beginning. An
   * open import of the same source is `IMPORT_STATUS_CONFLICT`.
   *
   * Needs a subscription: a Team without one is refused with `TIER_REQUIRED`.
   *
   * A malformed request (an unknown key, a wrong type) is refused whole; a row
   * with a bad value is skipped and named in the report. Not retry-safe: a
   * retry makes a second import, whose rows report `unchanged`.
   *
   * @example
   * const imp = await curviate.leads.imports.create({
   *   rows: [{ linkedin_url: "https://www.linkedin.com/in/ana/", job_title: "CTO" }],
   *   list_name: "Q4 webinar",
   * });
   * if (imp.status === "queued") console.log(`Running in the background: ${imp.id}`);
   */
  create(body: LeadImportCreateBody): Promise<LeadImport> {
    return this.ctx.request<LeadImport>({
      method: "POST",
      path: "/v1/leads/imports",
      body,
    });
  }

  /**
   * List your team's imports.
   * `GET /v1/leads/imports`
   *
   * @example
   * const { items } = await curviate.leads.imports.list({ limit: 10 });
   */
  list(params?: LeadImportListParams): Promise<LeadImportListPage> {
    return this.ctx.request<LeadImportListPage>({
      method: "GET",
      path: "/v1/leads/imports",
      ...(params ? { query: params } : {}),
    });
  }

  /**
   * Read an import: its `status` and counts. Poll a background import until
   * `status` is `completed` or `failed`.
   * `GET /v1/leads/imports/{id}`
   *
   * @example
   * const { status } = await curviate.leads.imports.get("imp_123");
   */
  get(importId: string): Promise<LeadImportGetResult> {
    return this.ctx.request<LeadImportGetResult>({
      method: "GET",
      path: apiPath`/v1/leads/imports/${importId}`,
    });
  }

  /**
   * Page through an import's per-row report: each row's `outcome` (`created`,
   * `updated`, `unchanged`, `skipped`), its Lead, and why a row was
   * skipped. `outcome` is a comma list to keep.
   * `GET /v1/leads/imports/{id}/rows`
   *
   * @example
   * const { items } = await curviate.leads.imports.rows("imp_123", { outcome: "skipped" });
   */
  rows(importId: string, params?: LeadImportRowsParams): Promise<LeadImportRowsPage> {
    return this.ctx.request<LeadImportRowsPage>({
      method: "GET",
      path: apiPath`/v1/leads/imports/${importId}/rows`,
      ...(params ? { query: params } : {}),
    });
  }

  /**
   * Pause an import from a LinkedIn source: no page is read until it
   * resumes; a page in flight is stored, and the Account is free for its
   * next import meanwhile. `IMPORT_STATUS_CONFLICT` unless queued or
   * running. Needs a subscription.
   * `POST /v1/leads/imports/{id}/pause`
   *
   * @example
   * await curviate.leads.imports.pause("imp_123");
   */
  pause(importId: string): Promise<LeadImportControlResult> {
    return this.ctx.request<LeadImportControlResult>({ method: "POST", path: apiPath`/v1/leads/imports/${importId}/pause` });
  }

  /**
   * Resume a paused import: it reads on from where it stopped, after the
   * Account's running import if there is one, at the same pace.
   * `IMPORT_STATUS_CONFLICT` unless paused. Needs a subscription.
   * `POST /v1/leads/imports/{id}/resume`
   *
   * @example
   * await curviate.leads.imports.resume("imp_123");
   */
  resume(importId: string): Promise<LeadImportControlResult> {
    return this.ctx.request<LeadImportControlResult>({ method: "POST", path: apiPath`/v1/leads/imports/${importId}/resume` });
  }

  /**
   * Stop an import for good: the people found so far stay and the position
   * is kept, so a new import of the same source with `continue_from` reads
   * on from there. `IMPORT_STATUS_CONFLICT` once finished. Needs a subscription.
   * `POST /v1/leads/imports/{id}/stop`
   *
   * @example
   * await curviate.leads.imports.stop("imp_123");
   */
  stop(importId: string): Promise<LeadImportControlResult> {
    return this.ctx.request<LeadImportControlResult>({ method: "POST", path: apiPath`/v1/leads/imports/${importId}/stop` });
  }
}

export class LeadsResource {
  /** Bulk imports from rows or CSV. */
  readonly imports: LeadImportsResource;

  constructor(private readonly ctx: RequestContext) {
    this.imports = new LeadImportsResource(ctx);
  }

  /**
   * List Leads, newest first (`order: "asc"` for oldest). Filters combine
   * with AND: `list_id` (up to 20 Lead lists, as an array or a comma list:
   * Leads in any of them, or in every one with `list_match: "all"`; one id
   * is one list), `not_list_id` (Leads in none of those lists), `has_email`
   * (`true`: only Leads with an email address, `false`: only those
   * without), `tag` (comma list, any of them), `import_id`, `linkedin_url`,
   * `q` (substring over names, headline, job title, company, email,
   * location), `enrichment_status`, `connected`, `account_id` (Connections of
   * that account, or of any of up to 50, as an array or a comma list), `campaign_id` + `enrollment_status` (any of the statuses
   * given). A list id that is not your team's throws `RESOURCE_NOT_FOUND`
   * naming the key. Pages with an opaque `cursor` until it is `null`.
   * `include_total: true` adds `total` to the page, the number of Leads the
   * filters match (with `limit: 1` it is the count before a bulk call or a new
   * list); it is left out unless asked for.
   * `GET /v1/leads`
   *
   * @example
   * const { items, cursor } = await curviate.leads.list({ tag: "warm", limit: 100 });
   *
   * @example
   * const { total } = await curviate.leads.list({ list_id: ["cl_1", "cl_2"], list_match: "all", has_email: true, include_total: true, limit: 1 });
   */
  list(params?: LeadListParams): Promise<LeadListPage> {
    return this.ctx.request<LeadListPage>({
      method: "GET",
      path: "/v1/leads",
      query: commaLists(params, "enrollment_status", "list_id", "not_list_id", "account_id"),
    });
  }

  /**
   * Read one Lead. `do_not_contact` is the Lead's Do-not-contact entry as
   * `{ scope, reason, how, at }`, or `null`: `scope: "email_only"` is the
   * "No email" mark (email steps skip the Lead, LinkedIn still reaches them).
   * `GET /v1/leads/{id}`
   *
   * @example
   * const lead = await curviate.leads.get("con_123");
   */
  get(leadId: string): Promise<Lead> {
    return this.ctx.request<Lead>({
      method: "GET",
      path: apiPath`/v1/leads/${leadId}`,
    });
  }

  /**
   * Create a Lead, or update the one this `linkedin_url` already resolves
   * to. The result carries `outcome`: `created`, `updated` or `unchanged`.
   * An omitted, `null` or empty field never erases a stored value.
   * `tags` are added (a new name creates the Tag); `list_id` or `list_name`
   * adds it to a list (a new name creates the list).
   * `POST /v1/leads`
   *
   * Needs a subscription: a Team without one is refused with `TIER_REQUIRED`.
   *
   * @example
   * const { id, outcome } = await curviate.leads.upsert({
   *   linkedin_url: "https://www.linkedin.com/in/ana/",
   *   job_title: "CTO",
   *   tags: ["warm"],
   * });
   */
  upsert(body: LeadUpsertBody): Promise<LeadUpsertResult> {
    return this.ctx.request<LeadUpsertResult>({
      method: "POST",
      path: "/v1/leads",
      body,
    });
  }

  /**
   * Change a Lead's fields. `null` clears a field (Curviate may fill it
   * again from a profile read) and removes an `extra` key; `""` is refused.
   * `linkedin_url` cannot change.
   * `PATCH /v1/leads/{id}`
   *
   * Needs a subscription: a Team without one is refused with `TIER_REQUIRED`.
   *
   * @example
   * await curviate.leads.update("con_123", { company: "Acme", extra: { plan: "pro" } });
   */
  update(leadId: string, body: LeadUpdateBody): Promise<LeadUpdateResult> {
    return this.ctx.request<LeadUpdateResult>({
      method: "PATCH",
      path: apiPath`/v1/leads/${leadId}`,
      body,
    });
  }

  /**
   * Delete a Lead (bodyless, 204): its list memberships and Tags go with it
   * and its Campaign enrollments end. Owners and Managers only.
   * `DELETE /v1/leads/{id}`
   *
   * @example
   * await curviate.leads.delete("con_123");
   */
  async delete(leadId: string): Promise<void> {
    // The transport hands a bodyless 204 back as an empty buffer; the contract is `void`.
    await this.ctx.request<unknown>({
      method: "DELETE",
      path: apiPath`/v1/leads/${leadId}`,
    });
  }

  /**
   * Delete up to 1,000 Leads by `lead_ids`, or every Lead a `filter`
   * matches (up to 10,000). Send exactly one of the two. `filter` takes the
   * {@link LeadsResource.list} filters as JSON, comma lists as arrays
   * (`list_id`, `not_list_id`, `list_match`, `has_email`, `tag`, ...); a
   * filter matching more than 10,000 Leads throws `INVALID_REQUEST`
   * naming the count and deletes nothing, so count first with
   * `list({ ...filter, include_total: true, limit: 1 })`. Ids that are not your
   * team's come back in `not_found` (always empty with a filter). Owners and
   * Managers only.
   * `POST /v1/leads/delete`
   *
   * @example
   * const { deleted, not_found } = await curviate.leads.deleteMany({ lead_ids: ["con_1", "con_2"] });
   *
   * @example
   * await curviate.leads.deleteMany({ filter: { list_id: ["cl_1"], has_email: false } });
   */
  deleteMany(body: LeadDeleteManyBody): Promise<LeadDeleteManyResult> {
    return this.ctx.request<LeadDeleteManyResult>({
      method: "POST",
      path: "/v1/leads/delete",
      body,
    });
  }

  /**
   * Add or remove Tags and list memberships on up to 1,000 Leads at once:
   * `add_tags`, `remove_tags`, `add_list_id` or `add_list_name` (created if
   * new), `remove_list_id`. Name the Leads with exactly one of
   * `lead_ids` or `filter`: every Lead the {@link LeadsResource.list}
   * filters match (comma lists as arrays), up to 10,000. A filter over the
   * cap throws `INVALID_REQUEST` naming the count and changes nothing.
   * `POST /v1/leads/update`
   *
   * Needs a subscription: a Team without one is refused with `TIER_REQUIRED`.
   *
   * @example
   * await curviate.leads.updateMany({ lead_ids: ["con_1", "con_2"], add_tags: ["vip"], add_list_name: "Q4" });
   * await curviate.leads.updateMany({ filter: { tag: ["warm"], has_email: true }, add_list_name: "Warm with email" });
   */
  updateMany(body: LeadUpdateManyBody): Promise<LeadUpdateManyResult> {
    return this.ctx.request<LeadUpdateManyResult>({
      method: "POST",
      path: "/v1/leads/update",
      body,
    });
  }

  /**
   * Fill Leads' profile fields, for up to 1,000 `lead_ids` or a
   * `list_id`. What Curviate already stores is used first; the rest is queued
   * as live profile views from `account_id`, paced like a person. A live
   * visit is a real profile view the person may see. `mode`: `auto`
   * (default; stored data newer than `max_age` seconds, else a visit),
   * `refill`, `cache_only` (never a visit, no `account_id` needed) or `live`.
   * `POST /v1/leads/enrich`
   *
   * Needs a subscription: a Team without one is refused with `TIER_REQUIRED`.
   *
   * @example
   * const { counts } = await curviate.leads.enrich({ list_id: "cl_123", account_id: "acc_123" });
   */
  enrich(body: LeadEnrichBody): Promise<LeadEnrichResult> {
    return this.ctx.request<LeadEnrichResult>({
      method: "POST",
      path: "/v1/leads/enrich",
      body,
    });
  }

  /**
   * Export every Lead matching the {@link LeadsResource.list} filters in
   * one download, no paging. `format: "json"` resolves with the Lead
   * array; `csv` (UTF-8 with a BOM) and `ndjson` (the default) resolve with
   * the raw bytes. `fields` picks and orders the columns; `list_id`,
   * `not_list_id`, `list_match` and `has_email` filter as on `list`. A CSV cell that
   * could run as a spreadsheet formula is prefixed with `'`.
   * `GET /v1/leads/export`
   *
   * @example
   * const leads = await curviate.leads.export({ format: "json", tag: "warm" });
   * const csv = new TextDecoder().decode(await curviate.leads.export({ format: "csv" }));
   */
  export(params: LeadExportParams & { format: "json" }): Promise<Lead[]>;
  export(params?: LeadExportParams & { format?: "csv" | "ndjson" }): Promise<ArrayBuffer>;
  export(params?: LeadExportParams): Promise<Lead[] | ArrayBuffer>;
  export(params?: LeadExportParams): Promise<Lead[] | ArrayBuffer> {
    return this.ctx.request<Lead[] | ArrayBuffer>({
      method: "GET",
      path: "/v1/leads/export",
      query: commaLists(params, "enrollment_status", "list_id", "not_list_id", "account_id"),
    });
  }
}
