/**
 * Client configuration.
 *
 * Only `apiKey` is required; every other field has a sensible default. The
 * resolved config is frozen; the client is immutable after construction.
 */
import { CurviateError } from "./errors.js";

/** Public constructor input. */
export interface CurviateConfig {
  /** Required. The API key (`cvt_live_...`). */
  apiKey: string;
  /** Default `https://api.curviate.com`. */
  baseUrl?: string;
  /** Per-request timeout in ms. Default `30_000`. */
  timeout?: number;
  /** Max retry attempts for retryable reads. Default `3`. */
  maxRetries?: number;
  /** Injectable transport for tests / edge runtimes without a global `fetch`. */
  fetch?: typeof fetch;
}

/** Fully-resolved, frozen config carried by a {@link Curviate} instance. */
export interface ResolvedConfig {
  readonly apiKey: string;
  readonly baseUrl: string;
  readonly timeout: number;
  readonly maxRetries: number;
  readonly fetch: typeof fetch | undefined;
}

export const DEFAULT_BASE_URL = "https://api.curviate.com";
export const DEFAULT_TIMEOUT_MS = 30_000;
export const DEFAULT_MAX_RETRIES = 3;

/**
 * Validate and resolve a {@link CurviateConfig}. Throws synchronously (no
 * network call) when `apiKey` is missing or empty.
 */
export function resolveConfig(config: CurviateConfig): ResolvedConfig {
  if (typeof config?.apiKey !== "string" || config.apiKey.length === 0) {
    throw new CurviateError({
      code: "INVALID_REQUEST",
      message: "An apiKey is required to construct a Curviate client.",
      userFixable: true,
      retryLikelyToSucceed: false,
    });
  }
  return Object.freeze({
    apiKey: config.apiKey,
    baseUrl: config.baseUrl ?? DEFAULT_BASE_URL,
    timeout: config.timeout ?? DEFAULT_TIMEOUT_MS,
    maxRetries: config.maxRetries ?? DEFAULT_MAX_RETRIES,
    fetch: config.fetch,
  });
}
