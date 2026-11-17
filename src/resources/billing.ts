/**
 * Billing (root-scoped): the plan (`quote`, `switchPeriod`), the spending cap
 * (`spendingCap`), the change log (`changes`), `curviate.billing.seats`
 * (2 methods) and `curviate.billing.invoices` (2 methods). Owners only.
 *
 * Seats are bought and cancelled on `curviate.accounts` (`addSeats`,
 * `cancelSeat`); here an unused seat is lent to another of your Teams and
 * moved back. Invoices are for the Team's Owners.
 */
import type { RequestContext } from "../internal/context.js";
import type { paths } from "../generated/types.js";
import { apiPath } from "../internal/path.js";
import { pageable, type Pageable } from "../internal/paginate.js";

export type SeatLendBody = paths["/v1/billing/seats/lend"]["post"]["requestBody"]["content"]["application/json"];
export type SeatLendResult = paths["/v1/billing/seats/lend"]["post"]["responses"]["201"]["content"]["application/json"];
export type SeatReturnResult = paths["/v1/billing/seats/{seat_id}/return"]["post"]["responses"]["200"]["content"]["application/json"];
export type InvoiceListParams = NonNullable<paths["/v1/billing/invoices"]["get"]["parameters"]["query"]>;
export type InvoiceListPage = paths["/v1/billing/invoices"]["get"]["responses"]["200"]["content"]["application/json"];
export type Invoice = InvoiceListPage["items"][number];
export type QuoteParams = paths["/v1/billing/quote"]["get"]["parameters"]["query"];
export type Quote = paths["/v1/billing/quote"]["get"]["responses"]["200"]["content"]["application/json"];
export type SpendingCap = paths["/v1/billing/spending-cap"]["get"]["responses"]["200"]["content"]["application/json"];
export type BillingChangeListParams = NonNullable<paths["/v1/billing/changes"]["get"]["parameters"]["query"]>;
export type BillingChangeListPage = paths["/v1/billing/changes"]["get"]["responses"]["200"]["content"]["application/json"];
export type BillingChange = BillingChangeListPage["items"][number];
export type SwitchPeriodResult = paths["/v1/billing/subscription/switch-period"]["post"]["responses"]["200"]["content"]["application/json"];

/** `curviate.billing.seats`: lend an unused seat to another of your Teams. */
export class BillingSeatsResource {
  constructor(private readonly ctx: RequestContext) {}

  /**
   * Move an unused paid seat of this Team to another of your Teams, at no
   * charge; it stays on this Team's invoice at its Tier. `seat_id` picks the
   * seat, or leave it out to lend the oldest unused one; each call lends one
   * more seat. Trial, occupied, unconfirmed, cancelling and already-lent seats
   * cannot move (`SEAT_NOT_FOUND`). The borrowing Team connects an Account
   * into it and the seat counts against that Team's rate limit, not this
   * one's. While it is lent, a connect naming it or a cancel of it throws
   * `SEAT_LENT`: move it back first. Only the Owner who pays for both Teams
   * can lend (`INSUFFICIENT_ROLE`). Resolves with the lent `seat_id` and the
   * `team_id` it went to.
   * `POST /v1/billing/seats/lend`
   *
   * @example
   * const { seat_id } = await curviate.billing.seats.lend({ team_id: "tnt_456" });
   */
  lend(body: SeatLendBody): Promise<SeatLendResult> {
    return this.ctx.request<SeatLendResult>({ method: "POST", path: "/v1/billing/seats/lend", body });
  }

  /**
   * End a seat loan while no Account uses the seat. Call it from either Team:
   * with the lending Team's seat id, or with the lent seat's id in the Team
   * that received it. A seat an Account still uses throws `SEAT_NOT_EMPTY`:
   * disconnect the Account first. The Owner who pays for either Team can move
   * it back.
   * `POST /v1/billing/seats/{seat_id}/return`
   *
   * @example
   * await curviate.billing.seats.return("seat_123");
   */
  return(seatId: string): Promise<SeatReturnResult> {
    return this.ctx.request<SeatReturnResult>({ method: "POST", path: apiPath`/v1/billing/seats/${seatId}/return` });
  }
}

/** `curviate.billing.invoices`: the Team's issued invoices. Owners only. */
export class BillingInvoicesResource {
  constructor(private readonly ctx: RequestContext) {}

