/**
 * Contacts resource: 9 methods plus `imports` (4 methods), root-scoped,
 * `curviate.contacts`.
 *
 * A Contact is a person your team keeps: a LinkedIn URL plus your own fields
 * (`job_title`, `email`, `extra`, ...), Tags and Contact list memberships.
 * Contacts belong to the team, not to an account. Any spelling of one person's
 * profile or Sales Navigator URL resolves to the same Contact, so writing the
 * same person twice updates one Contact rather than creating a second.
 *
 * Profile reads through Curviate keep matching Contacts up to date
 * (`enrichment`); {@link ContactsResource.enrich} asks for it explicitly.
 * Deleting Contacts, lists or Tags is for Owners and Managers; a Member gets
 * `INSUFFICIENT_ROLE`. A cap (100,000 Contacts, 50 Tags per Contact, ...)
 * refuses with `CONTACT_LIMIT_REACHED`.
 */
import type { RequestContext } from "../internal/context.js";
import type { paths } from "../generated/types.js";
import { apiPath } from "../internal/path.js";
import { commaLists } from "../internal/query.js";

// ─── Type aliases from generated OpenAPI snapshot ──────────────────────────

export type ContactListParams = NonNullable<paths["/v1/contacts"]["get"]["parameters"]["query"]>;
export type ContactListPage = paths["/v1/contacts"]["get"]["responses"]["200"]["content"]["application/json"];
export type Contact = paths["/v1/contacts/{id}"]["get"]["responses"]["200"]["content"]["application/json"];
export type ContactUpsertBody = NonNullable<paths["/v1/contacts"]["post"]["requestBody"]>["content"]["application/json"];
/** `201` when the Contact was created, `200` when updated or unchanged; `outcome` says which. */
export type ContactUpsertResult =
  | paths["/v1/contacts"]["post"]["responses"]["200"]["content"]["application/json"]
  | paths["/v1/contacts"]["post"]["responses"]["201"]["content"]["application/json"];
export type ContactUpdateBody = NonNullable<paths["/v1/contacts/{id}"]["patch"]["requestBody"]>["content"]["application/json"];
export type ContactUpdateResult = paths["/v1/contacts/{id}"]["patch"]["responses"]["200"]["content"]["application/json"];
export type ContactDeleteManyBody = NonNullable<paths["/v1/contacts/delete"]["post"]["requestBody"]>["content"]["application/json"];
export type ContactDeleteManyResult = paths["/v1/contacts/delete"]["post"]["responses"]["200"]["content"]["application/json"];
export type ContactUpdateManyBody = NonNullable<paths["/v1/contacts/update"]["post"]["requestBody"]>["content"]["application/json"];
export type ContactUpdateManyResult = paths["/v1/contacts/update"]["post"]["responses"]["200"]["content"]["application/json"];
export type ContactEnrichBody = NonNullable<paths["/v1/contacts/enrich"]["post"]["requestBody"]>["content"]["application/json"];
export type ContactEnrichResult = paths["/v1/contacts/enrich"]["post"]["responses"]["200"]["content"]["application/json"];
export type ContactExportParams = NonNullable<paths["/v1/contacts/export"]["get"]["parameters"]["query"]>;

export type ContactImportCreateBody = NonNullable<paths["/v1/contacts/imports"]["post"]["requestBody"]>["content"]["application/json"];
/** `201` with the finished report for a small import, `202` with a `queued` import for a large one. */
export type ContactImport =
  | paths["/v1/contacts/imports"]["post"]["responses"]["201"]["content"]["application/json"]
  | paths["/v1/contacts/imports"]["post"]["responses"]["202"]["content"]["application/json"];
export type ContactImportListParams = NonNullable<paths["/v1/contacts/imports"]["get"]["parameters"]["query"]>;
export type ContactImportListPage = paths["/v1/contacts/imports"]["get"]["responses"]["200"]["content"]["application/json"];
export type ContactImportGetResult = paths["/v1/contacts/imports/{id}"]["get"]["responses"]["200"]["content"]["application/json"];
export type ContactImportRowsParams = NonNullable<paths["/v1/contacts/imports/{id}/rows"]["get"]["parameters"]["query"]>;
export type ContactImportRowsPage = paths["/v1/contacts/imports/{id}/rows"]["get"]["responses"]["200"]["content"]["application/json"];

// ─── Resource classes ─────────────────────────────────────────────────────────

/**
 * Contact imports, `curviate.contacts.imports`: up to 10,000 rows (body up to
 * 9 MiB) per import, as JSON `rows` or a `csv` string. Up to 500 rows run
 * inline; larger imports run in the background, one at a time per team, at
 * most 5 queued or running (`IMPORT_QUEUE_FULL` beyond that, retry later).
 * Imports and their per-row reports are kept 30 days after they finish.
 */
