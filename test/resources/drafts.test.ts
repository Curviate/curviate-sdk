// drafts namespace (7 methods, root-scoped). Responses are the examples the
// served OpenAPI document publishes for each operation (fixtures/openapi.json),
// so a drift between the SDK's wiring and the served contract fails here.
import { readFileSync } from "node:fs";
import { http, HttpResponse, passthrough } from "msw";
import { describe, expect, it } from "vitest";
import { server } from "../msw/server.js";
import { Curviate, CurviateError } from "../../src/index.js";

const BASE = "https://app.curviate.test";
const client = new Curviate({ apiKey: "cvt_test_drafts", baseUrl: BASE });
const ID = "drf_01J8Z3K9P0Q1R2S3T4V5W6X7Y8";

const doc = JSON.parse(
  readFileSync(new URL("../../fixtures/openapi.json", import.meta.url), "utf8"),
) as { paths: Record<string, Record<string, { responses: Record<string, any> }>> };

/** First published example of an operation's response. */
function served(path: string, method: string, status: string, name?: string): any {
  const content = doc.paths[path]![method]!.responses[status].content["application/json"];
  const examples = content.examples as Record<string, { value: unknown }>;
  const ex = name ? examples[name] : Object.values(examples)[0];
  if (!ex) throw new Error(`no example ${name ?? "(first)"} for ${method} ${path} ${status}`);
  return ex.value;
}

describe("drafts.create", () => {
  it("POST /v1/drafts with the body as JSON; no account segment", async () => {
    let seen: { path: string; body: unknown; ct: string | null } | undefined;
    server.use(
      http.post(`${BASE}/v1/drafts`, async ({ request }) => {
        seen = {
          path: new URL(request.url).pathname,
          body: await request.json(),
          ct: request.headers.get("content-type"),
        };
        return HttpResponse.json(served("/v1/drafts", "post", "201", "full"), { status: 201 });
      }),
    );
    const body = {
      account_id: "acc_1",
      text: "hi",
      scheduled_at: "2026-10-12T09:00:00+02:00",
    };
    const res = await client.drafts.create(body);
    expect(seen?.path).toBe("/v1/drafts");
    expect(seen?.ct).toBe("application/json");
    // ISO 8601 with offset travels unchanged: no client-side normalisation.
    expect(seen?.body).toEqual(body);
    expect(res.object).toBe("draft");
    expect(res.id).toBe(ID);
  });

  it("create() with no argument sends {} (every field is optional)", async () => {
    let body: unknown;
    server.use(
      http.post(`${BASE}/v1/drafts`, async ({ request }) => {
        body = await request.json();
        return HttpResponse.json(served("/v1/drafts", "post", "201", "empty"), { status: 201 });
      }),
    );
    const res = await client.drafts.create();
    expect(body).toEqual({});
    expect(res.status).toBe("draft");
    expect(res.account_id).toBeNull();
  });
});

describe("drafts.list", () => {
  it("GET /v1/drafts: status joins to one comma list, filters forwarded", async () => {
    let url: URL | undefined;
    server.use(
      http.get(`${BASE}/v1/drafts`, ({ request }) => {
        url = new URL(request.url);
        return HttpResponse.json(served("/v1/drafts", "get", "200", "mixed"));
      }),
    );
    const res = await client.drafts.list({
      status: ["scheduled", "published"],
      account_id: "none",
      from: "2026-10-01T00:00:00Z",
      to: "2026-11-01T00:00:00Z",
      order: "asc",
      limit: 5,
      cursor: "cur_1",
    });
    const q = url!.searchParams;
    expect(url!.pathname).toBe("/v1/drafts");
    expect(q.getAll("status")).toEqual(["scheduled,published"]);
    expect(q.get("account_id")).toBe("none");
    expect(q.get("from")).toBe("2026-10-01T00:00:00Z");
    expect(q.get("to")).toBe("2026-11-01T00:00:00Z");
    expect(q.get("order")).toBe("asc");
    expect(q.get("limit")).toBe("5");
    expect(q.get("cursor")).toBe("cur_1");
    expect(res.object).toBe("draft_list");
    // The served example mixes a Draft and a publish record.
    expect(res.items.map((i) => i.object)).toEqual(["draft", "publish_record"]);
  });

  it("no params: no query string at all (server default status applies)", async () => {
    let search: string | undefined;
    server.use(
      http.get(`${BASE}/v1/drafts`, ({ request }) => {
        search = new URL(request.url).search;
        return HttpResponse.json(served("/v1/drafts", "get", "200"));
      }),
    );
    await client.drafts.list();
    expect(search).toBe("");
  });
});

