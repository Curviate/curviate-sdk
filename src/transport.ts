/**
 * HTTP transport for the Curviate SDK.
 *
 * Wraps `fetch`: injects the Bearer auth header, serialises JSON and multipart
 * bodies, parses JSON and binary responses, maps HTTP errors to
 * {@link CurviateError}, and runs the client-side retry/backoff contract.
 *
 * Stateless: each {@link execute} call is independent, no request queue, no
 * in-flight dedupe (clients own retry safety).
 *
 * The `_jitterFn` and `_sleepFn` options are internal seams for deterministic
 * tests; they are not part of the public client surface.
 */
import {
  CurviateError,
  KNOWN_ERROR_CODES,
  KNOWN_REQUIRED_TIERS,
  type ErrorCode,
  type RequiredTier,
  type RetryHint,
} from "./errors.js";

/** HTTP methods the transport issues. */
export type HttpMethod = "GET" | "HEAD" | "POST" | "PATCH" | "PUT" | "DELETE";

/** Options for a single {@link execute} call. */
export interface ExecuteOptions {
  apiKey: string;
  baseUrl: string;
  /** Per-attempt timeout in ms. */
  timeout: number;
  /** Max retry attempts for retryable GET/HEAD failures. */
  maxRetries: number;
  /**
   * Query params appended via URLSearchParams (GET).
   * Array values are serialized as repeated params (e.g. `?k=a&k=b`),
   * which is the standard for multi-value fields like `linkedin_sections`.
   */
  query?: Record<string, string | number | boolean | string[] | undefined | null>;
  /** Request body: a plain object (JSON) or a FormData (multipart). */
  body?: unknown;
  /** Injectable fetch (edge runtimes / tests). Defaults to global fetch. */
  fetch?: typeof fetch;
  /** @internal deterministic jitter for tests; defaults to Math.random()*200. */
  _jitterFn?: () => number;
  /** @internal deterministic sleep for tests; defaults to setTimeout. */
  _sleepFn?: (ms: number) => Promise<void>;
}

/** Error envelope as it arrives on the wire (snake_case). */
interface WireErrorEnvelope {
  code?: string;
  message?: string;
  retry_hint?: { kind?: string; delay_ms?: number } | null;
  user_fixable?: boolean;
  retry_likely_to_succeed?: boolean;
  required_tier?: string;
}

// Backoff defaults.
const BASE_DELAY_MS = 500;
const MAX_DELAY_MS = 30_000;

/** Codes that are safe to retry, and only for GET/HEAD. */
const RETRYABLE_CODES: ReadonlySet<string> = new Set([
  "INTERNAL",
  "PLATFORM_ERROR",
  "PLATFORM_RATE_LIMIT",
  "RATE_LIMIT_ACCOUNT",
  "RATE_LIMIT_TENANT",
  "RATE_LIMITED",
]);

const WRITE_METHODS: ReadonlySet<HttpMethod> = new Set(["POST", "PATCH", "PUT", "DELETE"]);

function defaultSleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Parse `Retry-After` (seconds form). HTTP-date form falls back to 30s. */
function parseRetryAfterMs(header: string | null): number | undefined {
  if (header == null) return undefined;
  const seconds = Number(header);
  if (Number.isFinite(seconds) && seconds >= 0) return seconds * 1000;
  // HTTP-date form is not parsed precisely; use a conservative fallback.
  return 30_000;
}

/** Compute the backoff delay for retry attempt `n` (1-indexed), with jitter. */
function backoffDelay(n: number, jitter: number): number {
  const exp = Math.min(BASE_DELAY_MS * 2 ** (n - 1), MAX_DELAY_MS);
  return exp + jitter;
}

/** Narrow an arbitrary wire `code` to a known {@link ErrorCode}, else INTERNAL. */
function toErrorCode(code: string | undefined): ErrorCode {
  return code && KNOWN_ERROR_CODES.has(code) ? (code as ErrorCode) : "INTERNAL";
}

function toRetryHint(hint: WireErrorEnvelope["retry_hint"]): RetryHint | null {
  if (!hint || typeof hint !== "object") return null;
  const kind = hint.kind;
  if (kind !== "delay" && kind !== "backoff" && kind !== "never") return null;
  const out: RetryHint = { kind };
  if (typeof hint.delay_ms === "number") out.delayMs = hint.delay_ms;
  return out;
}

