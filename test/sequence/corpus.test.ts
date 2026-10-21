/**
 * The server's own corpus (vendored byte for byte, provenance in
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
const entry = (f: string) => {
  const found = corpus.find(([n]) => n === f);
  if (!found) throw new Error(`corpus entry ${f} is missing`);
  return found[1];
};
const valid = offline.filter(([, e]) => e.errors.length === 0);
const invalid = offline.filter(([, e]) => e.errors.length > 0 && e.code === undefined);
const unstorable = offline.filter(([, e]) => e.code === "INVALID_REQUEST");

describe("corpus verdicts", () => {
  it("runs the whole vendored corpus: every entry but the server-only ones", () => {
    expect(corpus.length).toBe(153);
    expect(offline.length).toBe(143);
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
    expect(validateSequence(value)).toEqual({ errors: entry("r1-not-an-object.json").errors, warnings: [] });
  });

  it("{{motion.<key>}} is deprecated (W13) plus W9, never an error, in the deprecation window", () => {
    const doc = { on_reply: "end", steps: [{ id: "m", do: "message.send", with: { text: "Hi {{motion.x}}", fallback: "Hi" }, next: "end" }] };
    const r = validateSequence(doc);
    expect(r.errors).toEqual([]);
    expect(r.warnings.map((w) => w.code)).toEqual(["W13", "W9"]);
  });

  it("an own property holding undefined counts as absent", () => {
    const doc = { on_reply: "end", extra: undefined, steps: [{ id: "a", wait: "1d", next: "end", note: undefined }] };
    expect(validateSequence(doc)).toEqual({ errors: [], warnings: [] });
  });
});

/** The rules an entry is the expected case of, as the corpus owner labels it. */
const coveredRules = (entries: [string, CorpusEntry][]) => new Set(entries.flatMap(([, e]) => e.rules).filter((r) => /^R\d+$/.test(r)));
const ALL_RULES = Array.from({ length: 24 }, (_, i) => `R${i + 1}`);

describe("coverage", () => {
  it("every rule R1-R24 is the expected rule of an entry the SDK runs", () => {
    const covered = coveredRules(offline);
    expect(ALL_RULES.filter((r) => !covered.has(r))).toEqual([]);
  });

  it("control: dropping a rule's only entries reds the coverage check", () => {
    const without = offline.filter(([, e]) => !e.rules.includes("R20"));
    expect(ALL_RULES.filter((r) => !coveredRules(without).has(r))).toEqual(["R20"]);
  });
});

