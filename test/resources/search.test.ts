// search namespace (9 methods, account-scoped)
// Account-first path grammar. Pagination (offset/limit/cursor) stays a
// TOP-LEVEL query param on every structured op — never in the body.
// fromUrl is the sole home of URL-mode search: POST /v1/{account_id}/search
// body {url}. groups/services/getServiceParameters are additive discovery
// endpoints (discovery additions).
import { http, HttpResponse } from "msw";
import { describe, expect, it } from "vitest";
import { server } from "../msw/server.js";
import { Curviate } from "../../src/index.js";

const BASE = "https://app.curviate.test";
const client = new Curviate({ apiKey: "cvt_test_search", baseUrl: BASE });
const search = () => client.account("acc_se1").search;

describe("search.getParameters", () => {
  it("GET /v1/{account_id}/search/parameters forwards type/keywords/limit/offset", async () => {
    let url: string | undefined;
    server.use(
      http.get(`${BASE}/v1/acc_se1/search/parameters`, ({ request }) => {
        url = request.url;
        return HttpResponse.json({
          object: "search_parameter_list",
          items: [{ id: "id_1", name: "Software Development" }],
          cursor: null,
        });
      }),
    );
    const res = await search().getParameters({ type: "SKILL", keywords: "software development", limit: 5, offset: 0 });
    const params = new URL(url!).searchParams;
    expect(new URL(url!).pathname).toBe("/v1/acc_se1/search/parameters");
    expect(params.get("type")).toBe("SKILL");
    expect(params.get("keywords")).toBe("software development");
    expect(params.get("limit")).toBe("5");
    expect(res.items[0]?.id).toBe("id_1");
  });

  // Pagination: the resolver takes a cursor as of the 0.36.0 snapshot. The
  // method forwards the query verbatim, so these pin the wire, not a helper.
  it("forwards cursor on the query string", async () => {
    let url: string | undefined;
    server.use(
      http.get(`${BASE}/v1/acc_se1/search/parameters`, ({ request }) => {
        url = request.url;
        return HttpResponse.json({ object: "search_parameter_list", items: [], cursor: "cur_2" });
      }),
    );
    const res = await search().getParameters({ type: "SKILL", keywords: "eng", cursor: "cur_1" });
    expect(new URL(url!).searchParams.get("cursor")).toBe("cur_1");
    // The next cursor comes back on the page, so a caller can walk it.
    expect(res.cursor).toBe("cur_2");
  });

  it("omits cursor entirely when it is not passed", async () => {
    let url: string | undefined;
    server.use(
      http.get(`${BASE}/v1/acc_se1/search/parameters`, ({ request }) => {
        url = request.url;
        return HttpResponse.json({ object: "search_parameter_list", items: [], cursor: null });
      }),
    );
    await search().getParameters({ type: "SKILL", keywords: "eng" });
    const params = new URL(url!).searchParams;
    expect(params.has("cursor")).toBe(false);
    // Positive control on the same path: the params that WERE passed are there,
    // so "absent" is a real absence and not a URL that was never captured.
    expect(params.get("keywords")).toBe("eng");
  });

  it("sends an empty cursor as an empty value rather than dropping it", async () => {
    // The served schema is minLength 1, so an empty cursor must reach the API
    // and earn its 400; silently dropping it would page from the start instead.
    let url: string | undefined;
    server.use(
      http.get(`${BASE}/v1/acc_se1/search/parameters`, ({ request }) => {
        url = request.url;
        return HttpResponse.json({ object: "search_parameter_list", items: [], cursor: null });
      }),
    );
    await search().getParameters({ type: "SKILL", keywords: "eng", cursor: "" });
    const params = new URL(url!).searchParams;
    expect(params.has("cursor")).toBe(true);
    expect(params.get("cursor")).toBe("");
  });
});

