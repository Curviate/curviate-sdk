/**
 * Offline Sequence validator: rules R1-R24 and warnings W1, W5-W9, the same
 * verdict the API and `curviate motion lint` give.
 * Pure: no I/O, never throws, never mutates its input.
 *
 * A second implementation of the server's rules (the server cannot import the
 * SDK). The two are held together by the shared corpus
 * (`test/fixtures/sequence-corpus/`, vendored byte for byte from the server):
 * every entry's `errors` and `warnings` must come out exactly. Rule texts are
 * the contract; change one in the corpus first.
 *
 * `{{motion.<key>}}` is never an error here and always W9: only the server
 * knows the Motion's `settings.variables`. W2-W4 and W10 need the Motion's
 * sending Accounts or settings and are server-only.
 */
import {
  ACCOUNT_FIELDS,
  DURATION_BOUNDS,
  END,
  MAX_PREDICATE_DEPTH,
  MAX_QUOTED_TOKEN_CHARS,
  MAX_SEQUENCE_BYTES,
  MAX_VARIABLE_REFS_PER_TEXT,
  MOTION_KEY_PATTERN,
  NAME_FIELDS,
  TEXT_LIMITS,
} from "./constants.js";
import type { CurviateErrorDetail } from "../errors.js";
import { SEQUENCE_SCHEMA_V1 } from "./schema.js";
import { isObject, vocabulary, type Vocabulary } from "./vocab.js";

/** One reason a Sequence document is refused: `path` into the document, `rule` saying what to change. */
export type SequenceError = CurviateErrorDetail;
/** A non-blocking finding, `code` `W1` or `W5` to `W9`. */
export interface SequenceWarning {
  code: `W${number}`;
  path: string;
  rule: string;
}
/** What {@link validateSequence} returns: every error, in step order, and every warning. */
export interface SequenceValidationResult {
  errors: SequenceError[];
  warnings: SequenceWarning[];
}

interface Issue {
  order: number;
  path: string;
  rule: string;
}
interface Ctx {
  v: Vocabulary;
  re: Patterns;
  issues: Issue[];
  warnings: (SequenceWarning & { order: number })[];
}
interface Patterns {
  id: RegExp;
  duration: RegExp;
  emit: RegExp;
  signal: RegExp;
  extraKey: RegExp;
  tag: RegExp;
  motion: RegExp;
}

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
function durationRule(bounds: { label: string }): string {
  return `must be a duration between ${bounds.label}: a number then m, h or d, like 30d`;
}
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
function isKnownVariable(ctx: Ctx, inner: string): boolean {
  if (inner.startsWith("contact.extra.")) return ctx.re.extraKey.test(inner.slice("contact.extra.".length));
  if (inner.startsWith("contact.")) return ctx.v.standardFields.includes(inner.slice(8));
  if (inner.startsWith("account.")) return (ACCOUNT_FIELDS as readonly string[]).includes(inner.slice(8));
  return false;
}

