/**
 * Job identifier resolution, shared by `jobs.get()` and
 * `recruiter.getJob()`, both of which accept a bare numeric job id or a
 * full LinkedIn job URL. The wire request always carries the numeric id;
 * this is a client-side convenience, never a server param.
 */
import { CurviateError } from "../errors.js";

const JOB_URL_ID_PATTERN = /\/jobs\/view\/(\d+)/;

/**
 * Resolve a caller-supplied job identifier to the bare numeric id the API
 * expects. Accepts:
 *   - a bare numeric id (e.g. `"4428113858"`), returned as-is;
 *   - a LinkedIn job URL (e.g. `"https://www.linkedin.com/jobs/view/4428113858"`,
 *     with or without a trailing slash / query string), with the numeric id
 *     extracted.
 *
 * Throws `CurviateError({ code: "INVALID_REQUEST" })` synchronously (no
 * network call) when neither pattern matches, mirroring the client-side
 * validation `Curviate#account()` already performs on an invalid input.
 */
export function resolveJobId(idOrUrl: string): string {
  const trimmed = idOrUrl.trim();
  if (/^\d+$/.test(trimmed)) return trimmed;

  const match = trimmed.match(JOB_URL_ID_PATTERN);
  if (match) return match[1] as string;

  throw new CurviateError({
    code: "INVALID_REQUEST",
    message: `Could not extract a numeric job id from "${idOrUrl}". Pass a bare numeric id (e.g. "4428113858") or a LinkedIn job URL (e.g. "https://www.linkedin.com/jobs/view/4428113858").`,
    userFixable: true,
    retryLikelyToSucceed: false,
  });
}
