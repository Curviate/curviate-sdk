// Rules the parity table cannot fail on: what goes on the wire for the new
// bytes, raw-body, list-array and no-argument calls, and the served `details`.
import { http, HttpResponse } from "msw";
import { describe, expect, it } from "vitest";
import { server } from "./msw/server.js";
import { Curviate, isCurviateError } from "../src/index.js";

const BASE = "https://app.curviate.test";
const client = new Curviate({ apiKey: "cvt_test_ripple_b", baseUrl: BASE, maxRetries: 0 });
const text = (b: ArrayBuffer) => new TextDecoder("utf-8", { ignoreBOM: true }).decode(b);

describe("downloads resolve with bytes", () => {
  it("every file comes back as the exact bytes served, a json one included", async () => {
    server.use(
      http.get(`${BASE}/v1/exports/exp_json/file`, () => new HttpResponse('[ {"a": 1} ]', { headers: { "content-type": "application/json" } })),
      http.get(`${BASE}/v1/analytics/export`, () => new HttpResponse("﻿day,sent\n", { headers: { "content-type": "text/csv" } })),
      http.get(`${BASE}/v1/billing/invoices/INV-1/pdf`, () => new HttpResponse("%PDF-1.7", { headers: { "content-type": "application/pdf" } })),
    );
    const json = await client.exports.download("exp_json");
    expect(json).toBeInstanceOf(ArrayBuffer);
    expect(text(json)).toBe('[ {"a": 1} ]');
    expect(text(await client.analytics.export({ table: ["daily"] }))).toBe("﻿day,sent\n");
    expect(text(await client.billing.invoices.pdf("INV-1"))).toBe("%PDF-1.7");
  });
});

describe("request shapes", () => {
  it("setLogo PUTs the PNG bytes raw as image/png", async () => {
    let seen: { method: string; type: string | null; bytes: number[] } | undefined;
    server.use(
      http.put(`${BASE}/v1/teams/current/logo`, async ({ request }) => {
        seen = { method: request.method, type: request.headers.get("content-type"), bytes: [...new Uint8Array(await request.arrayBuffer())] };
        return HttpResponse.json({ object: "team", team_id: "tnt_1", logo_url: "https://x/logo.png" });
      }),
    );
    await client.teams.setLogo(new Uint8Array([0x89, 0x50, 0x4e, 0x47]));
    expect(seen).toEqual({ method: "PUT", type: "image/png", bytes: [0x89, 0x50, 0x4e, 0x47] });
  });

  it("contacts.list joins list_id and not_list_id arrays into comma lists", async () => {
    let url: URL | undefined;
    server.use(http.get(`${BASE}/v1/contacts`, ({ request }) => { url = new URL(request.url); return HttpResponse.json({ object: "contact_page", items: [], cursor: null, total: 0 }); }));
    await client.contacts.list({ list_id: ["cl_1", "cl_2"], not_list_id: ["cl_3"], list_match: "all", has_email: true, include_total: true });
    expect(Object.fromEntries(url!.searchParams)).toEqual({ list_id: "cl_1,cl_2", not_list_id: "cl_3", list_match: "all", has_email: "true", include_total: "true" });
  });

  it("network.resync() with no argument still sends a JSON body (Resync all)", async () => {
    let body: unknown;
    server.use(http.post(`${BASE}/v1/network/resync`, async ({ request }) => { body = await request.json(); return HttpResponse.json({ object: "network_resync_list", items: [] }, { status: 202 }); }));
    await client.network.resync();
    expect(body).toEqual({});
  });
});

describe("served error details", () => {
  it("TIER_REQUIRED surfaces details.account_id", async () => {
    server.use(
      http.post(`${BASE}/v1/do-not-contact`, () =>
        HttpResponse.json(
          { code: "TIER_REQUIRED", message: "x", user_fixable: true, retry_likely_to_succeed: false, details: { account_id: "acc_9" } },
          { status: 403 },
        ),
      ),
    );
    const err = await client.doNotContact.add({ contact_id: "con_1" }).catch((e: unknown) => e);
    expect(isCurviateError(err) && err.details).toEqual({ account_id: "acc_9" });
  });
});
