import { Badge } from "@/components/ui/badge";

/**
 * The small fixed chips on each question row. Status is the only badge that
 * carries working meaning, so it is the only one with a colour cue — and the
 * label text always says the word, so the colour is never the message on its
 * own. Type, difficulty and competency stay outline chips and rely on text.
 */
export function QuestionBadges({ typeLabel, difficultyLabel, competency }) {
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <Badge variant="outline">{typeLabel}</Badge>
      <Badge variant="outline">{difficultyLabel}</Badge>
      {competency ? <Badge variant="outline">{competency}</Badge> : null}
    </div>
  );
}

export function StatusBadge({ status, label }) {
  const variant =
    status === "published" ? "default" : status === "archived" ? "outline" : "secondary";

  return <Badge variant={variant}>{label}</Badge>;
}