describe("search.people", () => {
  it("POST /v1/{account_id}/search/people — filters in the body, cursor/limit/offset in the query", async () => {
    let capturedUrl: string | undefined;
    let body: Record<string, unknown> | undefined;
    server.use(
      http.post(`${BASE}/v1/acc_se1/search/people`, async ({ request }) => {
        capturedUrl = request.url;
        body = (await request.json()) as Record<string, unknown>;
        return HttpResponse.json({
          object: "people_search_result",
          items: [],
          paging: { total_count: 0 },
          cursor: null,
        });
      }),
    );
    await search().people({ keywords: "engineer", cursor: "cur_1", limit: 10, offset: 20 });
    const parsed = new URL(capturedUrl!);
    expect(parsed.pathname).toBe("/v1/acc_se1/search/people");
    expect(parsed.searchParams.get("cursor")).toBe("cur_1");
    expect(parsed.searchParams.get("limit")).toBe("10");
    expect(parsed.searchParams.get("offset")).toBe("20");
    expect(body).toEqual({ keywords: "engineer" });
    expect(body).not.toHaveProperty("cursor");
    expect(body).not.toHaveProperty("limit");
    expect(body).not.toHaveProperty("offset");
    // structured search no longer accepts url in the body
    expect(body).not.toHaveProperty("url");
  });

  it("omitting cursor/limit/offset sends no query string", async () => {
    let capturedUrl: string | undefined;
    server.use(
      http.post(`${BASE}/v1/acc_se1/search/people`, async ({ request }) => {
        capturedUrl = request.url;
        return HttpResponse.json({ object: "people_search_result", items: [], paging: { total_count: 0 }, cursor: null });
      }),
    );
    await search().people({ keywords: "engineer" });
    expect(new URL(capturedUrl!).search).toBe("");
  });
});

describe("search.companies", () => {
  it("POST /v1/{account_id}/search/companies", async () => {
    let capturedUrl: string | undefined;
    let body: Record<string, unknown> | undefined;
    server.use(
      http.post(`${BASE}/v1/acc_se1/search/companies`, async ({ request }) => {
        capturedUrl = request.url;
        body = (await request.json()) as Record<string, unknown>;
        return HttpResponse.json({ object: "company_search_result", items: [], paging: { total_count: 0 }, cursor: null });
      }),
    );
    await search().companies({ keywords: "acme", limit: 2 });
    expect(new URL(capturedUrl!).pathname).toBe("/v1/acc_se1/search/companies");
    expect(new URL(capturedUrl!).searchParams.get("limit")).toBe("2");
    expect(body).toEqual({ keywords: "acme" });
  });
});

describe("search.posts", () => {
  it("POST /v1/{account_id}/search/posts", async () => {
    let capturedUrl: string | undefined;
    server.use(
      http.post(`${BASE}/v1/acc_se1/search/posts`, async ({ request }) => {
        capturedUrl = request.url;
        return HttpResponse.json({ object: "post_search_result", items: [], paging: { total_count: 0 }, cursor: null });
      }),
    );
    await search().posts({ keywords: "hiring" });
    expect(new URL(capturedUrl!).pathname).toBe("/v1/acc_se1/search/posts");
  });
});

describe("search.jobs", () => {
  it("POST /v1/{account_id}/search/jobs", async () => {
    let capturedUrl: string | undefined;
    server.use(
      http.post(`${BASE}/v1/acc_se1/search/jobs`, async ({ request }) => {
        capturedUrl = request.url;
        return HttpResponse.json({ object: "job_search_result", items: [], paging: { total_count: 0 }, cursor: null });
      }),
    );
    await search().jobs({ keywords: "founders associate" });
    expect(new URL(capturedUrl!).pathname).toBe("/v1/acc_se1/search/jobs");
  });
});

describe("search.fromUrl", () => {
  it("POST /v1/{account_id}/search sends {url} and NOTHING else", async () => {
    let capturedUrl: string | undefined;
    let body: unknown;
    server.use(
      http.post(`${BASE}/v1/acc_se1/search`, async ({ request }) => {
        capturedUrl = request.url;
        body = await request.json();
        return HttpResponse.json({ object: "search_result", items: [], cursor: null });
      }),
    );
    await search().fromUrl({ url: "https://www.linkedin.com/search/results/people/?keywords=engineer" });
    expect(new URL(capturedUrl!).pathname).toBe("/v1/acc_se1/search");
    expect(body).toEqual({ url: "https://www.linkedin.com/search/results/people/?keywords=engineer" });
  });

  it("still supports cursor/limit/offset as query params alongside the url body", async () => {
    let capturedUrl: string | undefined;
    let body: unknown;
    server.use(
      http.post(`${BASE}/v1/acc_se1/search`, async ({ request }) => {
        capturedUrl = request.url;
        body = await request.json();
        return HttpResponse.json({ object: "search_result", items: [], cursor: null });
      }),
    );
    await search().fromUrl({ url: "https://www.linkedin.com/search/results/people/", cursor: "cur_9" });
    expect(new URL(capturedUrl!).searchParams.get("cursor")).toBe("cur_9");
    expect(body).toEqual({ url: "https://www.linkedin.com/search/results/people/" });
  });
});

