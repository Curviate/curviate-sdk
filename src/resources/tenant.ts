/**
 * Tenant settings (root-scoped): `curviate.tenant.beta` (2 methods).
 */
import type { RequestContext } from "../internal/context.js";

// ponytail: hand-typed until the served OpenAPI carries `/v1/tenant/beta`; swap to `paths[...]` on the next regen.
/** The Team's persisted beta consent. */
export interface TenantBetaConsent {
  object: "tenant_beta_consent";
  beta_enabled: boolean;
}
export interface TenantBetaSetBody {
  beta_enabled: boolean;
}

/** `curviate.tenant.beta`: whether the Team consents to beta-gated operations. */
export class TenantBetaResource {
  constructor(private readonly ctx: RequestContext) {}

  /**
   * The persisted decision only, not the effective consent of a given call:
   * the `X-Curviate-Beta` header overrides it per request, either way. Every
   * member may read.
   * `GET /v1/tenant/beta`
   *
   * @example
   * const { beta_enabled } = await curviate.tenant.beta.get();
   */
  get(): Promise<TenantBetaConsent> {
    return this.ctx.request<TenantBetaConsent>({ method: "GET", path: "/v1/tenant/beta" });
  }

  /**
   * Persist the consent for every account of the Team. Off: beta-gated
   * operations refuse `BETA_NOT_ENABLED` again from the next call. Owners
   * only (`INSUFFICIENT_ROLE`).
   * `PATCH /v1/tenant/beta`
   *
   * @example
   * await curviate.tenant.beta.set({ beta_enabled: true });
   */
  set(body: TenantBetaSetBody): Promise<TenantBetaConsent> {
    return this.ctx.request<TenantBetaConsent>({ method: "PATCH", path: "/v1/tenant/beta", body });
  }
}

export class TenantResource {
  /** Beta consent: `get` and `set`. */
  readonly beta: TenantBetaResource;

  constructor(ctx: RequestContext) {
    this.beta = new TenantBetaResource(ctx);
  }
}
