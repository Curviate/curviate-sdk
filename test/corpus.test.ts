// The shared corpora (vendored byte for byte from the API by
// scripts/vendor-shared.mjs): every entry through the public offline
// functions, exact `errors[]` and `warnings[]`, and every render byte-equal.
// The API runs the same files, so an entry here failing is a drift between
// the SDK and the API.
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { Sequence, SEQUENCE_SCHEMA_V1, renderWebhookTemplate, step, validateSequence, validateWebhookTemplate, type WebhookTemplateContext, type WebhookTemplateSource } from "../src/index.js";

const read = <T>(dir: string) =>
  readdirSync(join(__dirname, "fixtures", dir))
    .filter((f) => f.endsWith(".json"))
    .sort()
    .map((f) => [f, JSON.parse(readFileSync(join(__dirname, "fixtures", dir, f), "utf8")) as T] as const);

const templates = read<{ source: WebhookTemplateSource; template: string; errors: unknown[]; warnings: unknown[]; context?: WebhookTemplateContext; body?: string }>("webhook-template-corpus");
const sequences = read<{ only?: "server" | "lint"; document: unknown; errors: unknown[]; warnings: unknown[] }>("sequence-corpus");
const isFile = (d: unknown): d is { sequence: unknown } => typeof d === "object" && d !== null && !Array.isArray(d) && "sequence" in d;

describe("webhook template corpus (validateWebhookTemplate, renderWebhookTemplate)", () => {
  it.each(templates)("%s", (_f, e) => {
    expect(validateWebhookTemplate(e.template, { source: e.source })).toEqual({ errors: e.errors, warnings: e.warnings });
    if (e.body !== undefined) expect(renderWebhookTemplate(e.template, e.context!)).toBe(e.body);
  });
});

describe("sequence corpus (validateSequence)", () => {
  it.each(sequences.filter(([, e]) => e.only !== "server"))("%s", (_f, e) => {
    expect(validateSequence(isFile(e.document) ? e.document.sequence : e.document)).toEqual({ errors: e.errors, warnings: e.warnings });
  });
});

describe("builder and embedded schema speak Lead and Campaign", () => {
  it("builds lead.connected and {{lead.first_name}}, validates clean offline, and the schema holds no old word", () => {
    const doc = Sequence.create({ on_reply: "end" })
      .add(
        step.if("is_connected", { "lead.connected": true }, { then: "opener", else: "end" }),
        step.do("opener", "message.send", { with: { text: "Hi {{lead.first_name}}", fallback: "Hi" }, next: "end" }),
      )
      .toDocument();
    const json = JSON.stringify(doc);
    expect(json).toContain('"lead.connected":true');
    expect(json).toContain("{{lead.first_name}}");
    expect(validateSequence(doc).errors).toEqual([]);
    expect(JSON.stringify(SEQUENCE_SCHEMA_V1)).not.toMatch(/contact|motion/i);
  });

  it("types what the API accepts (email step, per-variable fallbacks, on_missing, weights, business days) and refuses at compile time what it refuses", () => {
    const doc = Sequence.create({ on_reply: "end" })
      .add(
        step.do("m", "message.send", { with: { text: "Hi {{lead.first_name|there}}" }, next: "w" }),
        step.wait("w", "3bd", { next: "e" }),
        step.do("e", "email.send", {
          with: { subject: "Hi {{lead.first_name|there}}", text: "Hello {{lead.first_name|there}}\n\n{{mailbox.signature}}", on_missing: "skip" },
          next: "u",
        }),
        step.until("u", "message.replied", { timeout: "5bd", then: "end", else: "v" }),
        step.do("v", "message.send", {
          variants: [
            { id: "v_a", text: "One", weight: 70 },
            { id: "v_b", text: "Two", weight: 30 },
          ],
          next: "end",
        }),
      )
      .toDocument();
    expect(validateSequence(doc)).toEqual({ errors: [], warnings: expect.any(Array) });
    // @ts-expect-error a duration is m, h, d or bd
    step.wait("x", "3w");
    // @ts-expect-error a message variable without its own fallback needs the step's
    step.do("y", "message.send", { with: { text: "Hi {{lead.first_name}}" } });
    step.do("z", "message.send", { with: { text: "Hi {{lead.first_name}}", on_missing: "hold" } });
  });
});
