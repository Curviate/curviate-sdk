// Vendored from the API by scripts/vendor-shared.mjs. Do not edit: change the API and re-run.
import { MESSAGE_SEND_ACTIONS } from "./message-actions.js";
export const SEQUENCE_SCHEMA_URL = "https://docs.curviate.com/schemas/sequence/v1.json";
export const MAX_STEPS = 100;
export const LINT_WARN_MS = 10;
export const MIN_VARIANTS = 2;
export const MAX_VARIANTS = 2;
export const DEPRECATED_ACCEPTED_UNTIL = "2027-01-19";
export const MAX_VARIANTS_DEPRECATED = 5;
export const MAX_SEQUENCE_BYTES = 256 * 1024;
export const MAX_STEP_NOTE_CHARS = 500;
export const MAX_TAG_CHARS = 64;
export const MAX_PREDICATE_DEPTH = 10;
export const MAX_VARIABLE_REFS_PER_TEXT = 50;
export const MAX_QUOTED_TOKEN_CHARS = 64;
export const ID_PATTERN = "^[a-z][a-z0-9_]{0,39}$";
export const EVENT_NAME_PATTERN = "^[a-z][a-z0-9_.]{0,63}$";
export const EXTRA_KEY_PATTERN = "^[A-Za-z0-9_]{1,64}$";
export const SAVE_NAME_PATTERN = "^[a-z][a-z0-9_]{0,63}$";
export const MAX_SAVE_ENTRIES = 20;
export const DURATION_PATTERN = "^[1-9][0-9]*(m|h|d)$";
export const TAG_PATTERN = "^[^,;]*[^,;\\s][^,;]*$";
export const END = "end";
const M = 1;
const H = 60;
const D = 24 * 60;
export const DURATION_BOUNDS = {
    wait: { min: 1 * M, max: 365 * D, label: "1m and 365d", example: "1d" },
    timeout: { min: 1 * H, max: 180 * D, label: "1h and 180d", example: "21d" },
    withdraw_after: { min: 14 * D, max: 180 * D, label: "14d and 180d", example: "21d" },
    newer_than: { min: 1 * H, max: 365 * D, label: "1h and 365d", example: "30d" },
} as const;
export const STEP_KINDS = ["do", "wait", "until", "if", "emit", "tag"] as const;
export type StepKind = (typeof STEP_KINDS)[number];
export const ACTIONS = [
    "profile.view",
    "profile.follow",
    "profile.unfollow",
    "invite.send",
    "invite.withdraw",
    "message.send",
    "inmail.send",
    "voice.send",
    "post.react",
    "post.comment",
    "skill.endorse",
] as const;
export type Action = (typeof ACTIONS)[number];
export const ACTION_PARAMS: Record<Action, readonly string[]> = {
    "profile.view": [],
    "profile.follow": [],
    "profile.unfollow": [],
    "invite.send": ["note", "note_fallback", "withdraw_after"],
    "invite.withdraw": [],
    "message.send": ["text", "fallback"],
    "inmail.send": ["subject", "text", "fallback"],
    "voice.send": ["clip_id", "fallback"],
    "post.react": ["post", "newer_than", "reaction"],
    "post.comment": ["post", "newer_than", "text", "fallback"],
    "skill.endorse": [],
};
export const VOICE_CLIP_ID_RE = /^vc_[0-9A-HJKMNP-TV-Z]{26}$/;
export const VOICE_CLIP_RULE = "must be the id of a Voice clip of this Team (POST /v1/motions/voice-clips)";
export const MESSAGING_ACTIONS: readonly Action[] = ["invite.send", ...MESSAGE_SEND_ACTIONS, "post.comment"];
export const REACTIONS = ["like", "celebrate", "support", "love", "insightful", "funny"] as const;
export const EVENTS = ["invite.accepted", "message.replied", "message.read"] as const;
export const STANDARD_FIELDS = [
    "full_name",
    "first_name",
    "last_name",
    "headline",
    "job_title",
    "company",
    "email",
    "location",
    "linkedin_url",
    "about",
] as const;
export const NAME_FIELDS = ["full_name", "first_name", "last_name"] as const;
export const ACCOUNT_FIELDS = ["first_name", "last_name", "full_name"] as const;
export const BOOLEAN_PREDICATES = [
    "contact.connected",
    "contact.open_profile",
    "contact.premium",
    "contact.has_photo",
] as const;
export const FIELD_OPERATORS = ["eq", "neq", "in", "contains", "exists"] as const;
export const NUMBER_OPERATORS = ["gte", "lte"] as const;
export const TEXT_LIMITS = {
    message: 8000,
    invite_note: 300,
    inmail_subject: 200,
    inmail_text: 1900,
    comment: 1250,
} as const;
export const STEP_KEYS: Record<StepKind, readonly string[]> = {
    do: ["id", "do", "with", "variants", "event", "next", "else", "note"],
    wait: ["id", "wait", "next", "note"],
    until: ["id", "until", "timeout", "save", "save_to_contact", "then", "else", "note"],
    if: ["id", "if", "then", "else", "note"],
    emit: ["id", "emit", "next", "note"],
    tag: ["id", "tag", "event", "next", "note"],
};
export const SHORT_VARIABLE_PATTERN = "^[a-z][a-z0-9_]{0,63}$";
const SHORT_RE = new RegExp(SHORT_VARIABLE_PATTERN);
export const MY_FIELDS = ["my_first_name", "my_last_name", "my_full_name"] as const;
export function longVariable(inner: string): string | null {
    if (inner.includes("."))
        return inner;
    if (!SHORT_RE.test(inner))
        return null;
    if ((MY_FIELDS as readonly string[]).includes(inner))
        return `account.${inner.slice(3)}`;
    if (inner.startsWith("my_"))
        return null;
    if ((STANDARD_FIELDS as readonly string[]).includes(inner))
        return `contact.${inner}`;
    return `contact.extra.${inner}`;
}
export const isObject = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
export const fallbackKeyword = (action: unknown): "drop" | "skip" | null => (action === "invite.send" ? "drop" : action === "post.comment" ? "skip" : null);
