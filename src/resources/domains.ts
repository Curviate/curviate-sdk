/**
 * Domains resource: 1 method (root-scoped), `curviate.domains`.
 *
 * The DNS health of a sending domain: MX, SPF, DKIM, DMARC and the tracking
 * record, each `pass`, `fail` or `unknown`. A domain exists here once one of
 * your Team's Mailboxes is on it.
 */
import type { RequestContext } from "../internal/context.js";
import type { paths } from "../generated/types.js";
import { apiPath } from "../internal/path.js";

export type DomainChecks =
  paths["/v1/domains/{domain}/checks"]["get"]["responses"]["200"]["content"]["application/json"];

export class DomainsResource {
  constructor(private readonly ctx: RequestContext) {}

  /**
   * A sending domain's checks as last run (daily): each of `mx`, `spf`,
   * `dkim`, `dmarc` and `tracking` is `pass`, `fail` or `unknown` (a failed
   * lookup, or a DKIM selector not known yet; never a failure), with the
   * `tracking_record` CNAME to add and any named `blocklists`.
   * `GET /v1/domains/{domain}/checks`
   *
   * With `{ now: true }` it runs the checks now and returns the result: DNS
   * lookups only, it sends nothing and connects to no Mailbox.
   * `POST /v1/domains/{domain}/checks`
   *
   * A domain none of your Team's Mailboxes is on is `404 DOMAIN_NOT_FOUND`.
   *
   * @example
   * const { checks } = await curviate.domains.check("acme.example", { now: true });
   */
  check(domain: string, options: { now?: boolean } = {}): Promise<DomainChecks> {
    return this.ctx.request<DomainChecks>({
      method: options.now ? "POST" : "GET",
      path: apiPath`/v1/domains/${domain}/checks`,
    });
  }
}
