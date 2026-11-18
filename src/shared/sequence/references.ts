// Vendored from the API by scripts/vendor-shared.mjs. Do not edit: change the API and re-run.
import { CAMPAIGN_ATTACHMENT_ID_RE, VOICE_CLIP_ID_RE, isObject } from "./limits.js";
type Json = Record<string, unknown>;
function steps(doc: unknown): Json[] {
    const s = isObject(doc) ? doc["steps"] : undefined;
    return Array.isArray(s) ? s.filter(isObject) : [];
}
function predicateTag(pred: unknown): string | null {
    if (!isObject(pred))
        return null;
    const inner = isObject(pred["not"]) ? pred["not"] : pred;
    const tag = inner["lead.tag"];
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
export function awaitedCustomEvents(doc: unknown): string[] {
    const names = steps(doc).flatMap((s) => {
        const n = awaitedEventName(s["until"]);
        return n === null ? [] : [n];
    });
    return [...new Set(names)];
}
export function voiceClipRefs(doc: unknown): Array<{
    clipId: string;
    path: string;
    pointer: string;
}> {
    const out: Array<{
        clipId: string;
        path: string;
        pointer: string;
    }> = [];
    const add = (v: unknown, path: string, pointer: string) => {
        if (typeof v === "string" && VOICE_CLIP_ID_RE.test(v))
            out.push({ clipId: v, path, pointer });
    };
    steps(doc).forEach((s, i) => {
        if (s["do"] !== "voice.send")
            return;
        if (isObject(s["with"]))
            add(s["with"]["clip_id"], `${String(s["id"])}.with.clip_id`, `/steps/${i}/with/clip_id`);
        if (Array.isArray(s["variants"])) {
            s["variants"].forEach((v: unknown, j: number) => {
                if (isObject(v))
                    add(v["clip_id"], `${String(s["id"])}.variants.${String(v["id"])}.clip_id`, `/steps/${i}/variants/${j}/clip_id`);
            });
        }
    });
    return out;
}
export function attachmentRefs(doc: unknown): Array<{
    step: string;
    variant: string | null;
    ids: string[];
    path: string;
    pointer: string;
}> {
    const out: Array<{
        step: string;
        variant: string | null;
        ids: string[];
        path: string;
        pointer: string;
    }> = [];
    const add = (v: unknown, step: string, variant: string | null, path: string, pointer: string) => {
        if (!Array.isArray(v))
            return;
        const ids = [...new Set(v.filter((x): x is string => typeof x === "string" && CAMPAIGN_ATTACHMENT_ID_RE.test(x)))];
        if (ids.length > 0)
            out.push({ step, variant, ids, path, pointer });
    };
    steps(doc).forEach((s, i) => {
        if (s["do"] !== "email.send")
            return;
        const id = String(s["id"]);
        if (Array.isArray(s["variants"])) {
            s["variants"].forEach((v: unknown, j: number) => {
                if (isObject(v))
                    add(v["attachment_ids"], id, String(v["id"]), `${id}.variants.${String(v["id"])}.attachment_ids`, `/steps/${i}/variants/${j}/attachment_ids`);
            });
        }
        else if (isObject(s["with"]))
            add(s["with"]["attachment_ids"], id, null, `${id}.with.attachment_ids`, `/steps/${i}/with/attachment_ids`);
    });
    return out;
}
export function sequenceStepIds(doc: unknown): string[] {
    return steps(doc).flatMap((s) => (typeof s["id"] === "string" ? [s["id"]] : []));
}
