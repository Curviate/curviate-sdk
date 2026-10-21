/**
 * The embedded schema is the fixture's component, drives the validator's bounds,
 * uses only supported keywords, and cannot be changed by a consumer.
 */
import { readFileSync, readdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { SEQUENCE_SCHEMA_URL, SEQUENCE_SCHEMA_V1, validateSequence } from "../../src/index.js";
import { createValidator } from "../../src/sequence/validate.js";
import { assertKeywords, schemaKeywords, SUPPORTED_KEYWORDS, vocabulary } from "../../src/sequence/vocab.js";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const fixture = JSON.parse(readFileSync(resolve(root, "fixtures/openapi.json"), "utf8")) as {
  components: { schemas: Record<string, unknown> };
};
const copy = (): Record<string, any> => JSON.parse(JSON.stringify(SEQUENCE_SCHEMA_V1));
const wait = (id: string, next?: string) => ({ id, wait: "1d", ...(next ? { next } : {}) });

describe("embedded schema", () => {
  it("deep-equals components.schemas.SequenceDocument of the fixture, $id is the schema URL, no $ref", () => {
    expect(SEQUENCE_SCHEMA_V1).toEqual(fixture.components.schemas["SequenceDocument"]);
    expect(SEQUENCE_SCHEMA_V1["$id"]).toBe(SEQUENCE_SCHEMA_URL);
    expect(JSON.stringify(SEQUENCE_SCHEMA_V1)).not.toContain('"$ref"');
    // control: the scan finds a $ref where one is
    expect(JSON.stringify({ a: { $ref: "#/x" } })).toContain('"$ref"');
  });

  it("uses exactly the supported keywords; another keyword is refused, never skipped", () => {
    expect(schemaKeywords(SEQUENCE_SCHEMA_V1)).toEqual(SUPPORTED_KEYWORDS);
    const s = copy();
    s["properties"].steps.dependentSchemas = { x: {} };
    expect(() => assertKeywords(s)).toThrow(/dependentSchemas/);
    expect(() => vocabulary(s)).toThrow(/dependentSchemas/);
  });

  it("is deep-frozen: a mutation throws in strict mode and never changes a later verdict", () => {
    const doc = { on_reply: "end", steps: [wait("a"), wait("b"), wait("c"), wait("d", "end")] };
    const before = validateSequence(doc);
    const steps = (SEQUENCE_SCHEMA_V1["properties"] as Record<string, Record<string, unknown>>)["steps"]!;
    expect(() => {
      "use strict";
      steps["maxItems"] = 3;
    }).toThrow(TypeError);
    expect(steps["maxItems"]).toBe(100);
    expect(validateSequence(doc)).toEqual(before);
  });
});

describe("bounds come from the schema", () => {
  it("a schema copy with steps.maxItems 3 refuses a 4-step document the shipped schema accepts", () => {
    const doc = { on_reply: "end", steps: [wait("a"), wait("b"), wait("c"), wait("d", "end")] };
    const s = copy();
    s["properties"].steps.maxItems = 3;
    expect(createValidator(vocabulary(s))(doc).errors).toMatchObject([{ path: "steps", rule: "4 steps; the limit is 3", code: "R2" }]);
    expect(validateSequence(doc).errors).toEqual([]);
  });

  it("a schema copy with another action enum changes the accepted actions (vocabulary is read, not restated)", () => {
    const s = copy();
    const alt = s["properties"].steps.items.oneOf.find((a: any) => a.properties.do?.const === "skill.endorse");
    alt.properties.do.const = "skill.praise";
    const doc = { on_reply: "end", steps: [{ id: "e", do: "skill.praise", next: "end" }] };
    expect(createValidator(vocabulary(s))(doc).errors).toEqual([]);
    expect(validateSequence(doc).errors.map((e) => e.path)).toEqual(["e.do"]);
  });

  it("document size is UTF-8 bytes of compact JSON: 256 KiB passes, one byte more fails", () => {
    const at = (bytes: number) => {
      const d = { on_reply: "end", steps: [{ id: "a", wait: "1d", next: "end", note: "" }] };
      // A 3-byte character in the note proves bytes, not characters, are counted.
      const fixed = new TextEncoder().encode(JSON.stringify(d)).length;
      const n = bytes - fixed;
      d.steps[0]!.note = "€".repeat(Math.floor(n / 3)) + "x".repeat(n % 3);
      expect(new TextEncoder().encode(JSON.stringify(d)).length).toBe(bytes);
      return validateSequence(d).errors.filter((e) => e.path === "$");
    };
    expect(at(256 * 1024)).toEqual([]);
    expect(at(256 * 1024 + 1)).toMatchObject([{ path: "$", rule: "the document is 262145 bytes; the limit is 262144, UTF-8 compact JSON", code: "R2", pointer: "" }]);
  });
});

describe("purity", () => {
  const FORBIDDEN = /["']node:|["']fs["']|\bprocess\.|\bfetch\(/;
  const scan = (dir: string): string[] =>
    readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
      e.isDirectory() ? scan(join(dir, e.name)) : e.name.endsWith(".ts") && FORBIDDEN.test(readFileSync(join(dir, e.name), "utf8")) ? [e.name] : [],
    );

  it("src/sequence has no node:, fs, process or fetch reference", () => {
    expect(scan(resolve(root, "src/sequence"))).toEqual([]);
  });

  it("control: a planted node:fs import reds the scan", () => {
    expect(FORBIDDEN.test('import { readFileSync } from "node:fs";')).toBe(true);
    expect(FORBIDDEN.test("const r = await fetch(url);")).toBe(true);
    expect(FORBIDDEN.test("const k = process.env.X;")).toBe(true);
    expect(FORBIDDEN.test("const visit = (node: unknown) => 0;")).toBe(false);
  });
});
