// Vendored from the API by scripts/vendor-shared.mjs. Do not edit: change the API and re-run.
import { durationMinutes } from "./paths.js";
import { normalizePath } from "../field-paths.js";
import { awaitedEventName } from "./references.js";
import { ACCOUNT_FIELDS, ACTION_PARAMS, ACTIONS, VOICE_CLIP_ID_RE, VOICE_CLIP_RULE, BOOLEAN_PREDICATES, DURATION_BOUNDS, DEPRECATED_ACCEPTED_UNTIL, DURATION_PATTERN, END, EVENT_NAME_PATTERN, EVENTS, EXTRA_KEY_PATTERN, FIELD_OPERATORS, ID_PATTERN, MAX_PREDICATE_DEPTH, MAX_QUOTED_TOKEN_CHARS, MAX_SAVE_ENTRIES, MAX_SEQUENCE_BYTES, MAX_STEP_NOTE_CHARS, MAX_STEPS, MAX_VARIABLE_REFS_PER_TEXT, MAX_TAG_CHARS, MAX_VARIANTS, MAX_VARIANTS_DEPRECATED, MESSAGING_ACTIONS, MY_FIELDS, MIN_VARIANTS, NAME_FIELDS, NUMBER_OPERATORS, REACTIONS, SAVE_NAME_PATTERN, SEQUENCE_SCHEMA_URL, STANDARD_FIELDS, STEP_KEYS, STEP_KINDS, TAG_PATTERN, TEXT_LIMITS, type Action, type StepKind, fallbackKeyword, isObject, longVariable, } from "./limits.js";
import { isMessageSend } from "./message-actions.js";
import { ruleHelp } from "./rules.js";
export interface PathRule {
    path: string;
    rule: string;
}
export interface SequenceError {
    path: string;
    rule: string;
    code: string;
    message: string;
    pointer: string;
    hint: string;
    docs_url: string;
    severity: "error" | "warning";
    candidates?: string[];
}
export interface SequenceWarning extends SequenceError {
    code: `W${number}`;
}
export interface SequenceValidationResult {
    errors: SequenceError[];
    warnings: SequenceWarning[];
}
export type SendingAccountProfile = "basic" | "premium" | "sales_navigator" | "recruiter";
export interface MotionWarningContext {
    accountProfiles: readonly SendingAccountProfile[];
    assign?: string | undefined;
}
export type SampleShapes = Readonly<Record<string, readonly {
    path: string;
    type: string;
}[]>>;
export function validateSequence(doc: unknown, opts: {
    variables: Readonly<Record<string, unknown>>;
    shapes?: SampleShapes;
}): SequenceValidationResult {
    return run(doc, { kind: "server", variables: opts.variables, shapes: opts.shapes ?? {} });
}
export function lintSequence(doc: unknown): SequenceValidationResult {
    return run(doc, { kind: "lint" });
}
export function jsonPointer(...tokens: (string | number)[]): string {
    return tokens.map((t) => "/" + String(t).replace(/~/g, "~0").replace(/\//g, "~1")).join("");
}
export function sequenceEntry<C extends string>(code: C, path: string, pointer: string, rule: string, token?: string, candidates?: string[]): SequenceError & {
    code: C;
} {
    return {
        path,
        rule,
        code,
        message: rule,
        pointer,
        ...ruleHelp(code, token),
        severity: code.startsWith("W") ? "warning" : "error",
        ...(candidates?.length ? { candidates } : {}),
    };
}
export function sequenceSizeError(bytes: number): SequenceError {
    return sequenceEntry("R2", "$", "", `the document is ${bytes} bytes; the limit is ${MAX_SEQUENCE_BYTES}, UTF-8 compact JSON`);
}
export function errorsMessage(errors: readonly PathRule[]): string {
    const first = errors[0];
    if (!first)
        return "";
    const more = errors.length - 1;
    return `${first.path}: ${first.rule}${more > 0 ? ` and ${more} more` : ""}`;
}
const UNTIL = `; accepted until ${DEPRECATED_ACCEPTED_UNTIL}`;
export function motionWarnings(doc: unknown, ctx: MotionWarningContext & {
    variableKeys?: number;
}): SequenceWarning[] {
    const out: SequenceWarning[] = [];
    const warn = (code: `W${number}`, path: string, pointer: string, rule: string, token?: string) => out.push(sequenceEntry(code, path, pointer, rule, token));
    if ((ctx.variableKeys ?? 0) > 0) {
        warn("W13", "settings.variables", "", `Motion variables were removed${UNTIL}; write the text in place or use a custom field`, "text in place or a custom field");
    }
    if (!isObject(doc))
        return out;
    const steps = Array.isArray(doc["steps"]) ? doc["steps"] : [];
    const has = (p: SendingAccountProfile) => ctx.accountProfiles.includes(p);
    const recruiterOnly = ctx.accountProfiles.length > 0 && ctx.accountProfiles.every((p) => p === "recruiter");
    const invite = ctx.assign === "already_connected" ? steps.findIndex((s: unknown) => isObject(s) && s["do"] === "invite.send" && typeof s["id"] === "string") : -1;
    if (invite >= 0) {
        warn("W17", `${(steps[invite] as Record<string, unknown>)["id"] as string}.do`, jsonPointer("steps", invite, "do"), "settings.assign is already_connected, so anyone not already connected to a sending Account is skipped and this invitation never runs for them; use assign: auto");
    }
    steps.forEach((step: unknown, i: number) => {
        if (!isObject(step) || typeof step["id"] !== "string")
            return;
        const id = step["id"];
        if (step["do"] === "inmail.send" && ctx.accountProfiles.length > 0 && !has("sales_navigator") && !has("recruiter")) {
            warn("W2", `${id}.do`, jsonPointer("steps", i, "do"), "no sending Account has Sales Navigator or Recruiter, so this step will be skipped");
        }
        if (step["do"] === "invite.send" && has("basic")) {
            const w = isObject(step["with"]) ? step["with"] : {};
            const noted = (typeof w["note"] === "string" && w["note"] !== "") || Array.isArray(step["variants"]);
            if (noted && w["note_fallback"] !== "drop") {
                warn("W3", `${id}.with.note_fallback`, jsonPointer("steps", i, ...(isObject(step["with"]) ? ["with"] : [])), 'a basic sending Account sends only a few noted invitations a month; set note_fallback to "drop" to send without a note after that');
            }
        }
        if (step["until"] === "message.read" && recruiterOnly) {
            warn("W4", `${id}.until`, jsonPointer("steps", i, "until"), "every sending Account uses Recruiter, and Recruiter chats never report a message as read");
        }
    });
    return out;
}
export function validateWhere(where: unknown): PathRule[] {
    if (!Array.isArray(where))
        return [{ path: "where", rule: "must be an array of predicates" }];
    const out: Issue[] = [];
    where.forEach((p, i) => checkPredicate(p, `where[${i}]`, jsonPointer(i), true, out));
    return out.map(({ path, rule }) => ({ path, rule }));
}
type Mode = {
    kind: "server";
    variables: Readonly<Record<string, unknown>>;
    shapes: SampleShapes;
} | {
    kind: "lint";
};
interface Issue {
    order: number;
    code: string;
    path: string;
    pointer: string;
    rule: string;
    token?: string;
    candidates?: string[];
}
const ID_RE = new RegExp(ID_PATTERN);
const DURATION_RE = new RegExp(DURATION_PATTERN);
const EVENT_RE = new RegExp(EVENT_NAME_PATTERN);
const EXTRA_KEY_RE = new RegExp(EXTRA_KEY_PATTERN);
const TAG_RE = new RegExp(TAG_PATTERN);
const SAVE_NAME_RE = new RegExp(SAVE_NAME_PATTERN);
export const VARIABLE_RE = /\{\{([^{}]*)\}\}/g;
const SINGLE_BRACE_RE = /\{[A-Za-z_][A-Za-z0-9_.]*\}/g;
const KIND_LIST = STEP_KINDS.join(", ");
function keysOf(o: Record<string, unknown>): string[] {
    return Object.keys(o).filter((k) => o[k] !== undefined);
}
function has(o: Record<string, unknown>, k: string): boolean {
    return Object.hasOwn(o, k) && o[k] !== undefined;
}
function quote(token: string): string {
    return [...token].slice(0, MAX_QUOTED_TOKEN_CHARS).join("");
}
function compactBytes(v: unknown): number {
    try {
        return new TextEncoder().encode(JSON.stringify(v)).length;
    }
    catch {
        return 0;
    }
}
export function deeperThan(v: unknown, max: number): boolean {
    let level: unknown[] = [v];
    for (let depth = 1; level.length; depth++) {
        const next: unknown[] = [];
        for (const x of level) {
            if (typeof x === "object" && x !== null)
                for (const child of Object.values(x))
                    next.push(child);
        }
        if (!next.length)
            return false;
        if (depth > max)
            return true;
        level = next;
    }
    return false;
}
type Bounds = {
    min: number;
    max: number;
    label: string;
    example: string;
};
function durationRule(bounds: Bounds): string {
    return `must be a duration between ${bounds.label}: a number then m, h or d, like 30d`;
}
const durationHint = (bounds: Bounds) => `${bounds.label}, for example ${bounds.example}`;
function durationOk(v: unknown, bounds: {
    min: number;
    max: number;
}): boolean {
    if (typeof v !== "string" || !DURATION_RE.test(v))
        return false;
    const m = durationMinutes(v);
    return m >= bounds.min && m <= bounds.max;
}
function tagOk(v: unknown): boolean {
    return typeof v === "string" && [...v].length <= MAX_TAG_CHARS && TAG_RE.test(v);
}
const TAG_RULE = "a Tag name is 1 to 64 characters, without , or ;";
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
export function distance(a: string, b: string, cap: number): number {
    if (Math.abs(a.length - b.length) > cap)
        return cap + 1;
    let prev = Array.from({ length: b.length + 1 }, (_, j) => j);
    for (let i = 1; i <= a.length; i++) {
        const cur = [i];
        for (let j = 1; j <= b.length; j++)
            cur[j] = Math.min(prev[j]! + 1, cur[j - 1]! + 1, prev[j - 1]! + (a[i - 1] === b[j - 1] ? 0 : 1));
        prev = cur;
    }
    return prev[b.length]!;
}
const NEAR_NAMES: readonly string[] = [...STANDARD_FIELDS, ...MY_FIELDS];
function likelyTypoOf(key: string): string | null {
    let best: string | null = null;
    let bestD = 3;
    for (const n of NEAR_NAMES) {
        const d = distance(key, n, 2);
        if (d < bestD)
            [best, bestD] = [n, d];
    }
    return best;
}
interface SavedValue {
    event: string;
    path: string;
}
interface Values {
    saved: Map<string, SavedValue[]>;
    toContact: Set<string>;
    used: Set<string>;
}
interface Ctx {
    mode: Mode;
    issues: Issue[];
    warnings: Issue[];
    values: Values;
}
const issue = (ctx: Ctx, i: Issue) => ctx.issues.push(i);
const warning = (ctx: Ctx, i: Issue) => ctx.warnings.push(i);
function checkText(ctx: Ctx, order: number, path: string, pointer: string, parent: string, value: unknown, limit: number): string | null {
    if (typeof value !== "string" || value.trim() === "") {
        issue(ctx, { order, code: "R13", path, pointer: typeof value === "undefined" ? parent : pointer, rule: "must be non-empty text" });
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
        const motion = /^motion\.([a-z][a-z0-9_]{0,39})$/.exec(v.inner);
        if (motion) {
            warning(ctx, {
                ...at,
                code: "W13",
                rule: `${quote(v.token)}: Motion variables were removed${UNTIL}; write the text in place or use a custom field`,
                token: `text in place or a custom field such as {{${motion[1]}}}`,
            });
            if (ctx.mode.kind === "lint") {
                warning(ctx, { ...at, code: "W9", rule: `${quote(v.token)} is checked against settings.variables by the server only` });
            }
            else if (!Object.hasOwn(ctx.mode.variables, motion[1]!)) {
                issue(ctx, { ...at, code: "R16", rule: `${quote(v.token)} is not defined in settings.variables` });
            }
            continue;
        }
        const ev = /^enrollment\.(.*)$/s.exec(v.inner);
        if (ev) {
            enrollmentRef(ctx, at, quote(v.token), ev[1]!, (k) => `{{${k}}}`);
            continue;
        }
        if (!v.inner.includes(".") && v.inner.startsWith("my_") && !(MY_FIELDS as readonly string[]).includes(v.inner)) {
            issue(ctx, { ...at, code: "R16", rule: `${quote(v.token)}: the my_ prefix is reserved for my_first_name, my_last_name and my_full_name` });
            continue;
        }
        if (!isKnownVariable(v.inner)) {
            issue(ctx, {
                ...at,
                code: "R16",
                rule: `unknown variable ${quote(v.token)}; use a field ({{first_name}}), your name ({{my_first_name}}), a custom field ({{opener}}), or contact.<field>, contact.extra.<key>, account.first_name, account.last_name, account.full_name`,
            });
            continue;
        }
        const long = longVariable(v.inner)!;
        if (!v.inner.includes(".") && long.startsWith("contact.extra.") && ctx.values.saved.has(v.inner)) {
            const want = `{{enrollment.${v.inner}}}`;
            warning(ctx, { ...at, code: "W16", rule: `${quote(v.token)} is read as a Contact field; did you mean ${want}?`, token: want, candidates: [want] });
        }
        if (!v.inner.includes(".") && long.startsWith("contact.extra.")) {
            const near = likelyTypoOf(v.inner);
            if (near !== null)
                warning(ctx, { ...at, code: "W11", rule: `${quote(v.token)} is read as a custom field; did you mean ${near}?`, token: near });
        }
    }
    const rest = value.replace(VARIABLE_RE, " ");
    if (rest.includes("{{")) {
        issue(ctx, { ...at, code: "R16", rule: "unclosed variable; write a variable as {{contact.first_name}}" });
    }
    else {
        for (const m of rest.matchAll(SINGLE_BRACE_RE)) {
            issue(ctx, { ...at, code: "R18", rule: `${quote(m[0])} is not a variable; write {{contact.<field>}} or remove the braces` });
        }
    }
    const len = staticLength(value);
    if (len > limit) {
        issue(ctx, { ...at, code: "R22", rule: `${len} characters; the limit is ${limit}, variables not counted` });
    }
    return value;
}
function enrollmentRef(ctx: Ctx, at: {
    order: number;
    path: string;
    pointer: string;
}, shown: string, key: string, form: (long: string) => string): void {
    if (key === "id") {
        issue(ctx, { ...at, code: "R27", rule: `${shown}: enrollment.id is reserved`, token: "{{enrollment_id}}", candidates: ["{{enrollment_id}}"] });
        return;
    }
    ctx.values.used.add(key);
    if (ctx.values.saved.has(key))
        return;
    const candidates = ctx.values.toContact.has(key)
        ? [form(`contact.extra.${key}`)]
        : [...ctx.values.saved.keys()].filter((n) => distance(key, n, 2) <= 2).map((n) => form(`enrollment.${n}`));
    issue(ctx, { ...at, code: "R27", rule: `${shown}: no save of this Sequence writes ${quote(key)}`, ...(candidates.length ? { token: candidates[0]!, candidates } : {}) });
}
function isKnownVariable(inner: string): boolean {
    const long = longVariable(inner);
    if (long === null)
        return false;
    if (long.startsWith("contact.extra."))
        return EXTRA_KEY_RE.test(long.slice("contact.extra.".length));
    if (long.startsWith("contact."))
        return (STANDARD_FIELDS as readonly string[]).includes(long.slice(8));
    if (long.startsWith("account."))
        return (ACCOUNT_FIELDS as readonly string[]).includes(long.slice(8));
    return false;
}
function checkClipId(ctx: Ctx, order: number, path: string, pointer: string, parent: string, value: unknown): null {
    if (typeof value !== "string" || !VOICE_CLIP_ID_RE.test(value))
        issue(ctx, { order, code: "R13", path, pointer: value === undefined ? parent : pointer, rule: VOICE_CLIP_RULE });
    return null;
}
function checkFallbackText(ctx: Ctx, order: number, path: string, pointer: string, parent: string, value: unknown, limit: number, keyword?: string): void {
    if (keyword !== undefined && value === keyword)
        return;
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
    ptr: string;
    id: string | null;
    kind: StepKind | null;
    raw: Record<string, unknown> | null;
}
function entries(issues: Issue[]): SequenceError[] {
    return issues.sort((a, b) => a.order - b.order).map((i) => sequenceEntry(i.code, i.path, i.pointer, i.rule, i.token, i.candidates));
}
function run(doc: unknown, mode: Mode): SequenceValidationResult {
    const ctx: Ctx = { mode, issues: [], warnings: [], values: { saved: new Map(), toContact: new Set(), used: new Set() } };
    const DOC = -1;
    if (!isObject(doc)) {
        return { errors: [sequenceEntry("R1", "$", "", "a Sequence document is a JSON object")], warnings: [] };
    }
    for (const k of keysOf(doc)) {
        if (k !== "$schema" && k !== "on_reply" && k !== "steps") {
            issue(ctx, { order: DOC, code: "R1", path: quote(k), pointer: jsonPointer(k), rule: "unknown key; a Sequence document holds only $schema, on_reply and steps" });
        }
    }
    if (has(doc, "$schema") && doc["$schema"] !== SEQUENCE_SCHEMA_URL) {
        issue(ctx, { order: DOC, code: "R1", path: "$schema", pointer: "/$schema", rule: `must be ${SEQUENCE_SCHEMA_URL}` });
    }
    const bytes = compactBytes(doc);
    if (bytes > MAX_SEQUENCE_BYTES) {
        const e = sequenceSizeError(bytes);
        issue(ctx, { order: DOC, code: e.code, path: e.path, pointer: e.pointer, rule: e.rule });
    }
    const rawSteps = doc["steps"];
    const stepsArr = Array.isArray(rawSteps) ? rawSteps : [];
    ctx.values = valuesOf(stepsArr);
    if (!Array.isArray(rawSteps) || rawSteps.length === 0) {
        issue(ctx, { order: DOC, code: "R2", path: "steps", pointer: has(doc, "steps") ? "/steps" : "", rule: `required: an array of 1 to ${MAX_STEPS} steps` });
    }
    else if (rawSteps.length > MAX_STEPS) {
        issue(ctx, { order: DOC, code: "R2", path: "steps", pointer: "/steps", rule: `${rawSteps.length} steps; the limit is ${MAX_STEPS}` });
    }
    const infos: StepInfo[] = [];
    const firstIndex = new Map<string, number>();
    let structural = !Array.isArray(rawSteps) || rawSteps.length === 0 || rawSteps.length > MAX_STEPS;
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
            issue(ctx, { ...idAt, pointer: ptr, rule: `required: matching ${ID_PATTERN}` });
            structural = true;
        }
        else if (typeof id !== "string" || !ID_RE.test(id)) {
            issue(ctx, { ...idAt, rule: `must match ${ID_PATTERN}` });
            structural = true;
        }
        else if (id === END) {
            issue(ctx, { ...idAt, rule: '"end" is reserved' });
            structural = true;
        }
        else if (firstIndex.has(id)) {
            issue(ctx, { ...idAt, rule: `duplicate step id ${id}` });
            structural = true;
        }
        else {
            firstIndex.set(id, index);
            info.id = id;
            info.prefix = id;
        }
        const kinds = STEP_KINDS.filter((k) => has(raw, k));
        if (kinds.length !== 1) {
            issue(ctx, {
                order: index,
                code: "R4",
                path: info.prefix,
                pointer: ptr,
                rule: kinds.length === 0 ? `a step needs exactly one of ${KIND_LIST}` : `a step has exactly one kind; found ${kinds.join(", ")}`,
            });
            structural = true;
            return;
        }
        info.kind = kinds[0]!;
    });
    const onReply = doc["on_reply"];
    const targetOk = (t: unknown): boolean => t === END || (typeof t === "string" && firstIndex.has(t));
    const replyAt = { order: DOC, code: "R11", path: "on_reply", pointer: "/on_reply" };
    if (!has(doc, "on_reply")) {
        issue(ctx, { ...replyAt, pointer: "", rule: 'required: a step id or "end"' });
        structural = true;
    }
    else if (typeof onReply !== "string") {
        issue(ctx, { ...replyAt, rule: 'must be a step id or "end"' });
        structural = true;
    }
    else if (!targetOk(onReply)) {
        issue(ctx, { ...replyAt, rule: `unknown step ${quote(onReply)}` });
        structural = true;
    }
    const usedIds = new Set(firstIndex.keys());
    for (const info of infos) {
        if (!info.raw || !info.kind)
            continue;
        const { raw, kind, index: order, prefix: p, ptr } = info;
        for (const k of keysOf(raw)) {
            if (STEP_KEYS[kind].includes(k))
                continue;
            if (k === "save" || k === "save_to_contact") {
                issue(ctx, { order, code: "R25", path: `${p}.${k}`, pointer: `${ptr}/${k}`, rule: `${k} is allowed only on an until event.<name> step` });
                continue;
            }
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
            if (typeof n !== "string" || [...n].length > MAX_STEP_NOTE_CHARS) {
                issue(ctx, { order, code: "R22", path: `${p}.note`, pointer: `${ptr}/note`, rule: `must be text of at most ${MAX_STEP_NOTE_CHARS} characters` });
            }
        }
        if (has(raw, "event") && STEP_KEYS[kind].includes("event")) {
            const e = raw["event"];
            if (typeof e !== "string" || !EVENT_RE.test(e)) {
                issue(ctx, { order, code: "R24", path: `${p}.event`, pointer: `${ptr}/event`, rule: `must match ${EVENT_NAME_PATTERN}, like invite_sent` });
            }
        }
        switch (kind) {
            case "do":
                checkDo(ctx, order, p, ptr, raw, usedIds);
                break;
            case "wait":
                if (!durationOk(raw["wait"], DURATION_BOUNDS.wait)) {
                    issue(ctx, { order, code: "R12", path: `${p}.wait`, pointer: `${ptr}/wait`, rule: durationRule(DURATION_BOUNDS.wait), token: durationHint(DURATION_BOUNDS.wait) });
                }
                break;
            case "until":
                checkUntil(ctx, order, p, ptr, raw);
                break;
            case "if":
                checkPredicate(raw["if"], `${p}.if`, `${ptr}/if`, false, ctx.issues, order, false, ctx);
                break;
            case "emit": {
                const e = raw["emit"];
                if (typeof e !== "string" || !EVENT_RE.test(e)) {
                    issue(ctx, { order, code: "R24", path: `${p}.emit`, pointer: `${ptr}/emit`, rule: `must match ${EVENT_NAME_PATTERN}, like reply.received` });
                }
                break;
            }
            case "tag":
                if (!tagOk(raw["tag"]))
                    issue(ctx, { order, code: "R24", path: `${p}.tag`, pointer: `${ptr}/tag`, rule: TAG_RULE });
                break;
        }
        if ((kind === "until" || kind === "if") && !has(raw, "then")) {
            issue(ctx, { order, code: "R7", path: `${p}.then`, pointer: ptr, rule: `required on an ${kind} step` });
            structural = true;
        }
        for (const f of ["then", "else", "next"] as const) {
            if (!has(raw, f) || !STEP_KEYS[kind].includes(f))
                continue;
            const t = raw[f];
            const at = { order, code: "R6", path: `${p}.${f}`, pointer: `${ptr}/${f}` };
            if (typeof t !== "string") {
                issue(ctx, { ...at, rule: 'must be a step id or "end"' });
                structural = true;
            }
            else if (!targetOk(t)) {
                issue(ctx, { ...at, rule: `unknown step ${quote(t)}` });
                structural = true;
            }
        }
    }
    for (const info of infos) {
        const save = info.kind === "until" && awaitedEventName(info.raw!["until"]) !== null ? info.raw!["save"] : undefined;
        if (!isObject(save))
            continue;
        for (const name of keysOf(save)) {
            if (ctx.values.used.has(name) || name === "id" || !SAVE_NAME_RE.test(name))
                continue;
            warning(ctx, {
                order: info.index,
                code: "W14",
                path: `${info.prefix}.save.${quote(name)}`,
                pointer: `${info.ptr}/save${jsonPointer(name)}`,
                rule: `${quote(name)} is saved but nothing in this Sequence reads it; a webhook template may still send it`,
            });
        }
    }
    if (!structural)
        graph(ctx, infos, firstIndex, onReply as string);
    return { errors: entries(ctx.issues), warnings: entries(ctx.warnings) as SequenceWarning[] };
}
function checkUntil(ctx: Ctx, order: number, p: string, ptr: string, raw: Record<string, unknown>): void {
    const ev = raw["until"];
    const at = { order, code: "R14", path: `${p}.until`, pointer: `${ptr}/until` };
    const custom = typeof ev === "string" ? /^(event|signal)\.(.*)$/s.exec(ev) : null;
    if (custom) {
        const [, ns, name] = custom;
        if (!EVENT_RE.test(name!)) {
            issue(ctx, { ...at, rule: `an event name must match ${EVENT_NAME_PATTERN}` });
        }
        else if (ns === "signal") {
            warning(ctx, { ...at, code: "W13", rule: `until signal.${quote(name!)} is now until event.${quote(name!)}${UNTIL}`, token: `event.${quote(name!)}` });
        }
    }
    else if (!(EVENTS as readonly unknown[]).includes(ev)) {
        issue(ctx, { ...at, rule: "unknown event; use invite.accepted, message.replied, message.read or event.<name>" });
    }
    for (const key of ["save", "save_to_contact"] as const) {
        if (has(raw, key))
            checkSave(ctx, order, p, ptr, raw, key, custom && EVENT_RE.test(custom[2]!) ? custom[2]! : null);
    }
    if (!has(raw, "timeout")) {
        issue(ctx, { order, code: "R14", path: `${p}.timeout`, pointer: ptr, rule: "required on an until step" });
    }
    else if (!durationOk(raw["timeout"], DURATION_BOUNDS.timeout)) {
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
const SAVE_CONTACT_FIELDS: readonly string[] = STANDARD_FIELDS.filter((f) => f !== "email");
function checkSave(ctx: Ctx, order: number, p: string, ptr: string, raw: Record<string, unknown>, key: "save" | "save_to_contact", event: string | null): void {
    const v = raw[key];
    const at = { order, path: `${p}.${key}`, pointer: `${ptr}/${key}` };
    if (event === null) {
        issue(ctx, { ...at, code: "R25", rule: `${key} is allowed only on an until event.<name> step` });
        return;
    }
    if (!isObject(v) || keysOf(v).length === 0) {
        issue(ctx, { ...at, code: "R25", rule: `must be an object of 1 to ${MAX_SAVE_ENTRIES} entries` });
        return;
    }
    const names = keysOf(v);
    if (names.length > MAX_SAVE_ENTRIES)
        issue(ctx, { ...at, code: "R25", rule: `${names.length} entries; the limit is ${MAX_SAVE_ENTRIES}` });
    for (const name of names) {
        const e = { order, path: `${at.path}.${quote(name)}`, pointer: `${at.pointer}${jsonPointer(name)}` };
        if (key === "save") {
            if (name === "id")
                issue(ctx, { ...e, code: "R25", rule: '"id" is reserved; enrollment_id is always sent' });
            else if (!SAVE_NAME_RE.test(name))
                issue(ctx, { ...e, code: "R25", rule: `a value name must match ${SAVE_NAME_PATTERN}` });
        }
        else if (SAVE_CONTACT_FIELDS.includes(name)) {
            issue(ctx, { ...e, code: "R25", rule: `${name} is a standard Contact field; only email can be saved to one` });
        }
        else if (name !== "email" && !EXTRA_KEY_RE.test(name)) {
            issue(ctx, { ...e, code: "R25", rule: `a custom field key must match ${EXTRA_KEY_PATTERN}, or be email` });
        }
        const path = typeof v[name] === "string" ? normalizePath(v[name] as string) : null;
        if (path === null) {
            issue(ctx, { ...e, code: "R26", rule: 'not a field path; use dots, items[0] and ["a.b"], at most 256 characters, like lead.score' });
            continue;
        }
        const type = sampleType(ctx, event, path);
        if (type === "object" || type === "array") {
            issue(ctx, { ...e, code: "R29", rule: `${quote(path)} is an ${type} in the sample of event ${event}; save a field inside it` });
        }
    }
}
function sampleType(ctx: Ctx, event: string, path: string): string | null {
    if (ctx.mode.kind !== "server")
        return null;
    return ctx.mode.shapes[event]?.find((f) => f.path === path)?.type ?? null;
}
function valuesOf(steps: unknown[]): Values {
    const out: Values = { saved: new Map(), toContact: new Set(), used: new Set() };
    for (const s of steps) {
        if (!isObject(s))
            continue;
        const m = typeof s["until"] === "string" ? /^(?:event|signal)\.(.+)$/s.exec(s["until"]) : null;
        if (isObject(s["save"])) {
            for (const [name, raw] of Object.entries(s["save"])) {
                const path = typeof raw === "string" ? normalizePath(raw) : null;
                out.saved.set(name, [...(out.saved.get(name) ?? []), ...(m && path ? [{ event: m[1]!, path }] : [])]);
            }
        }
        if (isObject(s["save_to_contact"]))
            for (const k of Object.keys(s["save_to_contact"]))
                out.toContact.add(k);
    }
    return out;
}
function checkDo(ctx: Ctx, order: number, p: string, ptr: string, raw: Record<string, unknown>, usedIds: Set<string>): void {
    const action = raw["do"];
    if (!(ACTIONS as readonly unknown[]).includes(action)) {
        issue(ctx, { order, code: "R13", path: `${p}.do`, pointer: `${ptr}/do`, rule: `unknown action; use ${ACTIONS.join(", ")}` });
        return;
    }
    const a = action as Action;
    const params = ACTION_PARAMS[a];
    const wp = `${ptr}/with`;
    const withParent = isObject(raw["with"]) ? wp : ptr;
    let w: Record<string, unknown> = {};
    if (has(raw, "with")) {
        if (!isObject(raw["with"])) {
            issue(ctx, { order, code: "R13", path: `${p}.with`, pointer: wp, rule: "must be an object" });
        }
        else {
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
    const messaging = MESSAGING_ACTIONS.includes(a);
    const hasVariants = has(raw, "variants");
    const vptr = `${ptr}/variants`;
    if (hasVariants && !messaging) {
        issue(ctx, { order, code: "R23", path: `${p}.variants`, pointer: vptr, rule: "variants are allowed on messaging steps only" });
    }
    if (has(w, "post") && params.includes("post") && w["post"] !== "latest") {
        issue(ctx, { order, code: "R13", path: `${p}.with.post`, pointer: `${wp}/post`, rule: 'only "latest" is supported' });
    }
    if (has(w, "newer_than") && params.includes("newer_than") && !durationOk(w["newer_than"], DURATION_BOUNDS.newer_than)) {
        issue(ctx, {
            order,
            code: "R12",
            path: `${p}.with.newer_than`,
            pointer: `${wp}/newer_than`,
            rule: durationRule(DURATION_BOUNDS.newer_than),
            token: durationHint(DURATION_BOUNDS.newer_than),
        });
    }
    if (has(w, "reaction") && params.includes("reaction") && !(REACTIONS as readonly unknown[]).includes(w["reaction"])) {
        issue(ctx, { order, code: "R13", path: `${p}.with.reaction`, pointer: `${wp}/reaction`, rule: `must be one of ${REACTIONS.join(", ")}` });
    }
    if (has(w, "withdraw_after") && params.includes("withdraw_after") && !durationOk(w["withdraw_after"], DURATION_BOUNDS.withdraw_after)) {
        issue(ctx, { order, code: "R21", path: `${p}.with.withdraw_after`, pointer: `${wp}/withdraw_after`, rule: durationRule(DURATION_BOUNDS.withdraw_after) });
    }
    if (!messaging)
        return;
    const voice = a === "voice.send";
    const textKeys = a === "inmail.send" ? ["subject", "text"] : voice ? ["clip_id"] : ["text"];
    const checkField = (path: string, pointer: string, parent: string, value: unknown, limit: number): string | null => voice ? checkClipId(ctx, order, path, pointer, parent, value) : checkText(ctx, order, path, pointer, parent, value, limit);
    const withTextKeys = a === "invite.send" ? ["note"] : textKeys;
    const variants = hasVariants ? raw["variants"] : undefined;
    if (hasVariants && withTextKeys.some((k) => has(w, k) && w[k] !== null)) {
        issue(ctx, { order, code: "R23", path: `${p}.variants`, pointer: vptr, rule: `use either variants or with.${withTextKeys.join(" and with.")}, not both` });
    }
    const limitOf = (field: string): number => a === "message.send" || voice
        ? TEXT_LIMITS.message
        : a === "post.comment"
            ? TEXT_LIMITS.comment
            : a === "invite.send"
                ? TEXT_LIMITS.invite_note
                : field === "subject"
                    ? TEXT_LIMITS.inmail_subject
                    : TEXT_LIMITS.inmail_text;
    const texts: {
        path: string;
        pointer: string;
        field: string;
        value: string;
    }[] = [];
    if (hasVariants) {
        const n = Array.isArray(variants) ? variants.length : null;
        if (n !== null && n > MAX_VARIANTS && n <= MAX_VARIANTS_DEPRECATED) {
            warning(ctx, { order, code: "W13", path: `${p}.variants`, pointer: vptr, rule: `${n} variants; A/B takes exactly ${MAX_VARIANTS}${UNTIL}`, token: `${MAX_VARIANTS} variants` });
        }
        else if (n === null || n < MIN_VARIANTS || n > MAX_VARIANTS) {
            issue(ctx, {
                order,
                code: "R23",
                path: `${p}.variants`,
                pointer: vptr,
                rule: `needs exactly ${MAX_VARIANTS} variants (A/B)${n === null ? "" : `; found ${n}`}`,
            });
        }
        (Array.isArray(variants) ? variants : []).forEach((v, j) => {
            let vp = `${p}.variants[${j}]`;
            const vptrJ = `${vptr}/${j}`;
            if (!isObject(v)) {
                issue(ctx, { order, code: "R23", path: vp, pointer: vptrJ, rule: "a variant is a JSON object" });
                return;
            }
            const vid = v["id"];
            const idAt = { order, code: "R23", path: `${vp}.id`, pointer: has(v, "id") ? `${vptrJ}/id` : vptrJ };
            if (typeof vid !== "string" || !ID_RE.test(vid)) {
                issue(ctx, { ...idAt, rule: `must match ${ID_PATTERN}` });
            }
            else if (vid === END) {
                issue(ctx, { ...idAt, rule: '"end" is reserved' });
            }
            else if (usedIds.has(vid)) {
                issue(ctx, { ...idAt, rule: `${vid} is already a step or variant id` });
            }
            else {
                usedIds.add(vid);
                vp = `${p}.variants.${vid}`;
            }
            for (const k of keysOf(v)) {
                if (k !== "id" && !textKeys.includes(k)) {
                    issue(ctx, { order, code: "R23", path: `${vp}.${quote(k)}`, pointer: `${vptrJ}${jsonPointer(k)}`, rule: `unknown key; a variant holds id and ${textKeys.join(" and ")}` });
                }
            }
            for (const field of textKeys) {
                const value = checkField(`${vp}.${field}`, `${vptrJ}/${field}`, vptrJ, v[field], limitOf(field));
                if (value !== null)
                    texts.push({ path: `${vp}.${field}`, pointer: `${vptrJ}/${field}`, field, value });
            }
        });
    }
    else {
        for (const field of withTextKeys) {
            const fp = `${wp}/${field}`;
            if (a === "invite.send") {
                if (has(w, "note") && w["note"] !== null) {
                    const value = checkText(ctx, order, `${p}.with.note`, fp, withParent, w["note"], limitOf(field));
                    if (value !== null)
                        texts.push({ path: `${p}.with.note`, pointer: fp, field, value });
                }
            }
            else if (!has(w, field)) {
                issue(ctx, { order, code: "R13", path: `${p}.with.${field}`, pointer: withParent, rule: "required, or use variants" });
            }
            else {
                const value = checkField(`${p}.with.${field}`, fp, withParent, w[field], limitOf(field));
                if (value !== null)
                    texts.push({ path: `${p}.with.${field}`, pointer: fp, field, value });
            }
        }
    }
    if (a === "post.comment") {
        for (const t of texts) {
            const contactVars = variablesIn(t.value)
                .filter((v) => isKnownVariable(v.inner))
                .map((v) => longVariable(v.inner)!)
                .filter((l) => l.startsWith("contact."));
            if (contactVars.length === 0) {
                issue(ctx, { order, code: "R20", path: t.path, pointer: t.pointer, rule: "a comment must use a contact variable, such as {{contact.extra.comment}}" });
            }
            else if (contactVars.every((l) => (NAME_FIELDS as readonly string[]).includes(l.slice(8)))) {
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
    const usesVariable = texts.some((t) => hasVariable(t.value));
    if (a === "invite.send") {
        const fp = `${p}.with.note_fallback`;
        if (has(w, "note_fallback")) {
            checkFallbackText(ctx, order, fp, `${wp}/note_fallback`, withParent, w["note_fallback"], TEXT_LIMITS.invite_note, fallbackKeyword(a) ?? undefined);
        }
        else if (usesVariable) {
            issue(ctx, { order, code: "R19", path: fp, pointer: withParent, rule: 'required because the note uses a variable: text, or "drop"' });
        }
    }
    else if (a === "inmail.send") {
        const fp = `${p}.with.fallback`;
        const fptr = `${wp}/fallback`;
        if (has(w, "fallback")) {
            const f = w["fallback"];
            if (!isObject(f)) {
                issue(ctx, { order, code: "R19", path: fp, pointer: fptr, rule: "must be an object with subject and text" });
            }
            else {
                for (const k of keysOf(f)) {
                    if (k !== "subject" && k !== "text") {
                        issue(ctx, { order, code: "R19", path: `${fp}.${quote(k)}`, pointer: `${fptr}${jsonPointer(k)}`, rule: "unknown key; a fallback holds subject and text" });
                    }
                }
                checkFallbackText(ctx, order, `${fp}.subject`, `${fptr}/subject`, fptr, f["subject"], TEXT_LIMITS.inmail_subject);
                checkFallbackText(ctx, order, `${fp}.text`, `${fptr}/text`, fptr, f["text"], TEXT_LIMITS.inmail_text);
            }
        }
        else if (usesVariable) {
            issue(ctx, { order, code: "R19", path: fp, pointer: withParent, rule: "required because the subject or text uses a variable: an object with subject and text" });
        }
    }
    else {
        const fp = `${p}.with.fallback`;
        const comment = a === "post.comment";
        if (has(w, "fallback"))
            checkFallbackText(ctx, order, fp, `${wp}/fallback`, withParent, w["fallback"], limitOf("text"), fallbackKeyword(a) ?? undefined);
        else if (comment)
            issue(ctx, { order, code: "R19", path: fp, pointer: withParent, rule: 'required on a comment: text, or "skip"' });
        else if (voice)
            issue(ctx, { order, code: "R19", path: fp, pointer: withParent, rule: "required on a voice note: variable-free text sent when the audio cannot go" });
        else if (usesVariable)
            issue(ctx, { order, code: "R19", path: fp, pointer: withParent, rule: "required because the text uses a variable" });
    }
}
function checkPredicate(pred: unknown, path: string, pointer: string, inWhere: boolean, out: Issue[], order = 0, nested = false, ctx?: Ctx): void {
    const push = (rule: string, code = "R15") => out.push({ order, code, path, pointer, rule });
    if (!nested && deeperThan(pred, MAX_PREDICATE_DEPTH)) {
        push(`a predicate nests at most ${MAX_PREDICATE_DEPTH} levels`);
        return;
    }
    if (!isObject(pred) || keysOf(pred).length !== 1) {
        push("a predicate is an object with exactly one key");
        return;
    }
    const key = keysOf(pred)[0]!;
    const v = pred[key];
    if (key === "not") {
        if (nested)
            push("not cannot wrap another not");
        else
            checkPredicate(v, `${path}.not`, `${pointer}/not`, inWhere, out, order, true, ctx);
        return;
    }
    if (key.startsWith("account.")) {
        if (inWhere)
            push("account.* predicates are not allowed in where");
        else if (key !== "account.premium")
            push(`unknown predicate ${quote(key)}`);
        else if (typeof v !== "boolean")
            push("account.premium takes true or false");
        return;
    }
    if (key.startsWith("message.")) {
        if (inWhere)
            push("message.* predicates are not allowed in where");
        else if (key !== "message.seen")
            push(`unknown predicate ${quote(key)}`);
        else if (typeof v !== "boolean")
            push("message.seen takes true or false");
        return;
    }
    if ((BOOLEAN_PREDICATES as readonly string[]).includes(key)) {
        if (typeof v !== "boolean")
            push(`${key} takes true or false`);
        return;
    }
    switch (key) {
        case "contact.degree": {
            const deg = (n: unknown) => n === 1 || n === 2 || n === 3;
            const ok = isObject(v) &&
                keysOf(v).length === 1 &&
                ((has(v, "eq") && deg(v["eq"])) || (has(v, "in") && Array.isArray(v["in"]) && v["in"].length > 0 && v["in"].every(deg)));
            if (!ok)
                push('contact.degree takes {"eq": n} or {"in": [n, ...]}, n being 1, 2 or 3');
            return;
        }
        case "contact.connections_gte":
            if (!Number.isInteger(v) || (v as number) < 0)
                push("contact.connections_gte takes an integer of 0 or more");
            return;
        case "contact.posted_within":
            if (typeof v !== "string" || !DURATION_RE.test(v))
                push("contact.posted_within takes a duration like 14d");
            return;
        case "contact.tag":
            if (!tagOk(v))
                push("contact.tag takes a Tag name of 1 to 64 characters, without , or ;");
            return;
    }
    const enrollmentKey = key.startsWith("enrollment.") ? key.slice("enrollment.".length) : null;
    if (enrollmentKey !== null && inWhere) {
        push("enrollment.* predicates are not allowed in where");
        return;
    }
    const field = enrollmentKey !== null
        ? true
        : key.startsWith("contact.extra.")
            ? EXTRA_KEY_RE.test(key.slice(14))
            : key.startsWith("contact.") && (STANDARD_FIELDS as readonly string[]).includes(key.slice(8));
    if (!field) {
        push(`unknown predicate ${quote(key)}`);
        return;
    }
    const scalar = (x: unknown) => typeof x === "string" || typeof x === "number" || typeof x === "boolean";
    const op = isObject(v) && keysOf(v).length === 1 ? keysOf(v)[0]! : null;
    const operand = op === null ? undefined : (v as Record<string, unknown>)[op];
    if (enrollmentKey !== null && ctx)
        enrollmentRef(ctx, { order, path, pointer }, quote(key), enrollmentKey, (k) => k);
    if (op !== null && (NUMBER_OPERATORS as readonly string[]).includes(op)) {
        if (enrollmentKey === null && !key.startsWith("contact.extra."))
            push(`${op} compares numbers on enrollment.<key> and contact.extra.<key> only`, "R28");
        else if (typeof operand !== "number" || !Number.isFinite(operand))
            push(`${op} takes a number, like {"${op}": 50}`, "R28");
        else if (enrollmentKey !== null && ctx) {
            for (const sv of ctx.values.saved.get(enrollmentKey) ?? []) {
                const type = sampleType(ctx, sv.event, sv.path);
                if (type === "boolean" || type === "object" || type === "array") {
                    push(`${quote(key)} is saved from ${quote(sv.path)}, a ${type} in the sample of event ${sv.event}; ${op} compares numbers`, "R29");
                    break;
                }
            }
        }
        return;
    }
    const ok = op !== null &&
        (FIELD_OPERATORS as readonly string[]).includes(op) &&
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
    const exitPtr = (i: number, e: Edge) => (e.fallThrough ? infos[i]!.ptr : `${infos[i]!.ptr}/${e.field}`);
    const graphIssues: Issue[] = [];
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
    const roots = [0, ...(onReply === END ? [] : [ids.get(onReply)!])];
    const seen = new Set<number>();
    const queue = [...roots];
    while (queue.length) {
        const i = queue.shift()!;
        if (seen.has(i))
            continue;
        seen.add(i);
        for (const e of edges[i]!)
            if (typeof e.to === "number")
                queue.push(e.to);
    }
    infos.forEach((info, i) => {
        if (!seen.has(i)) {
            graphIssues.push({ order: i, code: "R9", path: info.prefix, pointer: info.ptr, rule: "unreachable: no path leads here from the first step or from on_reply" });
        }
    });
    const state = new Array<0 | 1 | 2>(n).fill(0);
    const stack: number[] = [];
    const dfs = (i: number): void => {
        state[i] = 1;
        stack.push(i);
        for (const e of edges[i]!) {
            if (typeof e.to !== "number")
                continue;
            if (state[e.to] === 1) {
                const rule = `cycle: ${[...stack.slice(stack.indexOf(e.to)), e.to].map((k) => infos[k]!.prefix).join(" -> ")}`;
                if (!graphIssues.some((x) => x.rule === rule)) {
                    graphIssues.push({ order: i, code: "R8", path: `${infos[i]!.prefix}.${e.field}`, pointer: exitPtr(i, e), rule });
                }
            }
            else if (state[e.to] === 0) {
                dfs(e.to);
            }
        }
        stack.pop();
        state[i] = 2;
    };
    for (const r of roots)
        if (state[r] === 0)
            dfs(r);
    ctx.issues.push(...graphIssues);
    if (graphIssues.length)
        return;
    const preds: {
        from: number;
        edge: Edge;
    }[][] = infos.map(() => []);
    edges.forEach((es, i) => es.forEach((e) => typeof e.to === "number" && preds[e.to]!.push({ from: i, edge: e })));
    const action = (i: number) => infos[i]!.raw!["do"];
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
    const order = topo(n, edges, roots);
    const afterInvite = new Array<boolean>(n).fill(false);
    const withoutInvite = new Array<boolean>(n).fill(false);
    const withoutMessage = new Array<boolean>(n).fill(false);
    const fromFirst = new Set<number>(topo(n, edges, [0]));
    for (const r of roots)
        if (r === 0 || !fromFirst.has(r))
            withoutInvite[r] = withoutMessage[r] = true;
    for (const i of order) {
        for (const { from, edge } of preds[i]!) {
            const invited = action(from) === "invite.send" && edge.field === "next";
            if (afterInvite[from] || invited)
                afterInvite[i] = true;
            if (withoutInvite[from] && !invited)
                withoutInvite[i] = true;
            const messaged = isMessageSend(action(from)) && edge.field === "next";
            if (withoutMessage[from] && !messaged)
                withoutMessage[i] = true;
        }
    }
    infos.forEach((info, i) => {
        if (!seen.has(i))
            return;
        if (action(i) === "profile.follow" && afterInvite[i]) {
            warning(ctx, {
                order: i,
                code: "W5",
                path: `${info.prefix}.do`,
                pointer: `${info.ptr}/do`,
                rule: "profile.follow after invite.send on the same path; an invitation already follows",
            });
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
    const flagged = new Set<number>();
    infos.forEach((info, i) => {
        if (info.raw!["until"] !== "invite.accepted")
            return;
        const start = edges[i]![0]!.to;
        const visited = new Set<number>();
        const q = typeof start === "number" ? [start] : [];
        while (q.length) {
            const k = q.shift()!;
            if (visited.has(k))
                continue;
            visited.add(k);
            if (action(k) === "message.send") {
                if (!flagged.has(k)) {
                    flagged.add(k);
                    const link = messageTexts(infos[k]!).find((t) => t.value.includes("http"));
                    if (link) {
                        warning(ctx, { order: k, code: "W8", path: link.path, pointer: link.pointer, rule: "a link in the first message after the invitation is accepted" });
                    }
                }
                continue;
            }
            for (const e of edges[k]!)
                if (typeof e.to === "number")
                    q.push(e.to);
        }
    });
}
function messageTexts(info: StepInfo): {
    path: string;
    pointer: string;
    value: string;
}[] {
    const raw = info.raw!;
    const w = isObject(raw["with"]) ? raw["with"] : {};
    const out: {
        path: string;
        pointer: string;
        value: string;
    }[] = [];
    if (Array.isArray(raw["variants"])) {
        raw["variants"].forEach((v, j) => {
            if (isObject(v) && typeof v["text"] === "string") {
                const id = typeof v["id"] === "string" ? `variants.${v["id"]}` : `variants[${j}]`;
                out.push({ path: `${info.prefix}.${id}.text`, pointer: `${info.ptr}/variants/${j}/text`, value: v["text"] });
            }
        });
    }
    if (typeof w["text"] === "string")
        out.push({ path: `${info.prefix}.with.text`, pointer: `${info.ptr}/with/text`, value: w["text"] });
    if (typeof w["fallback"] === "string")
        out.push({ path: `${info.prefix}.with.fallback`, pointer: `${info.ptr}/with/fallback`, value: w["fallback"] });
    return out;
}
function topo(n: number, edges: Edge[][], roots: number[]): number[] {
    const out: number[] = [];
    const done = new Array<boolean>(n).fill(false);
    const visit = (i: number) => {
        if (done[i])
            return;
        done[i] = true;
        for (const e of edges[i]!)
            if (typeof e.to === "number")
                visit(e.to);
        out.push(i);
    };
    roots.forEach(visit);
    return out.reverse();
}
