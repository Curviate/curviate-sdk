// Connection location: a new connect names exactly one location
// source, PATCH can move it and returns the account, and the two location
// refusals decode to themselves rather than INTERNAL.
//
// The compile-time half lives in `typeCases` below. It is never called; `tsc
// --noEmit` (pnpm typecheck, which includes test/) is what runs it. Each
// `@ts-expect-error` is a claim that the line does NOT compile: if the type
// ever accepts it, tsc reports the directive as unused and the typecheck reds.
import { http, HttpResponse } from "msw";
import { describe, expect, it } from "vitest";
import { server } from "./msw/server.js";
import { Curviate, isCurviateError, type AuthIntentBody } from "../src/index.js";

const BASE = "https://app.curviate.test";
const client = new Curviate({ apiKey: "cvt_test_location", baseUrl: BASE });

const creds = { auth_method: "credentials", credentials: { email: "u@x.com", password: "p" } } as const;
const proxy = { protocol: "socks4", host: "proxy.example.com", port: 1080 } as const;

export function typeCases(): AuthIntentBody[] {
  return [
    // compiles: one source each, and a reconnect may keep its location
    { seat_id: "s", ...creds, country: "DE" },
    { seat_id: "s", ...creds, country: "US", allow_country_fallback: true },
    { seat_id: "s", ...creds, ip: "8.8.8.8" },
    { seat_id: "s", ...creds, proxy },
    { account_id: "acc_1", ...creds },
    { account_id: "acc_1", ...creds, country: "NL" },

    // @ts-expect-error a new connect without a location (400 CONNECTION_LOCATION_REQUIRED)
    { seat_id: "s", ...creds },
    // @ts-expect-error two sources at once (400 INVALID_REQUEST)
    { seat_id: "s", ...creds, country: "DE", ip: "8.8.8.8" },
    // @ts-expect-error country and proxy at once
    { seat_id: "s", ...creds, country: "DE", proxy },
    // @ts-expect-error allow_country_fallback with your own proxy
    { seat_id: "s", ...creds, proxy, allow_country_fallback: false },
    // @ts-expect-error a country outside the served enum
    { seat_id: "s", ...creds, country: "XX" },
    // @ts-expect-error allow_country_fallback alone on a reconnect (it applies to a country or ip)
    { account_id: "acc_1", ...creds, allow_country_fallback: true },
  ];
}

describe("auth.intent: connection location", () => {
  it("forwards country and allow_country_fallback verbatim", async () => {
    let body: Record<string, unknown> | undefined;
    server.use(
      http.post(`${BASE}/v1/auth/intent`, async ({ request }) => {
        body = (await request.json()) as Record<string, unknown>;
        return HttpResponse.json(
          {
            object: "account",
            account_id: "acc_1",
            status: "active",
            connection_location: { country: "DE", current_country: null, mode: "auto", strict: false },
          },
          { status: 201 },
        );
      }),
    );
    const res = await client.auth.intent({ seat_id: "seat_1", ...creds, country: "DE", allow_country_fallback: true });
    expect(body).toMatchObject({ country: "DE", allow_country_fallback: true });
    expect(body).not.toHaveProperty("ip");
    if (res.object !== "account") throw new Error("expected the account branch");
    expect(res.connection_location?.country).toBe("DE");
  });
});

describe("accounts.update: location change returns the account", () => {
  it("sends country and returns the account with the re-read connection_location", async () => {
    let body: unknown;
    server.use(
      http.patch(`${BASE}/v1/accounts/acc_1`, async ({ request }) => {
        body = await request.json();
        return HttpResponse.json({
          object: "account",
          account_id: "acc_1",
          status: "active",
          connection_location: { country: "US", current_country: "US", mode: "auto", strict: true },
        });
      }),
    );
    const res = await client.accounts.update("acc_1", { country: "US" });
    expect(body).toEqual({ country: "US" });
    expect(res.status).toBe("active");
    expect(res.connection_location).toEqual({ country: "US", current_country: "US", mode: "auto", strict: true });
  });
});

describe("location refusals decode to themselves", () => {
  const location = { country: "DE", current_country: "DE", mode: "auto", strict: true };

  function refuse(status: number, body: Record<string, unknown>) {
    server.use(http.patch(`${BASE}/v1/accounts/acc_1`, () => HttpResponse.json(body, { status })));
  }

  it("422 CONNECTION_LOCATION_UNAVAILABLE carries where the account connects from now", async () => {
    refuse(422, {
      code: "CONNECTION_LOCATION_UNAVAILABLE",
      message: "No connection is available in United States right now. Try a nearby country, or allow fallback.",
      user_fixable: true,
      retry_likely_to_succeed: false,
      connection_location: location,
    });
    const err = await client.accounts.update("acc_1", { country: "US" }).catch((e: unknown) => e);
    if (!isCurviateError(err)) throw new Error("expected a CurviateError");
    expect(err.code).toBe("CONNECTION_LOCATION_UNAVAILABLE");
    expect(err.httpStatus).toBe(422);
    expect(err.connectionLocation).toEqual(location);
    expect(err.toJSON()).toMatchObject({ code: "CONNECTION_LOCATION_UNAVAILABLE", connectionLocation: location });
  });

  it("422 with no connection_location leaves the field absent (control for the case above)", async () => {
    refuse(422, {
      code: "CONNECTION_LOCATION_UNAVAILABLE",
      message: "No connection is available in Germany right now.",
      user_fixable: true,
      retry_likely_to_succeed: false,
    });
    const err = await client.accounts.update("acc_1", { country: "DE" }).catch((e: unknown) => e);
    if (!isCurviateError(err)) throw new Error("expected a CurviateError");
    expect(err.code).toBe("CONNECTION_LOCATION_UNAVAILABLE");
    expect(err.connectionLocation).toBeUndefined();
    expect(err.toJSON()).not.toHaveProperty("connectionLocation");
  });

  it("400 CONNECTION_LOCATION_REQUIRED decodes to itself, not INTERNAL", async () => {
    refuse(400, {
      code: "CONNECTION_LOCATION_REQUIRED",
      message: "Choose where this account connects from.",
      user_fixable: true,
      retry_likely_to_succeed: false,
    });
    const err = await client.accounts.update("acc_1", { proxy: null }).catch((e: unknown) => e);
    if (!isCurviateError(err)) throw new Error("expected a CurviateError");
    expect(err.code).toBe("CONNECTION_LOCATION_REQUIRED");
    expect(err.userFixable).toBe(true);
  });
});
