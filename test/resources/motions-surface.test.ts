// The root `motions` and `enrollments` namespaces, against a recorded
// transport (an injected `fetch`). One row per method: method, path, query and
// body on the wire. The comma-list rows also cover the empty-array fold on
// every list filter the API reads as one comma list.
import { describe, expect, it } from "vitest";
import { Curviate, ERROR_CODES, isCurviateError } from "../../src/index.js";

const BASE = "https://app.curviate.test";

interface Sent {
  method: string;
  path: string;
  search: string;
  body: unknown;
}

function recorder(status = 200, payload: string | null = JSON.stringify({ object: "ok" })) {
  const sent: Sent[] = [];
  const fetchImpl = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = new URL(String(input));
    sent.push({
      method: init?.method ?? "GET",
      path: url.pathname,
      // Raw and decoded: a repeated key or an empty `k=` shows here.
      search: decodeURIComponent(url.search),
      body: typeof init?.body === "string" ? JSON.parse(init.body) : undefined,
    });
    return new Response(payload, { status, headers: payload === null ? {} : { "content-type": "application/json" } });
  }) as typeof fetch;
  return { sent, fetchImpl };
}

const client = (fetchImpl: typeof fetch) =>
  new Curviate({ apiKey: "cvt_test_motions", baseUrl: BASE, fetch: fetchImpl, maxRetries: 0 });

type Row = [name: string, call: (c: Curviate) => Promise<unknown>, method: string, path: string, search: string, body: unknown];

// An id with the characters the path encoder exists for.
const ODD = "a/b?c";
const ODD_PATH = "a%2Fb%3Fc";
const DOC = { on_reply: "end", steps: [{ id: "w", wait: "1d", next: "end" }] };

const ROWS: Row[] = [
  // Motions
  ["motions.create", (c) => c.motions.create({ name: "Q4", contact_list_ids: ["cl_1"] }), "POST", "/v1/motions", "", { name: "Q4", contact_list_ids: ["cl_1"] }],
  ["motions.list()", (c) => c.motions.list(), "GET", "/v1/motions", "", undefined],
  [
    "motions.list(status) sends one comma list",
    (c) => c.motions.list({ status: ["active", "paused"], account_id: "acc_1", q: "q4", limit: 5, cursor: "cur_1" }),
    "GET",
    "/v1/motions",
    "?status=active,paused&account_id=acc_1&q=q4&limit=5&cursor=cur_1",
    undefined,
  ],
  ["motions.list(status: []) omits the filter", (c) => c.motions.list({ status: [] }), "GET", "/v1/motions", "", undefined],
  ["motions.get", (c) => c.motions.get(ODD), "GET", `/v1/motions/${ODD_PATH}`, "", undefined],
  ["motions.update", (c) => c.motions.update(ODD, { name: "Q1", sequence: DOC }), "PATCH", `/v1/motions/${ODD_PATH}`, "", { name: "Q1", sequence: DOC }],
  ["motions.delete", (c) => c.motions.delete(ODD), "DELETE", `/v1/motions/${ODD_PATH}`, "", undefined],
  ["motions.start", (c) => c.motions.start(ODD), "POST", `/v1/motions/${ODD_PATH}/start`, "", undefined],
  ["motions.pause", (c) => c.motions.pause("mot_1"), "POST", "/v1/motions/mot_1/pause", "", undefined],
  ["motions.resume", (c) => c.motions.resume("mot_1"), "POST", "/v1/motions/mot_1/resume", "", undefined],
  ["motions.archive", (c) => c.motions.archive("mot_1"), "POST", "/v1/motions/mot_1/archive", "", undefined],
  ["motions.preview()", (c) => c.motions.preview(ODD), "GET", `/v1/motions/${ODD_PATH}/preview`, "", undefined],
  ["motions.preview(sample)", (c) => c.motions.preview("mot_1", { sample: 3 }), "GET", "/v1/motions/mot_1/preview", "?sample=3", undefined],
  [
    "motions.preview(contact_ids) sends one comma list, order kept",
    (c) => c.motions.preview("mot_1", { contact_ids: ["con_2", "con_1"] }),
    "GET",
    "/v1/motions/mot_1/preview",
    "?contact_ids=con_2,con_1",
    undefined,
  ],
  ["motions.preview(contact_ids: []) omits it", (c) => c.motions.preview("mot_1", { contact_ids: [] }), "GET", "/v1/motions/mot_1/preview", "", undefined],
  ["motions.getSequenceVersion()", (c) => c.motions.getSequenceVersion(ODD), "GET", `/v1/motions/${ODD_PATH}/sequence`, "", undefined],
  ["motions.getSequenceVersion(version)", (c) => c.motions.getSequenceVersion("mot_1", { version: 2 }), "GET", "/v1/motions/mot_1/sequence", "?version=2", undefined],
  [
    "motions.addContacts",
    (c) => c.motions.addContacts(ODD, { contact_ids: ["con_1"], account_id: "acc_1" }),
    "POST",
    `/v1/motions/${ODD_PATH}/contacts`,
    "",
    { contact_ids: ["con_1"], account_id: "acc_1" },
  ],
  ["motions.removeContacts", (c) => c.motions.removeContacts("mot_1", { contact_ids: ["con_1"] }), "POST", "/v1/motions/mot_1/contacts/remove", "", { contact_ids: ["con_1"] }],

  // Enrollments
  ["enrollments.list()", (c) => c.enrollments.list(), "GET", "/v1/enrollments", "", undefined],
  [
    "enrollments.list(filters) sends status as one comma list",
    (c) => c.enrollments.list({ motion_id: "mot_1", contact_id: "con_1", account_id: "acc_1", status: ["active", "paused"], step_id: "opener", limit: 10 }),
    "GET",
    "/v1/enrollments",
    "?motion_id=mot_1&contact_id=con_1&account_id=acc_1&status=active,paused&step_id=opener&limit=10",
    undefined,
  ],
  ["enrollments.list(status: []) omits the filter", (c) => c.enrollments.list({ motion_id: "mot_1", status: [] }), "GET", "/v1/enrollments", "?motion_id=mot_1", undefined],
  ["enrollments.get", (c) => c.enrollments.get(ODD), "GET", `/v1/enrollments/${ODD_PATH}`, "", undefined],
  ["enrollments.stop", (c) => c.enrollments.stop(ODD), "POST", `/v1/enrollments/${ODD_PATH}/stop`, "", undefined],
  ["enrollments.resume", (c) => c.enrollments.resume("enr_1", { at: "opener" }), "POST", "/v1/enrollments/enr_1/resume", "", { at: "opener" }],
  ["enrollments.signal", (c) => c.enrollments.signal("enr_1", { name: "demo_booked" }), "POST", "/v1/enrollments/enr_1/signal", "", { name: "demo_booked" }],

  // The same fold on the comma lists that shipped before (contacts, drafts).
  ["contacts.list(enrollment_status: []) omits it", (c) => c.contacts.list({ motion_id: "mot_1", enrollment_status: [] }), "GET", "/v1/contacts", "?motion_id=mot_1", undefined],
  ["contacts.export(enrollment_status: []) omits it", (c) => c.contacts.export({ motion_id: "mot_1", enrollment_status: [] }), "GET", "/v1/contacts/export", "?motion_id=mot_1", undefined],
  ["contacts.list(enrollment_status) still one comma list", (c) => c.contacts.list({ motion_id: "mot_1", enrollment_status: ["active", "paused"] }), "GET", "/v1/contacts", "?motion_id=mot_1&enrollment_status=active,paused", undefined],
  ["drafts.list(status: []) omits it", (c) => c.drafts.list({ status: [] }), "GET", "/v1/drafts", "", undefined],
];

