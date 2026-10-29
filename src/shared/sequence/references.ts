// Vendored from the API by scripts/vendor-shared.mjs. Do not edit: change the API and re-run.
import { isObject } from "./limits.js";
type Json = Record<string, unknown>;
function steps(doc: unknown): Json[] {
    const s = isObject(doc) ? doc["steps"] : undefined;
    return Array.isArray(s) ? s.filter(isObject) : [];
}
function predicateTag(pred: unknown): string | null {
    if (!isObject(pred))
        return null;
    const inner = isObject(pred["not"]) ? pred["not"] : pred;
    const tag = inner["contact.tag"];
    return typeof tag === "string" ? tag : null;
}
export function referencedTags(doc: unknown, where: unknown): string[] {
    const names = [
        ...steps(doc).flatMap((s) => [typeof s["tag"] === "string" ? s["tag"] : null, predicateTag(s["if"])]),
        ...(Array.isArray(where) ? where.map(predicateTag) : []),
    ];
    return [...new Set(names.filter((n): n is string => n !== null).map((n) => n.trim().toLowerCase()))];
}
export function awaitedEventName(until: unknown): string | null {
    const m = typeof until === "string" ? /^(?:event|signal)\.(.+)$/s.exec(until) : null;
    return m ? m[1]! : null;
}
export function awaitedSignals(doc: unknown): string[] {
    const names = steps(doc).flatMap((s) => {
        const n = awaitedEventName(s["until"]);
        return n === null ? [] : [n];
    });
    return [...new Set(names)];
}
export function sequenceStepIds(doc: unknown): string[] {
    return steps(doc).flatMap((s) => (typeof s["id"] === "string" ? [s["id"]] : []));
}
