/**
 * The report's filters, as they live in the address bar.
 *
 * The address is the one place the filters are kept, so a refresh, a shared
 * link and the back button all show the same report. Anything the address
 * holds that is not a real value is dropped rather than sent: an unknown
 * status, a malformed date, a page that is not a whole number.
 */

export const STATUS_OPTIONS = Object.freeze([
  { value: "needs_intervention", label: "Needs support" },
  { value: "active", label: "Learning" },
  { value: "improving", label: "Improving" },
  { value: "mastered", label: "Mastered" },
  { value: "inactive", label: "Inactive" },
]);

const STATUS_VALUES = new Set(STATUS_OPTIONS.map((option) => option.value));
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

export const EMPTY_FILTERS = Object.freeze({
  sectionId: null,
  competencyId: null,
  status: null,
  from: null,
  to: null,
  page: 1,
});

function first(value) {
  return Array.isArray(value) ? value[0] : value;
}

function id(value) {
  const text = first(value);
  return typeof text === "string" && UUID.test(text) ? text.toLowerCase() : null;
}

/** A real calendar date in YYYY-MM-DD, or null. */
export function isoDate(value) {
  const text = first(value);
  if (typeof text !== "string" || !ISO_DATE.test(text)) return null;
  const parsed = new Date(`${text}T00:00:00Z`);
  return Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== text ? null : text;
}

/**
 * @param {Record<string, string|string[]|undefined>|URLSearchParams|null|undefined} params
 * @returns {typeof EMPTY_FILTERS}
 */
export function readReportFilters(params) {
  const get = (key) =>
    params instanceof URLSearchParams ? params.get(key) : params?.[key];

  const status = first(get("status"));
  let from = isoDate(get("from"));
  let to = isoDate(get("to"));
  // A range that ends before it starts is not a range. Keep the start.
  if (from && to && to < from) to = null;

  const page = Number.parseInt(first(get("page")) ?? "", 10);

  return {
    sectionId: id(get("section")),
    competencyId: id(get("competency")),
    status: STATUS_VALUES.has(status) ? status : null,
    from,
    to,
    page: Number.isInteger(page) && page > 1 ? page : 1,
  };
}

/**
 * The address for a set of filters. Page 1 and empty filters are left out, so
 * the plain report has a plain address.
 *
 * @param {Partial<typeof EMPTY_FILTERS>} filters
 * @returns {string} "" or "?section=…&…"
 */
export function reportQuery(filters) {
  const params = new URLSearchParams();
  if (filters.sectionId) params.set("section", filters.sectionId);
  if (filters.competencyId) params.set("competency", filters.competencyId);
  if (filters.status) params.set("status", filters.status);
  if (filters.from) params.set("from", filters.from);
  if (filters.to) params.set("to", filters.to);
  if (filters.page && filters.page > 1) params.set("page", String(filters.page));
  const text = params.toString();
  return text ? `?${text}` : "";
}

/**
 * The same filters in the API's own names.
 *
 * @param {Partial<typeof EMPTY_FILTERS>} filters
 * @param {{page?: boolean}} [options]
 */
export function apiParams(filters, { page = true } = {}) {
  const params = new URLSearchParams();
  if (filters.sectionId) params.set("section_id", filters.sectionId);
  if (filters.competencyId) params.set("competency_id", filters.competencyId);
  if (filters.status) params.set("status", filters.status);
  if (filters.from) params.set("from", filters.from);
  if (filters.to) params.set("to", filters.to);
  if (page && filters.page && filters.page > 1) params.set("page", String(filters.page));
  return params;
}

/** The same filters as the summary request body. */
export function summaryBody(filters) {
  return {
    section_id: filters.sectionId ?? null,
    competency_id: filters.competencyId ?? null,
    status: filters.status ?? null,
    from: filters.from ?? null,
    to: filters.to ?? null,
  };
}

/** True when anything narrows the report. */
export function isFiltered(filters) {
  return Boolean(
    filters.sectionId || filters.competencyId || filters.status || filters.from || filters.to,
  );
}

/** Changing a filter starts the learner list again from its first page. */
export function withFilter(filters, key, value) {
  return { ...filters, [key]: value || null, page: 1 };
}
