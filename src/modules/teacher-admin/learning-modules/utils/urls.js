const LEARNING_MODULES_PATH = "/teacher/learning-modules";

/** Builds a list URL without dropping the active search or publication status. */
export function learningModulesUrl({ search = "", status = "published", page = 1 } = {}) {
  const query = new URLSearchParams();

  if (search) {
    query.set("search", search);
  }
  query.set("status", status);
  query.set("page", String(page));

  return `${LEARNING_MODULES_PATH}?${query.toString()}`;
}
