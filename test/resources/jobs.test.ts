// jobs namespace (10 methods, account-scoped) — 1 realign (get, account-first
// grammar, id/URL client-side resolution preserved) + 9 new (the whole Core
// Jobs write surface). create/update job_title/company are OBJECTS
// ({id?,name?}), never scalars; apply_method is a method-discriminated
// oneOf. publish's body is a mode-discriminated oneOf (FREE vs
// PROMOTED/PROMOTED_PLUS + budget). close is bodyless. listApplicants is
// POST-as-search: limit/cursor stay top-level query params, never in the
// body. downloadResume returns raw bytes.
import { http, HttpResponse } from "msw";
import { describe, expect, it } from "vitest";
import { server } from "../msw/server.js";
import { Curviate } from "../../src/index.js";
import { CurviateError, isCurviateError } from "../../src/errors.js";

const BASE = "https://app.curviate.test";
const ACC = "acc_jobs1";
const client = new Curviate({ apiKey: "cvt_test_jobs", baseUrl: BASE });
const jobs = () => client.account(ACC).jobs;

const JOB_FIXTURE = {
  object: "job_posting",
  id: "4428113858",
  title: "Founders Associate",
  company: { id: "67756343", name: "LEAGUES" },
  location: "Stuttgart, Baden-Württemberg, Germany",
  state: "LISTED",
  is_repost: false,
  is_application_limit_reached: false,
  created_at: "2026-06-12T10:07:09.000Z",
  description: "Über deine Rolle: …",
  applications_count: 75,
  workplace_type: "ON_SITE",
  employment_status: "FULL_TIME",
  published_at: "2026-06-12T10:08:03.000Z",
  hiring_team: [] as unknown[],
};

const APPLY_METHOD = { method: "linkedin" as const, notification_email: "jobs@acme.test" };

const CREATE_BODY = {
  job_title: { name: "Founders Associate" },
  company: { name: "LEAGUES" },
  workplace_type: "ON_SITE" as const,
  location: "105646813",
  employment_status: "FULL_TIME" as const,
  description: "d".repeat(200),
  apply_method: APPLY_METHOD,
};

describe("jobs.list", () => {
  it("GET /v1/{account_id}/jobs — state is a required query param", async () => {
    let url: string | undefined;
    server.use(
      http.get(`${BASE}/v1/${ACC}/jobs`, ({ request }) => {
        url = request.url;
        return HttpResponse.json({ object: "job_posting_list", items: [], cursor: null });
      }),
    );
    const res = await jobs().list({ state: "OPEN" });
    const parsed = new URL(url!);
    expect(parsed.pathname).toBe(`/v1/${ACC}/jobs`);
    expect(parsed.searchParams.get("state")).toBe("OPEN");
    expect(res.object).toBe("job_posting_list");
  });

  it("forwards limit/cursor alongside the required state", async () => {
    let url: string | undefined;
    server.use(
      http.get(`${BASE}/v1/${ACC}/jobs`, ({ request }) => {
        url = request.url;
        return HttpResponse.json({ object: "job_posting_list", items: [], cursor: null });
      }),
    );
    await jobs().list({ state: "DRAFT", limit: 5, cursor: "cur_1" });
    const params = new URL(url!).searchParams;
    expect(params.get("state")).toBe("DRAFT");
    expect(params.get("limit")).toBe("5");
    expect(params.get("cursor")).toBe("cur_1");
  });
});

describe("jobs.create", () => {
  it("POST /v1/{account_id}/jobs sends all 7 required keys — job_title/company/apply_method are objects", async () => {
    let seenPath: string | undefined;
    let body: Record<string, unknown> | undefined;
    server.use(
      http.post(`${BASE}/v1/${ACC}/jobs`, async ({ request }) => {
        seenPath = new URL(request.url).pathname;
        body = (await request.json()) as Record<string, unknown>;
        return HttpResponse.json({ ...JOB_FIXTURE, object: "job_posting", state: "DRAFT" }, { status: 201 });
      }),
    );
    const res = await jobs().create(CREATE_BODY);
    expect(seenPath).toBe(`/v1/${ACC}/jobs`);
    expect(body).toEqual(CREATE_BODY);
    expect(body?.job_title).toEqual({ name: "Founders Associate" });
    expect(body?.company).toEqual({ name: "LEAGUES" });
    expect(body?.apply_method).toEqual(APPLY_METHOD);
    expect(res.id).toBe("4428113858");
  });

  it("also accepts the external apply_method arm", async () => {
    let body: Record<string, unknown> | undefined;
    server.use(
      http.post(`${BASE}/v1/${ACC}/jobs`, async ({ request }) => {
        body = (await request.json()) as Record<string, unknown>;
        return HttpResponse.json({ ...JOB_FIXTURE, state: "DRAFT" }, { status: 201 });
      }),
    );
    await jobs().create({
      ...CREATE_BODY,
      apply_method: { method: "external", website_url: "https://acme.test/apply" },
    });
    expect(body?.apply_method).toEqual({ method: "external", website_url: "https://acme.test/apply" });
  });
});

