/**
 * Mailboxes resource: 7 methods (root-scoped), `curviate.mailboxes`, with
 * `curviate.mailboxes.placementTests` (3) and `curviate.mailboxes.purchases` (6).
 *
 * A Mailbox is an email address your Team sends from. Connecting one is a
 * Connect request (`curviate.connectRequests.create({ mailbox: ... })`): there
 * is no create call here, and the password of a Mailbox belongs only in that
 * request's body, never in a URL, a log line or a prompt. No response from
 * this resource ever holds a password or a token.
 *
 * Mailboxes are available while your Team has them switched on; before that
 * every call answers `404 RESOURCE_NOT_FOUND`.
 */
import type { RequestContext } from "../internal/context.js";
import type { paths } from "../generated/types.js";
import { apiPath } from "../internal/path.js";

// ─── Type aliases from generated OpenAPI snapshot ──────────────────────────

export type MailboxListParams = NonNullable<paths["/v1/mailboxes"]["get"]["parameters"]["query"]>;
export type MailboxListPage = paths["/v1/mailboxes"]["get"]["responses"]["200"]["content"]["application/json"];
export type Mailbox = paths["/v1/mailboxes/{id}"]["get"]["responses"]["200"]["content"]["application/json"];
export type MailboxUpdateBody = NonNullable<paths["/v1/mailboxes/{id}"]["patch"]["requestBody"]>["content"]["application/json"];
export type MailboxRemoveResult = paths["/v1/mailboxes/{id}"]["delete"]["responses"]["200"]["content"]["application/json"];
export type MailboxDiscoverResult =
  paths["/v1/mailboxes/discover"]["get"]["responses"]["200"]["content"]["application/json"];
export type PlacementTestRunBody = NonNullable<paths["/v1/mailboxes/{id}/placement-tests"]["post"]["requestBody"]>["content"]["application/json"];
export type PlacementTest = paths["/v1/mailboxes/{id}/placement-tests"]["post"]["responses"]["202"]["content"]["application/json"];
export type PlacementTestListParams = NonNullable<paths["/v1/mailboxes/{id}/placement-tests"]["get"]["parameters"]["query"]>;
export type PlacementTestListPage = paths["/v1/mailboxes/{id}/placement-tests"]["get"]["responses"]["200"]["content"]["application/json"];
export type MailboxPurchaseCreateBody = NonNullable<paths["/v1/mailboxes/purchases"]["post"]["requestBody"]>["content"]["application/json"];
export type MailboxPurchase = paths["/v1/mailboxes/purchases/{id}"]["get"]["responses"]["200"]["content"]["application/json"];
export type MailboxPurchaseListParams = NonNullable<paths["/v1/mailboxes/purchases"]["get"]["parameters"]["query"]>;
export type MailboxPurchaseListPage = paths["/v1/mailboxes/purchases"]["get"]["responses"]["200"]["content"]["application/json"];
export type MailboxQuote = paths["/v1/mailboxes/purchases/quote"]["get"]["responses"]["200"]["content"]["application/json"];

// ─── Resource class ───────────────────────────────────────────────────────────

/** `curviate.mailboxes.placementTests`: where a Mailbox's email lands, by provider. */
export class PlacementTestsResource {
  constructor(private readonly ctx: RequestContext) {}

