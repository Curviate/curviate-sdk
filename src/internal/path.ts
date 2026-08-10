/**
 * Request-path construction.
 *
 * A path parameter is a VALUE, not a path fragment. Interpolated raw, any
 * character that means something to a URL parser changes which endpoint the
 * request reaches:
 *
 *   - `/` adds segments, so a share URL passed as a post id turns
 *     `GET /v1/{account_id}/posts/{post_id}` into a nine-segment path
 *     (and `https://` collapses to `https:/` on the way);
 *   - `..` is resolved by the URL parser BEFORE the request is sent, so an
 *     account selector shaped `x/../../../v1/accounts` retargets the call at a
 *     completely different endpoint;
 *   - `?` and `#` end the path outright, moving the rest of the id into the
 *     query string or the fragment.
 *
 * So every substituted value is percent-encoded at the point it enters the
 * path. {@link apiPath} is the shape to reach for: as a tagged template it
 * encodes each substitution and leaves the literal parts (including the
 * `{account_id}` placeholder, which is structure rather than a value)
 * untouched.
 *
 *   apiPath`/v1/{account_id}/posts/${postId}/comments`
 *
 * WHAT THIS DOES AND DOES NOT GUARANTEE. Using the tag is a convention, not a
 * constraint the compiler enforces: `RequestArgs.path` is a `string`, so a raw
 * `path: `...${id}`` template compiles and `tsc --noEmit` exits 0. The defence
 * is DETECTION, not prevention. What actually holds the line is the guard in
 * `test/path-encoding.guard.test.ts`, which derives every interpolation from
 * the AST at run time and reds on any that is not encoded. If you are adding a
 * request path, the tag is how you pass that guard; it is not a type error to
 * skip it.
 *
 * Encoding is `encodeURIComponent`, so the result decodes back to the exact
 * input on any router that decodes path parameters. The unreserved sub-delims
 * `! ' ( ) * - . _ ~` are left as-is: they are legal inside a path segment and
 * decode to themselves, which keeps LinkedIn URNs such as
 * `urn:li:fsd_profile:(ACoAA...,NAME_SEARCH)` close to their familiar form.
 *
 * NOTE for callers who previously worked around raw interpolation by encoding
 * ids themselves: pass the DECODED id now. A value that already contains `%3A`
 * is treated as a literal percent sign and encoded to `%253A`.
 */
import { CurviateError } from "../errors.js";

/**
 * Percent-encode one path-parameter value.
 *
 * @param value - the parameter as the caller supplied it, decoded.
 * @returns the value as a single, self-contained path segment.
 */
export function encodePathParam(value: string | number): string {
  return encodeURIComponent(String(value));
}

/**
 * Segments that percent-encoding cannot make safe.
 *
 * `encodeURIComponent` leaves `.` unescaped, and `.` and `..` are a complete
 * dot-segment grammar that the URL parser resolves before the request is sent:
 * `posts.get("..")` reaches `/v1/{account_id}/`, and a `..` account selector
 * escapes `/v1` altogether. Percent-encoding the dots does not help, because
 * the parser decodes a segment before deciding whether it is a dot segment.
 *
 * The empty string is here for the same reason: it produces a byte-identical
 * request target to `"."`, so refusing one without the other would leave a
 * one-character bypass.
 *
 * A caller-supplied literal `%2e` is deliberately NOT refused. It is a dot
 * segment only when it arrives raw; encoding turns it into `%252e`, which is
 * inert, and refusing it would reject a value that works.
 */
const UNSAFE_SEGMENT = /^(?:\.{1,2})?$/;

/**
 * Reject an assembled request path that carries a segment the URL parser would
 * resolve away.
 *
 * Checked here, on the finished path, rather than per parameter inside
 * {@link encodePathParam}, for two reasons. It keys the check on the SINK: any
 * future route to building a path is covered, not only the ones that go through
 * the encoder today. And it keeps the failure an ASYNCHRONOUS rejection like
 * every other error this SDK raises. A tagged template is evaluated while the
 * request arguments are being built, so throwing from inside it would escape a
 * method declared `Promise<T>` synchronously, which breaks `.catch()` and takes
 * down a `Promise.allSettled` over a batch of ids before it starts.
 *
 * @throws {CurviateError} `INVALID_REQUEST`, before any network call.
 */
export function assertPathIsSendable(path: string): void {
  // index 0 is the empty string before the leading "/", never a real segment.
  const segments = path.split("/").slice(1);
  for (const segment of segments) {
    if (!UNSAFE_SEGMENT.test(segment)) continue;
    throw new CurviateError({
      code: "INVALID_REQUEST",
      message:
        `A path parameter cannot be ${segment === "" ? "empty" : `"${segment}"`}. ` +
        "The URL parser resolves that away before the request is sent, so the " +
        "call would reach a different endpoint. Pass the id itself.",
      userFixable: true,
      retryLikelyToSucceed: false,
    });
  }
}

/**
 * Tagged template for a request path: percent-encodes every substituted value,
 * leaves the literal text untouched.
 *
 * @example
 * apiPath`/v1/{account_id}/chats/${chatId}/messages/${messageId}`
 */
export function apiPath(
  strings: TemplateStringsArray,
  ...values: ReadonlyArray<string | number>
): string {
  let out = strings[0] ?? "";
  for (let i = 0; i < values.length; i++) {
    out += encodePathParam(values[i] as string | number) + (strings[i + 1] ?? "");
  }
  return out;
}
