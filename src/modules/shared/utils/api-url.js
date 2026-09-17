const APPROVED_API_HOSTS = new Set(["api.mathsmart.test"]);
const LOCAL_DEVELOPMENT_HOSTS = new Set(["localhost", "127.0.0.1"]);

/** Allows bearer-token requests only over TLS, except for local development. */
export function secureApiBaseUrl(value) {
  if (typeof value !== "string" || !value) {
    return null;
  }

  try {
    const url = new URL(value);
    const isSecure = url.protocol === "https:" && APPROVED_API_HOSTS.has(url.hostname);
    const isLocalDevelopment =
      url.protocol === "http:" && LOCAL_DEVELOPMENT_HOSTS.has(url.hostname);

    return isSecure || isLocalDevelopment ? url.toString().replace(/\/+$/, "") : null;
  } catch {
    return null;
  }
}