describe("motions surface: method -> wire request", () => {
  it.each(ROWS)("%s", async (_name, call, method, path, search, body) => {
    const { sent, fetchImpl } = recorder();
    await call(client(fetchImpl));
    expect(sent).toEqual([{ method, path, search, body }]);
  });

  it("motions.delete resolves with nothing on a bodyless 204", async () => {
    const { fetchImpl } = recorder(204, null);
    await expect(client(fetchImpl).motions.delete("mot_1")).resolves.toBeUndefined();
  });
});

describe("motion refusals decode to their own code, not INTERNAL", () => {
  it.each([
    ["MOTION_NOT_STARTABLE", 422],
    ["MOTION_STATUS_CONFLICT", 409],
    ["ENROLLMENT_NOT_ACTIVE", 409],
    ["CONTACT_NOT_ENROLLABLE", 422],
    ["SEQUENCE_INVALID", 422],
  ] as const)("%s (%i)", async (code, status) => {
    expect(ERROR_CODES).toContain(code);
    const { fetchImpl } = recorder(status, JSON.stringify({ object: "error", code, message: "refused", user_fixable: true, retry_likely_to_succeed: false }));
    const err = await client(fetchImpl).motions.start("mot_1").catch((e: unknown) => e);
    expect(isCurviateError(err) && err.code).toBe(code);
  });

  it("POSITIVE CONTROL: an unknown code still decodes to INTERNAL", async () => {
    const { fetchImpl } = recorder(409, JSON.stringify({ object: "error", code: "NOT_A_CODE", message: "x" }));
    const err = await client(fetchImpl).motions.start("mot_1").catch((e: unknown) => e);
    expect(isCurviateError(err) && err.code).toBe("INTERNAL");
  });
});
