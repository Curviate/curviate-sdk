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
 * untouched, which makes a raw interpolation impossible to write rather than
 * merely detectable after the fact.
 *
 *   apiPath`/v1/{account_id}/posts/${postId}/comments`
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
