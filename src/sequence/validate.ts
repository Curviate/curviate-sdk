/**
 * Offline Sequence validator: rules R1-R24 and warnings W1, W5-W9, W11-W13,
 * the same verdict the API and `curviate motion lint` give. Every entry is
 * compiler-style: `path`, `rule`, `code`, `message` (= `rule`), `pointer`
 * (RFC 6901 into the document; a missing key points at the object that lacks
 * it), `hint` and `docs_url` (`rules.ts`).
 * Pure: no I/O, never throws, never mutates its input.
 *
 * A second implementation of the server's rules (the server cannot import the
 * SDK). The two are held together by the shared corpus
 * (`test/fixtures/sequence-corpus/`, vendored byte for byte from the server):
 * every entry's `errors` and `warnings` must come out exactly. Rule texts are
 * the contract; change one in the corpus first.
 *
 * `{{motion.<key>}}` is deprecated (W13) and never an error here, plus W9:
 * only the server knows the Motion's `settings.variables`. W2-W4 and W10 need
 * the Motion's sending Accounts or settings and are server-only.
 */
import {
  ACCOUNT_FIELDS,
  DEPRECATED_ACCEPTED_UNTIL,
  DURATION_BOUNDS,
  END,
  MAX_PREDICATE_DEPTH,
  MAX_QUOTED_TOKEN_CHARS,
  MAX_SEQUENCE_BYTES,
  MAX_VARIABLE_REFS_PER_TEXT,
  MAX_VARIANTS,
  MOTION_KEY_PATTERN,
  MY_FIELDS,
  NAME_FIELDS,
  SHORT_VARIABLE_PATTERN,
  TEXT_LIMITS,
} from "./constants.js";
import { ruleHelp } from "./rules.js";
import type { CurviateErrorDetail } from "../errors.js";
import { SEQUENCE_SCHEMA_V1 } from "./schema.js";
import { isObject, vocabulary, type Vocabulary } from "./vocab.js";

/**
 * One reason a Sequence document is refused: `path` into the document, `rule`
 * saying what to change, and the compiler-style `code` (`R1` to `R24`),
 * `message` (= `rule`), `pointer`, `hint` and `docs_url`. A string the API
 * cannot store (a NUL, a lone surrogate) is refused before any rule: that one
 * entry is `{path, rule}` only, as the API's `400` names it.
 */
export type SequenceError = CurviateErrorDetail;
/** A non-blocking finding, `code` `W1`, `W5` to `W9` or `W11` to `W13`, with the compiler-style keys. */
export interface SequenceWarning {
  code: `W${number}`;
  path: string;
  rule: string;
  message: string;
  pointer: string;
  hint: string;
  docs_url: string;
}
/** What {@link validateSequence} returns: every error, in step order, and every warning. */
export interface SequenceValidationResult {
  errors: SequenceError[];
  warnings: SequenceWarning[];
}

interface Issue {
  order: number;
  code: string;
  path: string;
  pointer: string;
  rule: string;
  /** The offending token a hint names (R12, W11, W13). */
  token?: string;
}
interface Ctx {
  v: Vocabulary;
  re: Patterns;
  issues: Issue[];
  warnings: Issue[];
}
interface Patterns {
  id: RegExp;
  duration: RegExp;
  emit: RegExp;
  event: RegExp;
  extraKey: RegExp;
  tag: RegExp;
  motion: RegExp;
  short: RegExp;
}
const issue = (ctx: Ctx, i: Issue) => ctx.issues.push(i);
const warning = (ctx: Ctx, i: Issue) => ctx.warnings.push(i);