describe("jobs.get", () => {
  it("GET /v1/{account_id}/jobs/:job_id — a bare numeric id issues the request as-is (account-first)", async () => {
    let capturedUrl: string | undefined;
    server.use(
      http.get(`${BASE}/v1/${ACC}/jobs/4428113858`, ({ request }) => {
        capturedUrl = request.url;
        return HttpResponse.json(JOB_FIXTURE);
      }),
    );
    const res = await jobs().get("4428113858");
    expect(new URL(capturedUrl!).pathname).toBe(`/v1/${ACC}/jobs/4428113858`);
    expect(res.object).toBe("job_posting");
    expect(res.id).toBe("4428113858");
    expect(res.title).toBe("Founders Associate");
    expect(res.company).toEqual({ id: "67756343", name: "LEAGUES" });
    expect(res.applications_count).toBe(75);
  });

  it("a full LinkedIn job URL resolves client-side to the identical GET request", async () => {
    let capturedUrl: string | undefined;
    let hitCount = 0;
    server.use(
      http.get(`${BASE}/v1/${ACC}/jobs/4428113858`, ({ request }) => {
        hitCount++;
        capturedUrl = request.url;
        return HttpResponse.json(JOB_FIXTURE);
      }),
    );
    const byId = await jobs().get("4428113858");
    const byUrl = await jobs().get("https://www.linkedin.com/jobs/view/4428113858");
    expect(hitCount).toBe(2);
    expect(new URL(capturedUrl!).pathname).toBe(`/v1/${ACC}/jobs/4428113858`);
    expect(byUrl).toEqual(byId);
  });

  it("throws INVALID_REQUEST synchronously for an unrelated non-numeric string", () => {
    let caught: unknown;
    try {
      jobs().get("not-a-job-identifier");
    } catch (e) {
      caught = e;
    }
    expect(isCurviateError(caught)).toBe(true);
    expect((caught as CurviateError).code).toBe("INVALID_REQUEST");
  });

  it("sends with_sections as one comma value (a repeated key keeps only the last)", async () => {
    let url: string | undefined;
    server.use(
      http.get(`${BASE}/v1/${ACC}/jobs/4428113858`, ({ request }) => {
        url = request.url;
        return HttpResponse.json(JOB_FIXTURE);
      }),
    );
    await jobs().get("4428113858", { with_sections: ["hiring_team", "salary"] });
    const params = new URL(url!).searchParams;
    expect(params.getAll("with_sections")).toEqual(["hiring_team,salary"]);
  });
});

describe("jobs.update", () => {
  it("PATCH /v1/{account_id}/jobs/{job_id} sends only the included fields", async () => {
    let seenPath: string | undefined;
    let body: unknown;
    server.use(
      http.patch(`${BASE}/v1/${ACC}/jobs/4428113858`, async ({ request }) => {
        seenPath = new URL(request.url).pathname;
        body = await request.json();
        return HttpResponse.json({ ...JOB_FIXTURE, title: "Founders Associate II" });
      }),
    );
    const res = await jobs().update("4428113858", { job_title: { name: "Founders Associate II" } });
    expect(seenPath).toBe(`/v1/${ACC}/jobs/4428113858`);
    expect(body).toEqual({ job_title: { name: "Founders Associate II" } });
    expect(res.title).toBe("Founders Associate II");
  });
});

describe("jobs.getBudget", () => {
  it("GET /v1/{account_id}/jobs/{job_id}/budget", async () => {
    let capturedUrl: string | undefined;
    server.use(
      http.get(`${BASE}/v1/${ACC}/jobs/4428113858/budget`, ({ request }) => {
        capturedUrl = request.url;
        return HttpResponse.json({
          object: "job_posting_budget",
          promoted: { currency: "EUR", daily: { min: 5, max: 500, recommended: 25 } },
          free: { eligible: true },
        });
      }),
    );
    const res = await jobs().getBudget("4428113858");
    expect(new URL(capturedUrl!).pathname).toBe(`/v1/${ACC}/jobs/4428113858/budget`);
    expect(res.object).toBe("job_posting_budget");
  });
});

describe("jobs.publish", () => {
  it("POST .../publish with mode:'FREE' sends {mode:'FREE'}", async () => {
    let seenPath: string | undefined;
    let body: unknown;
    server.use(
      http.post(`${BASE}/v1/${ACC}/jobs/job_1/publish`, async ({ request }) => {
        seenPath = new URL(request.url).pathname;
        body = await request.json();
        return HttpResponse.json({ object: "job_posting_published", job_state: "LISTED" });
      }),
    );
    const res = await jobs().publish("job_1", { mode: "FREE" });
    expect(seenPath).toBe(`/v1/${ACC}/jobs/job_1/publish`);
    expect(body).toEqual({ mode: "FREE" });
    expect(res).toEqual({ object: "job_posting_published", job_state: "LISTED" });
  });

  it("POST .../publish with mode:'PROMOTED' carries budget — real money, explicit opt-in", async () => {
    let body: unknown;
    server.use(
      http.post(`${BASE}/v1/${ACC}/jobs/job_1/publish`, async ({ request }) => {
        body = await request.json();
        return HttpResponse.json({ object: "job_posting_published", job_state: "LISTED" });
      }),
    );
    await jobs().publish("job_1", {
      mode: "PROMOTED",
      budget: { currency: "EUR", amount: 25, scope: "DAILY" },
    });
    expect(body).toEqual({
      mode: "PROMOTED",
      budget: { currency: "EUR", amount: 25, scope: "DAILY" },
    });
  });
});

