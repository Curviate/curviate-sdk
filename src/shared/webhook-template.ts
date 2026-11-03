// Vendored from the API by scripts/vendor-shared.mjs. Do not edit: change the API and re-run.
import { STANDARD_FIELDS } from "./sequence/limits.js";
import { distance } from "./sequence/validate.js";
export const MAX_TEMPLATE_BYTES = 16384;
export const MAX_TEMPLATE_REFERENCES = 200;
export const BODY_TEMPLATES_DOCS_URL = "https://docs.curviate.com/reference/webhooks/body-templates";
export type TemplateRuleCode = "T1" | "T2" | "T3" | "T4" | "T5" | "T6" | "T7" | "T8" | "T9" | "T10" | "TW1";
export interface TemplateFinding {
    path: "body_template";
    rule: string;
    code: TemplateRuleCode;
    message: string;
    pointer: "/body_template";
    line: number;
    col: number;
    hint: string;
    docs_url: string;
    severity: "error" | "warning";
    candidates?: string[];
}
const RULES: Record<TemplateRuleCode, {
    title: string;
    hint: (token: string) => string;
}> = {
    T1: { title: "Empty template", hint: () => "Send null for the standard payload, or write the JSON body your tool expects." },
    T2: {
        title: "Not valid JSON",
        hint: (t) => (t ? `Remove the trailing comma before ${t}.` : "Write the template as JSON: double-quoted keys and strings, commas between members, nothing after the last value."),
    },
    T3: { title: "Variable never closed", hint: () => "Close the variable with }}, like {{contact.email}}." },
    T4: { title: "Variable outside a string", hint: (t) => `Put the variable inside a JSON string: "${t}" keeps the value's type.` },
    T5: { title: "Variable in a key", hint: (t) => `Use a fixed key and put the variable in the value, like ${t}.` },
    T6: { title: "Unknown variable", hint: (t) => (t ? `Use ${t}.` : "Use a variable this source carries: GET /v1/webhooks/variables?source=<source> lists them.") },
    T7: { title: "enrollment.id is reserved", hint: () => "Use {{enrollment_id}} for the Enrollment's id." },
    T8: { title: "No defaults or filters", hint: () => "Remove the part after |: a template has no defaults or filters, and a missing value drops its key." },
    T9: { title: "Single-brace placeholder", hint: (t) => `Write the variable with double braces, like ${t}.` },
    T10: { title: "Template size", hint: () => `Keep the template to ${MAX_TEMPLATE_BYTES.toLocaleString("en-US")} bytes and ${MAX_TEMPLATE_REFERENCES} variables.` },
    TW1: { title: "Enrollment value no Sequence saves", hint: (t) => `Save ${t} with save on an until event.<name> step of a Sequence; until one does, it is always missing.` },
};
export const WEBHOOK_TEMPLATE_RULE_CODES: readonly TemplateRuleCode[] = Object.keys(RULES) as TemplateRuleCode[];
export function webhookTemplateRuleDocs(): {
    code: TemplateRuleCode;
    anchor: string;
    title: string;
}[] {
    return WEBHOOK_TEMPLATE_RULE_CODES.map((code) => ({ code, anchor: code.toLowerCase(), title: RULES[code].title }));
}
export type TemplateScope = "event" | "account" | "contact" | "motion" | "enrollment";
const SCOPES_BY_SOURCE: Record<string, readonly TemplateScope[]> = {
    motion: ["event", "account", "contact", "motion", "enrollment"],
    messaging: ["event", "account", "contact", "motion"],
    user: ["event", "account", "contact", "motion"],
    account_status: ["event", "account"],
    post: ["event", "account"],
};
const ACCOUNT_PARTS = ["first_name", "last_name", "full_name"] as const;
const EXTRA_KEY = /^[A-Za-z0-9_]{1,64}$/;
const VALUE_KEY = /^[a-z][a-z0-9_]{0,63}$/;
const FIXED: ReadonlyArray<readonly [
    string,
    TemplateScope
]> = [
    ["event", "event"],
    ["occurred_at", "event"],
    ...ACCOUNT_PARTS.map((p) => [`account.${p}`, "account"] as const),
    ...STANDARD_FIELDS.map((f) => [`contact.${f}`, "contact"] as const),
    ["motion.id", "motion"],
    ["motion.name", "motion"],
    ["enrollment_id", "motion"],
    ["step_id", "enrollment"],
];
const SCOPE_OF = new Map<string, TemplateScope>(FIXED);
const SHORT = new Map<string, string>([...STANDARD_FIELDS.map((f) => [f, `contact.${f}`] as const), ...ACCOUNT_PARTS.map((p) => [`my_${p}`, `account.${p}`] as const)]);
type Resolved = {
    ok: true;
    name: string;
    scope: TemplateScope;
} | {
    ok: false;
    code: "T6" | "T7" | "T8";
    rule: string;
    token?: string;
    candidates?: string[];
};
function resolve(inner: string): Resolved {
    const raw = inner.trim();
    if (raw.includes("|"))
        return { ok: false, code: "T8", rule: `{{${raw.slice(0, raw.indexOf("|")).trim()} | \u2026}} carries a default or a filter` };
    const name = SHORT.get(raw) ?? raw;
    if (name === "enrollment.id")
        return { ok: false, code: "T7", rule: "{{enrollment.id}} is reserved", token: "{{enrollment_id}}", candidates: ["{{enrollment_id}}"] };
    const fixed = SCOPE_OF.get(name);
    if (fixed)
        return { ok: true, name, scope: fixed };
    if (name.startsWith("contact.extra.") && EXTRA_KEY.test(name.slice(14)))
        return { ok: true, name, scope: "contact" };
    if (name.startsWith("enrollment.") && VALUE_KEY.test(name.slice(11)))
        return { ok: true, name, scope: "enrollment" };
    return { ok: false, code: "T6", rule: `unknown variable {{${raw}}}` };
}
const scopeOk = (source: string, r: {
    name: string;
    scope: TemplateScope;
}) => (SCOPES_BY_SOURCE[source] ?? []).includes(r.scope);
function candidatesFor(source: string, raw: string): string[] {
    const known = [...FIXED.filter(([n, s]) => scopeOk(source, { name: n, scope: s })).map(([n]) => n), ...[...SHORT].filter(([, l]) => scopeOk(source, { name: l, scope: SCOPE_OF.get(l)! })).map(([s]) => s)];
    return known
        .map((n) => [n, distance(raw, n, 3)] as const)
        .filter(([, d]) => d <= 3)
        .sort((a, b) => a[1] - b[1] || (a[0] < b[0] ? -1 : 1))
        .slice(0, 3)
        .map(([n]) => `{{${n}}}`);
}
interface Span {
    start: number;
    end: number;
}
interface Scan {
    strings: Array<Span & {
        key: boolean;
    }>;
    bare: Span[];
    error: {
        at: number;
        code: "T2" | "T3";
        rule: string;
        token?: string;
    } | null;
}
const LITERAL = /-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?|true|false|null/y;
const STRUCTURAL = new Set(["{", "}", "[", "]", ":", ",", '"']);
const what = (c: string | undefined) => (c === undefined ? "the end of the template" : STRUCTURAL.has(c) ? `'${c}'` : "a character that starts no JSON value");
function scan(src: string): Scan {
    const out: Scan = { strings: [], bare: [], error: null };
    const fail = (at: number, rule: string, code: "T2" | "T3" = "T2", token?: string) => ((out.error = { at, code, rule, ...(token ? { token } : {}) }), out);
    const stack: string[] = [];
    let i = 0;
    let expect: "value" | "key" | "next" = "value";
    let opened = false;
    let comma = false;
    const ws = () => {
        while (i < src.length && (src[i] === " " || src[i] === "\t" || src[i] === "\n" || src[i] === "\r"))
            i++;
    };
    const string = (): number | string => {
        let j = i + 1;
        while (j < src.length) {
            const c = src.charCodeAt(j);
            if (c === 34)
                return j + 1;
            if (c === 92) {
                const e = src[j + 1];
                if (e === "u" ? !/^[0-9a-fA-F]{4}$/.test(src.slice(j + 2, j + 6)) : e === undefined || !'"\\/bfnrt'.includes(e))
                    return `invalid escape in a string at line ${lineCol(src, j).line}`;
                j += e === "u" ? 6 : 2;
                continue;
            }
            if (c < 32)
                return "a control character (a raw line break or tab) inside a string; write it as \\n or \\t";
            j++;
        }
        return "a string is never closed";
    };
    for (;;) {
        ws();
        const c = src[i];
        if (expect === "next") {
            const closer = stack.at(-1);
            if (closer === undefined)
                return i < src.length ? fail(i, `unexpected ${what(c)} after the JSON value`) : out;
            if (c === ",") {
                i++;
                comma = true;
                expect = closer === "}" ? "key" : "value";
            }
            else if (c === closer) {
                stack.pop();
                i++;
            }
            else
                return fail(i, `expected ',' or '${closer}', found ${what(c)}`);
            continue;
        }
        if (opened && c === stack.at(-1)) {
            stack.pop();
            i++;
            opened = false;
            expect = "next";
            continue;
        }
        if (comma && (c === "}" || c === "]"))
            return fail(i, `trailing comma before '${c}'`, "T2", `'${c}'`);
        opened = comma = false;
        if (c === undefined)
            return fail(i, "the template ends where a value is expected");
        if (expect === "key") {
            if (c !== '"')
                return fail(i, `expected a double-quoted key, found ${what(c)}`);
            const end = string();
            if (typeof end === "string")
                return fail(i, end);
            out.strings.push({ start: i, end, key: true });
            i = end;
            ws();
            if (src[i] !== ":")
                return fail(i, `expected ':' after a key, found ${what(src[i])}`);
            i++;
            expect = "value";
            continue;
        }
        if (c === "{" && src[i + 1] === "{") {
            const close = src.indexOf("}}", i + 2);
            if (close < 0)
                return fail(i, "{{ is never closed", "T3");
            out.bare.push({ start: i, end: close + 2 });
            i = close + 2;
            expect = "next";
        }
        else if (c === "{" || c === "[") {
            stack.push(c === "{" ? "}" : "]");
            i++;
            opened = true;
            expect = c === "{" ? "key" : "value";
        }
        else if (c === '"') {
            const end = string();
            if (typeof end === "string")
                return fail(i, end);
            out.strings.push({ start: i, end, key: false });
            i = end;
            expect = "next";
        }
        else {
            LITERAL.lastIndex = i;
            const m = LITERAL.exec(src);
            if (!m)
                return fail(i, `unexpected ${what(c)}`);
            i += m[0].length;
            expect = "next";
        }
    }
}
function lineCol(src: string, at: number): {
    line: number;
    col: number;
} {
    let line = 1;
    let start = 0;
    for (let k = src.indexOf("\n"); k !== -1 && k < at; k = src.indexOf("\n", k + 1)) {
        line++;
        start = k + 1;
    }
    return { line, col: at - start + 1 };
}
export interface TemplateLintResult {
    errors: TemplateFinding[];
    warnings: TemplateFinding[];
}
export function lintWebhookTemplate(template: string, opts: {
    source: string;
    saved?: ReadonlySet<string>;
}): TemplateLintResult {
    const found: Array<{
        at: number;
        code: TemplateRuleCode;
        rule: string;
        token?: string;
        candidates?: string[];
    }> = [];
    const finish = (): TemplateLintResult => {
        const all = found
            .map((f, n) => ({ f, n }))
            .sort((a, b) => a.f.at - b.f.at || a.n - b.n)
            .map(({ f }) => entry(template, f));
        return { errors: all.filter((e) => e.severity === "error"), warnings: all.filter((e) => e.severity === "warning") };
    };
    if (template.trim() === "") {
        found.push({ at: 0, code: "T1", rule: "the template is empty; send null for the standard payload" });
        return finish();
    }
    const bytes = new TextEncoder().encode(template).length;
    if (bytes > MAX_TEMPLATE_BYTES) {
        found.push({ at: 0, code: "T10", rule: `the template is ${bytes} bytes; the limit is ${MAX_TEMPLATE_BYTES}` });
        return finish();
    }
    const s = scan(template);
    let refs = 0;
    const counted = (at: number) => {
        refs += 1;
        if (refs === MAX_TEMPLATE_REFERENCES + 1)
            found.push({ at, code: "T10", rule: `the template has more than ${MAX_TEMPLATE_REFERENCES} variables` });
    };
    const judge = (at: number, inner: string) => {
        const r = resolve(inner);
        if (!r.ok) {
            const raw = inner.trim();
            const dotless = r.code === "T6" && !raw.includes(".") && /^[A-Za-z0-9_]+$/.test(raw);
            const extra = dotless && (SCOPES_BY_SOURCE[opts.source] ?? []).includes("contact") ? `{{contact.extra.${raw}}}` : undefined;
            const near = r.code === "T6" ? candidatesFor(opts.source, raw) : (r.candidates ?? []);
            const candidates = extra ? [extra, ...near.filter((c) => c !== extra)] : near;
            found.push({ at, code: r.code, rule: r.rule, ...(r.token ?? extra ?? candidates[0] ? { token: r.token ?? extra ?? candidates[0] } : {}), ...(candidates.length ? { candidates } : {}) });
            return;
        }
        if (!scopeOk(opts.source, r)) {
            found.push({ at, code: "T6", rule: `{{${inner.trim()}}} is not carried by ${opts.source} events` });
            return;
        }
        const key = r.name.startsWith("enrollment.") ? r.name.slice(11) : null;
        if (key !== null && opts.saved && !opts.saved.has(key))
            found.push({ at, code: "TW1", rule: `{{${r.name}}}: no current Sequence of this Team saves ${key}`, token: key });
    };
    for (const str of s.strings) {
        const raw = template.slice(str.start + 1, str.end - 1);
        const base = str.start + 1;
        for (let from = 0;;) {
            const k = raw.indexOf("{{", from);
            if (k < 0)
                break;
            if (raw[k - 1] === "\\" && raw[k - 2] === "\\") {
                from = k + 2;
                continue;
            }
            const close = raw.indexOf("}}", k + 2);
            if (close < 0) {
                found.push({ at: base + k, code: "T3", rule: "{{ is never closed" });
                break;
            }
            const inner = raw.slice(k + 2, close);
            counted(base + k);
            if (str.key) {
                const leaf = (resolve(inner).ok ? (SHORT.get(inner.trim()) ?? inner.trim()) : inner.trim()).split(".").pop() || "value";
                found.push({ at: base + k, code: "T5", rule: `{{${inner.trim()}}} is in an object key`, token: `"${leaf}": "{{${inner.trim()}}}"` });
            }
            else
                judge(base + k, inner);
            from = close + 2;
        }
        if (!str.key) {
            for (const m of raw.matchAll(/\{([A-Za-z_][A-Za-z0-9_.]*)\}/g)) {
                const k = m.index;
                if (raw[k - 1] === "{" || raw[k + m[0].length] === "}")
                    continue;
                found.push({ at: base + k, code: "T9", rule: `{${m[1]}} is a single-brace placeholder`, token: `{{${m[1]}}}` });
            }
        }
    }
    for (const b of s.bare) {
        const inner = template.slice(b.start + 2, b.end - 2).trim();
        counted(b.start);
        found.push({ at: b.start, code: "T4", rule: `{{${inner}}} is outside a JSON string`, token: `{{${inner}}}` });
    }
    if (s.error)
        found.push({ at: s.error.at, code: s.error.code, rule: s.error.code === "T3" ? s.error.rule : `not valid JSON: ${s.error.rule}`, ...(s.error.token ? { token: s.error.token } : {}) });
    return finish();
}
function entry(src: string, f: {
    at: number;
    code: TemplateRuleCode;
    rule: string;
    token?: string;
    candidates?: string[];
}): TemplateFinding {
    const { line, col } = lineCol(src, f.at);
    return {
        path: "body_template",
        rule: f.rule,
        code: f.code,
        message: f.rule,
        pointer: "/body_template",
        line,
        col,
        hint: RULES[f.code].hint(f.token ?? ""),
        docs_url: `${BODY_TEMPLATES_DOCS_URL}#${f.code.toLowerCase()}`,
        severity: f.code === "TW1" ? "warning" : "error",
        ...(f.candidates?.length ? { candidates: f.candidates } : {}),
    };
}
export function templateReferences(template: string): string[] {
    const out: string[] = [];
    for (const m of template.matchAll(/\{\{([^{}]*)\}\}/g)) {
        if (template[m.index - 1] === "\\" && template[m.index - 2] === "\\")
            continue;
        const r = resolve(m[1]!);
        if (r.ok)
            out.push(r.name);
    }
    return out;
}
export interface TemplateContext {
    event: string;
    occurred_at?: unknown;
    account?: Partial<Record<(typeof ACCOUNT_PARTS)[number], unknown>> | null;
    contact?: Record<string, unknown> | null;
    motion?: {
        id?: unknown;
        name?: unknown;
    } | null;
    enrollment_id?: unknown;
    step_id?: unknown;
    enrollment?: Record<string, unknown> | null;
}
const isObj = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const own = (o: unknown, k: string): unknown => (isObj(o) && Object.hasOwn(o, k) ? o[k] : undefined);
function valueOf(name: string, ctx: TemplateContext): string | number | boolean | undefined {
    const [ns, a, ...rest] = name.split(".");
    let v: unknown;
    if (a === undefined)
        v = own(ctx, ns!);
    else if (ns === "contact" && a === "extra")
        v = own(own(ctx.contact, "extra"), rest.join("."));
    else if (rest.length === 0)
        v = own(ns === "contact" ? ctx.contact : ns === "account" ? ctx.account : ns === "motion" ? ctx.motion : ns === "enrollment" ? ctx.enrollment : undefined, a);
    if (typeof v === "string")
        return v.trim() === "" ? undefined : v;
    if (typeof v === "number")
        return Number.isFinite(v) ? v : undefined;
    return typeof v === "boolean" ? v : undefined;
}
const DROP = Symbol("drop");
const WHOLE = /^\{\{([^{}]*)\}\}$/;
export function renderWebhookTemplate(template: string, ctx: TemplateContext): string {
    const look = (inner: string) => {
        const r = resolve(inner);
        return r.ok ? valueOf(r.name, ctx) : undefined;
    };
    const sub = (v: unknown): unknown => {
        if (typeof v === "string") {
            const whole = WHOLE.exec(v);
            if (whole)
                return look(whole[1]!) ?? DROP;
            return v.replace(/\\\{\{|\{\{([^{}]*)\}\}/g, (m, inner: string | undefined) => (inner === undefined ? "{{" : String(look(inner) ?? "")));
        }
        if (Array.isArray(v))
            return v.map(sub).filter((x) => x !== DROP);
        if (isObj(v)) {
            const o: Record<string, unknown> = {};
            for (const [k, x] of Object.entries(v)) {
                const r = sub(x);
                if (r !== DROP)
                    o[k] = r;
            }
            return o;
        }
        return v;
    };
    const out = sub(JSON.parse(template));
    return JSON.stringify(out === DROP ? null : out);
}
export const TEMPLATE_SAMPLE: Omit<TemplateContext, "event"> = {
    occurred_at: "2026-01-15T09:30:00.000Z",
    account: { first_name: "Sam", last_name: "Rivera", full_name: "Sam Rivera" },
    contact: {
        full_name: "Alex Jordan",
        first_name: "Alex",
        last_name: "Jordan",
        headline: "Head of Operations at Northwind",
        job_title: "Head of Operations",
        company: "Northwind",
        email: "alex.jordan@example.com",
        location: "Berlin, Germany",
        linkedin_url: "https://www.linkedin.com/in/alexjordan",
        about: "Operations lead building calm, repeatable processes.",
        extra: {},
    },
    motion: { id: "mot_01J8Z3K9P0Q1R2S3T4V5W6X7Y8", name: "Q4 founders outreach" },
    enrollment_id: "enr_01J8Z3K9P0Q1R2S3T4V5W6X7Y8",
    step_id: "wait_reply",
    enrollment: {},
};
const SAMPLE_EVENT: Record<string, string> = { motion: "enrollment.finished", messaging: "message.received", user: "connection.accepted", account_status: "account.disconnected", post: "post.published" };
export interface TemplateVariable {
    name: string;
    scope: TemplateScope;
    type: "string" | "string|number|boolean";
    example: string | null;
}
export function webhookTemplateVariables(source: string): TemplateVariable[] {
    const rows: TemplateVariable[] = FIXED.filter(([n, s]) => scopeOk(source, { name: n, scope: s })).map(([name, scope]) => {
        const v = valueOf(name, { event: SAMPLE_EVENT[source] ?? "", ...TEMPLATE_SAMPLE });
        return { name, scope: scope === "enrollment" ? "motion" : scope, type: "string", example: v === undefined ? null : String(v) };
    });
    if (scopeOk(source, { name: "contact.extra.<key>", scope: "contact" }))
        rows.push({ name: "contact.extra.<key>", scope: "contact", type: "string|number|boolean", example: null });
    return rows;
}