  /**
   * Run a placement test: your exact subject and body go from this Mailbox to
   * 12 test inboxes, 3 at each of Google Workspace, Microsoft 365, Gmail and
   * Outlook.com, and each copy's landing is read; results within an hour.
   * Answers with the running test; read it again with `get` for the verdicts.
   * The 12 copies count against the Mailbox's daily cap, so it needs room for
   * 12 today. Each test draws one from the Team's allowance: 10 per paid seat
   * a month, pooled across the Team (a trial has 0).
   *
   * Refusals, none of which sends anything or draws from the allowance:
   * `PLACEMENT_TEST_ALLOWANCE_EXHAUSTED` (429: this month's allowance is used,
   * or the Team has no paid seat; the message, and `list`'s
   * `allowance.resets_at`, say when it resets. Never retried: waiting minutes
   * does not help), `PLACEMENT_TESTS_UNAVAILABLE`
   * (503: tests cannot run right now), `MAILBOX_STATE_CONFLICT` (the Mailbox
   * cannot send now), `INVALID_REQUEST` (no room for 12 today, or a malformed
   * subject or body). Owners and Managers test any Mailbox; a Member only the
   * ones they connected.
   * `POST /v1/mailboxes/{id}/placement-tests`
   *
   * @example
   * const test = await curviate.mailboxes.placementTests.run("mbx_123", { subject: "Quick question", body: "Hi Anna, ..." });
   * // test.status: "running"; test.allowance: { used: 1, total: 10, resets_at }
   */
  run(mailboxId: string, body: PlacementTestRunBody): Promise<PlacementTest> {
    return this.ctx.request<PlacementTest>({ method: "POST", path: apiPath`/v1/mailboxes/${mailboxId}/placement-tests`, body });
  }

  /**
   * This Mailbox's placement tests, newest first, with the Team's allowance
   * `{ used, total, resets_at }`. Every role reads.
   * `GET /v1/mailboxes/{id}/placement-tests`
   *
   * @example
   * const { items, allowance } = await curviate.mailboxes.placementTests.list("mbx_123");
   */
  list(mailboxId: string, params?: PlacementTestListParams): Promise<PlacementTestListPage> {
    return this.ctx.request<PlacementTestListPage>({ method: "GET", path: apiPath`/v1/mailboxes/${mailboxId}/placement-tests`, ...(params ? { query: params } : {}) });
  }

  /**
   * One placement test: `running` or `complete`, and a verdict per provider
   * (`inbox`, `partly_spam` or `spam`; null while running).
   * `GET /v1/mailboxes/{id}/placement-tests/{test_id}`
   *
   * @example
   * const { status, verdicts } = await curviate.mailboxes.placementTests.get("mbx_123", "plt_123");
   */
  get(mailboxId: string, testId: string): Promise<PlacementTest> {
    return this.ctx.request<PlacementTest>({ method: "GET", path: apiPath`/v1/mailboxes/${mailboxId}/placement-tests/${testId}` });
  }
}

/** `curviate.mailboxes.purchases`: Mailboxes from Curviate, ordered on a domain your Team owns. */
export class MailboxPurchasesResource {
  constructor(private readonly ctx: RequestContext) {}

  /**
   * Order 1 to 50 Mailboxes from Curviate on one domain your Team owns (a
   * registrable domain, never a subdomain such as `mail.acme.com`), warm-up
   * included. Read the price first with `quote`, and show that. The
   * order waits in `awaiting_dns` until the records it lists are found at your
   * domain; nothing is charged before. The answer's `price` is what this order
   * costs: when it differs from the quote the person agreed to, `cancel` it
   * while it is `awaiting_dns` (free) and tell them.
   * Owners only (another role: `403 INSUFFICIENT_ROLE`). An order through an
   * API key counts under the Team's cap on Mailboxes from Curviate, which an
   * Owner sets in the dashboard (`billing.spendingCap()` reads `mailbox_cap`):
   * from 80% of it the order carries a `SPENDING_CAP_NEAR` notice; past it,
   * `403 SPENDING_CAP_REACHED` and nothing is ordered. Other refusals:
   * `MAILBOX_PURCHASE_TRIAL` (a Team on a trial), `MAILBOX_PURCHASE_PENDING`
   * (this domain already has an order waiting), `DOMAIN_IN_USE`,
   * `DOMAIN_IS_COMPANY_EMAIL` (the domain your company email runs on),
   * `MAILBOX_SALES_PAUSED` (orders cannot be placed at the moment). One HTTP
   * call, never retried. No answer ever holds a password.
   * `POST /v1/mailboxes/purchases`
   *
   * @example
   * const order = await curviate.mailboxes.purchases.create({
   *   domain: "acme-mail.example",
   *   mailboxes: [{ local_part: "anna", display_name: "Anna Weber", sends_for: { kind: "shared" } }],
   * });
   */
  create(body: MailboxPurchaseCreateBody): Promise<MailboxPurchase> {
    return this.ctx.request<MailboxPurchase>({ method: "POST", path: "/v1/mailboxes/purchases", body });
  }

