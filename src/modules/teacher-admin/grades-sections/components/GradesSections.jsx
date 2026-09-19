import { readGradesSections } from "../services/grades-sections-data";

import { GradesSectionsView } from "./GradesSectionsView";

/**
 * Reads the signed-in Teacher/Administrator's school directory and hands it to
 * the interactive view. The route wraps this in a `<Suspense>` boundary, so the
 * workspace shell and the loading shape are on screen while this awaits.
 */
export async function GradesSections() {
  const { grades, sections, advisers, error } = await readGradesSections();

  return (
    <GradesSectionsView
      initialGrades={grades}
      initialSections={sections}
      advisers={advisers}
      initialError={error}
    />
  );
}