  /**
   * The Team's issued invoices, newest first, with number, `total`,
   * `currency`, `status` (`paid`, `open`, `failed` or `void`) and service
   * period. Draft invoices are never listed and an invoice carries no link:
   * download its PDF by `number`. `limit` is 1 to 100 (default 20). `await` it
   * for one page; `for await` it for every invoice across pages. Owners only
   * (`INSUFFICIENT_ROLE`); `BILLING_PORTAL_UNAVAILABLE` (503) means retry.
   * `GET /v1/billing/invoices`
   *
   * @example
   * for await (const invoice of curviate.billing.invoices.list()) console.log(invoice.number, invoice.status);
   */
  list(params?: InvoiceListParams): Pageable<InvoiceListPage> {
    return pageable(
      (p) => this.ctx.request<InvoiceListPage>({ method: "GET", path: "/v1/billing/invoices", ...(p ? { query: p } : {}) }),
      params,
    );
  }

  /**
   * One invoice as PDF bytes, by its `number` from {@link BillingInvoicesResource.list}.
   * An unknown number throws `RESOURCE_NOT_FOUND`. Owners only.
   * `GET /v1/billing/invoices/{number}/pdf`
   *
   * @example
   * const pdf = await curviate.billing.invoices.pdf("INV-0042");
   * await fs.promises.writeFile("INV-0042.pdf", Buffer.from(pdf));
   */
  pdf(number: string): Promise<ArrayBuffer> {
    return this.ctx.request<ArrayBuffer>({ method: "GET", path: apiPath`/v1/billing/invoices/${number}/pdf` });
  }
}

export class BillingResource {
  readonly seats: BillingSeatsResource;
  readonly invoices: BillingInvoicesResource;

  constructor(private readonly ctx: RequestContext) {
    this.seats = new BillingSeatsResource(ctx);
    this.invoices = new BillingInvoicesResource(ctx);
  }

  /**
   * Price `seats` for one `period` (`monthly` or `annual`), step by step:
   * each seat costs the price of the step it falls in. `total` and each
   * step's `amount` are in cents. Computed from the price list; charges
   * nothing. Owners only.
   * `GET /v1/billing/quote`
   *
   * @example
   * const { total, steps } = await curviate.billing.quote({ seats: "25", period: "monthly" });
   */
  quote(params: QuoteParams): Promise<Quote> {
    return this.ctx.request<Quote>({ method: "GET", path: "/v1/billing/quote", query: params });
  }

  /**
   * The spending cap: the most seats an agent may bring the Team to
   * (`cap_seats`, 100 until an Owner sets one), the seats now, the room left
   * and what the cap's seats cost a month. Read only: an Owner changes it in
   * the dashboard. Adding seats past it throws `SPENDING_CAP_REACHED`.
   * Owners only.
   * `GET /v1/billing/spending-cap`
   *
   * @example
   * const { room_seats } = await curviate.billing.spendingCap();
   */
  spendingCap(): Promise<SpendingCap> {
    return this.ctx.request<SpendingCap>({ method: "GET", path: "/v1/billing/spending-cap" });
  }

  /**
   * Every seat added or removed and every spending cap change, newest first:
   * who made it, the way it came in, the seat counts before and after and what
   * it adds to the monthly price. `await` it for one page; `for await` it for
   * every change. Owners only.
   * `GET /v1/billing/changes`
   *
   * @example
   * for await (const change of curviate.billing.changes()) console.log(change.created_at);
   */
  changes(params?: BillingChangeListParams): Pageable<BillingChangeListPage> {
    return pageable(
      (p) => this.ctx.request<BillingChangeListPage>({ method: "GET", path: "/v1/billing/changes", ...(p ? { query: p } : {}) }),
      params,
    );
  }

  /**
   * Move a monthly subscription to yearly billing at its next renewal, at the
   * yearly price for the same seats. Nothing is charged now; a second call
   * while the switch is pending changes nothing. There is no switch back.
   * Owners only.
   * `POST /v1/billing/subscription/switch-period`
   *
   * @example
   * await curviate.billing.switchPeriod();
   */
  switchPeriod(): Promise<SwitchPeriodResult> {
    return this.ctx.request<SwitchPeriodResult>({ method: "POST", path: "/v1/billing/subscription/switch-period" });
  }
}
