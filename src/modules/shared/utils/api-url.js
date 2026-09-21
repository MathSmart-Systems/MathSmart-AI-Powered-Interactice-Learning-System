import { SAME_ORIGIN_API_PATH, trustedDeploymentHost } from "../../../lib/api/base-url.js";

const APPROVED_API_HOSTS = new Set(["api.mathsmart.test"]);
const LOCAL_DEVELOPMENT_HOSTS = new Set(["localhost", "127.0.0.1"]);

/**
 * Allows bearer-token requests only over TLS, except for local development.
 *
 * Accepted:
 * - the relative same-origin path `/api/v1`, which the browser resolves
 *   against the page it is on;
 * - HTTPS to an approved host, or to the current Vercel deployment's own host
 *   (`VERCEL_URL`, set by Vercel, never taken from a request);
 * - HTTP to localhost or 127.0.0.1 for local development.
 *
 * Any other host is refused, HTTPS or not.
 */
export function secureApiBaseUrl(value) {
  if (typeof value !== "string" || !value) {
    return null;
  }

  if (value.replace(/\/+$/, "") === SAME_ORIGIN_API_PATH) {
    return SAME_ORIGIN_API_PATH;
  }

  try {
    const url = new URL(value);
    const deploymentHost = trustedDeploymentHost();
    const isSecure =
      url.protocol === "https:" &&
      (APPROVED_API_HOSTS.has(url.hostname) || (deploymentHost !== null && url.host === deploymentHost));
    const isLocalDevelopment =
      url.protocol === "http:" && LOCAL_DEVELOPMENT_HOSTS.has(url.hostname);

    return isSecure || isLocalDevelopment ? url.toString().replace(/\/+$/, "") : null;
  } catch {
    return null;
  }
}
