// webhooks namespace (6 methods; root-scoped). getStateDiff had no served
// equivalent and was removed.
import { http, HttpResponse } from "msw";
import { describe, expect, it } from "vitest";
import { server } from "./msw/server.js";
import { Curviate } from "../src/index.js";

const BASE = "https://app.curviate.test";
const client = new Curviate({ apiKey: "cvt_test_webhooks", baseUrl: BASE });

// ─── webhooks.create (POST /v1/webhooks) ─────────────────────────────────────
describe("webhooks.create", () => {
  it("POST /v1/webhooks creates a webhook and returns the secret once", async () => {
    server.use(
      http.post(`${BASE}/v1/webhooks`, () =>
        HttpResponse.json(
          {
            object: "webhook",
            id: "wh_1",
            source: "messaging",
            request_url: "https://example.com/hook",
            secret: "sk_1234567890abcdef",
            secret_prefix: "sk_12345",
          },
          { status: 201 },
        ),
      ),
    );
    const res = await client.webhooks.create({
      source: "messaging",
      request_url: "https://example.com/hook",
      account_ids: ["acc_1"],
    });
    expect(res.id).toBe("wh_1");
    expect(res.secret).toBeDefined(); // returned only on creation
  });
});

// account_ids is optional on every source; omitted or null = every account you
// can operate, now and later. Both shapes compile and go on the wire as given.
describe("webhooks: account_ids optional on every source, null = every account", () => {
  it.each([
    ["create, motion source, omitted", (c: Curviate) => c.webhooks.create({ source: "motion", request_url: "https://example.com/hook", events: ["motion.custom_event", "enrollment.replied"] }), { source: "motion", request_url: "https://example.com/hook", events: ["motion.custom_event", "enrollment.replied"] }],
    ["create, messaging source, null", (c: Curviate) => c.webhooks.create({ source: "messaging", request_url: "https://example.com/hook", account_ids: null }), { source: "messaging", request_url: "https://example.com/hook", account_ids: null }],
    ["update, null switches to every account", (c: Curviate) => c.webhooks.update("wh_1", { account_ids: null }), { account_ids: null }],
  ] as const)("%s", async (_, call, body) => {
    const sent: unknown[] = [];
    server.use(
      http.post(`${BASE}/v1/webhooks`, async ({ request }) => {
        sent.push(await request.json());
        return HttpResponse.json({ object: "webhook", id: "wh_1", account_ids: null }, { status: 201 });
      }),
      http.patch(`${BASE}/v1/webhooks/wh_1`, async ({ request }) => {
        sent.push(await request.json());
        return HttpResponse.json({ object: "webhook", id: "wh_1", account_ids: null });
      }),
    );
    await call(client);
    expect(sent).toEqual([body]);
  });
});

// ─── webhooks.list (GET /v1/webhooks) ─────────────────────────────────────────
describe("webhooks.list", () => {
  it("GET /v1/webhooks returns paginated webhook list", async () => {
    server.use(
      http.get(`${BASE}/v1/webhooks`, () =>
        HttpResponse.json({ object: "webhook_list", items: [], cursor: null }),
      ),
    );
    const res = await client.webhooks.list();
    expect(res.object).toBe("webhook_list");
    expect(Array.isArray(res.items)).toBe(true);
  });

  it("forwards limit + cursor query params", async () => {
    let url: string | undefined;
    server.use(
      http.get(`${BASE}/v1/webhooks`, ({ request }) => {
        url = request.url;
        return HttpResponse.json({ object: "webhook_list", items: [], cursor: null });
      }),
    );
    await client.webhooks.list({ limit: 10, cursor: "c_abc" });
    const parsed = new URL(url!);
    expect(parsed.searchParams.get("limit")).toBe("10");
    expect(parsed.searchParams.get("cursor")).toBe("c_abc");
  });
});

// ─── webhooks.listEvents (GET /v1/webhooks/events) ────────────────────────────
describe("webhooks.listEvents", () => {
  it("GET /v1/webhooks/events returns event catalogue", async () => {
    server.use(
      http.get(`${BASE}/v1/webhooks/events`, () =>
        HttpResponse.json({ object: "webhook_event_catalogue", sources: [] }),
      ),
    );
    const res = await client.webhooks.listEvents();
    expect(res.object).toBe("webhook_event_catalogue");
  });
});

// ─── webhooks.get (GET /v1/webhooks/:id) — net-new ───────────────────────────
describe("webhooks.get", () => {
  it("GET /v1/webhooks/:id returns the webhook (no plaintext secret)", async () => {
    server.use(
      http.get(`${BASE}/v1/webhooks/wh_1`, () =>
        HttpResponse.json({
          object: "webhook",
          id: "wh_1",
          source: "messaging",
          request_url: "https://example.com/hook",
          secret_prefix: "sk_12345",
        }),
      ),
    );
    const res = await client.webhooks.get("wh_1");
    expect(res.object).toBe("webhook");
    expect(res.id).toBe("wh_1");
    expect((res as Record<string, unknown>)["secret"]).toBeUndefined();
  });

  it("404s for a webhook not owned by the tenant", async () => {
    server.use(
      http.get(`${BASE}/v1/webhooks/wh_missing`, () =>
        HttpResponse.json(
          { error: { code: "NOT_FOUND", message: "Webhook not found." } },
          { status: 404 },
        ),
      ),
    );
    await expect(client.webhooks.get("wh_missing")).rejects.toBeDefined();
  });
});

// ─── webhooks.update (PATCH /v1/webhooks/:id) ─────────────────────────────────
describe("webhooks.update", () => {
  it("PATCH /v1/webhooks/:id returns updated webhook", async () => {
    server.use(
      http.patch(`${BASE}/v1/webhooks/wh_1`, () =>
        HttpResponse.json({
          object: "webhook",
          id: "wh_1",
          source: "messaging",
          enabled: false,
        }),
      ),
    );
    const res = await client.webhooks.update("wh_1", { enabled: false });
    expect(res.id).toBe("wh_1");
    expect(res.enabled).toBe(false);
  });
});

// ─── webhooks.delete (DELETE /v1/webhooks/:id) ────────────────────────────────
describe("webhooks.delete", () => {
  it("DELETE /v1/webhooks/:id returns deleted shape", async () => {
    server.use(
      http.delete(`${BASE}/v1/webhooks/wh_1`, () =>
        HttpResponse.json({ object: "webhook_deleted", id: "wh_1" }),
      ),
    );
    const res = await client.webhooks.delete("wh_1");
    expect(res.object).toBe("webhook_deleted");
    expect(res.id).toBe("wh_1");
  });
});

// ─── coverage: webhooks' own method count ────────────────────────────────────
// The full cross-namespace method-count bijection moved to a dedicated parity
// test as the v2 namespace realignment lands namespace-by-namespace; this
// file only asserts its own surface.
describe("coverage: webhooks exposes exactly 6 methods", () => {
  it("counts webhooks' own public function properties (getStateDiff removed)", () => {
    function countMethods(obj: object): number {
      return Object.getOwnPropertyNames(Object.getPrototypeOf(obj))
        .filter((name) => name !== "constructor" && typeof (obj as Record<string, unknown>)[name] === "function")
        .length;
    }

    expect(countMethods(client.webhooks)).toBe(6);
    expect("getStateDiff" in client.webhooks).toBe(false);
  });
});
