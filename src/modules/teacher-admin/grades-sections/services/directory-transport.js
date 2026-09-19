/**
 * The transport behind the Grades & Sections directory.
 *
 * Deliberately depends on nothing but the platform: no aliased imports, no
 * Supabase client, no environment reads. The browser service and the
 * server-side reader wire those in, and this file stays testable with nothing
 * but a stubbed `fetch` — which is the only way the failure paths (missing
 * configuration, ended session, unreachable server, malformed reply, refusal
 * envelope) can be exercised without a live server.
 *
 * Every reply is normalised to one shape — `{ok, status, data, error}` — so a
 * caller never has to know whether a failure came from the network, the API's
 * error envelope, or the client's own preconditions.
 */

/** How long a directory request may take before it is abandoned. */
export const REQUEST_TIMEOUT_MS = 30_000;

/**
 * Trims the trailing slashes off a configured API address.
 *
 * @param {unknown} base
 * @returns {string|null} the usable address, or null when none is configured
 */
export function normalizeBaseUrl(base) {
  if (typeof base !== "string") return null;
  const trimmed = base.replace(/\/+$/, "");
  return trimmed ? trimmed : null;
}

/**
 * Builds the authenticated directory client.
 *
 * @param {object} options
 * @param {string|null} options.baseUrl already normalised API address
 * @param {() => Promise<string|null>} options.getAccessToken
 * @param {typeof fetch} [options.fetchImpl]
 * @param {number} [options.timeoutMs]
 */
export function createDirectoryClient({
  baseUrl,
  getAccessToken,
  fetchImpl,
  timeoutMs = REQUEST_TIMEOUT_MS,
}) {
  async function request(method, path, body) {
    if (!baseUrl) return { ok: false, status: null, error: "API not configured" };

    const token = await getAccessToken();
    if (!token) return { ok: false, status: null, error: "Session not available" };

    const headers = {
      Authorization: `Bearer ${token}`,
      Accept: "application/json",
    };
    if (body !== undefined) {
      headers["Content-Type"] = "application/json";
    }

    const send = fetchImpl ?? globalThis.fetch;

    let response;
    try {
      response = await send(`${baseUrl}${path}`, {
        method,
        headers,
        body: body !== undefined ? JSON.stringify(body) : undefined,
        cache: "no-store",
        signal: AbortSignal.timeout(timeoutMs),
      });
    } catch (cause) {
      const detail =
        cause?.cause?.message || cause?.message || cause?.name || "Network request failed";
      return { ok: false, status: null, error: `Service unavailable (${detail})` };
    }

    const status = response.status;

    // A deactivation answers 204, so there is deliberately no body to read.
    if (status === 204) return { ok: true, status };

    let json;
    try {
      json = await response.json();
    } catch {
      return { ok: false, status, error: `Server error (${status})` };
    }

    if (!response.ok) {
      const message =
        json?.error?.message || json?.detail || `Request failed with status ${status}`;
      return { ok: false, status, error: message };
    }

    return { ok: true, status, data: json?.data ?? json };
  }

  return { request };
}

/**
 * Extracts the list out of a collection envelope.
 *
 * @returns {{data: Array, error: string|null}}
 */
export function extractList(response) {
  if (!response.ok) return { data: [], error: response.error ?? "Request failed" };
  const payload = response.data;
  const list = Array.isArray(payload) ? payload : (payload?.data ?? []);
  return { data: list, error: null };
}

/**
 * The body for creating a section.
 *
 * There is deliberately no grade. MathSmart teaches one, the server resolves
 * it, and the API forbids unknown fields — so sending one would be refused,
 * which is what stops a crafted request putting a section anywhere else.
 *
 * An unassigned adviser is an omission, not an empty string: a blank string is
 * not an identifier.
 */
export function sectionCreatePayload({ name, adviser_id, is_active }) {
  const payload = { name, is_active };
  if (typeof adviser_id === "string" && adviser_id.trim()) {
    payload.adviser_id = adviser_id;
  }
  return payload;
}

/**
 * The body for changing a section.
 *
 * Clearing the adviser has to be explicit: an absent key leaves the current
 * adviser alone, so a blank choice becomes `null` rather than disappearing.
 * A grade never travels, for the same reason it never travels on a create.
 */
export function sectionPatchPayload(patch) {
  const cleaned = { ...patch };
  delete cleaned.grade_id;
  if ("adviser_id" in cleaned) {
    const value = cleaned.adviser_id;
    if (typeof value !== "string" || !value.trim()) {
      cleaned.adviser_id = null;
    }
  }
  return cleaned;
}

/**
 * Rewrites a database constraint refusal into something a teacher can act on.
 *
 * The API reports a broken reference in its own terms; the person reading it
 * needs to know which choice to change.
 */
export function clarifySectionFailure(result) {
  if (result.ok || typeof result.error !== "string") return result;

  const message = result.error;
  if (!message.includes("foreign key") && !message.includes("violates")) return result;

  if (message.includes("adviser")) {
    return {
      ...result,
      error:
        "The selected adviser is invalid or has been removed. Please choose another or leave unassigned.",
    };
  }
  if (message.includes("grade")) {
    return {
      ...result,
      error: "The selected grade level is invalid. Please refresh the page and try again.",
    };
  }
  return result;
}

/**
 * Maps the account directory onto the adviser choices a section may use.
 *
 * Keyed by `teacher_admin_id`, which is what `sections.adviser_id` references.
 * That is the profile's own key, not the account's `user_id`: they are
 * different values, and sending the account id reached the database and came
 * back as a foreign key violation the browser could only report as "Failed to
 * fetch". An account with no teacher_admin profile has no id to be assigned
 * by, so it is left out rather than offered and then refused.
 *
 * Only an active Teacher/Administrator with a usable name can advise a
 * section, so anything else is left out too.
 *
 * @param {unknown} users
 * @returns {Record<string, string>} teacher_admin_id to display name
 */
export function buildAdviserDirectory(users) {
  const advisers = {};
  if (!Array.isArray(users)) return advisers;

  for (const user of users) {
    if (
      user &&
      user.teacher_admin_id &&
      user.role === "teacher_admin" &&
      user.account_status === "active" &&
      typeof user.full_name === "string" &&
      user.full_name.trim()
    ) {
      advisers[String(user.teacher_admin_id)] = user.full_name.trim();
    }
  }
  return advisers;
}

/**
 * Whether the directory read failed outright.
 *
 * One list answering is still a useful page, so only a pair of failures is
 * reported as an unavailable directory.
 */
export function directoryReadError(gradesOk, sectionsOk) {
  return !gradesOk && !sectionsOk ? "unavailable" : undefined;
}
