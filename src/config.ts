/**
 * Client configuration.
 *
 * Only `apiKey` is required; every other field has a sensible default. The
 * resolved config is frozen; the client is immutable after construction.
 */
import { CurviateError } from "./errors.js";
import { version } from "../package.json";

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
  /**
   * The Team to act in (`tnt_...`), sent as `X-Curviate-Team` on every
   * request; {@link Curviate.withTeam} overrides it for the calls made
   * through the client it returns. A key may work in one Team or in all of
   * a person's Teams. A Team key acts only in its own Team: naming another is
   * refused with `TEAM_ACCESS_DENIED`, so leave this unset with one. A key
   * that works in all of your Teams needs a Team for Team-level operations:
   * without one they are refused with `TEAM_REQUIRED` (a call on one of your
   * accounts takes that account's Team). A dashboard session token without
   * one acts in your default Team.
   */
  team?: string;
  /**
   * The `Curviate-Client` header sent on every request, informational only
   * (it is how your Team's settings show which tools use a key). Default
   * `sdk/<this SDK's version>`. A tool built on the SDK may pass its own
   * `<name>/<version>`; it replaces the default, never adds a second header.
   */
  client?: string;
}

/** Fully-resolved, frozen config carried by a {@link Curviate} instance. */
export interface ResolvedConfig {
  readonly apiKey: string;
  readonly baseUrl: string;
  readonly timeout: number;
  readonly maxRetries: number;
  readonly fetch: typeof fetch | undefined;
  readonly team?: string;
  readonly client: string;
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
  // Printable ASCII, no spaces: anything else cannot travel in a header and
  // would surface later as a retried "network error".
  if (config.team !== undefined && !/^[\x21-\x7e]+$/.test(String(config.team))) {
    throw new CurviateError({
      code: "INVALID_REQUEST",
      message: "team, when given, must be a team id (tnt_...): non-empty, no spaces.",
      userFixable: true,
      retryLikelyToSucceed: false,
    });
  }
  if (config.client !== undefined && !/^[\x21-\x7e]+$/.test(String(config.client))) {
    throw new CurviateError({
      code: "INVALID_REQUEST",
      message: "client, when given, must be <name>/<version>: non-empty, no spaces.",
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
    ...(config.team !== undefined ? { team: config.team } : {}),
    client: config.client ?? `sdk/${version}`,
  });
}
