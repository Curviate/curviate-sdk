/**
 * POSITIVE CONTROL for the path scanner. Not production code, never imported
 * by src/, and deliberately not under src/ so the real scan never reads it.
 *
 * The mutation record for the path-encoding guard measured the wrong axis: it
 * proved the scanner's INPUT SET cannot silently empty, and every one of those
 * refusals works. But five mutations that leave the input set full while making
 * the scanner structurally unable to REPORT `raw` all survived a green suite:
 * force every status to `encoded-by-tag`, make `looksLikePath` return false,
 * make `isEncoderCall` return true, count any tag as an encoding tag, drop
 * representation C. A scanner that has stopped classifying looks exactly like a
 * codebase with nothing to report.
 *
 * So this file contains known-bad and known-good path construction in every
 * representation the scanner claims to cover, and the control asserts the exact
 * classification of each. It is the half of the guard that proves the
 * instrument still reads.
 *
 * Keep the shapes below in sync with the representations in `path-sites.ts`.
 * Adding a representation without adding a control arm is the gap this closes.
 */

// Local stand-ins so the fixture compiles standalone. Only the IDENTIFIER
// names matter to the scanner; it never resolves or executes these.
const apiPath = (strings: TemplateStringsArray, ...values: string[]): string =>
  strings.raw.join("") + values.join("");
const notAnEncoder = (v: string): string => v;
const buildPath = (v: string): string => v;

const postId = "p1";
const chatId = "c1";
const cardUrn = "u1";

// Each path carries a UNIQUE literal marker (`ctl-<name>`) so an assertion can
// select exactly one construct. Two fixture paths that differ only by their tag
// have identical template text, because a tag is not part of the template.

/** Representation A, raw: must classify `raw`. */
export const rawSingle = { path: `/v1/ctl-raw-single/${postId}` };

/** Representation A, raw with TWO parameters: must yield TWO `raw` sites. */
export const rawDouble = { path: `/v1/ctl-raw-double/${chatId}/messages/${postId}` };

/** Representation A, tagged: must classify `encoded-by-tag`. */
export const taggedSingle = { path: apiPath`/v1/ctl-tagged/${postId}` };

/** Representation A, hand-encoded call: must classify `encoded-by-call`. */
export const callEncoded = { path: `/v1/ctl-call-encoded/${encodeURIComponent(cardUrn)}` };

/** A call that is NOT an encoder must still classify `raw`. */
export const fakeEncoder = { path: `/v1/ctl-fake-encoder/${notAnEncoder(postId)}` };

/**
 * A tag that is NOT an encoding tag. Reported twice on purpose: representation
 * A cannot classify the tagged expression, and representation B still sees the
 * inner template and calls its substitution `raw`. Both are the right answer.
 */
export const wrongTag = { path: String.raw`/v1/ctl-wrong-tag/${postId}` };

/** Representation A, static: no site at all, recorded as a static path. */
export const staticPath = { path: "/v1/ctl-static-string" };

/** Representation A, static template: also a static path, no site. */
export const staticTemplate = { path: `/v1/ctl-static-template` };

/** Representation A, unresolvable initializer: must be reported unclassified. */
export const opaquePath = { path: buildPath(postId) };

/** Representation B: a `/v1/` template that is NOT under a `path:` property. */
export const looseTemplate = `/v1/ctl-loose-template/${postId}`;

/** Representation C: `+` concatenation building a `/v1/` path. */
export const concatenated = "/v1/ctl-concatenated/" + postId;

/** Representation D: a URL construction site. */
export const constructed = new URL("/v1/health", "https://example.invalid");