/** RFC 6901: a pointer from its reference tokens. */
function jsonPointer(...tokens: (string | number)[]): string {
  return tokens.map((t) => "/" + String(t).replace(/~/g, "~0").replace(/\//g, "~1")).join("");
}
/** One compiler-style entry: `message` = `rule`, hint and docs URL from the one table. */
function entry(code: string, path: string, pointer: string, rule: string, token?: string): SequenceWarning {
  return { path, rule, code: code as `W${number}`, message: rule, pointer, ...ruleHelp(code, token) };
}
function entries(issues: Issue[]): SequenceWarning[] {
  return issues.sort((a, b) => a.order - b.order).map((i) => entry(i.code, i.path, i.pointer, i.rule, i.token));
}
/** W13 rule tail: when an accepted old form stops being accepted. */
const UNTIL = `; accepted until ${DEPRECATED_ACCEPTED_UNTIL}`;

const VARIABLE_RE = /\{\{([^{}]*)\}\}/g;
const SINGLE_BRACE_RE = /\{[A-Za-z_][A-Za-z0-9_.]*\}/g;

/** Own keys whose value is not `undefined` (JSON cannot carry `undefined`). */
function keysOf(o: Record<string, unknown>): string[] {
  return Object.keys(o).filter((k) => o[k] !== undefined);
}
function has(o: Record<string, unknown>, k: string): boolean {
  return Object.prototype.hasOwnProperty.call(o, k) && o[k] !== undefined;
}
/** An authored token as quoted in a rule or path: cut to 64 characters. */
function quote(token: string): string {
  return [...token].slice(0, MAX_QUOTED_TOKEN_CHARS).join("");
}
/** UTF-8 bytes of compact JSON; 0 when the value cannot serialise (other rules refuse it). */
function compactBytes(v: unknown): number {
  try {
    return new TextEncoder().encode(JSON.stringify(v)).length;
  } catch {
    return 0;
  }
}
/** True when `v` nests deeper than `max` levels; iterative, so depth cannot overflow the stack. */
function deeperThan(v: unknown, max: number): boolean {
  let level: unknown[] = [v];
  for (let depth = 1; level.length; depth++) {
    const next: unknown[] = [];
    for (const x of level) {
      if (typeof x === "object" && x !== null) for (const child of Object.values(x)) next.push(child);
    }
    if (!next.length) return false;
    if (depth > max) return true;
    level = next;
  }
  return false;
}
function durationMinutes(v: string): number {
  const m = /^([1-9][0-9]*)(m|h|d)$/.exec(v);
  if (!m) return 0;
  return Number(m[1]) * { m: 1, h: 60, d: 1440 }[m[2] as "m" | "h" | "d"];
}
type Bounds = { min: number; max: number; label: string; example: string };
function durationRule(bounds: Bounds): string {
  return `must be a duration between ${bounds.label}: a number then m, h or d, like 30d`;
}
const durationHint = (bounds: Bounds) => `${bounds.label}, for example ${bounds.example}`;
function durationOk(ctx: Ctx, v: unknown, bounds: { min: number; max: number }): boolean {
  if (typeof v !== "string" || !ctx.re.duration.test(v)) return false;
  const m = durationMinutes(v);
  return m >= bounds.min && m <= bounds.max;
}
function tagOk(ctx: Ctx, v: unknown): boolean {
  return typeof v === "string" && [...v].length <= ctx.v.maxTagChars && ctx.re.tag.test(v);
}

interface Variable {
  token: string;
  inner: string;
}
function variablesIn(text: string): Variable[] {
  return [...text.matchAll(VARIABLE_RE)].map((m) => ({ token: m[0], inner: m[1]!.trim() }));
}
function hasVariable(text: string): boolean {
  return variablesIn(text).length > 0;
}
function staticLength(text: string): number {
  return [...text.replace(VARIABLE_RE, "")].length;
}
/**
 * A short variable's long form (`first_name` to `contact.first_name`,
 * `my_first_name` to `account.first_name`, `opener` to `contact.extra.opener`).
 * A dotted name is returned as is; null for a short name with no long form
 * (capitals, or another `my_...`).
 */
function longVariable(ctx: Ctx, inner: string): string | null {
  if (inner.includes(".")) return inner;
  if (!ctx.re.short.test(inner)) return null;
  if ((MY_FIELDS as readonly string[]).includes(inner)) return `account.${inner.slice(3)}`;
  if (inner.startsWith("my_")) return null;
  if (ctx.v.standardFields.includes(inner)) return `contact.${inner}`;
  return `contact.extra.${inner}`;
}
/** A variable's inner text, short or long form, names a field that exists. */
function isKnownVariable(ctx: Ctx, inner: string): boolean {
  const long = longVariable(ctx, inner);
  if (long === null) return false;
  if (long.startsWith("contact.extra.")) return ctx.re.extraKey.test(long.slice("contact.extra.".length));
  if (long.startsWith("contact.")) return ctx.v.standardFields.includes(long.slice(8));
  if (long.startsWith("account.")) return (ACCOUNT_FIELDS as readonly string[]).includes(long.slice(8));
  return false;
}

/** Levenshtein distance, capped: returns `cap + 1` once it is certainly over. */
function distance(a: string, b: string, cap: number): number {
  if (Math.abs(a.length - b.length) > cap) return cap + 1;
  let prev = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    for (let j = 1; j <= b.length; j++) cur[j] = Math.min(prev[j]! + 1, cur[j - 1]! + 1, prev[j - 1]! + (a[i - 1] === b[j - 1] ? 0 : 1));
    prev = cur;
  }
  return prev[b.length]!;
}
/** W11: the standard or `my_` name a short custom-field key is a likely typo of (distance 2 or less), else null. */
function likelyTypoOf(ctx: Ctx, key: string): string | null {
  let best: string | null = null;
  let bestD = 3;
  for (const n of [...ctx.v.standardFields, ...MY_FIELDS]) {
    const d = distance(key, n, 2);
    if (d < bestD) [best, bestD] = [n, d];
  }
  return best;
}

/** A messaging text: R13 presence/type, R16-R18, R22, W9, W11, W13. */
function checkText(ctx: Ctx, order: number, path: string, pointer: string, parent: string, value: unknown, limit: number): string | null {
  if (typeof value !== "string" || value.trim() === "") {
    issue(ctx, { order, code: "R13", path, pointer: value === undefined ? parent : pointer, rule: "must be non-empty text" });
    return null;
  }
  const at = { order, path, pointer };
  const vars = variablesIn(value);
  if (vars.length > MAX_VARIABLE_REFS_PER_TEXT) {
    issue(ctx, { ...at, code: "R22", rule: `${vars.length} variables; the limit is ${MAX_VARIABLE_REFS_PER_TEXT} per text` });
  }
  for (const v of vars.length > MAX_VARIABLE_REFS_PER_TEXT ? [] : vars) {
    if (v.inner.includes("|")) {
      issue(ctx, { ...at, code: "R17", rule: "variable defaults are not supported; add a fallback" });
      continue;
    }
    if (v.inner.startsWith("motion.") && ctx.re.motion.test(v.inner.slice(7))) {
      const key = v.inner.slice(7);
      warning(ctx, {
        ...at,
        code: "W13",
        rule: `${quote(v.token)}: Motion variables were removed${UNTIL}; write the text in place or use a custom field`,
        token: `text in place or a custom field such as {{${key}}}`,
      });
      warning(ctx, { ...at, code: "W9", rule: `${quote(v.token)} is checked against settings.variables by the server only` });
      continue;
    }
    if (!v.inner.includes(".") && v.inner.startsWith("my_") && !(MY_FIELDS as readonly string[]).includes(v.inner)) {
      issue(ctx, { ...at, code: "R16", rule: `${quote(v.token)}: the my_ prefix is reserved for my_first_name, my_last_name and my_full_name` });
      continue;
    }
    if (!isKnownVariable(ctx, v.inner)) {
      issue(ctx, {
        ...at,
        code: "R16",
        rule: `unknown variable ${quote(v.token)}; use a field ({{first_name}}), your name ({{my_first_name}}), a custom field ({{opener}}), or contact.<field>, contact.extra.<key>, account.first_name, account.last_name, account.full_name`,
      });
      continue;
    }
    if (!v.inner.includes(".") && longVariable(ctx, v.inner)!.startsWith("contact.extra.")) {
      const near = likelyTypoOf(ctx, v.inner);
      if (near !== null) warning(ctx, { ...at, code: "W11", rule: `${quote(v.token)} is read as a custom field; did you mean ${near}?`, token: near });
    }
  }
  const rest = value.replace(VARIABLE_RE, " ");
  if (rest.includes("{{")) {
    issue(ctx, { ...at, code: "R16", rule: "unclosed variable; write a variable as {{contact.first_name}}" });
  } else {
    for (const m of rest.matchAll(SINGLE_BRACE_RE)) {
      issue(ctx, { ...at, code: "R18", rule: `${quote(m[0])} is not a variable; write {{contact.<field>}} or remove the braces` });
    }
  }
  const len = staticLength(value);
  if (len > limit) issue(ctx, { ...at, code: "R22", rule: `${len} characters; the limit is ${limit}, variables not counted` });
  return value;
}

/** R19 fallback text: present, non-empty, variable-free; R18 and R22 as any text. */
function checkFallbackText(ctx: Ctx, order: number, path: string, pointer: string, parent: string, value: unknown, limit: number, keyword?: string): void {
  if (keyword !== undefined && value === keyword) return;
  const at = { order, code: "R19", path, pointer };
  if (typeof value !== "string") {
    issue(ctx, { ...at, pointer: value === undefined ? parent : pointer, rule: keyword ? `must be text or "${keyword}"` : "must be text" });
    return;
  }
  if (value.trim() === "") {
    issue(ctx, { ...at, rule: "a fallback must not be empty" });
    return;
  }
  if (hasVariable(value)) {
    issue(ctx, { ...at, rule: "a fallback must not contain a variable" });
    return;
  }
  checkText(ctx, order, path, pointer, parent, value, limit);
}

interface StepInfo {
  index: number;
  prefix: string;
  /** JSON Pointer of the step: `/steps/<index>`. */
  ptr: string;
  /** Usable id (pattern-valid, not end, first occurrence) or null. */
  id: string | null;
  kind: string | null;
  raw: Record<string, unknown> | null;
}

/** Builds the validator over one schema's vocabulary (the internal seam tests use with a schema copy). */
export function createValidator(v: Vocabulary): (doc: unknown) => SequenceValidationResult {
  const re: Patterns = {
    id: new RegExp(v.idPattern),
    duration: new RegExp(v.durationPattern),
    emit: new RegExp(v.emitPattern),
    event: new RegExp(v.eventNamePattern),
    extraKey: new RegExp(v.extraKeyPattern),
    tag: new RegExp(v.tagPattern),
    motion: new RegExp(MOTION_KEY_PATTERN),
    short: new RegExp(SHORT_VARIABLE_PATTERN),
  };
  return (doc) => run(doc, { v, re, issues: [], warnings: [] });
}

/**
 * Validates a Sequence document offline: every error (rules R1-R24, in step
 * order, with `<step id>.<field>` paths) and every warning (W1, W5-W9,
 * W11-W13) the API reports, with the same `path`, `rule`, `code`, `pointer`,
 * `hint` and `docs_url`. Takes any value, never throws, never mutates it.
 * Nothing is sent anywhere.
 *
 * A deprecated form (3 to 5 variants, `until signal.<name>`,
 * `{{motion.<key>}}`) is accepted with warning W13 until 2027-01-19.
 * `{{motion.<key>}}` also yields W9 (only the server knows the Motion's
 * `settings.variables`). A document using vocabulary newer than this SDK is
 * refused here while the API accepts it: upgrade the SDK.
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
  // Built on first use, so importing the SDK never walks the schema.
  shipped ??= createValidator(vocabulary(SEQUENCE_SCHEMA_V1));
  return shipped(value);
}
let shipped: ((doc: unknown) => SequenceValidationResult) | undefined;

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
function run(doc: unknown, ctx: Ctx): SequenceValidationResult {
  const bad = firstUnstorable(doc);
  if (bad !== null) return { errors: [{ path: bad, rule: UNSTORABLE_RULE }], warnings: [] };
  const size = compactBytes(doc);
  if (size > MAX_SEQUENCE_BYTES) {
    return { errors: [entry("R2", "$", "", `the document is ${size} bytes; the limit is ${MAX_SEQUENCE_BYTES}, UTF-8 compact JSON`)], warnings: [] };
  }
  return rules(doc, ctx);
}

function rules(doc: unknown, ctx: Ctx): SequenceValidationResult {
  const { v } = ctx;
  const DOC = -1;
  if (!isObject(doc)) return { errors: [entry("R1", "$", "", "a Sequence document is a JSON object")], warnings: [] };

  // R1
  for (const k of keysOf(doc)) {
    if (k !== "$schema" && k !== "on_reply" && k !== "steps") {
      issue(ctx, { order: DOC, code: "R1", path: quote(k), pointer: jsonPointer(k), rule: "unknown key; a Sequence document holds only $schema, on_reply and steps" });
    }
  }
  if (has(doc, "$schema") && doc["$schema"] !== v.schemaUrl) {
    issue(ctx, { order: DOC, code: "R1", path: "$schema", pointer: "/$schema", rule: `must be ${v.schemaUrl}` });
  }
  // R2 (size: answered in `run`, alone)
  const rawSteps = doc["steps"];
  const stepsArr = Array.isArray(rawSteps) ? rawSteps : [];
  if (!Array.isArray(rawSteps) || rawSteps.length < v.minSteps) {
    issue(ctx, { order: DOC, code: "R2", path: "steps", pointer: has(doc, "steps") ? "/steps" : "", rule: `required: an array of ${v.minSteps} to ${v.maxSteps} steps` });
  } else if (rawSteps.length > v.maxSteps) {
    issue(ctx, { order: DOC, code: "R2", path: "steps", pointer: "/steps", rule: `${rawSteps.length} steps; the limit is ${v.maxSteps}` });
  }

  // R3 ids, R4 kinds
  const infos: StepInfo[] = [];
  const firstIndex = new Map<string, number>();
  // Over the step limit is R2 only: the graph pass is not run on an oversized document.
  let structural = !Array.isArray(rawSteps) || rawSteps.length < v.minSteps || rawSteps.length > v.maxSteps;
  stepsArr.forEach((raw, index) => {
    const ptr = jsonPointer("steps", index);
    const info: StepInfo = { index, prefix: `steps[${index}]`, ptr, id: null, kind: null, raw: null };
    infos.push(info);
    if (!isObject(raw)) {
      issue(ctx, { order: index, code: "R4", path: info.prefix, pointer: ptr, rule: "a step is a JSON object" });
      structural = true;
      return;
    }
    info.raw = raw;
    const id = raw["id"];
    const idAt = { order: index, code: "R3", path: `${info.prefix}.id`, pointer: `${ptr}/id` };
    if (!has(raw, "id")) {
      issue(ctx, { ...idAt, pointer: ptr, rule: `required: matching ${v.idPattern}` });
      structural = true;
    } else if (typeof id !== "string" || !ctx.re.id.test(id)) {
      issue(ctx, { ...idAt, rule: `must match ${v.idPattern}` });
      structural = true;
    } else if (id === END) {
      issue(ctx, { ...idAt, rule: '"end" is reserved' });
      structural = true;
    } else if (firstIndex.has(id)) {
      issue(ctx, { ...idAt, rule: `duplicate step id ${id}` });
      structural = true;
    } else {
      firstIndex.set(id, index);
      info.id = id;
      info.prefix = id;
    }
    const kinds = v.stepKinds.filter((k) => has(raw, k));
    if (kinds.length !== 1) {
      issue(ctx, {
        order: index,
        code: "R4",
        path: info.prefix,
        pointer: ptr,
        rule: kinds.length === 0 ? `a step needs exactly one of ${v.stepKinds.join(", ")}` : `a step has exactly one kind; found ${kinds.join(", ")}`,
      });
      structural = true;
      return;
    }
    info.kind = kinds[0]!;
  });

  // R11
  const onReply = doc["on_reply"];
  const targetOk = (t: unknown): boolean => t === END || (typeof t === "string" && firstIndex.has(t));
  const replyAt = { order: DOC, code: "R11", path: "on_reply", pointer: "/on_reply" };
  if (!has(doc, "on_reply")) {
    issue(ctx, { ...replyAt, pointer: "", rule: 'required: a step id or "end"' });
    structural = true;
  } else if (typeof onReply !== "string") {
    issue(ctx, { ...replyAt, rule: 'must be a step id or "end"' });
    structural = true;
  } else if (!targetOk(onReply)) {
    issue(ctx, { ...replyAt, rule: `unknown step ${quote(onReply)}` });
    structural = true;
  }

  // Variant ids are unique across all step and variant ids (R23).
  const usedIds = new Set(firstIndex.keys());

  for (const info of infos) {
    if (!info.raw || !info.kind) continue;
    const { raw, kind, index: order, prefix: p, ptr } = info;
    const keys = v.stepKeys[kind] ?? [];
    // R5
    for (const k of keysOf(raw)) {
      if (keys.includes(k)) continue;
      issue(ctx, {
        order,
        code: "R5",
        path: `${p}.${quote(k)}`,
        pointer: `${ptr}${jsonPointer(k)}`,
        rule: k === "by" ? "step-level by is not supported; use settings.assign" : `unknown key for a ${kind} step`,
      });
    }
    if (has(raw, "note")) {
      const n = raw["note"];
      if (typeof n !== "string" || [...n].length > v.maxNoteChars) {
        issue(ctx, { order, code: "R22", path: `${p}.note`, pointer: `${ptr}/note`, rule: `must be text of at most ${v.maxNoteChars} characters` });
      }
    }
    // R24: a step's custom event, on the kinds that take one (anywhere else R5 above).
    if (has(raw, "event") && keys.includes("event")) {
      const e = raw["event"];
      if (typeof e !== "string" || !ctx.re.event.test(e)) {
        issue(ctx, { order, code: "R24", path: `${p}.event`, pointer: `${ptr}/event`, rule: `must match ${v.eventNamePattern}, like invite_sent` });
      }
    }
    switch (kind) {
      case "do":
        checkDo(ctx, order, p, ptr, raw, usedIds);
        break;
      case "wait":
        if (!durationOk(ctx, raw["wait"], DURATION_BOUNDS.wait)) {
          issue(ctx, { order, code: "R12", path: `${p}.wait`, pointer: `${ptr}/wait`, rule: durationRule(DURATION_BOUNDS.wait), token: durationHint(DURATION_BOUNDS.wait) });
        }
        break;
      case "until":
        checkUntil(ctx, order, p, ptr, raw);
        break;
      case "if":
        checkPredicate(ctx, raw["if"], `${p}.if`, `${ptr}/if`, order);
        break;
      case "emit": {
        const e = raw["emit"];
        if (typeof e !== "string" || !ctx.re.emit.test(e)) {
          issue(ctx, { order, code: "R24", path: `${p}.emit`, pointer: `${ptr}/emit`, rule: `must match ${v.emitPattern}, like reply.received` });
        }
        break;
      }
      case "tag":
        if (!tagOk(ctx, raw["tag"])) issue(ctx, { order, code: "R24", path: `${p}.tag`, pointer: `${ptr}/tag`, rule: "a Tag name is 1 to 64 characters, without , or ;" });
        break;
    }
    // R6, R7
    if ((kind === "until" || kind === "if") && !has(raw, "then")) {
      issue(ctx, { order, code: "R7", path: `${p}.then`, pointer: ptr, rule: `required on an ${kind} step` });
      structural = true;
    }
    for (const f of ["then", "else", "next"] as const) {
      if (!has(raw, f) || !keys.includes(f)) continue;
      const t = raw[f];
      const at = { order, code: "R6", path: `${p}.${f}`, pointer: `${ptr}/${f}` };
      if (typeof t !== "string") {
        issue(ctx, { ...at, rule: 'must be a step id or "end"' });
        structural = true;
      } else if (!targetOk(t)) {
        issue(ctx, { ...at, rule: `unknown step ${quote(t)}` });
        structural = true;
      }
    }
  }

  if (!structural) graph(ctx, infos, firstIndex, onReply as string);

  return { errors: entries(ctx.issues), warnings: entries(ctx.warnings) };
}

function checkUntil(ctx: Ctx, order: number, p: string, ptr: string, raw: Record<string, unknown>): void {
  const ev = raw["until"];
  const at = { order, code: "R14", path: `${p}.until`, pointer: `${ptr}/until` };
  const custom = typeof ev === "string" ? /^(event|signal)\.(.*)$/s.exec(ev) : null;
  if (custom) {
    const [, ns, name] = custom;
    if (!ctx.re.event.test(name!)) {
      issue(ctx, { ...at, rule: `an event name must match ${ctx.v.eventNamePattern}` });
    } else if (ns === "signal") {
      // Deprecated spelling of the same awaited name.
      warning(ctx, { ...at, code: "W13", rule: `until signal.${quote(name!)} is now until event.${quote(name!)}${UNTIL}`, token: `event.${quote(name!)}` });
    }
  } else if (!(ctx.v.events as readonly unknown[]).includes(ev)) {
    issue(ctx, { ...at, rule: `unknown event; use ${ctx.v.events.join(", ")} or event.<name>` });
  }
  if (!has(raw, "timeout")) {
    issue(ctx, { order, code: "R14", path: `${p}.timeout`, pointer: ptr, rule: "required on an until step" });
  } else if (!durationOk(ctx, raw["timeout"], DURATION_BOUNDS.timeout)) {
    issue(ctx, {
      order,
      code: "R12",
      path: `${p}.timeout`,
      pointer: `${ptr}/timeout`,
      rule: durationRule(DURATION_BOUNDS.timeout),
      token: durationHint(DURATION_BOUNDS.timeout),
    });
  }
}

function limitOf(a: string, field: string): number {
  if (a === "message.send") return TEXT_LIMITS.message;
  if (a === "post.comment") return TEXT_LIMITS.comment;
  if (a === "invite.send") return TEXT_LIMITS.invite_note;
  return field === "subject" ? TEXT_LIMITS.inmail_subject : TEXT_LIMITS.inmail_text;
}

function checkDo(ctx: Ctx, order: number, p: string, ptr: string, raw: Record<string, unknown>, usedIds: Set<string>): void {
  const { v } = ctx;
  const a = raw["do"];
  if (typeof a !== "string" || !v.actions.includes(a)) {
    issue(ctx, { order, code: "R13", path: `${p}.do`, pointer: `${ptr}/do`, rule: `unknown action; use ${v.actions.join(", ")}` });
    return;
  }
  const params = v.actionParams[a] ?? [];
  const wp = `${ptr}/with`;
  /** Where a missing `with` key is pointed: `with` when it is an object, else the step. */
  const withParent = isObject(raw["with"]) ? wp : ptr;
  let w: Record<string, unknown> = {};
  if (has(raw, "with")) {
    if (!isObject(raw["with"])) {
      issue(ctx, { order, code: "R13", path: `${p}.with`, pointer: wp, rule: "must be an object" });
    } else {
      w = raw["with"];
      for (const k of keysOf(w)) {
        if (!params.includes(k)) {
          issue(ctx, {
            order,
            code: "R13",
            path: `${p}.with.${quote(k)}`,
            pointer: `${wp}${jsonPointer(k)}`,
            rule: `unknown parameter; ${a} takes ${params.length ? params.join(", ") : "no parameters"}`,
          });
        }
      }
    }
  }
  const messaging = v.messagingActions.includes(a);
  const hasVariants = has(raw, "variants");
  const vptr = `${ptr}/variants`;
  if (hasVariants && !messaging) issue(ctx, { order, code: "R23", path: `${p}.variants`, pointer: vptr, rule: "variants are allowed on messaging steps only" });

  if (has(w, "post") && params.includes("post") && w["post"] !== v.post) {
    issue(ctx, { order, code: "R13", path: `${p}.with.post`, pointer: `${wp}/post`, rule: `only "${v.post}" is supported` });
  }
  if (has(w, "newer_than") && params.includes("newer_than") && !durationOk(ctx, w["newer_than"], DURATION_BOUNDS.newer_than)) {
    issue(ctx, {
      order,
      code: "R12",
      path: `${p}.with.newer_than`,
      pointer: `${wp}/newer_than`,
      rule: durationRule(DURATION_BOUNDS.newer_than),
      token: durationHint(DURATION_BOUNDS.newer_than),
    });
  }
  if (has(w, "reaction") && params.includes("reaction") && !(v.reactions as readonly unknown[]).includes(w["reaction"])) {
    issue(ctx, { order, code: "R13", path: `${p}.with.reaction`, pointer: `${wp}/reaction`, rule: `must be one of ${v.reactions.join(", ")}` });
  }
  if (has(w, "withdraw_after") && params.includes("withdraw_after") && !durationOk(ctx, w["withdraw_after"], DURATION_BOUNDS.withdraw_after)) {
    issue(ctx, { order, code: "R21", path: `${p}.with.withdraw_after`, pointer: `${wp}/withdraw_after`, rule: durationRule(DURATION_BOUNDS.withdraw_after) });
  }
  if (!messaging) return;

  // Texts: with.<field> or variants (R23 exclusivity).
  const textKeys = a === "inmail.send" ? ["subject", "text"] : ["text"];
  /** The `with` keys `variants` replace; an invite `note:null` is "no note", not a text. */
  const withTextKeys = a === "invite.send" ? ["note"] : textKeys;
  const variants = hasVariants ? raw["variants"] : undefined;
  if (hasVariants && withTextKeys.some((k) => has(w, k) && w[k] !== null)) {
    issue(ctx, { order, code: "R23", path: `${p}.variants`, pointer: vptr, rule: `use either variants or with.${withTextKeys.join(" and with.")}, not both` });
  }

  /** Checked texts, each with the path and pointer it came from. */
  const texts: { path: string; pointer: string; value: string }[] = [];
  if (hasVariants) {
    const n = Array.isArray(variants) ? variants.length : null;
    if (n !== null && n > MAX_VARIANTS && n <= v.maxVariants) {
      // Deprecation window: more than A/B is still accepted, with W13.
      warning(ctx, { order, code: "W13", path: `${p}.variants`, pointer: vptr, rule: `${n} variants; A/B takes exactly ${MAX_VARIANTS}${UNTIL}`, token: `${MAX_VARIANTS} variants` });
    } else if (n === null || n < v.minVariants || n > MAX_VARIANTS) {
      issue(ctx, {
        order,
        code: "R23",
        path: `${p}.variants`,
        pointer: vptr,
        rule: `needs exactly ${MAX_VARIANTS} variants (A/B)${n === null ? "" : `; found ${n}`}`,
      });
    }
    (Array.isArray(variants) ? variants : []).forEach((variant, j) => {
      let vp = `${p}.variants[${j}]`;
      const vptrJ = `${vptr}/${j}`;
      if (!isObject(variant)) {
        issue(ctx, { order, code: "R23", path: vp, pointer: vptrJ, rule: "a variant is a JSON object" });
        return;
      }
      const vid = variant["id"];
      const idAt = { order, code: "R23", path: `${vp}.id`, pointer: has(variant, "id") ? `${vptrJ}/id` : vptrJ };
      if (typeof vid !== "string" || !ctx.re.id.test(vid)) {
        issue(ctx, { ...idAt, rule: `must match ${v.idPattern}` });
      } else if (vid === END) {
        issue(ctx, { ...idAt, rule: '"end" is reserved' });
      } else if (usedIds.has(vid)) {
        issue(ctx, { ...idAt, rule: `${vid} is already a step or variant id` });
      } else {
        usedIds.add(vid);
        vp = `${p}.variants.${vid}`;
      }
      for (const k of keysOf(variant)) {
        if (k !== "id" && !textKeys.includes(k)) {
          issue(ctx, { order, code: "R23", path: `${vp}.${quote(k)}`, pointer: `${vptrJ}${jsonPointer(k)}`, rule: `unknown key; a variant holds id and ${textKeys.join(" and ")}` });
        }
      }
      for (const field of textKeys) {
        const value = checkText(ctx, order, `${vp}.${field}`, `${vptrJ}/${field}`, vptrJ, variant[field], limitOf(a, field));
        if (value !== null) texts.push({ path: `${vp}.${field}`, pointer: `${vptrJ}/${field}`, value });
      }
    });
  } else {
    for (const field of withTextKeys) {
      const fp = `${wp}/${field}`;
      if (a === "invite.send") {
        if (has(w, "note") && w["note"] !== null) {
          const value = checkText(ctx, order, `${p}.with.note`, fp, withParent, w["note"], limitOf(a, field));
          if (value !== null) texts.push({ path: `${p}.with.note`, pointer: fp, value });
        }
      } else if (!has(w, field)) {
        issue(ctx, { order, code: "R13", path: `${p}.with.${field}`, pointer: withParent, rule: "required, or use variants" });
      } else {
        const value = checkText(ctx, order, `${p}.with.${field}`, fp, withParent, w[field], limitOf(a, field));
        if (value !== null) texts.push({ path: `${p}.with.${field}`, pointer: fp, value });
      }
    }
  }

  // R20, W7: short and long forms alike.
  if (a === "post.comment") {
    for (const t of texts) {
      const contactVars = variablesIn(t.value)
        .filter((x) => isKnownVariable(ctx, x.inner))
        .map((x) => longVariable(ctx, x.inner)!)
        .filter((l) => l.startsWith("contact."));
      if (contactVars.length === 0) {
        issue(ctx, { order, code: "R20", path: t.path, pointer: t.pointer, rule: "a comment must use a contact variable, such as {{contact.extra.comment}}" });
      } else if (contactVars.every((l) => (NAME_FIELDS as readonly string[]).includes(l.slice(8)))) {
        warning(ctx, {
          order,
          code: "W7",
          path: t.path,
          pointer: t.pointer,
          rule: "the comment's only per-Contact variables are name fields; write it per Contact, for example in contact.extra",
        });
      }
    }
  }

  // R19
  const usesVariable = texts.some((t) => hasVariable(t.value));
  if (a === "invite.send") {
    const fp = `${p}.with.note_fallback`;
    if (has(w, "note_fallback")) checkFallbackText(ctx, order, fp, `${wp}/note_fallback`, withParent, w["note_fallback"], TEXT_LIMITS.invite_note, "drop");
    else if (usesVariable) issue(ctx, { order, code: "R19", path: fp, pointer: withParent, rule: 'required because the note uses a variable: text, or "drop"' });
  } else if (a === "inmail.send") {
    const fp = `${p}.with.fallback`;
    const fptr = `${wp}/fallback`;
    if (has(w, "fallback")) {
      const f = w["fallback"];
      if (!isObject(f)) {
        issue(ctx, { order, code: "R19", path: fp, pointer: fptr, rule: "must be an object with subject and text" });
      } else {
        for (const k of keysOf(f)) {
          if (k !== "subject" && k !== "text") {
            issue(ctx, { order, code: "R19", path: `${fp}.${quote(k)}`, pointer: `${fptr}${jsonPointer(k)}`, rule: "unknown key; a fallback holds subject and text" });
          }
        }
        checkFallbackText(ctx, order, `${fp}.subject`, `${fptr}/subject`, fptr, f["subject"], TEXT_LIMITS.inmail_subject);
        checkFallbackText(ctx, order, `${fp}.text`, `${fptr}/text`, fptr, f["text"], TEXT_LIMITS.inmail_text);
      }
    } else if (usesVariable) {
      issue(ctx, { order, code: "R19", path: fp, pointer: withParent, rule: "required because the subject or text uses a variable: an object with subject and text" });
    }
  } else {
    const fp = `${p}.with.fallback`;
    const comment = a === "post.comment";
    if (has(w, "fallback")) checkFallbackText(ctx, order, fp, `${wp}/fallback`, withParent, w["fallback"], limitOf(a, "text"), comment ? "skip" : undefined);
    else if (comment) issue(ctx, { order, code: "R19", path: fp, pointer: withParent, rule: 'required on a comment: text, or "skip"' });
    else if (usesVariable) issue(ctx, { order, code: "R19", path: fp, pointer: withParent, rule: "required because the text uses a variable" });
  }
}