/** A messaging text: R13 presence/type, R16-R18, R22. */
function checkText(ctx: Ctx, order: number, path: string, value: unknown, limit: number): string | null {
  if (typeof value !== "string" || value.trim() === "") {
    ctx.issues.push({ order, path, rule: "must be non-empty text" });
    return null;
  }
  const vars = variablesIn(value);
  if (vars.length > MAX_VARIABLE_REFS_PER_TEXT) {
    ctx.issues.push({ order, path, rule: `${vars.length} variables; the limit is ${MAX_VARIABLE_REFS_PER_TEXT} per text` });
  }
  for (const v of vars.length > MAX_VARIABLE_REFS_PER_TEXT ? [] : vars) {
    if (v.inner.includes("|")) {
      ctx.issues.push({ order, path, rule: "variable defaults are not supported; add a fallback" });
      continue;
    }
    if (v.inner.startsWith("motion.") && ctx.re.motion.test(v.inner.slice(7))) {
      ctx.warnings.push({ order, code: "W9", path, rule: `${quote(v.token)} is checked against settings.variables by the server only` });
      continue;
    }
    if (!isKnownVariable(ctx, v.inner)) {
      ctx.issues.push({
        order,
        path,
        rule: `unknown variable ${quote(v.token)}; use contact.<field>, contact.extra.<key>, account.first_name, account.last_name, account.full_name or motion.<key>`,
      });
    }
  }
  const rest = value.replace(VARIABLE_RE, " ");
  if (rest.includes("{{")) {
    ctx.issues.push({ order, path, rule: "unclosed variable; write a variable as {{contact.first_name}}" });
  } else {
    for (const m of rest.matchAll(SINGLE_BRACE_RE)) {
      ctx.issues.push({ order, path, rule: `${quote(m[0])} is not a variable; write {{contact.<field>}} or remove the braces` });
    }
  }
  const len = staticLength(value);
  if (len > limit) ctx.issues.push({ order, path, rule: `${len} characters; the limit is ${limit}, variables not counted` });
  return value;
}

/** R19 fallback text: present, non-empty, variable-free; R18 and R22 as any text. */
function checkFallbackText(ctx: Ctx, order: number, path: string, value: unknown, limit: number, keyword?: string): void {
  if (keyword !== undefined && value === keyword) return;
  if (typeof value !== "string") {
    ctx.issues.push({ order, path, rule: keyword ? `must be text or "${keyword}"` : "must be text" });
    return;
  }
  if (value.trim() === "") {
    ctx.issues.push({ order, path, rule: "a fallback must not be empty" });
    return;
  }
  if (hasVariable(value)) {
    ctx.issues.push({ order, path, rule: "a fallback must not contain a variable" });
    return;
  }
  checkText(ctx, order, path, value, limit);
}

interface StepInfo {
  index: number;
  prefix: string;
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
    signal: new RegExp(v.signalNamePattern),
    extraKey: new RegExp(v.extraKeyPattern),
    tag: new RegExp(v.tagPattern),
    motion: new RegExp(MOTION_KEY_PATTERN),
  };
  return (doc) => run(doc, { v, re, issues: [], warnings: [] });
}

/**
 * Validates a Sequence document offline: every error (rules R1-R24, in step
 * order, with `<step id>.<field>` paths) and every warning (W1, W5-W9) the API
 * reports, with the same `path` and `rule` text. Takes any value, never
 * throws, never mutates it. Nothing is sent anywhere.
 *
 * `{{motion.<key>}}` yields warning W9 (only the server knows the Motion's
 * `settings.variables`). A document using vocabulary newer than this SDK is
 * refused here while the API accepts it: upgrade the SDK.
 *
 * @example
 * import { validateSequence } from "@curviate/sdk";
 *
 * const { errors, warnings } = validateSequence(JSON.parse(text));
 * for (const e of errors) console.error(`${e.path}: ${e.rule}`);
 */
export function validateSequence(value: unknown): SequenceValidationResult {
  // Built on first use, so importing the SDK never walks the schema.
  shipped ??= createValidator(vocabulary(SEQUENCE_SCHEMA_V1));
  return shipped(value);
}
let shipped: ((doc: unknown) => SequenceValidationResult) | undefined;