export class ContactImportsResource {
  constructor(private readonly ctx: RequestContext) {}

  /**
   * Import Contacts. Send exactly one of `rows` (objects with `linkedin_url`,
   * the standard fields, `extra`, `tags`; an exported JSON file re-imports
   * as is) or `csv` (the file as text; `delimiter` and a header `mapping`
   * are optional). `list_id` or `list_name` adds every row's Contact to a
   * list, `tags`/`remove_tags` add or remove Tags on every row's Contact.
   * `POST /v1/contacts/imports`
   *
   * A malformed request (an unknown key, a wrong type) is refused whole; a row
   * with a bad value is skipped and named in the report. Not retry-safe: a
   * retry makes a second import, whose rows report `unchanged`.
   *
   * @example
   * const imp = await curviate.contacts.imports.create({
   *   rows: [{ linkedin_url: "https://www.linkedin.com/in/ana/", job_title: "CTO" }],
   *   list_name: "Q4 webinar",
   * });
   * if (imp.status === "queued") console.log(`Running in the background: ${imp.id}`);
   */
  create(body: ContactImportCreateBody): Promise<ContactImport> {
    return this.ctx.request<ContactImport>({
      method: "POST",
      path: "/v1/contacts/imports",
      body,
    });
  }

  /**
   * List your team's imports.
   * `GET /v1/contacts/imports`
   *
   * @example
   * const { items } = await curviate.contacts.imports.list({ limit: 10 });
   */
  list(params?: ContactImportListParams): Promise<ContactImportListPage> {
    return this.ctx.request<ContactImportListPage>({
      method: "GET",
      path: "/v1/contacts/imports",
      ...(params ? { query: params } : {}),
    });
  }

  /**
   * Read an import: its `status` and counts. Poll a background import until
   * `status` is `completed` or `failed`.
   * `GET /v1/contacts/imports/{id}`
   *
   * @example
   * const { status } = await curviate.contacts.imports.get("imp_123");
   */
  get(importId: string): Promise<ContactImportGetResult> {
    return this.ctx.request<ContactImportGetResult>({
      method: "GET",
      path: apiPath`/v1/contacts/imports/${importId}`,
    });
  }

  /**
   * Page through an import's per-row report: each row's `outcome` (`created`,
   * `updated`, `unchanged`, `skipped`), its Contact, and why a row was
   * skipped. `outcome` is a comma list to keep.
   * `GET /v1/contacts/imports/{id}/rows`
   *
   * @example
   * const { items } = await curviate.contacts.imports.rows("imp_123", { outcome: "skipped" });
   */
  rows(importId: string, params?: ContactImportRowsParams): Promise<ContactImportRowsPage> {
    return this.ctx.request<ContactImportRowsPage>({
      method: "GET",
      path: apiPath`/v1/contacts/imports/${importId}/rows`,
      ...(params ? { query: params } : {}),
    });
  }
}

export class ContactsResource {
  /** Bulk imports from rows or CSV. */
  readonly imports: ContactImportsResource;

  constructor(private readonly ctx: RequestContext) {
    this.imports = new ContactImportsResource(ctx);
  }

  /**
   * List Contacts, newest first (`order: "asc"` for oldest). Filters combine:
   * `list_id`, `tag` (comma list, any of them), `import_id`, `linkedin_url`,
   * `q` (substring over names, headline, job title, company, email,
   * location), `enrichment_status`, `connected`, `account_id` (Connections of
   * that account), `motion_id` + `enrollment_status` (any of the statuses
   * given). Pages with an opaque
   * `cursor` until it is `null`.
   * `GET /v1/contacts`
   *
   * @example
   * const { items, cursor } = await curviate.contacts.list({ tag: "warm", limit: 100 });
   */
  list(params?: ContactListParams): Promise<ContactListPage> {
    return this.ctx.request<ContactListPage>({
      method: "GET",
      path: "/v1/contacts",
      ...(params ? { query: commaLists(params, "enrollment_status") } : {}),
    });
  }

  /**
   * Read one Contact.
   * `GET /v1/contacts/{id}`
   *
   * @example
   * const contact = await curviate.contacts.get("con_123");
   */
  get(contactId: string): Promise<Contact> {
    return this.ctx.request<Contact>({
      method: "GET",
      path: apiPath`/v1/contacts/${contactId}`,
    });
  }

  /**
   * Create a Contact, or update the one this `linkedin_url` already resolves
   * to. The result carries `outcome`: `created`, `updated` or `unchanged`.
   * An omitted, `null` or empty field never erases a stored value.
   * `tags` are added (a new name creates the Tag); `list_id` or `list_name`
   * adds it to a list (a new name creates the list).
   * `POST /v1/contacts`
   *
   * @example
   * const { id, outcome } = await curviate.contacts.upsert({
   *   linkedin_url: "https://www.linkedin.com/in/ana/",
   *   job_title: "CTO",
   *   tags: ["warm"],
   * });
   */
  upsert(body: ContactUpsertBody): Promise<ContactUpsertResult> {
    return this.ctx.request<ContactUpsertResult>({
      method: "POST",
      path: "/v1/contacts",
      body,
    });
  }

