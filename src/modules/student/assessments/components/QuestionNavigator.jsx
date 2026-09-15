"use client";

import { hasAnswer } from "../utils/format";

export function QuestionNavigator({
  questions = [],
  currentIndex = 0,
  answers = {},
  onJumpTo,
}) {
  return (
    <nav aria-label="Question navigator" className="flex flex-wrap gap-1.5">
      {questions.map((question, position) => {
        const isCurrent = position === currentIndex;
        const isAnswered = hasAnswer(answers[question.id]);

        return (
          <button
            key={question.id}
            type="button"
            onClick={() => onJumpTo?.(position)}
            aria-current={isCurrent ? "true" : undefined}
            aria-label={`Question ${position + 1}${isAnswered ? ", answered" : ", blank"}`}
            className={`size-8 rounded-md border text-xs font-medium tabular-nums transition-colors duration-200 ${
              isCurrent
                ? "border-primary bg-primary text-primary-foreground"
                : isAnswered
                  ? "border-border bg-secondary text-foreground hover:border-primary/40"
                  : "border-border bg-card text-muted-foreground hover:border-primary/40"
            }`}
          >
            {position + 1}
          </button>
        );
      })}
    </nav>
  );
}
