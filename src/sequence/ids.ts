/**
 * The id-from-kind rule the dashboard editor uses, so code and the editor name
 * new steps alike. The API never generates, renames or rewrites an id.
 */
import type { Action } from "./types.js";
import { isObject } from "./vocab.js";

/** A step kind, or the action of a `do` step. */
export type StepIdKind = Action | "wait" | "until" | "if" | "emit" | "tag";

const ID_BASE: Record<StepIdKind, string> = {
  "profile.view": "visit",
  "profile.follow": "follow",
  "profile.unfollow": "unfollow",
  "invite.send": "invite",
  "invite.withdraw": "withdraw",
  "message.send": "message",
  "inmail.send": "inmail",
  "post.react": "like",
  "post.comment": "comment",
  "skill.endorse": "endorse",
  wait: "wait",
  until: "accepted",
  if: "check",
  emit: "event",
  tag: "tag",
};

const MAX_ID = 40;
const idOf = (v: unknown): string | null => (isObject(v) && typeof v["id"] === "string" ? v["id"] : null);
const fit = (stem: string, suffix: string) => stem.slice(0, MAX_ID - suffix.length) + suffix;

/**
 * The id a new step of `kind` gets in `doc`: the first free one in its kind's
 * series (`message`, `message_2`, ...), free of every step and variant id; a
 * `wait` placed before step `beforeId` is `w_<beforeId>`. At most 40
 * characters. Pure: reads `doc`, never changes it.
 *
 * @example
 * import { newStepId } from "@curviate/sdk";
 *
 * const doc = { on_reply: "end", steps: [{ id: "message", do: "message.send", with: { text: "Hi" }, next: "end" }] };
 * newStepId(doc, "message.send"); // "message_2"
 * newStepId(doc, "wait", "message"); // "w_message"
 */
export function newStepId(doc: unknown, kind: StepIdKind, beforeId?: string): string {
  const taken = new Set<string>();
  for (const s of isObject(doc) && Array.isArray(doc["steps"]) ? doc["steps"] : []) {
    const id = idOf(s);
    if (id) taken.add(id);
    const vs = isObject(s) ? s["variants"] : undefined;
    if (Array.isArray(vs)) for (const v of vs) if (idOf(v)) taken.add(idOf(v)!);
  }
  const base = kind === "wait" && beforeId !== undefined ? `w_${beforeId}` : ID_BASE[kind];
  if (!taken.has(fit(base, ""))) return fit(base, "");
  for (let n = 2; ; n++) if (!taken.has(fit(base, `_${n}`))) return fit(base, `_${n}`);
}