describe("drafts.get / update / delete / publish", () => {
  it("get: GET /v1/drafts/{id}", async () => {
    let path: string | undefined;
    server.use(
      http.get(`${BASE}/v1/drafts/${ID}`, ({ request }) => {
        path = new URL(request.url).pathname;
        return HttpResponse.json(served("/v1/drafts/{id}", "get", "200"));
      }),
    );
    const res = await client.drafts.get(ID);
    expect(path).toBe(`/v1/drafts/${ID}`);
    expect(res.id).toBe(ID);
  });

  it("get: the id is percent-encoded, never a path escape", async () => {
    let path: string | undefined;
    server.use(
      http.get(`${BASE}/v1/drafts/:id`, ({ request }) => {
        path = new URL(request.url).pathname;
        return HttpResponse.json(served("/v1/drafts/{id}", "get", "200"));
      }),
    );
    await client.drafts.get("a/b");
    expect(path).toBe("/v1/drafts/a%2Fb");
  });

  it("update: PATCH /v1/drafts/{id} keeps null (unschedule) on the wire", async () => {
    let seen: { method: string; body: unknown } | undefined;
    server.use(
      http.patch(`${BASE}/v1/drafts/${ID}`, async ({ request }) => {
        seen = { method: request.method, body: await request.json() };
        return HttpResponse.json(served("/v1/drafts/{id}", "patch", "200"));
      }),
    );
    await client.drafts.update(ID, { scheduled_at: null });
    expect(seen).toEqual({ method: "PATCH", body: { scheduled_at: null } });
  });

  it("delete: DELETE /v1/drafts/{id}, bodyless 204 resolves undefined", async () => {
    let body: string | undefined;
    server.use(
      http.delete(`${BASE}/v1/drafts/${ID}`, async ({ request }) => {
        body = await request.text();
        return new HttpResponse(null, { status: 204 });
      }),
    );
    await expect(client.drafts.delete(ID)).resolves.toBeUndefined();
    expect(body).toBe("");
  });

  it("publish: POST /v1/drafts/{id}/publish returns the post_created shape", async () => {
    let seen: { method: string; body: string } | undefined;
    server.use(
      http.post(`${BASE}/v1/drafts/${ID}/publish`, async ({ request }) => {
        seen = { method: request.method, body: await request.text() };
        return HttpResponse.json(served("/v1/drafts/{id}/publish", "post", "201"), { status: 201 });
      }),
    );
    const res = await client.drafts.publish(ID);
    expect(seen).toEqual({ method: "POST", body: "" });
    expect(res.object).toBe("post_created");
    expect(res.id).toMatch(/^urn:li:/);
  });
});

describe("drafts.uploadAttachment", () => {
  const bytes = new Uint8Array([0, 1, 2, 3, 250, 251, 252, 253]);

  it("sends the raw bytes under the file's Content-Type with filename in the query", async () => {
    let seen: { url: URL; ct: string | null; bytes: Uint8Array } | undefined;
    server.use(
      http.post(`${BASE}/v1/drafts/${ID}/attachments`, async ({ request }) => {
        seen = {
          url: new URL(request.url),
          ct: request.headers.get("content-type"),
          bytes: new Uint8Array(await request.arrayBuffer()),
        };
        return HttpResponse.json(served("/v1/drafts/{id}/attachments", "post", "201"), { status: 201 });
      }),
    );
    const res = await client.drafts.uploadAttachment(ID, bytes, {
      filename: "clip final.mp4",
      contentType: "video/mp4",
    });
    expect(seen?.url.pathname).toBe(`/v1/drafts/${ID}/attachments`);
    expect(seen?.url.searchParams.get("filename")).toBe("clip final.mp4");
    expect(seen?.ct).toBe("video/mp4");
    expect(Array.from(seen!.bytes)).toEqual(Array.from(bytes));
    expect(res.object).toBe("draft");
  });

  it("a Blob carries its own type when contentType is omitted; the body is not JSON-encoded", async () => {
    let seen: { ct: string | null; text: string } | undefined;
    server.use(
      http.post(`${BASE}/v1/drafts/${ID}/attachments`, async ({ request }) => {
        seen = { ct: request.headers.get("content-type"), text: await request.text() };
        return HttpResponse.json(served("/v1/drafts/{id}/attachments", "post", "201"), { status: 201 });
      }),
    );
    await client.drafts.uploadAttachment(ID, new Blob(["%PDF-1.7"], { type: "application/pdf" }), {
      filename: "deck.pdf",
    });
    expect(seen).toEqual({ ct: "application/pdf", text: "%PDF-1.7" });
  });

  it("a refused upload surfaces the server code (413 PAYLOAD_TOO_LARGE) and is not retried", async () => {
    let calls = 0;
    server.use(
      http.post(`${BASE}/v1/drafts/${ID}/attachments`, () => {
        calls += 1;
        return HttpResponse.json(
          { code: "PAYLOAD_TOO_LARGE", message: "too big", user_fixable: true, retry_likely_to_succeed: false },
          { status: 413 },
        );
      }),
    );
    const err = await client.drafts
      .uploadAttachment(ID, bytes, { filename: "a.mp4", contentType: "video/mp4" })
      .catch((e: unknown) => e);
    expect(err).toBeInstanceOf(CurviateError);
    expect((err as CurviateError).code).toBe("PAYLOAD_TOO_LARGE");
    expect(calls).toBe(1);
  });
});