describe("the API's answer (ruling 2026-10-19)", () => {
  it("lists the first 100 errors; the refusal's message counts them all", () => {
    const e = entry("r16-102-errors-listed-100.json");
    expect(validateSequence(sequenceOf(e)).errors).toHaveLength(100);
    expect(e.error_count).toBe(102);
  });

  it("answers an oversized document with R2 alone", () => {
    const e = entry("r2-oversize-answered-alone.json");
    expect(validateSequence(sequenceOf(e)).errors).toEqual(e.errors);
    expect(e.errors.map((x) => x.path)).toEqual(["$"]);
  });

  it.each(unstorable.map(([f, e]) => [f, e] as const))("%s: refused, as the API's 400 INVALID_REQUEST", (_, e) => {
    expect(validateSequence(sequenceOf(e)).errors).toEqual(e.errors);
    let caught: unknown;
    try {
      Sequence.fromDocument(sequenceOf(e));
    } catch (err) {
      caught = err;
    }
    const err = caught as CurviateError;
    expect(err).toBeInstanceOf(CurviateError);
    expect(err.code).toBe("INVALID_REQUEST");
    expect(err.message).toBe(`sequence.${e.errors[0]!.path}: ${e.errors[0]!.rule}.`);
    expect(err.errors).toBeUndefined();
  });

  it("a NUL or lone surrogate in a key is refused too; a valid surrogate pair is not", () => {
    expect(validateSequence({ on_reply: "end", "a\u0000": 1, steps: [] }).errors).toEqual([{ path: "$ key", rule: expect.stringContaining("NUL") }]);
    expect(validateSequence({ on_reply: "end", steps: [{ id: "w", wait: "1d", next: "end", note: "ok \ud83d\udc4b" }] }).errors).toEqual([]);
    expect(validateSequence({ on_reply: "end", steps: [{ id: "w", wait: "1d", next: "end", note: "\udc4b" }] }).errors).toEqual([{ path: "steps[0].note", rule: expect.stringContaining("NUL") }]);
  });

  it.each([
    ["a NUL", "https://x\u0000"],
    ["a lone surrogate", "https://x\ud800"],
  ])("$schema holding %s: named sequence.$schema, as the route names it", (_, value) => {
    const doc = { $schema: value, on_reply: "end", steps: [{ id: "w", wait: "1d", next: "end" }] };
    expect(validateSequence(doc).errors).toEqual([{ path: "$schema", rule: expect.stringContaining("NUL") }]);
    expect(() => Sequence.fromDocument(doc)).toThrow(
      "sequence.$schema: must be well-formed Unicode and must not contain a NUL (\\u0000) character.",
    );
  });

  it("names the first bad string in the route's order: each key, then its whole value, before the next key", () => {
    // Key-first would name the later root key or the step's bad key; the route reaches the note first.
    const doc = { on_reply: "end", steps: [{ id: "w", wait: "1d", note: "x\u0000", "k\u0000": 1 }], "z\u0000": 1 };
    expect(validateSequence(doc).errors.map((e) => e.path)).toEqual(["steps[0].note"]);
    // control: with the note clean, the step's bad key comes next, then the root key
    doc.steps[0]!.note = "ok";
    expect(validateSequence(doc).errors.map((e) => e.path)).toEqual(["steps[0] key"]);
    expect(() => Sequence.fromDocument(doc)).toThrow("sequence.steps[0] key: must be well-formed");
    // a bad key holding a bad value: the key is named first
    expect(validateSequence({ on_reply: "end", steps: [{ "n\u0000": "v\u0000" }] }).errors.map((e) => e.path)).toEqual(["steps[0] key"]);
  });

  it("a document nested over 1,000 levels is refused (R15 here, a 400 from the API), never accepted", () => {
    expect(validateSequence(sequenceOf(entry("r15-not-20000-deep.json"))).errors.length).toBeGreaterThan(0);
  });
});

