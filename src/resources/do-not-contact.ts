/**
 * Do-not-contact list (root-scoped): `curviate.doNotContact` (7 methods).
 *
 * One list for the whole Team. No Motion contacts a person on it, and every
 * write toward them is refused with `DO_NOT_CONTACT` (an invitation, a chat
 * start or send, InMail, follow, endorse, a reaction or comment, a live
 * profile read). A reply in a conversation they wrote in stays allowed. An
 * entry whose Contact was deleted still applies (`contact` reads `null`).
 */
import type { RequestContext } from "../internal/context.js";
import type { paths } from "../generated/types.js";
import { apiPath } from "../internal/path.js";
import { pageable, type Pageable } from "../internal/paginate.js";

export type DoNotContactListParams = NonNullable<paths["/v1/do-not-contact"]["get"]["parameters"]["query"]>;
export type DoNotContactPage = paths["/v1/do-not-contact"]["get"]["responses"]["200"]["content"]["application/json"];
export type DoNotContactEntry = paths["/v1/do-not-contact/{id}"]["get"]["responses"]["200"]["content"]["application/json"];
export type DoNotContactAddBody = NonNullable<paths["/v1/do-not-contact"]["post"]["requestBody"]>["content"]["application/json"];
export type DoNotContactExportParams = NonNullable<paths["/v1/do-not-contact/export"]["get"]["parameters"]["query"]>;
/** One entry of a JSON export (`format: "json"`); NDJSON has one per line, CSV one per row. */
export type DoNotContactExportRow = paths["/v1/do-not-contact/export"]["get"]["responses"]["200"]["content"]["application/json"][number];
export type DoNotContactImportBody = NonNullable<paths["/v1/do-not-contact/import"]["post"]["requestBody"]>["content"]["application/json"];
/** The per-row report: `counts`, and one `report` entry per row with `outcome` (`created` | `unchanged` | `skipped`) and, for a skip, `skip_reason`. */
export type DoNotContactImportResult = paths["/v1/do-not-contact/import"]["post"]["responses"]["200"]["content"]["application/json"];
export type DoNotContactUpdateBody = NonNullable<paths["/v1/do-not-contact/{id}"]["patch"]["requestBody"]>["content"]["application/json"];

export class DoNotContactResource {
  constructor(private readonly ctx: RequestContext) {}

  /**
   * The Team's do-not-contact list, newest first. `q` matches the Contact's
   * name. `await` it for one page; `for await` it for every entry across
   * pages.
   * `GET /v1/do-not-contact`
   *
   * @example
   * for await (const entry of curviate.doNotContact.list({ q: "ana" })) console.log(entry.id, entry.reason);
   */
  list(params?: DoNotContactListParams): Pageable<DoNotContactPage> {
    return pageable(
      (p) => this.ctx.request<DoNotContactPage>({ method: "GET", path: "/v1/do-not-contact", ...(p ? { query: p } : {}) }),
      params,
    );
  }

  /**
   * One entry. `reason` is one of `asked_to_stop`, `existing_customer`,
   * `competitor`, `partner`, `employee`, `other`, or `null`.
   * `GET /v1/do-not-contact/{id}`
   *
   * @example
   * const entry = await curviate.doNotContact.get("dnc_123");
   */
  get(id: string): Promise<DoNotContactEntry> {
    return this.ctx.request<DoNotContactEntry>({ method: "GET", path: apiPath`/v1/do-not-contact/${id}` });
  }

  /**
   * Add one person by `contact_id` or `linkedin_url` (someone who is not a
   * Contact yet becomes one first, from stored data only), with an optional
   * `reason`. A person already on the list resolves with their existing entry,
   * unchanged. Any team member may add. For many people use {@link DoNotContactResource.import}. Needs
   * Automate: a Team below that Tier is refused with `TIER_REQUIRED`.
   * `POST /v1/do-not-contact`
   *
   * @example
   * const entry = await curviate.doNotContact.add({ linkedin_url: "https://www.linkedin.com/in/ana/", reason: "asked_to_stop" });
   */
  add(body: DoNotContactAddBody): Promise<DoNotContactEntry> {
    return this.ctx.request<DoNotContactEntry>({ method: "POST", path: "/v1/do-not-contact", body });
  }

