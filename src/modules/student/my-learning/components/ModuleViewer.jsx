import { MODULE_STATE, readModule } from "../services/my-learning-data";

import { moduleRoute } from "../utils/my-learning-model";

import { ModuleReader } from "./ModuleReader";
import { ModuleUnavailable } from "./ModuleUnavailable";

/**
 * Reads one module and renders whichever outcome applies. The route wraps this
 * in a `<Suspense>` boundary, so the workspace shell and the loading shape are
 * on screen while this awaits.
 */
export async function ModuleViewer({ moduleId }) {
  const result = await readModule(moduleId);

  if (result.state === MODULE_STATE.NOT_FOUND) {
    return <ModuleUnavailable kind="not_found" />;
  }

  // A lesson the path has not opened yet is refused by the database, not by
  // this component. Showing the reader anyway would hand a learner a checklist
  // that cannot save, so the locked state is rendered in its place.
  if (result.state === MODULE_STATE.LOCKED) {
    return <ModuleUnavailable kind="locked" />;
  }

  if (result.state === MODULE_STATE.ERROR) {
    return <ModuleUnavailable kind="error" retryHref={moduleRoute(moduleId)} />;
  }

  return <ModuleReader module={result.model} />;
}
