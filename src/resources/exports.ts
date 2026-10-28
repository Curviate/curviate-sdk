/**
 * Exports (root-scoped): `curviate.exports` (3 methods).
 *
 * A background export of Analytics tables, Motion or Account activity or an
 * Account's daily metrics, for sets too large to wait on. One export per Team
 * at a time. Owners and Managers. Create it, poll it until `status` is
 * `ready`, then download the file within 24 hours. The file is never behind a
 * link: you download it with your own credentials. For the same bytes
 * streamed now, `analytics.export` needs no job.
 */
import type { RequestContext } from "../internal/context.js";
import type { paths } from "../generated/types.js";
import { apiPath } from "../internal/path.js";

export type ExportCreateBody = paths["/v1/exports"]["post"]["requestBody"]["content"]["application/json"];
export type Export = paths["/v1/exports"]["post"]["responses"]["202"]["content"]["application/json"];
export type ExportGetResult = paths["/v1/exports/{export_id}"]["get"]["responses"]["200"]["content"]["application/json"];

export class ExportsResource {
  constructor(private readonly ctx: RequestContext) {}

  /**
   * Start an export; it runs in the background and this resolves at once with
   * `status: "queued"`. `entity` is what to export (`analytics`,
   * `motion_activity`, `account_activity` or `account_metrics`), `format`
   * `csv`, `json` or `ndjson` (one table only), `tables` picks the Analytics
   * tables (`daily`, `accounts`, `motions`, `enrollments`; several make one
   * ZIP), `filters` are the Analytics overview's filters (default: the last
   * 30 days). Your team has one export at a time: a second is refused with
   * `EXPORT_IN_PROGRESS`, and `details.export_id` names the running one (it
   * may be a teammate's, which `get` answers 404). An Owner or Manager only.
   * `POST /v1/exports`
   *
   * Not retry-safe: a retry starts a second export once the first finishes.
   *
   * @example
   * const exp = await curviate.exports.create({ entity: "analytics", format: "csv", tables: ["daily"], filters: { range: "90d" } });
   */
  create(body: ExportCreateBody): Promise<Export> {
    return this.ctx.request<Export>({ method: "POST", path: "/v1/exports", body });
  }

  /**
   * One export of yours and its `status`: `queued`, `running`, `ready`
   * (download it), `failed` (read `error`: `EXPORT_TOO_LARGE` means narrow the
   * filters or tables), `expired` (24 hours after `ready_at`, the file is
   * deleted) or `removed` (a Contact was deleted, which removes the Team's
   * exports that hold Contacts). Accept statuses you do not know. There is no
   * link to the file.
   * `GET /v1/exports/{export_id}`
   *
   * @example
   * const { status } = await curviate.exports.get("exp_123");
   */
  get(exportId: string): Promise<ExportGetResult> {
    return this.ctx.request<ExportGetResult>({ method: "GET", path: apiPath`/v1/exports/${exportId}` });
  }

  /**
   * Download a ready export's file as bytes (CSV with a BOM, JSON, NDJSON, or
   * a ZIP when several tables were asked). A queued, running or failed export
   * throws `EXPORT_NOT_READY`, an expired one `EXPORT_EXPIRED` and one removed
   * by a Contact delete `EXPORT_REMOVED` (run it again). A `json` file comes
   * back compact, not byte-for-byte.
   * `GET /v1/exports/{export_id}/file`
   *
   * @example
   * const bytes = await curviate.exports.download("exp_123");
   * await fs.promises.writeFile("export.csv", Buffer.from(bytes));
   */
  async download(exportId: string): Promise<ArrayBuffer> {
    return this.ctx.request<ArrayBuffer>({ bytes: true, method: "GET", path: apiPath`/v1/exports/${exportId}/file` });
  }
}