  /**
   * What `mailboxes` Mailboxes from Curviate cost your Team, read now from the
   * price the charge uses: `unit_amount` and `amount` (minor units, before
   * tax) for the Team's `billing_period`, `charged` (`with_next_invoice` for a
   * monthly Team; `when_records_found` for a yearly Team, which pays the rest
   * of its year that day; `never`), `prorated`, `plus_tax`, and `orderable`
   * with `not_orderable_reason` (`trial`, `sales_paused`). `charge_waits_for`
   * (`payment`, `subscription`) says the charge would wait. Show these as
   * served, never a price of your own. Owners only. One HTTP call, no charge.
   * `GET /v1/mailboxes/purchases/quote`
   *
   * @example
   * const { amount, currency, billing_period, charged } = await curviate.mailboxes.purchases.quote(3);
   */
  quote(mailboxes: number): Promise<MailboxQuote> {
    return this.ctx.request<MailboxQuote>({ method: "GET", path: "/v1/mailboxes/purchases/quote", query: { mailboxes } });
  }

  /**
   * Your Team's orders, newest first, every role. Filter by `state`; page with
   * `cursor` from `next_cursor` while `has_more`.
   * `GET /v1/mailboxes/purchases`
   *
   * @example
   * const { data } = await curviate.mailboxes.purchases.list({ state: "awaiting_dns" });
   */
  list(params?: MailboxPurchaseListParams): Promise<MailboxPurchaseListPage> {
    return this.ctx.request<MailboxPurchaseListPage>({ method: "GET", path: "/v1/mailboxes/purchases", ...(params ? { query: params } : {}) });
  }

  /**
   * One order. `state`: `awaiting_dns` (waiting for the records), `provisioning`
   * (charged, the Mailboxes being set up), `active`, or `cancelled` with a
   * `reason`: `requested`, `expired`, or `host_failed` (setting up failed and
   * Curviate undid the charge in full; an order being reversed reads
   * `provisioning` until then). Neither `provisioning` nor `host_failed` is a
   * cue to retry or to order again: read the order again later.
   * Its records: six rows to add at your domain exactly as shown (`mx`,
   * `spf`, `dkim`, `dmarc`, `verify`, `tracking`; `tracking` is not
   * required; the `mx` row also holds one CNAME that confirms the domain is
   * yours, `verify` one TXT record that confirms this order is yours) and
   * which are found. Tolerate a row `check` you do not know. Another Team's id answers `404 MAILBOX_PURCHASE_NOT_FOUND`, as an
   * unknown one.
   * `GET /v1/mailboxes/purchases/{id}`
   *
   * @example
   * const { state, records } = await curviate.mailboxes.purchases.get("mpu_123");
   */
  get(purchaseId: string): Promise<MailboxPurchase> {
    return this.ctx.request<MailboxPurchase>({ method: "GET", path: apiPath`/v1/mailboxes/purchases/${purchaseId}` });
  }

  /**
   * Look up the order's records now instead of waiting for Curviate's own
   * checks (every 15 minutes for 2 hours after the order, then hourly), and
   * answer the order with each row's `found`. Once a minute per order: sooner
   * is `429 PLATFORM_RATE_LIMIT`. An order no longer waiting for its records
   * is answered as it is. Owners only.
   * `POST /v1/mailboxes/purchases/{id}/check`
   *
   * @example
   * const { state, records } = await curviate.mailboxes.purchases.check("mpu_123");
   */
  check(purchaseId: string): Promise<MailboxPurchase> {
    return this.ctx.request<MailboxPurchase>({ method: "POST", path: apiPath`/v1/mailboxes/purchases/${purchaseId}/check` });
  }

