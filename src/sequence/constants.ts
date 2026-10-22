/**
 * The one module of Sequence bounds JSON Schema cannot express. Every enum, pattern and bound the v1 schema states is read from
 * `SEQUENCE_SCHEMA_V1` instead (see `vocab.ts`); each value here is pinned by
 * a boundary pair in the shared corpus (`test/sequence/corpus.test.ts`).
 */

/** The reserved target that ends a route. */
export const END = "end";

/** Duration bounds in minutes, with the wording the rule texts quote. */
const H = 60;
const D = 24 * H;
export const DURATION_BOUNDS = {
  wait: { min: 1, max: 365 * D, label: "1m and 365d", example: "1d" },
  timeout: { min: 1 * H, max: 180 * D, label: "1h and 180d", example: "21d" },
  withdraw_after: { min: 14 * D, max: 180 * D, label: "14d and 180d", example: "21d" },
  newer_than: { min: 1 * H, max: 365 * D, label: "1h and 365d", example: "30d" },
} as const;

/** R22 text limits, characters, variables not counted. */
export const TEXT_LIMITS = {
  message: 8000,
  invite_note: 300,
  inmail_subject: 200,
  inmail_text: 1900,
  comment: 1250,
} as const;

/** R2: UTF-8 bytes of compact `JSON.stringify` of the document. */
export const MAX_SEQUENCE_BYTES = 256 * 1024;
/** R15: nesting levels of one predicate (the predicate object is level 1). */
export const MAX_PREDICATE_DEPTH = 10;
/** R22: variable references in one text. */
export const MAX_VARIABLE_REFS_PER_TEXT = 50;
/** R16/R18 quote an authored placeholder token cut to this many characters. */
export const MAX_QUOTED_TOKEN_CHARS = 64;

/** v1 variables: `account.<field>`; `contact.<field>` reuses the schema's standard fields. */
export const ACCOUNT_FIELDS = ["first_name", "last_name", "full_name"] as const;
/** W7: the Contact name fields. */
export const NAME_FIELDS = ["full_name", "first_name", "last_name"] as const;
/** `{{motion.<key>}}` key shape (deprecated: accepted with W13 until {@link DEPRECATED_ACCEPTED_UNTIL}). */
export const MOTION_KEY_PATTERN = "^[a-z][a-z0-9_]{0,39}$";

/**
 * A/B only: exactly 2 variants. The schema's `maxItems` is the deprecation
 * window's bound (3 up to it are accepted with W13), not this.
 */
export const MAX_VARIANTS = 2;
/** An old form (3+ variants, `until signal.<name>`, `{{motion.<key>}}`) is accepted with W13 until this day. */
export const DEPRECATED_ACCEPTED_UNTIL = "2027-01-19";
/** A short variable, `{{<key>}}` (no dot): a standard field, `my_<name>`, or a custom field. */
export const SHORT_VARIABLE_PATTERN = "^[a-z][a-z0-9_]{0,63}$";
/** The sending account's own name, short form (`my_` is reserved for these). */
export const MY_FIELDS = ["my_first_name", "my_last_name", "my_full_name"] as const;
