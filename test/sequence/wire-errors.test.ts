/**
 * `CurviateError.errors` decodes the
 * wire `errors[]` of any error response, keeps `{path, rule}` and the
 * compiler-style `code`, `message`, `pointer`, `hint`, `docs_url` (each when a
 * string), drops any other key, and
 * leaves a malformed list undefined without breaking the rest of the error.
 * The offline module itself issues no request: the suite runs under MSW
 * `onUnhandledRequest: "error"` (test/setup.ts), and the control below is a
 * request that does reach the mock.
 */
import { http, HttpResponse } from "msw";
import { describe, expect, it } from "vitest";
import { server } from "../msw/server.js";
import { Curviate, CurviateError, Sequence, step, validateSequence } from "../../src/index.js";

const BASE = "https://app.curviate.test";
const client = new Curviate({ apiKey: "cvt_test_seq", baseUrl: BASE, maxRetries: 0 });

async function refusal(status: number, body: Record<string, unknown>): Promise<{ err: CurviateError; requests: number }> {
  let requests = 0;
  server.use(
    http.patch(`${BASE}/v1/tags/ctg_1`, () => {
      requests++;
      return HttpResponse.json(body, { status });
    }),
  );
  try {
    await client.tags.update("ctg_1", { name: "x" });
  } catch (err) {
    if (err instanceof CurviateError) return { err, requests };
    throw err;
  }
  throw new Error("expected a refusal");
}
const envelope = (code: string, errors?: unknown) => ({
  code,
  message: "m: r",
  user_fixable: true,
  retry_likely_to_succeed: false,
  ...(errors === undefined ? {} : { errors }),
});

describe("wire errors[]", () => {
  it("SEQUENCE_INVALID with 2 entries: both decoded with their compiler-style keys, suggestion dropped, toJSON carries them", async () => {
    const compiler = {
      code: "R19",
      message: "required because the text uses a variable",
      pointer: "/steps/0/with",
      hint: "Add a variable-free fallback.",
      docs_url: "https://docs.curviate.com/reference/sequence-rules#r19",
    };
    const { err, requests } = await refusal(422, envelope("SEQUENCE_INVALID", [
      { path: "opener.with.fallback", rule: "required because the text uses a variable", ...compiler, suggestion: "add a fallback" },
      { path: "on_reply", rule: "unknown step thanks", code: 11, pointer: null },
    ]));
    expect(requests).toBe(1);
    expect(err.code).toBe("SEQUENCE_INVALID");
    expect(err.message).toBe("m: r");
    expect(err.httpStatus).toBe(422);
    expect(err.errors).toEqual([
      { path: "opener.with.fallback", rule: "required because the text uses a variable", ...compiler },
      // a compiler-style key that is not a string is dropped; the entry stays
      { path: "on_reply", rule: "unknown step thanks" },
    ]);
    expect(err.toJSON().errors).toEqual(err.errors);
    expect(JSON.parse(JSON.stringify(err)).errors).toEqual(err.errors);
  });

  it("MOTION_NOT_STARTABLE with 3 entries: 3 decoded", async () => {
    const three = [
      { path: "schedule.timezone", rule: "required to start" },
      { path: "account_ids", rule: "at least one account" },
      { path: "contact_list_ids", rule: "at least one list" },
    ];
    const { err } = await refusal(422, envelope("MOTION_NOT_STARTABLE", three));
    expect(err.errors).toEqual(three);
    expect(err.message).toBe("m: r");
  });

  it.each([
    ["absent", 404, envelope("RESOURCE_NOT_FOUND")],
    ["not an array", 422, envelope("SEQUENCE_INVALID", "x")],
    ["an object", 422, envelope("SEQUENCE_INVALID", { path: "a", rule: "b" })],
  ])("errors %s → undefined; code and message still decode", async (_, status, body) => {
    const { err } = await refusal(status, body);
    expect(err.errors).toBeUndefined();
    expect(err.code).toBe(body.code);
    expect(err.message).toBe("m: r");
    expect("errors" in err.toJSON()).toBe(false);
  });

  it("an entry lacking rule, or with a non-string path, is dropped", async () => {
    const { err } = await refusal(422, envelope("SEQUENCE_INVALID", [{ path: "a" }, { path: 1, rule: "r" }, null, { path: "b", rule: "kept" }]));
    expect(err.errors).toEqual([{ path: "b", rule: "kept" }]);
  });

  it("an offline refusal and a server refusal carry the same code and errors", async () => {
    const doc = { on_reply: "nope", steps: [{ id: "a", wait: "1w" }] };
    const offline = (() => {
      try {
        Sequence.fromDocument(doc);
      } catch (e) {
        return e as CurviateError;
      }
      throw new Error("expected a throw");
    })();
    const { err } = await refusal(422, envelope("SEQUENCE_INVALID", validateSequence(doc).errors));
    expect(offline.code).toBe(err.code);
    expect(offline.errors).toEqual(err.errors);
  });
});

describe("no requests", () => {
  it("building, validating and emitting send nothing (a request would fail the suite); control: a client call reaches the mock", async () => {
    const b = Sequence.create({ on_reply: "end" }).add(step.wait("a", "1d", { next: "end" }));
    b.validate();
    JSON.stringify(b);
    Sequence.fromDocument(b.toDocument());
    const { requests } = await refusal(404, envelope("RESOURCE_NOT_FOUND"));
    expect(requests).toBe(1);
  });

  it("no client method or namespace is named validate, dryRun or dry_run", () => {
    const names = new Set<string>();
    const walk = (o: object, depth: number) => {
      for (let p: object | null = o; p && p !== Object.prototype; p = Object.getPrototypeOf(p)) {
        for (const k of Object.getOwnPropertyNames(p)) {
          names.add(k);
          const v = (o as Record<string, unknown>)[k];
          if (depth < 1 && typeof v === "object" && v !== null) walk(v, depth + 1);
        }
      }
    };
    walk(client, 0);
    walk(client.account("acc_1"), 0);
    expect(names.has("tags")).toBe(true); // control: the walk sees namespaces
    expect([...names].filter((n) => /^(validate|dryRun|dry_run)$/.test(n))).toEqual([]);
    // @ts-expect-error no validate method on the client
    void client.validate;
  });
});
