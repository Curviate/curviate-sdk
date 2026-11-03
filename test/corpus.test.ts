// The shared corpora (vendored byte for byte from the API by
// scripts/vendor-shared.mjs): every entry through the public offline
// functions, exact `errors[]` and `warnings[]`, and every render byte-equal.
// The API runs the same files, so an entry here failing is a drift between
// the SDK and the API.
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { renderWebhookTemplate, validateSequence, validateWebhookTemplate, type WebhookTemplateContext, type WebhookTemplateSource } from "../src/index.js";

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