describe("drafts.uploadAttachment on a real socket", () => {
  // The upload route refuses a body without Content-Length (411). msw does not
  // expose transport headers, so this one test talks to a real HTTP server.
  it("sends Content-Length (not chunked) for Uint8Array, ArrayBuffer and Blob", async () => {
    const { createServer } = await import("node:http");
    const seen: Array<{ cl: string | undefined; te: string | undefined; n: number }> = [];
    const srv = createServer((req, res) => {
      const chunks: Buffer[] = [];
      req.on("data", (c: Buffer) => chunks.push(c));
      req.on("end", () => {
        seen.push({
          cl: req.headers["content-length"],
          te: req.headers["transfer-encoding"],
          n: Buffer.concat(chunks).length,
        });
        res.setHeader("content-type", "application/json");
        res.statusCode = 201;
        res.end(JSON.stringify({ object: "draft", id: ID }));
      });
    });
    await new Promise<void>((r) => srv.listen(0, "127.0.0.1", r));
    const port = (srv.address() as { port: number }).port;
    // msw intercepts global fetch; let this host through to the real socket.
    server.use(http.post(`http://127.0.0.1:${port}/*`, () => passthrough()));
    const c = new Curviate({ apiKey: "k", baseUrl: `http://127.0.0.1:${port}` });
    const data = new Uint8Array([1, 2, 3, 4, 5]);
    const opts = { filename: "a.png", contentType: "image/png" as const };
    try {
      await c.drafts.uploadAttachment(ID, data, opts);
      await c.drafts.uploadAttachment(ID, data.buffer, opts);
      await c.drafts.uploadAttachment(ID, new Blob([data]), opts);
    } finally {
      srv.close();
    }
    expect(seen).toEqual([
      { cl: "5", te: undefined, n: 5 },
      { cl: "5", te: undefined, n: 5 },
      { cl: "5", te: undefined, n: 5 },
    ]);
  });
});

describe("drafts error codes decode to themselves (not INTERNAL)", () => {
  const cases: Array<[string, number, string, () => Promise<unknown>, "post" | "patch"]> = [
    ["DRAFT_LIMIT_REACHED", 422, "/v1/drafts", () => client.drafts.create({}), "post"],
    ["SCHEDULE_CONFLICT", 422, `/v1/drafts/${ID}`, () => client.drafts.update(ID, { scheduled_at: "2026-10-12T09:00:00Z" }), "patch"],
    ["ACCOUNT_REQUIRED", 422, `/v1/drafts/${ID}/publish`, () => client.drafts.publish(ID), "post"],
    ["DRAFT_NOT_PUBLISHABLE", 422, `/v1/drafts/${ID}/publish`, () => client.drafts.publish(ID), "post"],
    ["DRAFT_PUBLISHING", 409, `/v1/drafts/${ID}/publish`, () => client.drafts.publish(ID), "post"],
    ["MEDIA_QUOTA_EXCEEDED", 422, `/v1/drafts/${ID}/attachments`, () => client.drafts.uploadAttachment(ID, new Uint8Array(1), { filename: "a.png", contentType: "image/png" }), "post"],
  ];
  it.each(cases)("%s (%i)", async (code, status, path, call, method) => {
    server.use(
      http[method](`${BASE}${path}`, () =>
        HttpResponse.json(
          { code, message: "m", user_fixable: true, retry_likely_to_succeed: false },
          { status },
        ),
      ),
    );
    const err = await call().catch((e: unknown) => e);
    expect((err as CurviateError).code).toBe(code);
  });
});