  /**
   * Set the entry's `reason` from the fixed list; `null` clears it. Needs
   * Automate: a Team below that Tier is refused with `TIER_REQUIRED`.
   * `PATCH /v1/do-not-contact/{id}`
   *
   * @example
   * await curviate.doNotContact.update("dnc_123", { reason: "existing_customer" });
   */
  update(id: string, body: DoNotContactUpdateBody): Promise<DoNotContactEntry> {
    return this.ctx.request<DoNotContactEntry>({ method: "PATCH", path: apiPath`/v1/do-not-contact/${id}`, body });
  }

  /**
   * Export the whole list in one download, no paging, oldest first.
   * `format: "json"` resolves with the entry array; `csv` (UTF-8 with a BOM) and
   * `ndjson` (the default) resolve with the raw bytes. Each entry has
   * `linkedin_url` (`null` once the Contact was deleted), `reason`, `added_by`,
   * `via`, `created_at` and `id`. The file re-imports with {@link DoNotContactResource.import}.
   * Owners and Managers only (`INSUFFICIENT_ROLE`).
   * `GET /v1/do-not-contact/export`
   *
   * @example
   * const entries = await curviate.doNotContact.export({ format: "json" });
   * const csv = new TextDecoder().decode(await curviate.doNotContact.export({ format: "csv" }));
   */
  export(params: DoNotContactExportParams & { format: "json" }): Promise<DoNotContactExportRow[]>;
  export(params?: DoNotContactExportParams & { format?: "csv" | "ndjson" }): Promise<ArrayBuffer>;
  export(params?: DoNotContactExportParams): Promise<DoNotContactExportRow[] | ArrayBuffer>;
  export(params?: DoNotContactExportParams): Promise<DoNotContactExportRow[] | ArrayBuffer> {
    return this.ctx.request<DoNotContactExportRow[] | ArrayBuffer>({
      method: "GET",
      path: "/v1/do-not-contact/export",
      ...(params ? { query: params } : {}),
    });
  }

  /**
   * Put the people of a file on the list: up to 10,000 `rows` of
   * `{ linkedin_url, reason? }`, or a `csv` string with a header line (an
   * exported file works as it is). Each row works as {@link DoNotContactResource.add}:
   * a person already listed is `unchanged`, their entry and reason stay. A bad
   * URL or reason skips its row (`skip_reason`) and the others apply; a bad
   * structure rejects the file. Resolves with the per-row report. Any team
   * member may import. Needs Automate.
   * `POST /v1/do-not-contact/import`
   *
   * @example
   * const { counts, report } = await curviate.doNotContact.import({ rows: [{ linkedin_url: "https://www.linkedin.com/in/ana/", reason: "asked_to_stop" }] });
   */
  import(body: DoNotContactImportBody): Promise<DoNotContactImportResult> {
    return this.ctx.request<DoNotContactImportResult>({ method: "POST", path: "/v1/do-not-contact/import", body });
  }

  /**
   * Remove the entry (bodyless, 204): Motions and writes may reach the person
   * again. Owners and Managers only (`INSUFFICIENT_ROLE`).
   * `DELETE /v1/do-not-contact/{id}`
   *
   * @example
   * await curviate.doNotContact.remove("dnc_123");
   */
  async remove(id: string): Promise<void> {
    // The transport hands a bodyless 204 back as an empty buffer; the contract is `void`.
    await this.ctx.request<unknown>({ method: "DELETE", path: apiPath`/v1/do-not-contact/${id}` });
  }
}
