import { QuestionBadges, StatusBadge } from "./QuestionBadges";

/**
 * One question in the list. Purely presentational: the row's controls arrive as
 * a `actions` node rendered by the parent, so the row never talks to the API
 * itself or decides what a teacher may do. Archived rows are visually set
 * aside but keep their prompt readable, because they still matter to the
 * learners who were given them.
 */
export function QuestionRow({ question, actions }) {
  const archived = question.status === "archived";
  const meta = qMeta(question);

  return (
    <li>
      <div
        className={
          archived
            ? "flex flex-col gap-4 border border-border bg-secondary/50 px-5 py-5 sm:px-6"
            : "flex flex-col gap-4 border border-border bg-card px-5 py-5 sm:px-6"
        }
      >
        <div className="flex flex-wrap items-start justify-between gap-x-6 gap-y-2">
          <div className="flex flex-wrap items-center gap-1.5">
            <StatusBadge status={question.status} label={question.statusLabel} />
            <QuestionBadges
              typeLabel={question.typeLabel}
              difficultyLabel={question.difficultyLabel}
              competency={question.competency}
            />
          </div>

          {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
        </div>

        <div className="flex flex-col gap-1">
          <h3
            className={
              archived
                ? "font-display text-lg leading-snug font-semibold tracking-tight text-muted-foreground"
                : "font-display text-lg leading-snug font-semibold tracking-tight text-foreground"
            }
          >
            {question.prompt}
          </h3>

          {meta ? <p className="text-sm text-muted-foreground">{meta}</p> : null}
        </div>
      </div>
    </li>
  );
}

function qMeta(question) {
  const bits = [];

  if (question.options !== null && question.options !== undefined) {
    bits.push(`${question.options} ${question.options === 1 ? "option" : "options"}`);
  }

  if (question.version !== null) {
    bits.push(`Version ${question.version}`);
  }

  if (question.updatedLabel) {
    bits.push(question.updatedLabel);
  }

  return bits.length > 0 ? bits.join(" · ") : null;
}