describe("round trip", () => {
  for (const [file, e] of valid) {
    it(file, () => {
      const input = sequenceOf(e) as Record<string, unknown>;
      const out = Sequence.fromDocument(deepFreeze(structuredClone(input))).toDocument();
      expect(out).toEqual(input);
      // every valid corpus document is in the served key order (the server's corpus test pins it): byte for byte
      expect(JSON.stringify(out)).toBe(JSON.stringify(input));
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

describe("fromDocument refusals", () => {
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
      const more = (e.error_count ?? e.errors.length) - 1;
      expect(err.message).toBe(`${e.errors[0]!.path}: ${e.errors[0]!.rule}${more > 0 ? ` and ${more} more` : ""}`);
      expect(err.httpStatus).toBeUndefined();
      expect(err.userFixable).toBe(true);
      expect(err.retryLikelyToSucceed).toBe(false);
      expect(err.retryHint).toBeNull();
    });
  }
});

/**
 * Each value of the constants module (the bounds JSON Schema cannot state) is
 * pinned by a corpus pair: the entry at the bound passes, the one past it is
 * refused, both written by the server's corpus owner.
 */
const PAIRS: [constant: string, atBound: string, pastBound: string][] = [
  ["DURATION_BOUNDS.wait (365d)", "valid-wait-bounds.json", "r12-wait-366d.json"],
  ["DURATION_BOUNDS.timeout (1h)", "valid-timeout-bounds.json", "r12-timeout-59m.json"],
  ["DURATION_BOUNDS.timeout (180d)", "valid-timeout-bounds.json", "r12-timeout-181d.json"],
  ["DURATION_BOUNDS.withdraw_after (14d)", "valid-withdraw-after-bounds.json", "r21-withdraw-after-13d.json"],
  ["DURATION_BOUNDS.withdraw_after (180d)", "valid-withdraw-after-bounds.json", "r21-withdraw-after-181d.json"],
  ["DURATION_BOUNDS.newer_than (1h)", "valid-every-action.json", "r12-newer-than-59m.json"],
  ["DURATION_BOUNDS.newer_than (365d)", "valid-every-action.json", "r12-newer-than-366d.json"],
  ["TEXT_LIMITS.message", "valid-message-8000.json", "r22-message-8001.json"],
  ["TEXT_LIMITS.message, with a variable", "valid-message-8000-plus-variable.json", "r22-message-8001-plus-variable.json"],
  ["TEXT_LIMITS.invite_note", "valid-invite-note-300.json", "r22-invite-note-301.json"],
  ["TEXT_LIMITS.invite_note, with a variable", "valid-invite-note-300-plus-variable.json", "r22-invite-note-301-plus-variable.json"],
  ["TEXT_LIMITS.inmail_subject + inmail_text", "valid-inmail-200-1900.json", "r22-inmail-subject-201.json"],
  ["TEXT_LIMITS.inmail_subject + inmail_text, with variables", "valid-inmail-200-1900-plus-variable.json", "r22-inmail-201-1901-plus-variable.json"],
  ["TEXT_LIMITS.comment, with a variable", "valid-comment-1250.json", "r22-comment-1251.json"],
  ["MAX_SEQUENCE_BYTES", "valid-size-256kib.json", "r2-size-256kib-plus-one.json"],
  ["MAX_PREDICATE_DEPTH", "r15-predicate-depth-10.json", "r15-predicate-depth-11.json"],
  ["MAX_VARIABLE_REFS_PER_TEXT", "r22-variables-50-valid.json", "r22-variables-51.json"],
  ["MAX_QUOTED_TOKEN_CHARS", "r18-token-cut-to-64.json", "r18-token-cut-to-64.json"],
];

describe("constants boundary pairs", () => {
  it.each(PAIRS)("%s: %s at the bound, %s past it", (_, at, past) => {
    const a = entry(at);
    const p = entry(past);
    expect(validateSequence(sequenceOf(a)).errors).toEqual(a.errors);
    expect(validateSequence(sequenceOf(p)).errors).toEqual(p.errors);
    expect(p.errors.length).toBeGreaterThan(0);
  });

  it("the at-bound side passes on the bound it pins (depth 10 is refused for its operand, not its depth)", () => {
    for (const [, at] of PAIRS) {
      const rules = validateSequence(sequenceOf(entry(at))).errors.map((e) => e.rule);
      expect(rules.filter((r) => /limit is|nests at most|duration between/.test(r)), at).toEqual([]);
    }
  });

  it("the quoted token is cut to 64 characters", () => {
    const rule = entry("r18-token-cut-to-64.json").errors[0]!.rule;
    expect(rule.split(" ")[0]).toHaveLength(64);
  });
});

describe("motion-research examples", () => {
  it("role-switch-engagement: no error, warnings exactly W1 at r_msg", () => {
    const r = validateSequence(sequenceOf(entry("role-switch-engagement.json")));
    expect(r.errors).toEqual([]);
    expect(r.warnings.map(({ code, path }) => ({ code, path }))).toEqual([{ code: "W1", path: "r_msg" }]);
  });

  it("invalid-heyreach-style: R5 invite.by, R11 on_reply, R18 invite.with.note among its corpus errors", () => {
    const e = entry("invalid-heyreach-style.json");
    const errors = validateSequence(sequenceOf(e)).errors;
    expect(errors).toEqual(e.errors);
    expect(errors.map((x) => x.path)).toEqual(expect.arrayContaining(["invite.by", "on_reply", "invite.with.note"]));
    expect(e.rules).toEqual(["R5", "R11", "R16", "R17", "R18", "R19", "R20", "R21"]);
  });
});
