// Vendored from the API by scripts/vendor-shared.mjs. Do not edit: change the API and re-run.
import { END, isObject } from "./limits.js";
type Obj = Record<string, unknown>;
const str = (v: unknown): string | null => (typeof v === "string" ? v : null);
interface Exit {
    label: string | null;
    to: string;
}
interface Node {
    step: Obj;
    exits: Exit[];
}
function graphOf(doc: unknown): {
    nodes: Map<string, Node>;
    first: string | null;
    onReply: string | null;
} {
    const nodes = new Map<string, Node>();
    const doc_ = isObject(doc) ? doc : {};
    const steps = Array.isArray(doc_.steps) ? doc_.steps : [];
    const ids = steps.map((s) => (isObject(s) ? str(s.id) : null));
    steps.forEach((s, i) => {
        const id = ids[i] ?? null;
        if (!isObject(s) || id === null || nodes.has(id))
            return;
        const fall = ids[i + 1] ?? END;
        const next = str(s.next) ?? fall;
        const exits: Exit[] = [];
        if (s.if !== undefined || s.until !== undefined) {
            exits.push({ label: "then", to: str(s.then) ?? END }, { label: "else", to: str(s.else) ?? fall });
        }
        else if (s.do !== undefined && s.else !== undefined) {
            exits.push({ label: null, to: next }, { label: "else", to: str(s.else) ?? END });
        }
        else {
            exits.push({ label: null, to: next });
        }
        nodes.set(id, { step: s, exits });
    });
    const first = ids.find((i): i is string => i !== null) ?? null;
    return { nodes, first, onReply: doc_.on_reply === undefined ? null : str(doc_.on_reply) };
}
export interface RouteList {
    paths: string[][];
    truncated: boolean;
}
export function enumerateRoutes(doc: unknown, max: number): RouteList {
    const { nodes, first, onReply } = graphOf(doc);
    const seen = new Set<string>();
    const paths: string[][] = [];
    let truncated = false;
    const walk = (at: string, trail: string[], onTrail: Set<string>): void => {
        if (truncated)
            return;
        const node = at === END ? undefined : nodes.get(at);
        if (at === END || node === undefined || onTrail.has(at)) {
            const route = [...trail, END];
            const key = route.join(" ");
            if (seen.has(key))
                return;
            if (paths.length >= max) {
                truncated = true;
                return;
            }
            seen.add(key);
            paths.push(route);
            return;
        }
        onTrail.add(at);
        for (const x of node.exits)
            walk(x.to, [...trail, x.label === null ? at : `${at}:${x.label}`], onTrail);
        onTrail.delete(at);
    };
    for (const root of [first, onReply])
        if (root !== null)
            walk(root, [], new Set());
    return { paths, truncated };
}
export function replyRouteActs(doc: unknown): boolean {
    const { nodes, onReply } = graphOf(doc);
    const todo = [...(onReply === null ? [] : [onReply])];
    for (const n of nodes.values())
        if (n.step.until === "message.replied")
            todo.push(str(n.step.then) ?? END);
    const seen = new Set<string>();
    for (let at = todo.pop(); at !== undefined; at = todo.pop()) {
        const node = nodes.get(at);
        if (at === END || node === undefined || seen.has(at))
            continue;
        if (node.step.do !== undefined)
            return true;
        seen.add(at);
        todo.push(...node.exits.map((x) => x.to));
    }
    return false;
}
export function durationMinutes(v: unknown): number {
    const m = typeof v === "string" ? /^([1-9][0-9]*)(m|h|d)$/.exec(v) : null;
    if (!m)
        return 0;
    return Number(m[1]) * { m: 1, h: 60, d: 1440 }[m[2] as "m" | "h" | "d"];
}
export interface RouteCosts {
    longestMinutes: number;
    perKey: Map<string, number>;
}
export function routeCosts(doc: unknown, weigh: (step: Obj) => string | null): RouteCosts {
    const { nodes, first } = graphOf(doc);
    const memo = new Map<string, {
        minutes: number;
        counts: Map<string, number>;
    }>();
    const visit = (at: string, onTrail: Set<string>): {
        minutes: number;
        counts: Map<string, number>;
    } => {
        const node = at === END ? undefined : nodes.get(at);
        if (node === undefined || onTrail.has(at))
            return { minutes: 0, counts: new Map() };
        const done = memo.get(at);
        if (done)
            return done;
        onTrail.add(at);
        let minutes = 0;
        const counts = new Map<string, number>();
        for (const x of node.exits) {
            const r = visit(x.to, onTrail);
            minutes = Math.max(minutes, r.minutes);
            for (const [k, c] of r.counts)
                counts.set(k, Math.max(counts.get(k) ?? 0, c));
        }
        onTrail.delete(at);
        const own = node.step.wait !== undefined ? durationMinutes(node.step.wait) : node.step.until !== undefined ? durationMinutes(node.step.timeout) : 0;
        const key = weigh(node.step);
        if (key !== null)
            counts.set(key, (counts.get(key) ?? 0) + 1);
        const out = { minutes: minutes + own, counts };
        memo.set(at, out);
        return out;
    };
    const r = first === null ? { minutes: 0, counts: new Map<string, number>() } : visit(first, new Set());
    return { longestMinutes: r.minutes, perKey: r.counts };
}
