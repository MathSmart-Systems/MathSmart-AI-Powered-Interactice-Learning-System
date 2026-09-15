/** Allows bearer-token requests only over TLS, except for local development. */
export function secureApiBaseUrl(value) {
  if (typeof value !== "string" || !value) {
    return null;
  }

  try {
    const url = new URL(value);
    const isSecure = url.protocol === "https:";
    const isLocalDevelopment = url.protocol === "http:" && url.hostname === "localhost";

    return isSecure || isLocalDevelopment ? url.toString().replace(/\/+$/, "") : null;
  } catch {
    return null;
  }
}
