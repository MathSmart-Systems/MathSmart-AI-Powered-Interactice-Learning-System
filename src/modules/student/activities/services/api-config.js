/**
 * Activities API configuration.
 *
 * The same guarded bases as the assessments feature: only a loopback HTTP URL or
 * an HTTPS URL pointing at `/api/v1` is accepted as the live API, and nothing
 * ever embeds a credential here.
 */

const configuredBaseUrl = process.env.NEXT_PUBLIC_API_BASE_URL?.trim() || "";

export function parseApiBaseUrl(value) {
  if (!value) return null;

  try {
    const url = new URL(value);
    const pathname = url.pathname.replace(/\/+$/, "");
    const isLocal = ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname);

    if (
      !["http:", "https:"].includes(url.protocol) ||
      url.username ||
      url.password ||
      url.search ||
      url.hash ||
      pathname !== "/api/v1" ||
      (!isLocal && url.protocol !== "https:")
    ) {
      return null;
    }

    return `${url.origin}${pathname}`;
  } catch {
    return null;
  }
}

export const API_BASE_URL = parseApiBaseUrl(configuredBaseUrl);
export const API_CONFIGURED = API_BASE_URL !== null;

export const getApiUrl = (path) => {
  if (!API_BASE_URL) {
    throw new Error("MathSmart API is not configured");
  }
  if (typeof path !== "string" || !/^\/(?!\/)/.test(path)) {
    throw new Error("MathSmart API path is invalid");
  }
  return `${API_BASE_URL}${path}`;
};

const apiConfig = { API_BASE_URL, getApiUrl, API_CONFIGURED };

export default apiConfig;