// Vendored from the API by scripts/vendor-shared.mjs. Do not edit: change the API and re-run.
export const PATH_MAX = 256;
export const SHAPE_MAX_PATHS = 200;
export const SHAPE_KEY_MAX = 64;
export const EVENT_NAME_RE = /^[a-z][a-z0-9_.]{0,63}$/;
type Seg = string | number;
const PLAIN = /^[A-Za-z0-9_$-]+$/;
export function parsePath(input: string): Seg[] | null {
    const s = input.trim();
    const out: Seg[] = [];
    let i = 0;
    const key = () => {
        const m = /^[A-Za-z0-9_$-]+/.exec(s.slice(i));
        if (!m)
            return false;
        out.push(m[0]);
        i += m[0].length;
        return true;
    };
    if (s === "" || (s[0] !== "[" && !key()))
        return null;
    while (i < s.length) {
        if (s[i] === ".") {
            i += 1;
            if (!key())
                return null;
        }
        else if (s[i] === "[") {
            const idx = /^\[(\d{1,6})\]/.exec(s.slice(i));
            const str = /^\[("(?:[^"\\]|\\.)*")\]/.exec(s.slice(i));
            if (idx) {
                out.push(Number(idx[1]));
                i += idx[0].length;
            }
            else if (str) {
                try {
                    out.push(JSON.parse(str[1]!) as string);
                }
                catch {
                    return null;
                }
                i += str[0].length;
            }
            else
                return null;
        }
        else
            return null;
    }
    return out;
}
export function formatPath(segs: readonly Seg[]): string {
    return segs
        .map((g, n) => (typeof g === "number" ? `[${g}]` : PLAIN.test(g) ? (n === 0 ? g : `.${g}`) : `[${JSON.stringify(g)}]`))
        .join("");
}
export function normalizePath(input: string): string | null {
    const segs = parsePath(input);
    if (segs === null)
        return null;
    const p = formatPath(segs);
    return p.length > PATH_MAX ? null : p;
}
export function resolvePath(root: unknown, path: string): unknown {
    const segs = parsePath(path);
    if (segs === null)
        return undefined;
    let cur: unknown = root;
    for (const g of segs) {
        if (typeof g === "number") {
            if (!Array.isArray(cur))
                return undefined;
            cur = cur[g];
        }
        else {
            if (cur === null || typeof cur !== "object" || Array.isArray(cur) || !Object.prototype.hasOwnProperty.call(cur, g))
                return undefined;
            cur = (cur as Record<string, unknown>)[g];
        }
    }
    return cur;
}
export function stringAt(root: unknown, path: string | null): string | null {
    if (path === null)
        return null;
    const v = resolvePath(root, path);
    return typeof v === "string" && v.trim() !== "" ? v.trim() : null;
}
export function eventNameAt(root: unknown, path: string): string | null {
    const v = stringAt(root, path)?.toLowerCase() ?? null;
    return v !== null && EVENT_NAME_RE.test(v) ? v : null;
}
export type ShapeType = "string" | "number" | "boolean" | "null" | "object" | "array";
export interface ShapeField {
    path: string;
    type: ShapeType;
}
const EMAIL_KEY = /^([^\s@])[^\s@]*(@[^\s@]+\.[^\s@]+)$/;
function shapeKey(k: string): string {
    const m = EMAIL_KEY.exec(k);
    return [...(m ? `${m[1]}\u2022\u2022\u2022${m[2]}` : k)].slice(0, SHAPE_KEY_MAX).join("");
}
const typeOf = (v: unknown): ShapeType => (v === null ? "null" : Array.isArray(v) ? "array" : typeof v === "object" ? "object" : typeof v === "number" ? "number" : typeof v === "boolean" ? "boolean" : "string");
export function shapeOf(body: unknown): ShapeField[] {
    const out: ShapeField[] = [];
    const queue: Array<[
        Seg[],
        unknown
    ]> = [];
    const children = (segs: Seg[], v: unknown) => {
        if (Array.isArray(v)) {
            if (v.length > 0)
                queue.push([[...segs, 0], v[0]]);
        }
        else if (v !== null && typeof v === "object") {
            for (const [k, c] of Object.entries(v))
                queue.push([[...segs, shapeKey(k)], c]);
        }
    };
    children([], body);
    while (queue.length > 0 && out.length < SHAPE_MAX_PATHS) {
        const [segs, v] = queue.shift()!;
        const path = formatPath(segs);
        if (path.length <= PATH_MAX)
            out.push({ path, type: typeOf(v) });
        children(segs, v);
    }
    return out;
}
