/**
 * The transport behind activity administration.
 *
 * Deliberately depends on nothing but the platform: no aliased imports, no
 * Supabase client, no environment reads. The browser service wires those in,
 * and this file stays testable with nothing but a stubbed `fetch` — which is
 * the only way the failure paths (timeout, malformed reply, refusal envelope)
 * can be exercised without a live server.
 *
 * Every reply is normalised to one shape — `{ok, status, data, meta, error,
 * code, fields, requestId}` — so a caller never has to know whether a failure
 * came from the network, the API's error envelope, or a validation refusal.
 */

/** Page size the workspace asks for, inside every documented ceiling. */
export const DEFAULT_PAGE_SIZE = 20;

const REQUEST_TIMEOUT_MS = 10_000;

/** Failures that are the client's own, not the API's. */
export const CLIENT_FAILURE = Object.freeze({
  UNCONFIGURED: "api_unconfigured",
  NO_SESSION: "no_session",
  TIMEOUT: "request_timeout",
  NETWORK: "network_error",
  MALFORMED: "malformed_response",
});

/**
 * Normalizes a client-side or HTTP failure into the standard result envelope.
 *
 * @param {object} params
 * @param {number|null} [params.status] - HTTP status code
 * @param {string} params.code - Normalized machine-readable failure code
 * @param {string} params.error - Human-readable error message
 * @param {Record<string, string>} [params.fields] - Field-level error dictionary
 * @returns {object}
 */
function failure({ status = null, code, error, fields = {} }) {
  return {
    ok: false,
    status,
    data: null,
    meta: null,
    error,
    code,
    fields,
    requestId: null,
  };
}

/**
 * The API's error envelope, as the caller can actually use it.
 *
 * `docs/API_ROUTES.md` documents `{error: {code, message, fields, request_id}}`.
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

/** The collection envelope's `meta`, in the names the UI uses. */
export function readMeta(body, fallbackPageSize = DEFAULT_PAGE_SIZE) {
  const meta = body?.meta;
  if (!meta || typeof meta !== "object") {
    return null;
  }

  return {
    page: Number(meta.page) || 1,
    pageSize: Number(meta.page_size) || fallbackPageSize,
    totalItems: Number(meta.total_items) || 0,
    totalPages: Number(meta.total_pages) || 0,
  };
}

/**
 * The query string for a paged collection.
 *
 * An absent status is omitted rather than sent empty: the API types it as an
 * enum, and `status=` would be a 422 rather than "no filter".
 *
 * @param {object} [params]
 * @param {string} [params.search]
 * @param {number} [params.page]
 * @param {number} [params.pageSize]
 * @param {string|null} [params.status]
 * @param {string|null} [params.moduleId]
 * @returns {string}
 */
export function pageQuery({ search, page, pageSize, status = null, moduleId = null } = {}) {
  const query = new URLSearchParams();
  const trimmed = typeof search === "string" ? search.trim() : "";

  if (trimmed) {
    query.set("search", trimmed);
  }
  if (status) {
    query.set("status", status);
  }
  if (moduleId) {
    query.set("module_id", moduleId);
  }
  if (page) {
    query.set("page", String(page));
  }
  if (pageSize) {
    query.set("page_size", String(pageSize));
  }

  return query.toString();
}

/**
 * Builds a request function against one API base address.
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
  const base = typeof baseUrl === "string" && baseUrl ? baseUrl.replace(/\/+$/, "") : null;

  async function request(path, { method = "GET", body = null, token = null } = {}) {
    if (!base) {
      return failure({
        code: CLIENT_FAILURE.UNCONFIGURED,
        error: "The MathSmart API address is not configured for this environment.",
      });
    }

    const bearer = token || (await getAccessToken());
    if (!bearer) {
      return failure({
        code: CLIENT_FAILURE.NO_SESSION,
        error: "Your session has ended. Sign in again to continue.",
      });
    }

    const headers = {
      Accept: "application/json",
      Authorization: `Bearer ${bearer}`,
    };
    if (body !== null) {
      headers["Content-Type"] = "application/json";
    }

    let response;
    try {
      response = await fetchImpl(`${base}${path}`, {
        method,
        headers,
        body: body !== null ? JSON.stringify(body) : undefined,
        cache: "no-store",
        signal: AbortSignal.timeout(timeoutMs),
      });
    } catch (caught) {
      const timedOut = caught?.name === "TimeoutError" || caught?.name === "AbortError";
      return failure({
        code: timedOut ? CLIENT_FAILURE.TIMEOUT : CLIENT_FAILURE.NETWORK,
        error: timedOut
          ? "The request took too long. Check your connection and try again."
          : "MathSmart could not reach the server. Check your connection and try again.",
      });
    }

    // Archive answers 204, which has no body to read at all.
    if (response.status === 204) {
      return {
        ok: true,
        status: 204,
        data: null,
        meta: null,
        error: null,
        code: null,
        fields: {},
        requestId: null,
      };
    }

    let parsed = null;
    let parseFailed = false;
    let parseError = null;
    try {
      parsed = await response.json();
    } catch (caught) {
      parseFailed = true;
      parseError = caught;
    }

    if (!response.ok) {
      return {
        ...readErrorEnvelope(parsed, response.status),
        ok: false,
        status: response.status,
        data: null,
        meta: null,
      };
    }

    if (parseFailed || parsed?.data === undefined) {
      const timedOut = parseError?.name === "TimeoutError" || parseError?.name === "AbortError";
      return failure({
        status: response.status,
        code: timedOut ? CLIENT_FAILURE.TIMEOUT : CLIENT_FAILURE.MALFORMED,
        error: timedOut
          ? "The request took too long. Check your connection and try again."
          : "The server's reply could not be read.",
      });
    }

    return {
      ok: true,
      status: response.status,
      data: parsed.data,
      meta: readMeta(parsed),
      error: null,
      code: null,
      fields: {},
      requestId: null,
    };
  }

  return { request };
}