  /**
   * Cancel an order still waiting for its records: nothing was charged, so
   * nothing is refunded. An order being charged, being set up, active or
   * cancelled answers `409 MAILBOX_PURCHASE_STATE_CONFLICT` and stays as it
   * is. While a charge is under way that answer is neither a failure to retry
   * nor a cancellation: read the order again in a few minutes with `get`.
   * Owners only. One HTTP call, never retried.
   * `DELETE /v1/mailboxes/purchases/{id}`
   *
   * @example
   * const { state } = await curviate.mailboxes.purchases.cancel("mpu_123"); // "cancelled"
   */
  cancel(purchaseId: string): Promise<MailboxPurchase> {
    return this.ctx.request<MailboxPurchase>({ method: "DELETE", path: apiPath`/v1/mailboxes/purchases/${purchaseId}` });
  }
}

export class MailboxesResource {
  readonly placementTests: PlacementTestsResource;
  readonly purchases: MailboxPurchasesResource;

  constructor(private readonly ctx: RequestContext) {
    this.placementTests = new PlacementTestsResource(ctx);
    this.purchases = new MailboxPurchasesResource(ctx);
  }

  /**
   * List your Team's Mailboxes, newest first, one HTTP call per page. Filter by
   * `state`, by `sends_for` (an Account id, `shared` or `none`) or by `domain`.
   * Pages with an opaque `cursor` until it is `null`.
   * `GET /v1/mailboxes`
   *
   * @example
   * const { items } = await curviate.mailboxes.list({ state: "connected", limit: 100 });
   */
  list(params?: MailboxListParams): Promise<MailboxListPage> {
    return this.ctx.request<MailboxListPage>({
      method: "GET",
      path: "/v1/mailboxes",
      ...(params ? { query: params } : {}),
    });
  }

  /**
   * One Mailbox of your Team. An unknown id and another Team's id answer the
   * same `404 MAILBOX_NOT_FOUND`.
   * `GET /v1/mailboxes/{id}`
   *
   * @param mailboxId - the Mailbox id (`mbx_...`).
   *
   * @example
   * const { state, sends_for } = await curviate.mailboxes.get("mbx_123");
   */
  get(mailboxId: string): Promise<Mailbox> {
    return this.ctx.request<Mailbox>({
      method: "GET",
      path: apiPath`/v1/mailboxes/${mailboxId}`,
    });
  }

  /**
   * Set the daily cap (1 to 50), the signature (plain text, at most 2,000
   * characters, `null` clears it), the From name `display_name` (one line, at
   * most 100 characters; `null` sends with the name of the Account it sends
   * for) and/or `sends_for`: `{ kind: "account",
   * account_id }` (sends only for that one Account), `{ kind: "shared" }` (any
   * Account of the Team may send from it) or `null` (sends nothing until
   * linked). One Account, never a list. `warm_up: { enabled: true, days }`
   * (10, 14, 21 or 28) turns Mailbox warm-up on: short everyday emails
   * exchanged with other Teams' Mailboxes, filed in their own folder, so the
   * Mailbox builds a sending history; `{ enabled: false }` turns it off. The
   * read carries `warm_up { enabled, days, day, state, reason }`. Owners and
   * Managers change any Mailbox; a Member only the ones they connected.
   * `reputation` is a whole number 0 to 100, or `null`: with
   * `reputation_reason` `warm_up_off` the Mailbox has no score because
   * warm-up is off; otherwise not enough to say yet (show "gathering", never
   * 0).
   * The read also carries `landing { google, microsoft, other, read_at }`:
   * where this Mailbox's own warm-up mail lands per receiving provider over the
   * last 7 days, a verdict (`inbox`, `partly_spam`, `spam`, or `gathering`
   * while there is not enough to say), never a count, and `landing.reason`
   * `warm_up_off` when warm-up is off and there is nothing to read. Show the
   * verdict as served; there is nothing to compute from it.
   * `state` is `off`, `warming` (day N of the days picked; past them it stays
   * `warming` until ready), `ready` (the warm-up's bar is met; sending does not
   * change) or `waiting`: on but
   * not running now, its day held; `reason` says why (`paused_by_curviate`,
   * `reconnect_needed`, `trial`, `app_password`, `warm_up_app`, `allowance`,
   * `address_check`: Curviate is confirming the address receives its mail,
   * nothing to do; `address_unconfirmed`: it has not arrived, check the
   * connection settings, Curviate tries again by itself).
   * `PATCH /v1/mailboxes/{id}`
   *
   * @example
   * await curviate.mailboxes.update("mbx_123", { sends_for: { kind: "account", account_id: "acc_123" }, daily_cap: 30 });
   */
  update(mailboxId: string, body: MailboxUpdateBody): Promise<Mailbox> {
    return this.ctx.request<Mailbox>({
      method: "PATCH",
      path: apiPath`/v1/mailboxes/${mailboxId}`,
      body,
    });
  }

