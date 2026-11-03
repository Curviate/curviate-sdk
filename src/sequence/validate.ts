/**
 * Offline Sequence validator: rules R1-R28 and warnings W1, W5-W9, W11-W14,
 * W16, the same verdict the API and `curviate motion lint` give. Every entry
 * is compiler-style: `path`, `rule`, `code`, `message` (= `rule`), `pointer`
 * (RFC 6901 into the document; a missing key points at the object that lacks
 * it), `hint`, `docs_url`, `severity` and, for a did-you-mean, `candidates`.
 * Pure: no I/O, never throws, never mutates its input.
 *
 * The rules are the API's own code (`src/shared/`, vendored by
 * `scripts/vendor-shared.mjs`), checked against the shared corpus
 * (`test/fixtures/sequence-corpus/`): every entry's `errors` and `warnings`
 * come out exactly.
 *
 * Server-only: W2-W4 (the Motion's sending Accounts), the `{{motion.<key>}}`
 * check against `settings.variables` (offline that is W9), and R29 (the
 * Team's incoming-event samples).
 */
import type { CurviateErrorDetail } from "../errors.js";
import { MAX_SEQUENCE_BYTES } from "../shared/sequence/limits.js";
import { lintSequence, sequenceSizeError } from "../shared/sequence/validate.js";

/**
 * One reason a Sequence document is refused: `path` into the document, `rule`
 * saying what to change, and the compiler-style `code` (`R1` to `R28`),
 * `message` (= `rule`), `pointer`, `hint`, `docs_url`, `severity` and maybe
 * `candidates`. A string the API cannot store (a NUL, a lone surrogate) is
 * refused before any rule: that one entry is `{path, rule}` only, as the
 * API's `400` names it.
 */
export type SequenceError = CurviateErrorDetail;
/** A non-blocking finding (`code` `W<n>`, `severity` `warning`), with the compiler-style keys. */
export interface SequenceWarning {
  code: `W${number}`;
  path: string;
  rule: string;
  message: string;
  pointer: string;
  hint: string;
  docs_url: string;
  severity: "error" | "warning";
  candidates?: string[];
}
/** What {@link validateSequence} returns: every error, in step order, and every warning. */
export interface SequenceValidationResult {
  errors: SequenceError[];
  warnings: SequenceWarning[];
}

/**
 * Validates a Sequence document offline: every error (in step order, with
 * `<step id>.<field>` paths) and every warning the API reports, with the same
 * keys. Takes any value, never throws, never mutates it. Nothing is sent
 * anywhere.
 *
 * A deprecated form (3 to 5 variants, `until signal.<name>`,
 * `{{motion.<key>}}`) is accepted with warning W13 until 2027-01-19.
 * `{{motion.<key>}}` also yields W9 (only the server knows the Motion's
 * `settings.variables`).
 *
 * @example
 * import { validateSequence } from "@curviate/sdk";
 *
 * const { errors, warnings } = validateSequence(JSON.parse(text));
 * for (const e of errors) console.error(`${e.path}: ${e.rule} (${e.code}: ${e.hint})`);
 */
export function validateSequence(value: unknown): SequenceValidationResult {
  const out = verdict(value);
  return { errors: out.errors.slice(0, MAX_ERRORS_LISTED), warnings: out.warnings };
}

/** The full verdict, every error: what a refusal's message counts. */
export function verdict(value: unknown): SequenceValidationResult {
  const bad = firstUnstorable(value);
  if (bad !== null) return { errors: [{ path: bad, rule: UNSTORABLE_RULE }], warnings: [] };
  const size = compactBytes(value);
  if (size > MAX_SEQUENCE_BYTES) return { errors: [sequenceSizeError(size)], warnings: [] };
  return lintSequence(value) as SequenceValidationResult;
}

function compactBytes(v: unknown): number {
  try {
    return new TextEncoder().encode(JSON.stringify(v)).length;
  } catch {
    return 0;
  }
}

/** The rule of a string the API cannot store (its `400 INVALID_REQUEST`), offline. */
export const UNSTORABLE_RULE = "must be well-formed Unicode and must not contain a NUL (\\u0000) character";
/** The most errors the API lists; the message still counts them all. */
export const MAX_ERRORS_LISTED = 100;
const UNSTORABLE_RE = /\u0000|[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/;

/**
 * The first string, key or value, the API refuses before reading the document
 * (a NUL or a lone surrogate), named by its document path, as the API names it
 * under `sequence.`; a bad key is `<path> key`. Iterative: any depth.
 */
function firstUnstorable(doc: unknown): string | null {
  // The route's order: each key, then its whole value, before the next key.
  // Iterative (a key is a "key" item on the stack), so depth cannot overflow.
  const stack: [kind: "value" | "key", value: unknown, path: string][] = [["value", doc, ""]];
  while (stack.length) {
    const [kind, value, path] = stack.pop()!;
    if (kind === "key") {
      if (UNSTORABLE_RE.test(value as string)) return path ? `${path} key` : "$ key";
    } else if (typeof value === "string") {
      if (UNSTORABLE_RE.test(value)) return path || "$";
    } else if (Array.isArray(value)) {
      for (let i = value.length - 1; i >= 0; i--) stack.push(["value", value[i], `${path}[${i}]`]);
    } else if (typeof value === "object" && value !== null) {
      const entries = Object.entries(value);
      for (let i = entries.length - 1; i >= 0; i--) {
        const [k, v] = entries[i]!;
        stack.push(["value", v, path ? `${path}.${k}` : k], ["key", k, path]);
      }
    }
  }
  return null;
}

/**
 * The API's answer, in its order: an unstorable string first (alone), then an
 * oversized document (R2 alone, nothing else is read), then every rule, the
 * errors all listed (`validateSequence` lists the first {@link MAX_ERRORS_LISTED}).
 */
