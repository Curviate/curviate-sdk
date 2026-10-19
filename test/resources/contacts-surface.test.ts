// The root `contacts` (with `contacts.imports`), `contactLists` and `tags`
// namespaces, against a recorded transport (an injected `fetch`).
// One row per method: method, path, query and body on the wire.
import { describe, expect, it } from "vitest";
import { Curviate, ERROR_CODES, isCurviateError } from "../../src/index.js";

const BASE = "https://app.curviate.test";

interface Sent {
  method: string;
  path: string;
  query: Record<string, string>;
  body: unknown;
}

function recorder(
  status = 200,
  payload: string | null = JSON.stringify({ object: "ok" }),
  contentType = "application/json",
) {
  const sent: Sent[] = [];
  const fetchImpl = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = new URL(String(input));
    sent.push({
      method: init?.method ?? "GET",
      path: url.pathname,
      query: Object.fromEntries(url.searchParams),
      body: typeof init?.body === "string" ? JSON.parse(init.body) : undefined,
    });
    return new Response(payload, {
      status,
      headers: payload === null ? {} : { "content-type": contentType },
    });
  }) as typeof fetch;
  return { sent, fetchImpl };
}

function client(fetchImpl: typeof fetch) {
  return new Curviate({ apiKey: "cvt_test_contacts", baseUrl: BASE, fetch: fetchImpl, maxRetries: 0 });
}

type Row = [
  name: string,
  call: (c: Curviate) => Promise<unknown>,
  method: string,
  path: string,
  query: Record<string, string>,
  body: unknown,
];

// An id with the characters the path encoder exists for.
const ODD = "a/b?c";
const URL_ = "https://www.linkedin.com/in/ana/";

const ROWS: Row[] = [
  // Contacts
  ["contacts.list()", (c) => c.contacts.list(), "GET", "/v1/contacts", {}, undefined],
  [
    "contacts.list(filters)",
    (c) => c.contacts.list({ list_id: "cl_1", tag: "warm,vip", enrichment_status: "done", limit: 50, cursor: "cur_1" }),
    "GET",
    "/v1/contacts",
    { list_id: "cl_1", tag: "warm,vip", enrichment_status: "done", limit: "50", cursor: "cur_1" },
    undefined,
  ],
  ["contacts.get", (c) => c.contacts.get(ODD), "GET", "/v1/contacts/a%2Fb%3Fc", {}, undefined],
  [
    "contacts.upsert",
    (c) => c.contacts.upsert({ linkedin_url: URL_, job_title: "CTO", tags: ["warm"], list_name: "Q4" }),
    "POST",
    "/v1/contacts",
    {},
    { linkedin_url: URL_, job_title: "CTO", tags: ["warm"], list_name: "Q4" },
  ],
  [
    "contacts.update",
    (c) => c.contacts.update("con_1", { company: null, extra: { plan: "pro" } }),
    "PATCH",
    "/v1/contacts/con_1",
    {},
    { company: null, extra: { plan: "pro" } },
  ],
  ["contacts.delete", (c) => c.contacts.delete(ODD), "DELETE", "/v1/contacts/a%2Fb%3Fc", {}, undefined],
  [
    "contacts.deleteMany",
    (c) => c.contacts.deleteMany({ contact_ids: ["con_1", "con_2"] }),
    "POST",
    "/v1/contacts/delete",
    {},
    { contact_ids: ["con_1", "con_2"] },
  ],
  [
    "contacts.updateMany",
    (c) => c.contacts.updateMany({ contact_ids: ["con_1"], add_tags: ["vip"], remove_list_id: "cl_1" }),
    "POST",
    "/v1/contacts/update",
    {},
    { contact_ids: ["con_1"], add_tags: ["vip"], remove_list_id: "cl_1" },
  ],
  [
    "contacts.enrich",
    (c) => c.contacts.enrich({ list_id: "cl_1", account_id: "acc_1", mode: "auto", max_age: 86400 }),
    "POST",
    "/v1/contacts/enrich",
    {},
    { list_id: "cl_1", account_id: "acc_1", mode: "auto", max_age: 86400 },
  ],
  ["contacts.export()", (c) => c.contacts.export(), "GET", "/v1/contacts/export", {}, undefined],
  [
    "contacts.export(format, filters, fields)",
    (c) => c.contacts.export({ format: "csv", tag: "warm", fields: "linkedin_url,full_name" }),
    "GET",
    "/v1/contacts/export",
    { format: "csv", tag: "warm", fields: "linkedin_url,full_name" },
    undefined,
  ],

  // Contact imports
  [
    "contacts.imports.create(rows)",
    (c) => c.contacts.imports.create({ rows: [{ linkedin_url: URL_ }], tags: ["webinar"] }),
    "POST",
    "/v1/contacts/imports",
    {},
    { rows: [{ linkedin_url: URL_ }], tags: ["webinar"] },
  ],
  [
    "contacts.imports.create(csv)",
    (c) => c.contacts.imports.create({ csv: "linkedin_url\n" + URL_, delimiter: ",", mapping: { Firma: "company" } }),
    "POST",
    "/v1/contacts/imports",
    {},
    { csv: "linkedin_url\n" + URL_, delimiter: ",", mapping: { Firma: "company" } },
  ],
  ["contacts.imports.list", (c) => c.contacts.imports.list({ limit: 10 }), "GET", "/v1/contacts/imports", { limit: "10" }, undefined],
  ["contacts.imports.get", (c) => c.contacts.imports.get(ODD), "GET", "/v1/contacts/imports/a%2Fb%3Fc", {}, undefined],
  [
    "contacts.imports.rows",
    (c) => c.contacts.imports.rows("cimp_1", { outcome: "skipped", cursor: "cur_r" }),
    "GET",
    "/v1/contacts/imports/cimp_1/rows",
    { outcome: "skipped", cursor: "cur_r" },
    undefined,
  ],

  // Contact lists
  [
    "contactLists.create",
    (c) => c.contactLists.create({ name: "Q4 webinar", description: null }),
    "POST",
    "/v1/contact-lists",
    {},
    { name: "Q4 webinar", description: null },
  ],
  ["contactLists.list", (c) => c.contactLists.list({ q: "webinar" }), "GET", "/v1/contact-lists", { q: "webinar" }, undefined],
  ["contactLists.get", (c) => c.contactLists.get("cl_1"), "GET", "/v1/contact-lists/cl_1", {}, undefined],
  ["contactLists.update", (c) => c.contactLists.update(ODD, { name: "Q1" }), "PATCH", "/v1/contact-lists/a%2Fb%3Fc", {}, { name: "Q1" }],
  ["contactLists.delete", (c) => c.contactLists.delete("cl_1"), "DELETE", "/v1/contact-lists/cl_1", {}, undefined],

  // Tags
  ["tags.list", (c) => c.tags.list({ limit: 100 }), "GET", "/v1/tags", { limit: "100" }, undefined],
  ["tags.update", (c) => c.tags.update("ctg_1", { name: "hot" }), "PATCH", "/v1/tags/ctg_1", {}, { name: "hot" }],
  ["tags.delete", (c) => c.tags.delete(ODD), "DELETE", "/v1/tags/a%2Fb%3Fc", {}, undefined],
];

