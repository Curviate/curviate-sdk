/** The vendored api/040 corpus (sdk/009 FR-011): read-only access for the sequence tests. */
import { readdirSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export const CORPUS_DIR = resolve(dirname(fileURLToPath(import.meta.url)), "../fixtures/sequence-corpus");

export interface CorpusEntry {
  about: string;
  rules: string[];
  only?: "server" | "lint";
  context?: unknown;
  schema_valid: boolean;
  document: unknown;
  errors: { path: string; rule: string }[];
  warnings: { code: string; path: string; rule: string }[];
}

export const corpus: [file: string, entry: CorpusEntry][] = readdirSync(CORPUS_DIR)
  .filter((f) => f.endsWith(".json"))
  .sort()
  .map((f) => [f, JSON.parse(readFileSync(resolve(CORPUS_DIR, f), "utf8")) as CorpusEntry]);

const isMotionFile = (d: unknown): d is { sequence: unknown } =>
  typeof d === "object" && d !== null && !Array.isArray(d) && "sequence" in d;

/** The Sequence an entry is about: a Motion file is validated on its `.sequence` (paths stay relative to it). */
export const sequenceOf = (e: CorpusEntry): unknown => (isMotionFile(e.document) ? e.document.sequence : e.document);

/** Entries the SDK runs: everything but the server-only ones (W2-W4, W10). */
export const offline = corpus.filter(([, e]) => e.only !== "server");