// R15
function checkPredicate(ctx: Ctx, pred: unknown, path: string, pointer: string, order: number, nested = false): void {
  const { v } = ctx;
  const push = (rule: string) => issue(ctx, { order, code: "R15", path, pointer, rule });
  if (!nested && deeperThan(pred, MAX_PREDICATE_DEPTH)) {
    push(`a predicate nests at most ${MAX_PREDICATE_DEPTH} levels`);
    return;
  }
  if (!isObject(pred) || keysOf(pred).length !== 1) {
    push("a predicate is an object with exactly one key");
    return;
  }
  const key = keysOf(pred)[0]!;
  const val = pred[key];
  if (key === "not") {
    if (nested) push("not cannot wrap another not");
    else checkPredicate(ctx, val, `${path}.not`, `${pointer}/not`, order, true);
    return;
  }
  if (key.startsWith("account.")) {
    if (key !== "account.premium") push(`unknown predicate ${quote(key)}`);
    else if (typeof val !== "boolean") push("account.premium takes true or false");
    return;
  }
  // `message.seen` answers from the Enrollment's own records: `if` steps only.
  if (key.startsWith("message.")) {
    if (key !== "message.seen") push(`unknown predicate ${quote(key)}`);
    else if (typeof val !== "boolean") push("message.seen takes true or false");
    return;
  }
  if (v.booleanPredicates.includes(key)) {
    if (typeof val !== "boolean") push(`${key} takes true or false`);
    return;
  }
  switch (key) {
    case "contact.degree": {
      const deg = (n: unknown) => v.degrees.includes(n);
      const ok =
        isObject(val) &&
        keysOf(val).length === 1 &&
        ((has(val, "eq") && deg(val["eq"])) || (has(val, "in") && Array.isArray(val["in"]) && val["in"].length > 0 && val["in"].every(deg)));
      if (!ok) push('contact.degree takes {"eq": n} or {"in": [n, ...]}, n being 1, 2 or 3');
      return;
    }
    case "contact.connections_gte":
      if (!Number.isInteger(val) || (val as number) < v.connectionsMin) push("contact.connections_gte takes an integer of 0 or more");
      return;
    case "contact.posted_within":
      if (typeof val !== "string" || !ctx.re.duration.test(val)) push("contact.posted_within takes a duration like 14d");
      return;
    case "contact.tag":
      if (!tagOk(ctx, val)) push("contact.tag takes a Tag name of 1 to 64 characters, without , or ;");
      return;
  }
  const field = key.startsWith("contact.extra.")
    ? ctx.re.extraKey.test(key.slice(14))
    : key.startsWith("contact.") && v.standardFields.includes(key.slice(8));
  if (!field) {
    push(`unknown predicate ${quote(key)}`);
    return;
  }
  const scalar = (x: unknown) => typeof x === "string" || typeof x === "number" || typeof x === "boolean";
  const op = isObject(val) && keysOf(val).length === 1 ? keysOf(val)[0]! : null;
  const operand = op === null ? undefined : (val as Record<string, unknown>)[op];
  const ok =
    op !== null &&
    v.fieldOperators.includes(op) &&
    (op === "eq" || op === "neq"
      ? scalar(operand)
      : op === "in"
        ? Array.isArray(operand) && operand.length > 0 && operand.every(scalar)
        : op === "contains"
          ? typeof operand === "string"
          : typeof operand === "boolean");
  if (!ok) {
    push(`${quote(key)} takes exactly one of {"eq": v}, {"neq": v}, {"in": [v, ...]}, {"contains": "text"}, {"exists": true or false}`);
  }
}