function run(doc: unknown, ctx: Ctx): SequenceValidationResult {
  const { v } = ctx;
  const DOC = -1;
  if (!isObject(doc)) return { errors: [{ path: "$", rule: "a Sequence document is a JSON object" }], warnings: [] };

  // R1
  for (const k of keysOf(doc)) {
    if (k !== "$schema" && k !== "on_reply" && k !== "steps") {
      ctx.issues.push({ order: DOC, path: quote(k), rule: "unknown key; a Sequence document holds only $schema, on_reply and steps" });
    }
  }
  if (has(doc, "$schema") && doc["$schema"] !== v.schemaUrl) {
    ctx.issues.push({ order: DOC, path: "$schema", rule: `must be ${v.schemaUrl}` });
  }
  // R2
  const bytes = compactBytes(doc);
  if (bytes > MAX_SEQUENCE_BYTES) {
    ctx.issues.push({ order: DOC, path: "$", rule: `the document is ${bytes} bytes; the limit is ${MAX_SEQUENCE_BYTES}, UTF-8 compact JSON` });
  }
  const rawSteps = doc["steps"];
  const stepsArr = Array.isArray(rawSteps) ? rawSteps : [];
  if (!Array.isArray(rawSteps) || rawSteps.length < v.minSteps) {
    ctx.issues.push({ order: DOC, path: "steps", rule: `required: an array of ${v.minSteps} to ${v.maxSteps} steps` });
  } else if (rawSteps.length > v.maxSteps) {
    ctx.issues.push({ order: DOC, path: "steps", rule: `${rawSteps.length} steps; the limit is ${v.maxSteps}` });
  }

  // R3 ids, R4 kinds
  const infos: StepInfo[] = [];
  const firstIndex = new Map<string, number>();
  // Over the step limit is R2 only: the graph pass is not run on an oversized document.
  let structural = !Array.isArray(rawSteps) || rawSteps.length < v.minSteps || rawSteps.length > v.maxSteps;
  stepsArr.forEach((raw, index) => {
    const info: StepInfo = { index, prefix: `steps[${index}]`, id: null, kind: null, raw: null };
    infos.push(info);
    if (!isObject(raw)) {
      ctx.issues.push({ order: index, path: info.prefix, rule: "a step is a JSON object" });
      structural = true;
      return;
    }
    info.raw = raw;
    const id = raw["id"];
    if (!has(raw, "id")) {
      ctx.issues.push({ order: index, path: `${info.prefix}.id`, rule: `required: matching ${v.idPattern}` });
      structural = true;
    } else if (typeof id !== "string" || !ctx.re.id.test(id)) {
      ctx.issues.push({ order: index, path: `${info.prefix}.id`, rule: `must match ${v.idPattern}` });
      structural = true;
    } else if (id === END) {
      ctx.issues.push({ order: index, path: `${info.prefix}.id`, rule: '"end" is reserved' });
      structural = true;
    } else if (firstIndex.has(id)) {
      ctx.issues.push({ order: index, path: `${info.prefix}.id`, rule: `duplicate step id ${id}` });
      structural = true;
    } else {
      firstIndex.set(id, index);
      info.id = id;
      info.prefix = id;
    }
    const kinds = v.stepKinds.filter((k) => has(raw, k));
    if (kinds.length !== 1) {
      ctx.issues.push({
        order: index,
        path: info.prefix,
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
  if (!has(doc, "on_reply")) {
    ctx.issues.push({ order: DOC, path: "on_reply", rule: 'required: a step id or "end"' });
    structural = true;
  } else if (typeof onReply !== "string") {
    ctx.issues.push({ order: DOC, path: "on_reply", rule: 'must be a step id or "end"' });
    structural = true;
  } else if (!targetOk(onReply)) {
    ctx.issues.push({ order: DOC, path: "on_reply", rule: `unknown step ${quote(onReply)}` });
    structural = true;
  }

  // Variant ids are unique across all step and variant ids (R23).
  const usedIds = new Set(firstIndex.keys());

  for (const info of infos) {
    if (!info.raw || !info.kind) continue;
    const { raw, kind, index: order, prefix: p } = info;
    const keys = v.stepKeys[kind] ?? [];
    // R5
    for (const k of keysOf(raw)) {
      if (keys.includes(k)) continue;
      ctx.issues.push({
        order,
        path: `${p}.${quote(k)}`,
        rule: k === "by" ? "step-level by is not supported; use settings.assign" : `unknown key for a ${kind} step`,
      });
    }
    if (has(raw, "note")) {
      const n = raw["note"];
      if (typeof n !== "string" || [...n].length > v.maxNoteChars) {
        ctx.issues.push({ order, path: `${p}.note`, rule: `must be text of at most ${v.maxNoteChars} characters` });
      }
    }
    switch (kind) {
      case "do":
        checkDo(ctx, order, p, raw, usedIds);
        break;
      case "wait":
        if (!durationOk(ctx, raw["wait"], DURATION_BOUNDS.wait)) ctx.issues.push({ order, path: `${p}.wait`, rule: durationRule(DURATION_BOUNDS.wait) });
        break;
      case "until":
        checkUntil(ctx, order, p, raw);
        break;
      case "if":
        checkPredicate(ctx, raw["if"], `${p}.if`, order);
        break;
      case "emit": {
        const e = raw["emit"];
        if (typeof e !== "string" || !ctx.re.emit.test(e)) {
          ctx.issues.push({ order, path: `${p}.emit`, rule: `must match ${v.emitPattern}, like reply.received` });
        }
        break;
      }
      case "tag":
        if (!tagOk(ctx, raw["tag"])) ctx.issues.push({ order, path: `${p}.tag`, rule: "a Tag name is 1 to 64 characters, without , or ;" });
        break;
    }
    // R6, R7
    if ((kind === "until" || kind === "if") && !has(raw, "then")) {
      ctx.issues.push({ order, path: `${p}.then`, rule: `required on an ${kind} step` });
      structural = true;
    }
    for (const f of ["then", "else", "next"] as const) {
      if (!has(raw, f) || !keys.includes(f)) continue;
      const t = raw[f];
      if (typeof t !== "string") {
        ctx.issues.push({ order, path: `${p}.${f}`, rule: 'must be a step id or "end"' });
        structural = true;
      } else if (!targetOk(t)) {
        ctx.issues.push({ order, path: `${p}.${f}`, rule: `unknown step ${quote(t)}` });
        structural = true;
      }
    }
  }

  if (!structural) graph(ctx, infos, firstIndex, onReply as string);

  const byOrder = <T extends { order: number }>(a: T, b: T) => a.order - b.order;
  return {
    errors: ctx.issues.sort(byOrder).map(({ path, rule }) => ({ path, rule })),
    warnings: ctx.warnings.sort(byOrder).map(({ code, path, rule }) => ({ code, path, rule })),
  };
}

function checkUntil(ctx: Ctx, order: number, p: string, raw: Record<string, unknown>): void {
  const ev = raw["until"];
  if (typeof ev === "string" && ev.startsWith("signal.")) {
    if (!ctx.re.signal.test(ev.slice(7))) ctx.issues.push({ order, path: `${p}.until`, rule: `a signal name must match ${ctx.v.signalNamePattern}` });
  } else if (!(ctx.v.events as readonly unknown[]).includes(ev)) {
    ctx.issues.push({ order, path: `${p}.until`, rule: `unknown event; use ${ctx.v.events.join(", ")} or signal.<name>` });
  }
  if (!has(raw, "timeout")) {
    ctx.issues.push({ order, path: `${p}.timeout`, rule: "required on an until step" });
  } else if (!durationOk(ctx, raw["timeout"], DURATION_BOUNDS.timeout)) {
    ctx.issues.push({ order, path: `${p}.timeout`, rule: durationRule(DURATION_BOUNDS.timeout) });
  }
}

function limitOf(a: string, field: string): number {
  if (a === "message.send") return TEXT_LIMITS.message;
  if (a === "post.comment") return TEXT_LIMITS.comment;
  if (a === "invite.send") return TEXT_LIMITS.invite_note;
  return field === "subject" ? TEXT_LIMITS.inmail_subject : TEXT_LIMITS.inmail_text;
}

function checkDo(ctx: Ctx, order: number, p: string, raw: Record<string, unknown>, usedIds: Set<string>): void {
  const { v } = ctx;
  const a = raw["do"];
  if (typeof a !== "string" || !v.actions.includes(a)) {
    ctx.issues.push({ order, path: `${p}.do`, rule: `unknown action; use ${v.actions.join(", ")}` });
    return;
  }
  const params = v.actionParams[a] ?? [];
  let w: Record<string, unknown> = {};
  if (has(raw, "with")) {
    if (!isObject(raw["with"])) {
      ctx.issues.push({ order, path: `${p}.with`, rule: "must be an object" });
    } else {
      w = raw["with"];
      for (const k of keysOf(w)) {
        if (!params.includes(k)) {
          ctx.issues.push({ order, path: `${p}.with.${quote(k)}`, rule: `unknown parameter; ${a} takes ${params.length ? params.join(", ") : "no parameters"}` });
        }
      }
    }
  }
  const messaging = v.messagingActions.includes(a);
  const hasVariants = has(raw, "variants");
  if (hasVariants && !messaging) ctx.issues.push({ order, path: `${p}.variants`, rule: "variants are allowed on messaging steps only" });

  if (has(w, "post") && params.includes("post") && w["post"] !== v.post) {
    ctx.issues.push({ order, path: `${p}.with.post`, rule: `only "${v.post}" is supported` });
  }
  if (has(w, "newer_than") && params.includes("newer_than") && !durationOk(ctx, w["newer_than"], DURATION_BOUNDS.newer_than)) {
    ctx.issues.push({ order, path: `${p}.with.newer_than`, rule: durationRule(DURATION_BOUNDS.newer_than) });
  }
  if (has(w, "reaction") && params.includes("reaction") && !(v.reactions as readonly unknown[]).includes(w["reaction"])) {
    ctx.issues.push({ order, path: `${p}.with.reaction`, rule: `must be one of ${v.reactions.join(", ")}` });
  }
  if (has(w, "withdraw_after") && params.includes("withdraw_after") && !durationOk(ctx, w["withdraw_after"], DURATION_BOUNDS.withdraw_after)) {
    ctx.issues.push({ order, path: `${p}.with.withdraw_after`, rule: durationRule(DURATION_BOUNDS.withdraw_after) });
  }
  if (!messaging) return;

  // Texts: with.<field> or variants (R23 exclusivity).
  const textKeys = a === "inmail.send" ? ["subject", "text"] : ["text"];
  /** The `with` keys `variants` replace; an invite `note:null` is "no note", not a text. */
  const withTextKeys = a === "invite.send" ? ["note"] : textKeys;
  const variants = hasVariants ? raw["variants"] : undefined;
  if (hasVariants && withTextKeys.some((k) => has(w, k) && w[k] !== null)) {
    ctx.issues.push({ order, path: `${p}.variants`, rule: `use either variants or with.${withTextKeys.join(" and with.")}, not both` });
  }

  const texts: { path: string; value: string }[] = [];
  if (hasVariants) {
    if (!Array.isArray(variants) || variants.length < v.minVariants || variants.length > v.maxVariants) {
      ctx.issues.push({
        order,
        path: `${p}.variants`,
        rule: `needs ${v.minVariants} to ${v.maxVariants} variants${Array.isArray(variants) ? `; found ${variants.length}` : ""}`,
      });
    }
    (Array.isArray(variants) ? variants : []).forEach((variant, j) => {
      let vp = `${p}.variants[${j}]`;
      if (!isObject(variant)) {
        ctx.issues.push({ order, path: vp, rule: "a variant is a JSON object" });
        return;
      }
      const vid = variant["id"];
      if (typeof vid !== "string" || !ctx.re.id.test(vid)) {
        ctx.issues.push({ order, path: `${vp}.id`, rule: `must match ${v.idPattern}` });
      } else if (vid === END) {
        ctx.issues.push({ order, path: `${vp}.id`, rule: '"end" is reserved' });
      } else if (usedIds.has(vid)) {
        ctx.issues.push({ order, path: `${vp}.id`, rule: `${vid} is already a step or variant id` });
      } else {
        usedIds.add(vid);
        vp = `${p}.variants.${vid}`;
      }
      for (const k of keysOf(variant)) {
        if (k !== "id" && !textKeys.includes(k)) {
          ctx.issues.push({ order, path: `${vp}.${quote(k)}`, rule: `unknown key; a variant holds id and ${textKeys.join(" and ")}` });
        }
      }
      for (const field of textKeys) {
        const value = checkText(ctx, order, `${vp}.${field}`, variant[field], limitOf(a, field));
        if (value !== null) texts.push({ path: `${vp}.${field}`, value });
      }
    });
  } else {
    for (const field of withTextKeys) {
      if (a === "invite.send") {
        if (has(w, "note") && w["note"] !== null) {
          const value = checkText(ctx, order, `${p}.with.note`, w["note"], limitOf(a, field));
          if (value !== null) texts.push({ path: `${p}.with.note`, value });
        }
      } else if (!has(w, field)) {
        ctx.issues.push({ order, path: `${p}.with.${field}`, rule: "required, or use variants" });
      } else {
        const value = checkText(ctx, order, `${p}.with.${field}`, w[field], limitOf(a, field));
        if (value !== null) texts.push({ path: `${p}.with.${field}`, value });
      }
    }
  }

  // R20, W7
  if (a === "post.comment") {
    for (const t of texts) {
      const contactVars = variablesIn(t.value)
        .map((x) => x.inner)
        .filter((i) => i.startsWith("contact.") && isKnownVariable(ctx, i));
      if (contactVars.length === 0) {
        ctx.issues.push({ order, path: t.path, rule: "a comment must use a contact variable, such as {{contact.extra.comment}}" });
      } else if (contactVars.every((i) => (NAME_FIELDS as readonly string[]).includes(i.slice(8)))) {
        ctx.warnings.push({
          order,
          code: "W7",
          path: t.path,
          rule: "the comment's only per-Contact variables are name fields; write it per Contact, for example in contact.extra",
        });
      }
    }
  }

  // R19
  const usesVariable = texts.some((t) => hasVariable(t.value));
  if (a === "invite.send") {
    const fp = `${p}.with.note_fallback`;
    if (has(w, "note_fallback")) checkFallbackText(ctx, order, fp, w["note_fallback"], TEXT_LIMITS.invite_note, "drop");
    else if (usesVariable) ctx.issues.push({ order, path: fp, rule: 'required because the note uses a variable: text, or "drop"' });
  } else if (a === "inmail.send") {
    const fp = `${p}.with.fallback`;
    if (has(w, "fallback")) {
      const f = w["fallback"];
      if (!isObject(f)) {
        ctx.issues.push({ order, path: fp, rule: "must be an object with subject and text" });
      } else {
        for (const k of keysOf(f)) {
          if (k !== "subject" && k !== "text") ctx.issues.push({ order, path: `${fp}.${quote(k)}`, rule: "unknown key; a fallback holds subject and text" });
        }
        checkFallbackText(ctx, order, `${fp}.subject`, f["subject"], TEXT_LIMITS.inmail_subject);
        checkFallbackText(ctx, order, `${fp}.text`, f["text"], TEXT_LIMITS.inmail_text);
      }
    } else if (usesVariable) {
      ctx.issues.push({ order, path: fp, rule: "required because the subject or text uses a variable: an object with subject and text" });
    }
  } else {
    const fp = `${p}.with.fallback`;
    const comment = a === "post.comment";
    if (has(w, "fallback")) checkFallbackText(ctx, order, fp, w["fallback"], limitOf(a, "text"), comment ? "skip" : undefined);
    else if (comment) ctx.issues.push({ order, path: fp, rule: 'required on a comment: text, or "skip"' });
    else if (usesVariable) ctx.issues.push({ order, path: fp, rule: "required because the text uses a variable" });
  }
}

// R15
function checkPredicate(ctx: Ctx, pred: unknown, path: string, order: number, nested = false): void {
  const { v } = ctx;
  const push = (rule: string) => ctx.issues.push({ order, path, rule });
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
    else checkPredicate(ctx, val, `${path}.not`, order, true);
    return;
  }
  if (key.startsWith("account.")) {
    if (key !== "account.premium") push(`unknown predicate ${quote(key)}`);
    else if (typeof val !== "boolean") push("account.premium takes true or false");
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

// Graph: R8 cycles, R9 unreachable, R10 explicit endings; W1, W5, W6, W8.

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

  const graphIssues: Issue[] = [];
  // R10
  infos.forEach((info, i) => {
    for (const e of edges[i]!) {
      if (e.to === "off") {
        graphIssues.push({ order: i, path: `${info.prefix}.${e.field}`, rule: `the last step must end explicitly; set ${e.field} to a step id or "end"` });
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
    if (!seen.has(i)) graphIssues.push({ order: i, path: info.prefix, rule: "unreachable: no path leads here from the first step or from on_reply" });
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
        if (!graphIssues.some((x) => x.rule === rule)) graphIssues.push({ order: i, path: `${infos[i]!.prefix}.${e.field}`, rule });
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
      ctx.warnings.push({
        order: i,
        code: "W1",
        path: info.prefix,
        rule: `merge point: reached by fall-through from ${names(fallFrom)} and by a jump from ${names(jumpFrom)}`,
      });
    }
  });

  // W5/W6: dataflow in topological order. An invitation "happened" on a path
  // through an invite.send step's success exit (not its explicit else).
  const order = topo(n, edges, roots);
  const afterInvite = new Array<boolean>(n).fill(false);
  const withoutInvite = new Array<boolean>(n).fill(false);
  // Seeds: the first step, and on_reply only when nothing else leads there.
  const fromFirst = new Set<number>(topo(n, edges, [0]));
  for (const r of roots) if (r === 0 || !fromFirst.has(r)) withoutInvite[r] = true;
  for (const i of order) {
    for (const { from, edge } of preds[i]!) {
      const invited = action(from) === "invite.send" && edge.field === "next";
      if (afterInvite[from] || invited) afterInvite[i] = true;
      if (withoutInvite[from] && !invited) withoutInvite[i] = true;
    }
  }
  infos.forEach((info, i) => {
    if (!seen.has(i)) return;
    if (action(i) === "profile.follow" && afterInvite[i]) {
      ctx.warnings.push({ order: i, code: "W5", path: `${info.prefix}.do`, rule: "profile.follow after invite.send on the same path; an invitation already follows" });
    }
    if (info.raw!["until"] === "invite.accepted" && withoutInvite[i]) {
      ctx.warnings.push({ order: i, code: "W6", path: `${info.prefix}.until`, rule: "until invite.accepted on a path with no invite.send before it" });
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
          if (link) ctx.warnings.push({ order: k, code: "W8", path: link.path, rule: "a link in the first message after the invitation is accepted" });
        }
        continue;
      }
      for (const e of edges[k]!) if (typeof e.to === "number") q.push(e.to);
    }
  });
}

function messageTexts(info: StepInfo): { path: string; value: string }[] {
  const raw = info.raw!;
  const w = isObject(raw["with"]) ? raw["with"] : {};
  const out: { path: string; value: string }[] = [];
  if (Array.isArray(raw["variants"])) {
    raw["variants"].forEach((variant, j) => {
      if (isObject(variant) && typeof variant["text"] === "string") {
        const id = typeof variant["id"] === "string" ? `variants.${variant["id"]}` : `variants[${j}]`;
        out.push({ path: `${info.prefix}.${id}.text`, value: variant["text"] });
      }
    });
  }
  if (typeof w["text"] === "string") out.push({ path: `${info.prefix}.with.text`, value: w["text"] });
  if (typeof w["fallback"] === "string") out.push({ path: `${info.prefix}.with.fallback`, value: w["fallback"] });
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
