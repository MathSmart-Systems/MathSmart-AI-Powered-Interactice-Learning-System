import { COMPETENCIES_STATE, readCompetenciesCatalogue } from "../services/competencies-data";

import { CompetenciesUnavailable } from "./CompetenciesUnavailable";
import { CompetenciesView } from "./CompetenciesView";

/**
 * Reads the signed-in Teacher/Administrator's competency catalogue and renders
 * whichever of its two outcomes applies. The route wraps this in a
 * `<Suspense>` boundary, so the workspace shell and the loading shape are on
 * screen while this awaits.
 */
export async function Competencies() {
  const result = await readCompetenciesCatalogue();

  if (result.state === COMPETENCIES_STATE.ERROR) {
    return <CompetenciesUnavailable reason={result.reason} />;
  }

  return <CompetenciesView model={result.model} />;
}