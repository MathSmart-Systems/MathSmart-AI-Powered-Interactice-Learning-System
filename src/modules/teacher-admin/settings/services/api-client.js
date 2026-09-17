/**
 * Transport behind Teacher Settings administration.
 *
 * Deliberately depends only on the platform so it remains testable without a live server.
 */

import { secureApiBaseUrl } from "../../learning-modules/utils/api-url.js";

const REQUEST_TIMEOUT_MS = 10_000;

export const CLIENT_FAILURE = Object.freeze({
  UNCONFIGURED: "api_unconfigured",
  NO_SESSION: "no_session",
  TIMEOUT: "request_timeout",
  NETWORK: "network_error",
  MALFORMED: "malformed_response",
});

/**
 * Normalizes client or HTTP failures into a uniform result envelope.
 *
 * @param {object} params
 * @param {number|null} [params.status]
 * @param {string} params.code
 * @param {string} params.error
 * @param {Record<string, string>} [params.fields]
 * @returns {object}
 */
function failure({ status = null, code, error, fields = {} }) {
  return {
    ok: false,
    status,
    data: null,
    error,
    code,
    fields,
    requestId: null,
  };
}

/**
 * Reads the API error envelope.
 *
 * @param {unknown} body
 * @param {number} status
 */
export function readErrorEnvelope(body, status) {
  const envelope = body?.error;
  const message =
    (typeof envelope?.message === "string" && envelope.message) ||
    `The request failed with status ${status}.`;
  const fields =
    envelope?.fields && typeof envelope.fields === "object" ? envelope.fields : {};

  return {
    error: message,
    code: typeof envelope?.code === "string" ? envelope.code : null,
    fields,
    requestId: typeof envelope?.request_id === "string" ? envelope.request_id : null,
  };
}

/**
 * Builds an authenticated API client for Settings.
 *
 * @param {object} options
 * @param {string|null} options.baseUrl
 * @param {() => Promise<string|null>} [options.getAccessToken]
 * @param {number} [options.timeoutMs]
 * @param {typeof fetch} [options.fetchImpl]
 */
export function createApiClient({
  baseUrl,
  getAccessToken = async () => null,
  timeoutMs = REQUEST_TIMEOUT_MS,
  fetchImpl = globalThis.fetch,
} = {}) {
  const base = secureApiBaseUrl(baseUrl);

  async function request(path, { method = "GET", body = null, token = null } = {}) {
    if (!base) {
      return failure({
        code: CLIENT_FAILURE.UNCONFIGURED,
        error: "The MathSmart API address is not configured for this environment.",
      });
    }

    const authToken = token || (await getAccessToken());
    if (!authToken) {
      return failure({
        status: 401,
        code: CLIENT_FAILURE.NO_SESSION,
        error: "An active teacher session is required.",
      });
    }

    const url = `${base}${path.startsWith("/") ? path : `/${path}`}`;
    const headers = {
      Authorization: `Bearer ${authToken}`,
      Accept: "application/json",
    };

    const init = { method, headers };
    if (body !== null && body !== undefined) {
      headers["Content-Type"] = "application/json";
      init.body = JSON.stringify(body);
    }

    const controller = typeof AbortController !== "undefined" ? new AbortController() : null;
    let timer = null;
    if (controller) {
      init.signal = controller.signal;
      timer = setTimeout(() => controller.abort(), timeoutMs);
    }

    let response;
    let responseBody = null;
    try {
      response = await fetchImpl(url, init);
      const text = await response.text();
      if (text) {
        try {
          responseBody = JSON.parse(text);
        } catch {
          return failure({
            status: response.status,
            code: CLIENT_FAILURE.MALFORMED,
            error: "The server response was malformed.",
          });
        }
      }
    } catch (err) {
      if (err?.name === "AbortError") {
        return failure({
          code: CLIENT_FAILURE.TIMEOUT,
          error: "The request timed out. Please try again.",
        });
      }
      return failure({
        code: CLIENT_FAILURE.NETWORK,
        error: "Could not connect to the server. Check your connection.",
      });
    } finally {
      if (timer) {
        clearTimeout(timer);
      }
    }

    const requestId = response.headers?.get?.("x-request-id") || null;

    if (!response.ok) {
      const parsed = readErrorEnvelope(responseBody, response.status);
      return {
        ok: false,
        status: response.status,
        data: null,
        error: parsed.error,
        code: parsed.code,
        fields: parsed.fields,
        requestId: parsed.requestId || requestId,
      };
    }

    return {
      ok: true,
      status: response.status,
      data: responseBody?.data ?? null,
      error: null,
      code: null,
      fields: {},
      requestId,
    };
  }

  return { request };
}