describe("search.groups", () => {
  it("GET /v1/{account_id}/search/groups forwards keywords/limit/cursor", async () => {
    let url: string | undefined;
    server.use(
      http.get(`${BASE}/v1/acc_se1/search/groups`, ({ request }) => {
        url = request.url;
        return HttpResponse.json({
          object: "group_search_result",
          items: [{ object: "group", id: "13019519", name: "AI GTM Engineering", member_count: 42, type: "public" }],
          cursor: null,
        });
      }),
    );
    const res = await search().groups({ keywords: "gtm engineering", limit: 5 });
    const params = new URL(url!).searchParams;
    expect(new URL(url!).pathname).toBe("/v1/acc_se1/search/groups");
    expect(params.get("keywords")).toBe("gtm engineering");
    expect(params.get("limit")).toBe("5");
    expect(res.items[0]?.id).toBe("13019519");
  });

  it("no matches is a valid, non-error empty result", async () => {
    server.use(
      http.get(`${BASE}/v1/acc_se1/search/groups`, () =>
        HttpResponse.json({ object: "group_search_result", items: [], cursor: null }),
      ),
    );
    const res = await search().groups({ keywords: "zzz-no-match" });
    expect(res.items).toEqual([]);
  });
});

describe("search.services", () => {
  it("POST /v1/{account_id}/search/services — filters in the body, limit/cursor in the query", async () => {
    let capturedUrl: string | undefined;
    let body: Record<string, unknown> | undefined;
    server.use(
      http.post(`${BASE}/v1/acc_se1/search/services`, async ({ request }) => {
        capturedUrl = request.url;
        body = (await request.json()) as Record<string, unknown>;
        return HttpResponse.json({
          object: "service_search_result",
          items: [{ object: "service_provider", id: "ACoA1", name: "Alex Marketer" }],
          paging: { total_count: 1 },
          cursor: null,
        });
      }),
    );
    const res = await search().services({ service_category: ["296"], connections: [2], limit: 10 });
    const parsed = new URL(capturedUrl!);
    expect(parsed.pathname).toBe("/v1/acc_se1/search/services");
    expect(parsed.searchParams.get("limit")).toBe("10");
    expect(body).toEqual({ service_category: ["296"], connections: [2] });
    expect(body).not.toHaveProperty("limit");
    expect(res.items[0]?.id).toBe("ACoA1");
  });

  it("omitting limit/cursor sends no query string", async () => {
    let capturedUrl: string | undefined;
    server.use(
      http.post(`${BASE}/v1/acc_se1/search/services`, async ({ request }) => {
        capturedUrl = request.url;
        return HttpResponse.json({ object: "service_search_result", items: [], paging: { total_count: 0 }, cursor: null });
      }),
    );
    await search().services({ keywords: "marketing" });
    expect(new URL(capturedUrl!).search).toBe("");
  });
});

describe("search.getServiceParameters", () => {
  it("GET /v1/{account_id}/search/services/parameters forwards type/keywords/limit", async () => {
    let url: string | undefined;
    server.use(
      http.get(`${BASE}/v1/acc_se1/search/services/parameters`, ({ request }) => {
        url = request.url;
        return HttpResponse.json({
          object: "search_parameter_list",
          items: [{ id: "296", name: "Marketing Strategy", type: "service_category" }],
          cursor: null,
        });
      }),
    );
    const res = await search().getServiceParameters({ type: "service_category", keywords: "marke", limit: 5 });
    const params = new URL(url!).searchParams;
    expect(new URL(url!).pathname).toBe("/v1/acc_se1/search/services/parameters");
    expect(params.get("type")).toBe("service_category");
    expect(params.get("keywords")).toBe("marke");
    expect(res.items[0]?.id).toBe("296");
  });
});
