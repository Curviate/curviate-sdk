/**
 * A download resolves with the file's bytes. The transport parses a JSON
 * response, so a `json` export arrives as a value; re-encode it so every
 * download is bytes the caller can write to disk as is.
 *
 * ponytail: a `json` file comes back compact (JSON.stringify), not the exact
 * bytes the server sent; upgrade when the transport can hand a response back
 * unparsed.
 */
export function asBytes(value: unknown): ArrayBuffer {
  if (value instanceof ArrayBuffer) return value;
  const u = new TextEncoder().encode(JSON.stringify(value));
  return u.buffer.slice(u.byteOffset, u.byteOffset + u.byteLength) as ArrayBuffer;
}