// Graph: R8 cycles, R9 unreachable, R10 explicit endings; W1, W5, W6, W8, W12.

interface Edge {
  field: "next" | "then" | "else";
  to: number | "end" | "off";
  fallThrough: boolean;
}

function graph(ctx: Ctx, infos: StepInfo[], ids: Map<string, number>, onReply: string): void {
  const n = infos.length;
  const resolve = (t: string): number | "end" => (t === END ? END : ids.get(t)!);
  const ft = (i: number): number | "off" => (i + 1 < n ? i + 1 : "off");
  const edges: Edge[][] = infos.map((info, i) => {
    const raw = info.raw!;
    const explicit = (f: Edge["field"]): Edge => ({ field: f, to: resolve(raw[f] as string), fallThrough: false });
    const implicit = (f: Edge["field"]): Edge => ({ field: f, to: ft(i), fallThrough: true });
    const pick = (f: Edge["field"]) => (has(raw, f) ? explicit(f) : implicit(f));
    switch (info.kind!) {
      case "until":
      case "if":
        return [explicit("then"), pick("else")];
      case "do":
        return has(raw, "else") ? [pick("next"), explicit("else")] : [pick("next")];
      default:
        return [pick("next")];
    }
  });
  /** An exit's pointer: the key when written, else the step (a fall-through has no key). */
  const exitPtr = (i: number, e: Edge) => (e.fallThrough ? infos[i]!.ptr : `${infos[i]!.ptr}/${e.field}`);

  const graphIssues: Issue[] = [];
  // R10
  infos.forEach((info, i) => {
    for (const e of edges[i]!) {
      if (e.to === "off") {
        graphIssues.push({
          order: i,
          code: "R10",
          path: `${info.prefix}.${e.field}`,
          pointer: exitPtr(i, e),
          rule: `the last step must end explicitly; set ${e.field} to a step id or "end"`,
        });
      }
    }
  });
  // R9
  const roots = [0, ...(onReply === END ? [] : [ids.get(onReply)!])];
  const seen = new Set<number>();
  const queue = [...roots];
  while (queue.length) {
    const i = queue.shift()!;
    if (seen.has(i)) continue;
    seen.add(i);
    for (const e of edges[i]!) if (typeof e.to === "number") queue.push(e.to);
  }
  infos.forEach((info, i) => {
    if (!seen.has(i)) graphIssues.push({ order: i, code: "R9", path: info.prefix, pointer: info.ptr, rule: "unreachable: no path leads here from the first step or from on_reply" });
  });
  // R8
  const state = new Array<0 | 1 | 2>(n).fill(0);
  const stack: number[] = [];
  const dfs = (i: number): void => {
    state[i] = 1;
    stack.push(i);
    for (const e of edges[i]!) {
      if (typeof e.to !== "number") continue;
      if (state[e.to] === 1) {
        const rule = `cycle: ${[...stack.slice(stack.indexOf(e.to)), e.to].map((k) => infos[k]!.prefix).join(" -> ")}`;
        if (!graphIssues.some((x) => x.rule === rule)) graphIssues.push({ order: i, code: "R8", path: `${infos[i]!.prefix}.${e.field}`, pointer: exitPtr(i, e), rule });
      } else if (state[e.to] === 0) {
        dfs(e.to);
      }
    }
    stack.pop();
    state[i] = 2;
  };
  for (const r of roots) if (state[r] === 0) dfs(r);

  ctx.issues.push(...graphIssues);
  if (graphIssues.length) return;

  // Warnings on a well-formed acyclic graph. Predecessor lists, edge-aware.
  const preds: { from: number; edge: Edge }[][] = infos.map(() => []);
  edges.forEach((es, i) => es.forEach((e) => typeof e.to === "number" && preds[e.to]!.push({ from: i, edge: e })));
  const action = (i: number) => infos[i]!.raw!["do"];

  // W1: reached by fall-through and by a jump from another step.
  infos.forEach((info, i) => {
    const fallFrom = preds[i]!.filter((x) => x.edge.fallThrough).map((x) => x.from);
    const jumpFrom = preds[i]!.filter((x) => !x.edge.fallThrough && x.from !== i - 1).map((x) => x.from);
    if (fallFrom.length && jumpFrom.length) {
      const names = (xs: number[]) => [...new Set(xs)].map((k) => infos[k]!.prefix).join(", ");
      warning(ctx, {
        order: i,
        code: "W1",
        path: info.prefix,
        pointer: info.ptr,
        rule: `merge point: reached by fall-through from ${names(fallFrom)} and by a jump from ${names(jumpFrom)}`,
      });
    }
  });

  // W5/W6/W12: dataflow in topological order. An invitation (a message) "happened"
  // on a path through an invite.send (message.send, inmail.send) step's success exit.
  const order = topo(n, edges, roots);
  const afterInvite = new Array<boolean>(n).fill(false);
  const withoutInvite = new Array<boolean>(n).fill(false);
  const withoutMessage = new Array<boolean>(n).fill(false);
  // Seeds: the first step, and on_reply only when nothing else leads there.
  const fromFirst = new Set<number>(topo(n, edges, [0]));
  for (const r of roots) if (r === 0 || !fromFirst.has(r)) withoutInvite[r] = withoutMessage[r] = true;
  for (const i of order) {
    for (const { from, edge } of preds[i]!) {
      const invited = action(from) === "invite.send" && edge.field === "next";
      if (afterInvite[from] || invited) afterInvite[i] = true;
      if (withoutInvite[from] && !invited) withoutInvite[i] = true;
      const messaged = (action(from) === "message.send" || action(from) === "inmail.send") && edge.field === "next";
      if (withoutMessage[from] && !messaged) withoutMessage[i] = true;
    }
  }
  infos.forEach((info, i) => {
    if (!seen.has(i)) return;
    if (action(i) === "profile.follow" && afterInvite[i]) {
      warning(ctx, { order: i, code: "W5", path: `${info.prefix}.do`, pointer: `${info.ptr}/do`, rule: "profile.follow after invite.send on the same path; an invitation already follows" });
    }
    const cond = info.raw!["if"];
    const seenPred = isObject(cond) && (has(cond, "message.seen") || (isObject(cond["not"]) && has(cond["not"], "message.seen")));
    if (seenPred && withoutMessage[i]) {
      warning(ctx, {
        order: i,
        code: "W12",
        path: `${info.prefix}.if`,
        pointer: `${info.ptr}/if`,
        rule: "if message.seen on a path with no message.send or inmail.send before it; it is always false there",
      });
    }
    if (info.raw!["until"] === "invite.accepted" && withoutInvite[i]) {
      warning(ctx, { order: i, code: "W6", path: `${info.prefix}.until`, pointer: `${info.ptr}/until`, rule: "until invite.accepted on a path with no invite.send before it" });
    }
  });

  // W8: the first message.send after each `until invite.accepted` `then`.
  const flagged = new Set<number>();
  infos.forEach((info, i) => {
    if (info.raw!["until"] !== "invite.accepted") return;
    const start = edges[i]![0]!.to;
    const visited = new Set<number>();
    const q = typeof start === "number" ? [start] : [];
    while (q.length) {
      const k = q.shift()!;
      if (visited.has(k)) continue;
      visited.add(k);
      if (action(k) === "message.send") {
        if (!flagged.has(k)) {
          flagged.add(k);
          const link = messageTexts(infos[k]!).find((t) => t.value.includes("http"));
          if (link) warning(ctx, { order: k, code: "W8", path: link.path, pointer: link.pointer, rule: "a link in the first message after the invitation is accepted" });
        }
        continue;
      }
      for (const e of edges[k]!) if (typeof e.to === "number") q.push(e.to);
    }
  });
}