  /**
   * Change a Contact's fields. `null` clears a field (Curviate may fill it
   * again from a profile read) and removes an `extra` key; `""` is refused.
   * `linkedin_url` cannot change.
   * `PATCH /v1/contacts/{id}`
   *
   * @example
   * await curviate.contacts.update("con_123", { company: "Acme", extra: { plan: "pro" } });
   */
  update(contactId: string, body: ContactUpdateBody): Promise<ContactUpdateResult> {
    return this.ctx.request<ContactUpdateResult>({
      method: "PATCH",
      path: apiPath`/v1/contacts/${contactId}`,
      body,
    });
  }

  /**
   * Delete a Contact (bodyless, 204): its list memberships and Tags go with it
   * and its Motion enrollments end. Owners and Managers only.
   * `DELETE /v1/contacts/{id}`
   *
   * @example
   * await curviate.contacts.delete("con_123");
   */
  async delete(contactId: string): Promise<void> {
    // The transport hands a bodyless 204 back as an empty buffer; the contract is `void`.
    await this.ctx.request<unknown>({
      method: "DELETE",
      path: apiPath`/v1/contacts/${contactId}`,
    });
  }

  /**
   * Delete up to 1,000 Contacts. Ids that are not your team's come back in
   * `not_found`. Owners and Managers only.
   * `POST /v1/contacts/delete`
   *
   * @example
   * const { deleted, not_found } = await curviate.contacts.deleteMany({ contact_ids: ["con_1", "con_2"] });
   */
  deleteMany(body: ContactDeleteManyBody): Promise<ContactDeleteManyResult> {
    return this.ctx.request<ContactDeleteManyResult>({
      method: "POST",
      path: "/v1/contacts/delete",
      body,
    });
  }

  /**
   * Add or remove Tags and list memberships on up to 1,000 Contacts at once:
   * `add_tags`, `remove_tags`, `add_list_id` or `add_list_name` (created if
   * new), `remove_list_id`.
   * `POST /v1/contacts/update`
   *
   * @example
   * await curviate.contacts.updateMany({ contact_ids: ["con_1", "con_2"], add_tags: ["vip"], add_list_name: "Q4" });
   */
  updateMany(body: ContactUpdateManyBody): Promise<ContactUpdateManyResult> {
    return this.ctx.request<ContactUpdateManyResult>({
      method: "POST",
      path: "/v1/contacts/update",
      body,
    });
  }

  /**
   * Fill Contacts' profile fields, for up to 1,000 `contact_ids` or a
   * `list_id`. What Curviate already stores is used first; the rest is queued
   * as live profile views from `account_id`, paced like a person. A live
   * visit is a real profile view the person may see. `mode`: `auto`
   * (default; stored data newer than `max_age` seconds, else a visit),
   * `refill`, `cache_only` (never a visit, no `account_id` needed) or `live`.
   * `POST /v1/contacts/enrich`
   *
   * @example
   * const { counts } = await curviate.contacts.enrich({ list_id: "cl_123", account_id: "acc_123" });
   */
  enrich(body: ContactEnrichBody): Promise<ContactEnrichResult> {
    return this.ctx.request<ContactEnrichResult>({
      method: "POST",
      path: "/v1/contacts/enrich",
      body,
    });
  }

  /**
   * Export every Contact matching the {@link ContactsResource.list} filters in
   * one download, no paging. `format: "json"` resolves with the Contact
   * array; `csv` (UTF-8 with a BOM) and `ndjson` (the default) resolve with
   * the raw bytes. `fields` picks and orders the columns. A CSV cell that
   * could run as a spreadsheet formula is prefixed with `'`.
   * `GET /v1/contacts/export`
   *
   * @example
   * const contacts = await curviate.contacts.export({ format: "json", tag: "warm" });
   * const csv = new TextDecoder().decode(await curviate.contacts.export({ format: "csv" }));
   */
  export(params: ContactExportParams & { format: "json" }): Promise<Contact[]>;
  export(params?: ContactExportParams & { format?: "csv" | "ndjson" }): Promise<ArrayBuffer>;
  export(params?: ContactExportParams): Promise<Contact[] | ArrayBuffer>;
  export(params?: ContactExportParams): Promise<Contact[] | ArrayBuffer> {
    return this.ctx.request<Contact[] | ArrayBuffer>({
      method: "GET",
      path: "/v1/contacts/export",
      ...(params ? { query: commaLists(params, "enrollment_status") } : {}),
    });
  }
}
