/**
 * Shared API base-URL resolution for the learner profile client.
 *
 * Both the client mutation helper and the server-side reader forward a Supabase
 * access token to the MathSmart API, so they must never accept a cleartext
 * production URL. HTTPS is required outside local development; loopback hosts
 * remain reachable over HTTP for a local API on port 8000.
 */

/**
 * The API base URL, trimmed, or `null` when unset or unsafe.
 *
 * @param {string|undefined} [base=process.env.NEXT_PUBLIC_API_BASE_URL]
 * @returns {string|null}
 */
export function apiBaseUrl(base = process.env.NEXT_PUBLIC_API_BASE_URL) {
  if (typeof base !== "string" || !base) {
    return null;
  }
  const trimmed = base.replace(/\/+$/, "");
  const isLoopback =
    /^http:\/\/127\.0\.0\.1(?::\d+)?($|\/)/i.test(trimmed) ||
    /^http:\/\/localhost(?::\d+)?($|\/)/i.test(trimmed);
  if (/^https:/i.test(trimmed) || isLoopback) {
    return trimmed;
  }
  return null;
}