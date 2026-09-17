/**
 * The Student My Learning screen.
 *
 * The single source for the order is the backend's learning path: it ran with
 * the teacher's reasons, so it is a numbered list and the numbers mean the
 * priority the API assigned. The catalogue below it is the "look further
 * ahead" shelf — every published lesson the learner is not on the way to yet.
 * Nothing here decides a status; every label is written out from the API's
 * own answer.
 */

import { ModuleRow } from "./ModuleRow";

function EmptyNote({ children }) {
  return (
    <p className="border-l-[3px] border-border bg-card px-5 py-4 text-sm leading-relaxed text-muted-foreground">
      {children}
    </p>
  );
}

function SectionHeading({ id, title, description }) {
  return (
    <div className="flex flex-col gap-1">
      <h2
        id={id}
        className="font-display text-xl font-semibold tracking-tight text-foreground"
      >
        {title}
      </h2>
      {description ? (
        <p className="max-w-prose text-sm leading-relaxed text-muted-foreground">
          {description}
        </p>
      ) : null}
    </div>
  );
}

/**
 * @param {object} props
 * @param {object} props.model       the joined path-and-catalogue model
 * @param {string} props.diagnosticStatus app.diagnostic_status, or null
 * @param {boolean} props.pathUnavailable true when the path read failed
 */
export function MyLearningView({ model, diagnosticStatus, pathUnavailable }) {
  const pathReady = diagnosticStatus === "completed";

  if (model.catalogueEmpty) {
    return (
      <div className="flex flex-col gap-10">
        <MyLearningHeader />
        <EmptyNote>
          No learning modules are published for Grade 6 yet. Your teacher publishes lessons
          from the teacher workspace, and they appear here as soon as they are ready.
        </EmptyNote>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-10">
      <MyLearningHeader />

      <section aria-labelledby="learning-path-heading" className="flex flex-col gap-4">
        <SectionHeading
          id="learning-path-heading"
          title="Your learning path"
          description={
            pathReady
              ? "The order MathSmart recommends, built from what your diagnostic found."
              : "Recommended lessons appear here in order once your diagnostic is marked."
          }
        />

        {pathUnavailable ? (
          <EmptyNote>
            Your learning path could not be loaded just now. The published lessons below are
            still available. Reload the page to try again.
          </EmptyNote>
        ) : model.pathEmpty ? (
          <EmptyNote>
            {pathReady
              ? "Your teacher has not lined up your path yet. While it is being prepared, the published lessons below are ready for you to explore."
              : "Your learning path is built from your diagnostic. Once your diagnostic is marked, your recommended lessons will line up here in order."}
          </EmptyNote>
        ) : (
          <ol className="flex flex-col border border-border bg-card">
            {model.path.map((row) => (
              <ModuleRow key={row.key} row={row} number={row.priority} />
            ))}
          </ol>
        )}
      </section>

      {model.browse.length > 0 ? (
        <section aria-labelledby="explore-heading" className="flex flex-col gap-4">
          <SectionHeading
            id="explore-heading"
            title="Lessons to explore"
            description="Published lessons not on your path, if you want to look further ahead."
          />

          <ol className="flex flex-col border border-border bg-card">
            {model.browse.map((row) => (
              <ModuleRow key={row.key} row={row} number={null} />
            ))}
          </ol>
        </section>
      ) : null}
    </div>
  );
}

function MyLearningHeader() {
  return (
    <header className="flex flex-col gap-3">
      <p className="text-sm text-muted-foreground">Grade 6 mathematics</p>
      <h1 className="font-display text-3xl leading-tight font-semibold tracking-tight text-foreground sm:text-4xl">
        My Learning
      </h1>
      <p className="max-w-prose text-sm leading-relaxed text-muted-foreground">
        The lessons MathSmart recommends for you, in the order your diagnostic set them.
      </p>
      <span aria-hidden="true" className="mt-1 h-0.5 w-16 bg-primary" />
    </header>
  );
}