  /**
   * Stop a Mailbox sending until it is resumed. Only a `connected` or
   * `ramping` Mailbox pauses; any other state is refused with
   * `MAILBOX_STATE_CONFLICT`.
   * `POST /v1/mailboxes/{id}/pause`
   *
   * @example
   * await curviate.mailboxes.pause("mbx_123");
   */
  pause(mailboxId: string): Promise<Mailbox> {
    return this.ctx.request<Mailbox>({
      method: "POST",
      path: apiPath`/v1/mailboxes/${mailboxId}/pause`,
    });
  }

  /**
   * Resume a paused Mailbox: it goes to `ramping`, starting again at 5 emails
   * a day. A Mailbox that is not paused, a provider pause before its
   * `paused_until`, and one Curviate is fixing are refused with
   * `MAILBOX_STATE_CONFLICT`.
   * `POST /v1/mailboxes/{id}/resume`
   *
   * @example
   * await curviate.mailboxes.resume("mbx_123");
   */
  resume(mailboxId: string): Promise<Mailbox> {
    return this.ctx.request<Mailbox>({
      method: "POST",
      path: apiPath`/v1/mailboxes/${mailboxId}/resume`,
    });
  }

  /**
   * Remove a Mailbox and delete its stored credentials in one step. It changes
   * no seat count. A Member removes only a Mailbox they connected. A Mailbox
   * from Curviate is an Owner's to remove (`403 INSUFFICIENT_ROLE` otherwise);
   * it is deleted with its mail, and its charge stops at the end of the
   * billing period. `409 MAILBOX_STATE_CONFLICT` "Too many Mailbox changes are
   * still settling with billing" means nothing was changed: the person may try
   * again later; never resend it on your own.
   * `DELETE /v1/mailboxes/{id}`
   *
   * @example
   * await curviate.mailboxes.remove("mbx_123");
   */
  remove(mailboxId: string): Promise<MailboxRemoveResult> {
    return this.ctx.request<MailboxRemoveResult>({
      method: "DELETE",
      path: apiPath`/v1/mailboxes/${mailboxId}`,
    });
  }

  /**
   * Find the IMAP and SMTP settings for an email address, to show the person
   * and confirm before connecting (`confirm_required` marks settings that
   * arrived unencrypted or are a guess). A domain with nothing usable answers
   * `source: "none"` with no settings. The call takes no password and the
   * answer holds none.
   * `GET /v1/mailboxes/discover`
   *
   * @example
   * const found = await curviate.mailboxes.discover("anna@acme.example");
   * // found.connection: "google_app_password" | "microsoft_sign_in" | "imap_smtp"
   */
  discover(address: string): Promise<MailboxDiscoverResult> {
    return this.ctx.request<MailboxDiscoverResult>({
      method: "GET",
      path: "/v1/mailboxes/discover",
      query: { address },
    });
  }
}
