import { readStudentsData } from "../services/students-data";

import { StudentsView } from "./StudentsView";

/**
 * Reads the roster, the grade directory and the section directory, then hands
 * them to the interactive view. The route wraps this in a `<Suspense>`
 * boundary, so the workspace shell and the loading shape are on screen while
 * this awaits.
 */
export async function Students() {
  const { learners, grades, sections, sectionCounts, rosterTotal, rosterTruncated, error } =
    await readStudentsData();

  return (
    <StudentsView
      initialLearners={learners}
      initialGrades={grades}
      initialSections={sections}
      initialSectionCounts={sectionCounts}
      initialError={error}
      initialTruncated={rosterTruncated}
      initialTotal={rosterTotal}
    />
  );
}