describe("jobs.close", () => {
  it("POST /v1/{account_id}/jobs/{job_id}/close — no request body", async () => {
    let seenPath: string | undefined;
    let seenBody: string | null = null;
    server.use(
      http.post(`${BASE}/v1/${ACC}/jobs/job_1/close`, async ({ request }) => {
        seenPath = new URL(request.url).pathname;
        seenBody = await request.text();
        return HttpResponse.json({ object: "job_posting_closed" });
      }),
    );
    const res = await jobs().close("job_1");
    expect(seenPath).toBe(`/v1/${ACC}/jobs/job_1/close`);
    expect(seenBody).toBe("");
    expect(res).toEqual({ object: "job_posting_closed" });
  });
});

describe("jobs.listApplicants", () => {
  it("POST .../applicants — limit/cursor stay top-level query, never in the body", async () => {
    let seenPath: string | undefined;
    let capturedUrl: string | undefined;
    let body: unknown;
    server.use(
      http.post(`${BASE}/v1/${ACC}/jobs/job_1/applicants`, async ({ request }) => {
        seenPath = new URL(request.url).pathname;
        capturedUrl = request.url;
        body = await request.json();
        return HttpResponse.json({ object: "job_applicant_list", items: [], cursor: null });
      }),
    );
    await jobs().listApplicants("job_1", { ratings: ["GOOD_FIT"], sort_by: "APPLIED_DATE", limit: 10, cursor: "cur_1" });
    expect(seenPath).toBe(`/v1/${ACC}/jobs/job_1/applicants`);
    const params = new URL(capturedUrl!).searchParams;
    expect(params.get("limit")).toBe("10");
    expect(params.get("cursor")).toBe("cur_1");
    expect(body).toEqual({ ratings: ["GOOD_FIT"], sort_by: "APPLIED_DATE" });
    expect(body).not.toHaveProperty("limit");
    expect(body).not.toHaveProperty("cursor");
  });

  it("omitting all params sends an empty filter body and no query string (full funnel)", async () => {
    let capturedUrl: string | undefined;
    let body: unknown;
    server.use(
      http.post(`${BASE}/v1/${ACC}/jobs/job_1/applicants`, async ({ request }) => {
        capturedUrl = request.url;
        body = await request.json();
        return HttpResponse.json({ object: "job_applicant_list", items: [], cursor: null });
      }),
    );
    await jobs().listApplicants("job_1");
    expect(new URL(capturedUrl!).search).toBe("");
    expect(body).toEqual({});
  });
});

describe("jobs.getApplicant", () => {
  it("GET /v1/{account_id}/jobs/{job_id}/applicants/{applicant_id}", async () => {
    let capturedUrl: string | undefined;
    server.use(
      http.get(`${BASE}/v1/${ACC}/jobs/job_1/applicants/app_1`, ({ request }) => {
        capturedUrl = request.url;
        return HttpResponse.json({
          object: "job_applicant",
          id: "app_1",
          messaging_token: "tok_1",
          applied_at: "2026-06-12T10:07:09.000Z",
          profile: { id: "u_1", display_name: "Alice" },
          rating: "GOOD_FIT",
          screening_questions: [],
          has_resume: true,
          contact_info: {},
        });
      }),
    );
    const res = await jobs().getApplicant("job_1", "app_1");
    expect(new URL(capturedUrl!).pathname).toBe(`/v1/${ACC}/jobs/job_1/applicants/app_1`);
    expect(res.id).toBe("app_1");
    expect(res.rating).toBe("GOOD_FIT");
  });
});

describe("jobs.downloadResume", () => {
  it("GET .../resume returns an ArrayBuffer", async () => {
    let capturedUrl: string | undefined;
    server.use(
      http.get(`${BASE}/v1/${ACC}/jobs/job_1/applicants/app_1/resume`, ({ request }) => {
        capturedUrl = request.url;
        return new HttpResponse(new Uint8Array([0x25, 0x50, 0x44, 0x46]).buffer, {
          status: 200,
          headers: { "Content-Type": "application/octet-stream" },
        });
      }),
    );
    const buf = await jobs().downloadResume("job_1", "app_1");
    expect(new URL(capturedUrl!).pathname).toBe(`/v1/${ACC}/jobs/job_1/applicants/app_1/resume`);
    expect(buf).toBeInstanceOf(ArrayBuffer);
    expect(new Uint8Array(buf)).toEqual(new Uint8Array([0x25, 0x50, 0x44, 0x46]));
  });
});
