import { MODULE_STATE, readModule } from "../services/my-learning-data";

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

  if (result.state === MODULE_STATE.ERROR) {
    return <ModuleUnavailable kind="error" />;
  }

  return <ModuleReader module={result.model} />;
}