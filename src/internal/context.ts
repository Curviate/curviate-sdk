/**
 * Internal request context shared by every resource namespace.
 *
 * A `RequestContext` binds the resolved client config to a `request` function
 * and (optionally) a fixed `account_id` injected on every call, the mechanism
 * behind `curviate.account(id).<resource>`. Resources never touch the transport
 * directly; they call `ctx.request(...)`.
 *
 * Account-first path grammar: an account-scoped method declares its path
 * template with a leading `{account_id}` placeholder (e.g.
 * `/v1/{account_id}/chats/${chatId}`); the bound context substitutes the fixed
 * account id into that placeholder. `account_id` is therefore always a path
 * segment, never a query param, never a body field. Root-scoped namespaces
 * (`accounts`, `auth`, `webhooks`) are built with a context that carries no
 * account id, so their paths (which have no placeholder) are used verbatim.
 *
 * Each resource takes a `RequestContext` and maps one method to one `/v1/*`
 * operation.
 */
import { execute, type HttpMethod } from "../transport.js";
import { encodePathParam } from "./path.js";
import type { ResolvedConfig } from "../config.js";

/** The placeholder a path template uses for the account-scoping segment. */
const ACCOUNT_ID_PLACEHOLDER = "{account_id}";

/** Per-call request shape passed by a resource method. */
export interface RequestArgs {
  method: HttpMethod;
  /**
   * Path template. Account-scoped methods embed the literal `{account_id}`
   * placeholder as the leading `/v1/` segment; the bound context substitutes
   * the fixed account id. Root-scoped methods carry no placeholder.
   */
  path: string;
  /**
   * Query params. Array values serialize as repeated params (e.g. `?k=a&k=b`)
   * to support multi-value fields like `linkedin_sections`. `account_id` is
   * never a query param; it is the leading path segment.
   */
  query?: Record<string, string | number | boolean | string[] | undefined | null>;
  body?: unknown;
}

/** The bound caller a resource receives. */
export type RequestFn = <T = unknown>(args: RequestArgs) => Promise<T>;

export interface RequestContext {
  readonly request: RequestFn;
  /** The account id fixed by `account(id)`, or undefined for the root client. */
  readonly accountId: string | undefined;
}

/**
 * Substitute the fixed `account_id` into the `{account_id}` placeholder of a
 * path template. When the context carries no account id (root client), or the
 * template has no placeholder (root-scoped op), the path is returned unchanged.
 *
 * The account id is a path PARAMETER like any other, so it is percent-encoded
 * on the way in. Substituted raw, an account selector shaped
 * `x/../../../v1/accounts` retargets every call made through that scope at a
 * different endpoint, because the URL parser resolves `..` before the request
 * is sent. `split`/`join` (not `replace`) keeps the substitution literal, so a
 * `$` in an account id cannot address the match either.
 */
function injectAccountIdIntoPath(path: string, accountId: string | undefined): string {
  if (accountId === undefined) return path;
  return path.split(ACCOUNT_ID_PLACEHOLDER).join(encodePathParam(accountId));
}

/**
 * Build a {@link RequestContext} from the resolved config. When `accountId` is
 * provided, it is substituted into the `{account_id}` placeholder of every
 * request path (the account-first grammar); the query and body are forwarded to
 * the transport untouched.
 */
export function createContext(
  config: ResolvedConfig,
  accountId?: string,
): RequestContext {
  const request: RequestFn = <T>(args: RequestArgs) => {
    const path = injectAccountIdIntoPath(args.path, accountId);

    return execute<T>(args.method, path, {
      apiKey: config.apiKey,
      baseUrl: config.baseUrl,
      timeout: config.timeout,
      maxRetries: config.maxRetries,
      ...(config.fetch ? { fetch: config.fetch } : {}),
      ...(args.query !== undefined ? { query: args.query } : {}),
      ...(args.body !== undefined ? { body: args.body } : {}),
    });
  };
  return { request, accountId };
}