/** Build a {@link CurviateError} from an HTTP error response. */
async function errorFromResponse(res: Response): Promise<CurviateError> {
  const retryAfterMs = parseRetryAfterMs(res.headers.get("Retry-After"));
  let env: WireErrorEnvelope | undefined;
  try {
    env = (await res.clone().json()) as WireErrorEnvelope;
  } catch {
    env = undefined;
  }
  const requiredTier =
    env?.required_tier && KNOWN_REQUIRED_TIERS.has(env.required_tier)
      ? (env.required_tier as RequiredTier)
      : undefined;

  return new CurviateError({
    code: toErrorCode(env?.code),
    message: env?.message ?? `Request failed with status ${res.status}.`,
    httpStatus: res.status,
    retryHint: toRetryHint(env?.retry_hint),
    userFixable: env?.user_fixable ?? false,
    retryLikelyToSucceed: env?.retry_likely_to_succeed ?? false,
    ...(requiredTier !== undefined ? { requiredTier } : {}),
    ...(retryAfterMs !== undefined ? { retryAfterMs } : {}),
  });
}

/** The delay to wait before a retry: Retry-After > retry_hint.delay_ms > backoff. */
function retryDelay(err: CurviateError, attempt: number, jitter: number): number {
  if (err.retryAfterMs !== undefined) return err.retryAfterMs;
  if (err.retryHint?.kind === "delay" && err.retryHint.delayMs !== undefined) {
    return err.retryHint.delayMs;
  }
  return backoffDelay(attempt, jitter);
}

/** Build the `fetch` Request init for one attempt. */
function buildInit(method: HttpMethod, opts: ExecuteOptions, signal: AbortSignal): RequestInit {
  const headers: Record<string, string> = {
    authorization: `Bearer ${opts.apiKey}`,
  };
  const init: RequestInit = { method, headers, signal };

  if (method === "GET" || method === "HEAD" || opts.body === undefined) {
    return init;
  }
  if (opts.body instanceof FormData) {
    // Multipart: do NOT set Content-Type; the runtime sets it with the boundary.
    init.body = opts.body;
    return init;
  }
  headers["content-type"] = "application/json";
  init.body = JSON.stringify(opts.body);
  return init;
}

/** Build the absolute request URL with query params. */
function buildUrl(path: string, opts: ExecuteOptions): string {
  const url = new URL(path, opts.baseUrl);
  if (opts.query) {
    for (const [key, value] of Object.entries(opts.query)) {
      if (value === undefined || value === null) continue;
      if (Array.isArray(value)) {
        // Repeated params: ?k=a&k=b (the standard for multi-value fields).
        for (const v of value) {
          url.searchParams.append(key, String(v));
        }
      } else {
        url.searchParams.set(key, String(value));
      }
    }
  }
  return url.toString();
}

/** Parse a successful (2xx) response: JSON, or ArrayBuffer for binary. */
async function parseSuccess<T>(res: Response): Promise<T> {
  const ct = res.headers.get("content-type") ?? "";
  if (ct.includes("application/json")) {
    return (await res.json()) as T;
  }
  // Any non-JSON 2xx body is returned as binary (e.g. file downloads).
  return (await res.arrayBuffer()) as T;
}

/**
 * Execute a single API request with the configured retry/backoff policy.
 *
 * @typeParam T - the parsed success type (JSON object or ArrayBuffer).
 * @throws {CurviateError} on any HTTP error, network failure, or timeout.
 */
export async function execute<T = unknown>(
  method: HttpMethod,
  path: string,
  opts: ExecuteOptions,
): Promise<T> {
  const doFetch = opts.fetch ?? globalThis.fetch;
  const sleep = opts._sleepFn ?? defaultSleep;
  const jitterFn = opts._jitterFn ?? (() => Math.random() * 200);
  const url = buildUrl(path, opts);
  const isWrite = WRITE_METHODS.has(method);

  let attempt = 0;
  // attempt 0 = first try; up to maxRetries additional attempts for retryables.
  for (;;) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), opts.timeout);
    let res: Response;
    try {
      res = await doFetch(url, buildInit(method, opts, controller.signal));
    } catch {
      clearTimeout(timer);
      // Distinguish a timeout (AbortError) from a generic network failure.
      const aborted = controller.signal.aborted;
      const err = new CurviateError({
        code: "INTERNAL",
        message: aborted ? "Request timed out." : "Network error.",
        userFixable: false,
        retryLikelyToSucceed: true,
      });
      // A timeout/network failure is only retried for reads.
      if (!isWrite && attempt < opts.maxRetries) {
        await sleep(backoffDelay(attempt + 1, jitterFn()));
        attempt += 1;
        continue;
      }
      throw err;
    }
    clearTimeout(timer);

    if (res.ok) {
      return parseSuccess<T>(res);
    }

    const err = await errorFromResponse(res);
    const retryable = !isWrite && RETRYABLE_CODES.has(err.code) && attempt < opts.maxRetries;
    if (retryable) {
      await sleep(retryDelay(err, attempt + 1, jitterFn()));
      attempt += 1;
      continue;
    }
    // For writes that are rate-limited with a Retry-After header: wait the
    // indicated delay but do not re-fire (clients own retry safety).
    if (isWrite && err.retryAfterMs !== undefined) {
      await sleep(err.retryAfterMs);
    }
    throw err;
  }
}
