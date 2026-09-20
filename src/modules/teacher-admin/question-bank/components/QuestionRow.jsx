import { QuestionBadges, StatusBadge } from "./QuestionBadges";

/**
 * One question in the list. Purely presentational: the row's controls arrive as
 * an `actions` node rendered by the parent, so the row never talks to the API
 * itself or decides what a teacher may do. Archived rows are visually set
 * aside but keep their prompt readable, because they still matter to the
 * learners who were given them.
 *
 * ## Why the actions are their own column
 *
 * They used to share one `flex-wrap` row with the badges. That made their
 * position depend on how wide the badges happened to be: a question with a
 * short competency name kept Restore and Delete permanently at the top right,
 * and the next one along — same card, longer competency — wrapped them onto a
 * line of their own underneath. Two cards in the same list, two different
 * layouts, for no reason a teacher could see.
 *
 * The actions are a sibling column now. Their place is fixed by the card, not
 * by the metadata beside them: the details column takes the remaining width
 * and wraps inside itself, however many badges it holds and however long they
 * are. Below `sm` the card stacks, and the whole group moves together beneath
 * the details rather than splitting across the fold.
 */
export function QuestionRow({ question, actions }) {
  const archived = question.status === "archived";
  const meta = qMeta(question);

  return (
    <li>
      <div
        className={
          archived
            ? "flex flex-col gap-4 border border-border bg-secondary/50 px-5 py-5 sm:flex-row sm:items-start sm:gap-6 sm:px-6"
            : "flex flex-col gap-4 border border-border bg-card px-5 py-5 sm:flex-row sm:items-start sm:gap-6 sm:px-6"
        }
      >
        <div className="flex min-w-0 flex-1 flex-col gap-4">
          <div className="flex min-w-0 flex-wrap items-center gap-1.5">
            <StatusBadge status={question.status} label={question.statusLabel} />
            <QuestionBadges
              typeLabel={question.typeLabel}
              difficultyLabel={question.difficultyLabel}
              competency={question.competency}
              strand={question.competencyStrand}
            />
          </div>

          <div className="flex min-w-0 flex-col gap-1">
            <h3
              className={
                archived
                  ? "font-display text-lg leading-snug font-semibold tracking-tight break-words text-muted-foreground"
                  : "font-display text-lg leading-snug font-semibold tracking-tight break-words text-foreground"
              }
            >
              {question.prompt}
            </h3>

            {meta ? <p className="text-sm text-muted-foreground">{meta}</p> : null}
          </div>
        </div>

        {actions ? (
          <div className="flex shrink-0 flex-wrap items-start gap-2 sm:justify-end">
            {actions}
          </div>
        ) : null}
      </div>
    </li>
  );
}

/** Joins the available option count, version, and update date into row metadata. */
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