function messageTexts(info: StepInfo): { path: string; pointer: string; value: string }[] {
  const raw = info.raw!;
  const w = isObject(raw["with"]) ? raw["with"] : {};
  const out: { path: string; pointer: string; value: string }[] = [];
  if (Array.isArray(raw["variants"])) {
    raw["variants"].forEach((variant, j) => {
      if (isObject(variant) && typeof variant["text"] === "string") {
        const id = typeof variant["id"] === "string" ? `variants.${variant["id"]}` : `variants[${j}]`;
        out.push({ path: `${info.prefix}.${id}.text`, pointer: `${info.ptr}/variants/${j}/text`, value: variant["text"] });
      }
    });
  }
  if (typeof w["text"] === "string") out.push({ path: `${info.prefix}.with.text`, pointer: `${info.ptr}/with/text`, value: w["text"] });
  if (typeof w["fallback"] === "string") out.push({ path: `${info.prefix}.with.fallback`, pointer: `${info.ptr}/with/fallback`, value: w["fallback"] });
  return out;
}

function topo(n: number, edges: Edge[][], roots: number[]): number[] {
  const out: number[] = [];
  const done = new Array<boolean>(n).fill(false);
  const visit = (i: number) => {
    if (done[i]) return;
    done[i] = true;
    for (const e of edges[i]!) if (typeof e.to === "number") visit(e.to);
    out.push(i);
  };
  roots.forEach(visit);
  return out.reverse();
}