describe("contacts surface: method -> wire request", () => {
  it.each(ROWS)("%s", async (_name, call, method, path, query, body) => {
    const { sent, fetchImpl } = recorder();
    await call(client(fetchImpl));
    expect(sent).toEqual([{ method, path, query, body }]);
  });
});

describe("served bodies", () => {
  it.each([
    ["contacts.delete", (c: Curviate) => c.contacts.delete("con_1")],
    ["contactLists.delete", (c: Curviate) => c.contactLists.delete("cl_1")],
    ["tags.delete", (c: Curviate) => c.tags.delete("ctg_1")],
  ] as const)("%s resolves with nothing on a bodyless 204", async (_n, call) => {
    const { fetchImpl } = recorder(204, null);
    await expect(call(client(fetchImpl))).resolves.toBeUndefined();
  });

  it("export as json resolves with the parsed Contact array", async () => {
    const rows = [{ object: "contact", id: "con_1" }];
    const { fetchImpl } = recorder(200, JSON.stringify(rows));
    await expect(client(fetchImpl).contacts.export({ format: "json" })).resolves.toEqual(rows);
  });

  it.each([
    ["csv", "text/csv; charset=utf-8", "﻿linkedin_url,full_name\r\n"],
    ["ndjson", "application/x-ndjson", '{"object":"contact","id":"con_1"}\n'],
  ] as const)("export as %s resolves with the raw bytes", async (format, ct, text) => {
    const { fetchImpl } = recorder(200, text, ct);
    const out = await client(fetchImpl).contacts.export({ format });
    expect(out).toBeInstanceOf(ArrayBuffer);
    expect(new TextDecoder("utf-8", { ignoreBOM: true }).decode(out)).toBe(text);
  });
});

describe("contact refusals decode to their own code, not INTERNAL", () => {
  it.each([
    ["NAME_TAKEN", 409],
    ["RESOURCE_IN_USE", 409],
    ["CONTACT_LIMIT_REACHED", 422],
    ["IMPORT_QUEUE_FULL", 429],
  ] as const)("%s (%i)", async (code, status) => {
    expect(ERROR_CODES).toContain(code);
    const { fetchImpl } = recorder(
      status,
      JSON.stringify({ object: "error", code, message: "refused", user_fixable: true, retry_likely_to_succeed: false }),
    );
    const err = await client(fetchImpl).contactLists.create({ name: "x" }).catch((e: unknown) => e);
    expect(isCurviateError(err) && err.code).toBe(code);
  });

  it("POSITIVE CONTROL: an unknown code still decodes to INTERNAL", async () => {
    const { fetchImpl } = recorder(409, JSON.stringify({ object: "error", code: "NOT_A_CODE", message: "x" }));
    const err = await client(fetchImpl).contactLists.create({ name: "x" }).catch((e: unknown) => e);
    expect(isCurviateError(err) && err.code).toBe("INTERNAL");
  });
});
