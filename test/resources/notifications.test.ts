// notifications namespace (3 methods, account-scoped, NEW namespace) — the
// connected account's own notification centre. `list` reads
// the account's cards + the account-level unread badge; `delete` and
// `showLess` are self-action writes sharing a `card_urn` path param that
// embeds `(`, `)`, `:`, `,` — the SDK percent-encodes it into the path.
// Account-scoped ONLY — reachable via client.account(id).notifications,
// never the root client.
import { http, HttpResponse } from "msw";
import { describe, expect, it } from "vitest";
import { server } from "../msw/server.js";
import { Curviate } from "../../src/index.js";
import { CurviateError, isCurviateError } from "../../src/errors.js";

const BASE = "https://app.curviate.test";
const client = new Curviate({ apiKey: "cvt_test_notifications", baseUrl: BASE });
const acc = client.account("acc_1");

// A realistic card entity urn — carries the exact special characters
// (`(`, `)`, `:`, `,`) the path-encoding contract exists for.
const CARD_URN =
  "urn:li:fsd_notificationCard:(SHARED_BY_YOUR_NETWORK,urn:li:uniqueSuffix:(urn:li:none,rwpKFSX4QQKXFV6bDYxCsw))";

describe("notifications.list", () => {
  it("GET /v1/{account_id}/notifications — default (no query)", async () => {
    let capturedPath: string | undefined;
    let search: URLSearchParams | undefined;
    server.use(
      http.get(`${BASE}/v1/acc_1/notifications`, ({ request }) => {
        const url = new URL(request.url);
        capturedPath = url.pathname;
        search = url.searchParams;
        return HttpResponse.json({
          object: "notification_list",
          items: [{ object: "notification", card_urn: CARD_URN, injected: false }],
          cursor: "cur_next",
          unread_count: 2,
          latest_published_at: 1731234567000,
        });
      }),
    );
    const res = await acc.notifications.list();
    expect(capturedPath).toBe("/v1/acc_1/notifications");
    expect(search?.has("filter")).toBe(false);
    expect(search?.has("limit")).toBe(false);
    expect(search?.has("cursor")).toBe(false);
    expect(res.object).toBe("notification_list");
    expect(res.cursor).toBe("cur_next");
    expect(res.unread_count).toBe(2);
    expect(res.items?.length).toBe(1);
  });

  it("forwards filter/limit/cursor query params", async () => {
    let search: URLSearchParams | undefined;
    server.use(
      http.get(`${BASE}/v1/acc_1/notifications`, ({ request }) => {
        search = new URL(request.url).searchParams;
        return HttpResponse.json({
          object: "notification_list",
          items: [],
          cursor: null,
          unread_count: 0,
          latest_published_at: null,
        });
      }),
    );
    await acc.notifications.list({ filter: "mentions", limit: 5, cursor: "cur_1" });
    expect(search?.get("filter")).toBe("mentions");
    expect(search?.get("limit")).toBe("5");
    expect(search?.get("cursor")).toBe("cur_1");
  });
});

describe("notifications error envelope", () => {
  it("an unsupported filter surfaces the server's 400 as CurviateError(INVALID_REQUEST)", async () => {
    server.use(
      http.get(`${BASE}/v1/acc_1/notifications`, () =>
        HttpResponse.json(
          {
            code: "INVALID_REQUEST",
            message: "filter is not a supported value.",
            user_fixable: true,
            retry_likely_to_succeed: false,
          },
          { status: 400 },
        ),
      ),
    );
    let caught: unknown;
    try {
      // @ts-expect-error deliberately invalid filter to exercise the server 400
      await acc.notifications.list({ filter: "everything" });
    } catch (e) {
      caught = e;
    }
    expect(isCurviateError(caught)).toBe(true);
    expect((caught as CurviateError).code).toBe("INVALID_REQUEST");
    expect((caught as CurviateError).httpStatus).toBe(400);
  });
});

describe("notifications.delete", () => {
  it("DELETE /v1/{account_id}/notifications/{card_urn} — percent-encodes the card urn, no body", async () => {
    let seenMethod: string | undefined;
    let seenPath: string | undefined;
    let seenBody: string | null = null;
    let decodedParam: string | undefined;
    server.use(
      http.delete(`${BASE}/v1/acc_1/notifications/:cardUrn`, async ({ request, params }) => {
        seenMethod = request.method;
        seenPath = new URL(request.url).pathname;
        seenBody = await request.text();
        decodedParam = params["cardUrn"] as string;
        return HttpResponse.json({ object: "notification_deleted", card_urn: CARD_URN });
      }),
    );
    const res = await acc.notifications.delete(CARD_URN);
    expect(seenMethod).toBe("DELETE");
    expect(seenPath).toBe(`/v1/acc_1/notifications/${encodeURIComponent(CARD_URN)}`);
    // The raw urn arrives at the server decoded back to the original — the
    // percent-encoding round-trips losslessly.
    expect(decodedParam).toBe(CARD_URN);
    expect(seenBody).toBe("");
    expect(res).toEqual({ object: "notification_deleted", card_urn: CARD_URN });
  });

  it("a non-card card_urn surfaces the server's 400 as CurviateError(INVALID_REQUEST)", async () => {
    server.use(
      http.delete(`${BASE}/v1/acc_1/notifications/:cardUrn`, () =>
        HttpResponse.json(
          {
            code: "INVALID_REQUEST",
            message: "card_urn is not a notification card urn.",
            user_fixable: true,
            retry_likely_to_succeed: false,
          },
          { status: 400 },
        ),
      ),
    );
    let caught: unknown;
    try {
      await acc.notifications.delete("urn:li:notificationV2:(not,a,card)");
    } catch (e) {
      caught = e;
    }
    expect(isCurviateError(caught)).toBe(true);
    expect((caught as CurviateError).code).toBe("INVALID_REQUEST");
    expect((caught as CurviateError).httpStatus).toBe(400);
  });
});

describe("notifications.showLess", () => {
  it("POST /v1/{account_id}/notifications/{card_urn}/show-less — percent-encodes the card urn, no body", async () => {
    let seenMethod: string | undefined;
    let seenPath: string | undefined;
    let seenBody: string | null = null;
    let decodedParam: string | undefined;
    server.use(
      http.post(`${BASE}/v1/acc_1/notifications/:cardUrn/show-less`, async ({ request, params }) => {
        seenMethod = request.method;
        seenPath = new URL(request.url).pathname;
        seenBody = await request.text();
        decodedParam = params["cardUrn"] as string;
        return HttpResponse.json({ object: "notification_show_less_applied", card_urn: CARD_URN });
      }),
    );
    const res = await acc.notifications.showLess(CARD_URN);
    expect(seenMethod).toBe("POST");
    expect(seenPath).toBe(`/v1/acc_1/notifications/${encodeURIComponent(CARD_URN)}/show-less`);
    expect(decodedParam).toBe(CARD_URN);
    expect(seenBody).toBe("");
    expect(res).toEqual({ object: "notification_show_less_applied", card_urn: CARD_URN });
  });
});

describe("notifications namespace mounting", () => {
  it("account(id).notifications is LinkedIn's; the root key is Curviate's own (api/037 FR-016)", () => {
    expect(acc.notifications).toHaveProperty("showLess");
    expect(client.notifications).toHaveProperty("unreadCount");
    expect(client.notifications).not.toHaveProperty("showLess");
  });
});
