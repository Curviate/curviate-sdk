/**
 * sdk/009 TS-007, TS-011, TS-012, TS-016 (AC-007, AC-011, AC-012, AC-016):
 * the server's own corpus (vendored byte for byte, provenance in
 * `test/fixtures/sequence-corpus.PROVENANCE`) through the SDK. Every entry the
 * SDK runs must give exactly the server-written `errors` and `warnings`; a
 * drift on either side reds here or in the server's corpus test.
 */
import { describe, expect, it } from "vitest";
import { CurviateError, Sequence, validateSequence } from "../../src/index.js";
import { corpus, offline, sequenceOf, type CorpusEntry } from "./_corpus.js";

/** Deterministic PRNG (mulberry32), so a failing shuffle is reproducible from its seed. */
function rng(seed: number): () => number {
  let a = seed;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
/** The same value with every object's keys in a random order. */
function shuffleKeys(v: unknown, rand: () => number): unknown {
  if (Array.isArray(v)) return v.map((x) => shuffleKeys(x, rand));
  if (typeof v !== "object" || v === null) return v;
  const keys = Object.keys(v);
  for (let i = keys.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [keys[i], keys[j]] = [keys[j]!, keys[i]!];
  }
  return Object.fromEntries(keys.map((k) => [k, shuffleKeys((v as Record<string, unknown>)[k], rand)]));
}
function deepFreeze<T>(v: T): T {
  if (typeof v === "object" && v !== null) {
    Object.freeze(v);
    Object.values(v).forEach(deepFreeze);
  }
  return v;
}
/** The input's bytes; a value too deep for JSON (r15-not-20000-deep) compares by identity only. */
const snapshot = (v: unknown): string => {
  try {
    return JSON.stringify(v);
  } catch {
    return "(too deep to serialise)";
  }
};
const valid = offline.filter(([, e]) => e.errors.length === 0);
const invalid = offline.filter(([, e]) => e.errors.length > 0);

describe("corpus verdicts (AC-007)", () => {
  it("runs the whole vendored corpus: every entry but the server-only ones", () => {
    expect(corpus.length).toBe(120);
    expect(offline.length).toBe(110);
    expect(valid.length).toBeGreaterThan(0);
    expect(invalid.length).toBeGreaterThan(0);
  });

  for (const [file, e] of offline) {
    it(file, () => {
      const input = sequenceOf(e);
      const before = snapshot(input);
      expect(validateSequence(input)).toEqual({ errors: e.errors, warnings: e.warnings });
      expect(snapshot(input)).toBe(before);
    });
  }

  it("never emits a server-only warning (W2-W4, W10); the server-only entries do list them", () => {
    const serverOnly = /^W(2|3|4|10)$/;
    const offlineCodes = offline.flatMap(([, e]) => validateSequence(sequenceOf(e)).warnings.map((w) => w.code));
    expect(offlineCodes.filter((c) => serverOnly.test(c))).toEqual([]);
    // control: the instrument sees those codes where the server writes them
    const serverCodes = corpus.filter(([, e]) => e.only === "server").flatMap(([, e]) => e.warnings.map((w) => w.code));
    expect(new Set(serverCodes.filter((c) => serverOnly.test(c)))).toEqual(new Set(["W2", "W3", "W4", "W10"]));
  });

  it.each([undefined, null, [], "x", 42])("a non-object document (%j) is R1, never a throw", (value) => {
    expect(validateSequence(value)).toEqual({ errors: [{ path: "$", rule: "a Sequence document is a JSON object" }], warnings: [] });
  });

  it("{{motion.<key>}} is W9, never an error", () => {
    const doc = { on_reply: "end", steps: [{ id: "m", do: "message.send", with: { text: "Hi {{motion.x}}", fallback: "Hi" }, next: "end" }] };
    const r = validateSequence(doc);
    expect(r.errors).toEqual([]);
    expect(r.warnings.map((w) => w.code)).toEqual(["W9"]);
  });

  it("an own property holding undefined counts as absent", () => {
    const doc = { on_reply: "end", extra: undefined, steps: [{ id: "a", wait: "1d", next: "end", note: undefined }] };
    expect(validateSequence(doc)).toEqual({ errors: [], warnings: [] });
  });
});

/** The rules an entry is the expected case of, as the corpus owner labels it. */
const coveredRules = (entries: [string, CorpusEntry][]) => new Set(entries.flatMap(([, e]) => e.rules).filter((r) => /^R\d+$/.test(r)));
const ALL_RULES = Array.from({ length: 24 }, (_, i) => `R${i + 1}`);

describe("coverage (AC-015)", () => {
  it("every rule R1-R24 is the expected rule of an entry the SDK runs", () => {
    const covered = coveredRules(offline);
    expect(ALL_RULES.filter((r) => !covered.has(r))).toEqual([]);
  });

  it("control: dropping a rule's only entries reds the coverage check", () => {
    const without = offline.filter(([, e]) => !e.rules.includes("R20"));
    expect(ALL_RULES.filter((r) => !coveredRules(without).has(r))).toEqual(["R20"]);
  });
});

describe("round trip (AC-011)", () => {
  for (const [file, e] of valid) {
    it(file, () => {
      const input = sequenceOf(e) as Record<string, unknown>;
      const out = Sequence.fromDocument(deepFreeze(structuredClone(input))).toDocument();
      expect(out).toEqual(input);
      expect("$schema" in out).toBe("$schema" in input);
      expect(Sequence.fromDocument(out).toDocument()).toEqual(out);
      const canonical = JSON.stringify(out);
      for (let seed = 1; seed <= 20; seed++) {
        const shuffled = shuffleKeys(input, rng(seed));
        expect(JSON.stringify(Sequence.fromDocument(shuffled).toDocument()), `${file} seed ${seed}`).toBe(canonical);
      }
    });
  }
});

describe("fromDocument refusals (AC-012)", () => {
  for (const [file, e] of invalid) {
    it(file, () => {
      const input = sequenceOf(e);
      let caught: unknown;
      try {
        Sequence.fromDocument(input);
      } catch (err) {
        caught = err;
      }
      expect(caught).toBeInstanceOf(CurviateError);
      const err = caught as CurviateError;
      expect(err.code).toBe("SEQUENCE_INVALID");
      expect(err.errors).toEqual(e.errors);
      expect(err.errors).toEqual(validateSequence(input).errors);
      const more = e.errors.length - 1;
      expect(err.message).toBe(`${e.errors[0]!.path}: ${e.errors[0]!.rule}${more > 0 ? ` and ${more} more` : ""}`);
      expect(err.httpStatus).toBeUndefined();
      expect(err.userFixable).toBe(true);
      expect(err.retryLikelyToSucceed).toBe(false);
      expect(err.retryHint).toBeNull();
    });
  }
});
