/**
 * `motions.create` / `motions.update` take a
 * `Sequence` builder in `sequence`. Runs under MSW `onUnhandledRequest:
 * "error"` (test/setup.ts); every handler counts what reaches it.
 */
import { http, HttpResponse } from "msw";
import { describe, expect, it } from "vitest";
import { server } from "../msw/server.js";
import { Curviate, CurviateError, Sequence, step, validateSequence } from "../../src/index.js";

const BASE = "https://app.curviate.test";
const client = (apiKey = "cvt_test_seq_a") => new Curviate({ apiKey, baseUrl: BASE, maxRetries: 0 });

interface Seen {
  method: string;
  auth: string | null;
  raw: string;
}

function capture(status = 201, reply: Record<string, unknown> = { object: "motion", id: "mot_1" }): Seen[] {
  const seen: Seen[] = [];
  const handle = async ({ request }: { request: Request }) => {
    seen.push({ method: request.method, auth: request.headers.get("authorization"), raw: await request.text() });
    return HttpResponse.json(reply, { status });
  };
  server.use(http.post(`${BASE}/v1/motions`, handle), http.patch(`${BASE}/v1/motions/:id`, handle));
  return seen;
}

const valid = () =>
  Sequence.create({ on_reply: "end" }).add(
    step.do("invite", "invite.send", { with: { note: null } }),
    step.until("accepted", "invite.accepted", { timeout: "14d", then: "opener", else: "end" }),
    step.do("opener", "message.send", { with: { text: "Hi {{contact.first_name}}.", fallback: "Hi." }, next: "end" }),
  );

// Compiles (the text is a widened string), fails validation: a variable with no fallback.
const text: string = "Hi {{contact.first_name}}";
const invalid = () => Sequence.create({ on_reply: "end" }).add(step.do("m", "message.send", { with: { text }, next: "end" }));

const thrown = (f: () => unknown): unknown => {
  try {
    f();
  } catch (e) {
    return e;
  }
  return undefined;
};

describe("motions helpers take a builder", () => {
  it("create with a valid builder: one request, sequence byte for byte toDocument()", async () => {
    const seen = capture();
    const seq = valid();
    await client().motions.create({ name: "Q4", sequence: seq });
    expect(seen).toHaveLength(1);
    expect(seen[0]!.raw).toBe(JSON.stringify({ name: "Q4", sequence: seq.toDocument() }));
  });

  it("update with a valid builder sends its document", async () => {
    const seen = capture(200);
    const seq = valid();
    await client().motions.update("mot_1", { sequence: seq });
    expect(seen.map((s) => [s.method, s.raw])).toEqual([["PATCH", JSON.stringify({ sequence: seq.toDocument() })]]);
  });

  it.each([
    ["create", (c: Curviate) => c.motions.create({ name: "Q4", sequence: invalid() })],
    ["update", (c: Curviate) => c.motions.update("mot_1", { sequence: invalid() })],
  ] as const)("%s with an invalid builder throws SEQUENCE_INVALID and sends nothing", async (_n, call) => {
    const seen = capture();
    const err = await call(client()).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(CurviateError);
    expect((err as CurviateError).code).toBe("SEQUENCE_INVALID");
    expect((err as CurviateError).errors?.length).toBeGreaterThan(0);
    expect(seen).toHaveLength(0);
  });

  it("a plain object goes verbatim, unvalidated; the API's 422 surfaces with errors", async () => {
    const errors = [{ path: "s.do", rule: "unknown action post.save" }];
    const seen = capture(422, { object: "error", code: "SEQUENCE_INVALID", message: "s.do: unknown action post.save", errors });
    const doc = { on_reply: "end", steps: [{ id: "s", do: "post.save", next: "end" }] };
    // A plain object is the generated document type: an action newer than this SDK must still go out.
    const err = await client().motions.create({ name: "Q4", sequence: doc as never }).catch((e: unknown) => e);
    expect(seen.map((s) => s.raw)).toEqual([JSON.stringify({ name: "Q4", sequence: doc })]);
    expect(err).toBeInstanceOf(CurviateError);
    expect((err as CurviateError).code).toBe("SEQUENCE_INVALID");
    expect((err as CurviateError).errors).toEqual(errors);
  });

  it("update with sequence: null sends null", async () => {
    const seen = capture(200);
    await client().motions.update("mot_1", { sequence: null });
    expect(seen.map((s) => s.raw)).toEqual(['{"sequence":null}']);
  });

  it("sequence: Sequence.fromDocument(invalid JSON) throws before any request", () => {
    const seen = capture();
    const err = thrown(() => client().motions.create({ name: "Q4", sequence: Sequence.fromDocument({ on_reply: "x", steps: [] }) }));
    expect((err as CurviateError).code).toBe("SEQUENCE_INVALID");
    expect(seen).toHaveLength(0);
  });
});

describe("no state shared between clients or calls", () => {
  it("two keys, one builder, concurrently: each request carries its own key, bodies identical", async () => {
    const seen = capture();
    const seq = valid();
    await Promise.all([client("cvt_test_key_a").motions.create({ name: "Q4", sequence: seq }), client("cvt_test_key_b").motions.create({ name: "Q4", sequence: seq })]);
    expect(seen.map((s) => s.auth).sort()).toEqual(["Bearer cvt_test_key_a", "Bearer cvt_test_key_b"]);
    expect(seen[0]!.raw).toBe(seen[1]!.raw);
  });

  it("validating an invalid document then a valid one: its errors, then none", () => {
    expect(validateSequence({ on_reply: "nowhere", steps: [] }).errors.length).toBeGreaterThan(0);
    expect(validateSequence(valid().toDocument()).errors).toEqual([]);
  });
});

/** Compile-only (never runs): a builder failing G13 is not a `sequence`. */
/* eslint-disable @typescript-eslint/no-unused-vars */
function g13(c: Curviate): void {
  const unresolved = Sequence.create({ on_reply: "end" }).add(step.wait("w", "1d", { next: "later" }));
  // @ts-expect-error G13: "later" is neither an added step nor "end"
  void c.motions.create({ name: "Q4", sequence: unresolved });
  // @ts-expect-error G13 on update
  void c.motions.update("mot_1", { sequence: unresolved });
  void c.motions.create({ name: "Q4", sequence: unresolved.add(step.wait("later", "1d", { next: "end" })) });
  void c.motions.update("mot_1", { sequence: Sequence.fromDocument({}) });
  // No validate or dry-run option on the client (no validate or dry-run anywhere).
  // @ts-expect-error no validate option
  void c.motions.create({ name: "Q4", validate: true });
}
