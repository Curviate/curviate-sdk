/**
 * Query filters the API reads as one comma list (OpenAPI `style: form,
 * explode: false`: `status`, `enrollment_status`, `contact_ids`): the typed
 * array is joined, never sent as repeated keys, and an empty array means "no
 * filter", so the key is left out rather than sent as `k=`. Key order kept.
 */
export function commaLists<T extends object>(params: T | undefined, ...keys: (keyof T & string)[]) {
  if (params === undefined) return undefined;
  const out: Record<string, unknown> = { ...(params as Record<string, unknown>) };
  for (const k of keys) {
    const v = out[k];
    if (Array.isArray(v)) out[k] = v.length ? v.join(",") : undefined;
  }
  return out as Record<string, string | number | boolean | undefined>;
}
