import { Badge } from "@/components/ui/badge";

/**
 * The small fixed chips on each module row. Status is the only badge that
 * carries working meaning, so it is the only one with a colour cue — and the
 * label text always says the word, so the colour is never the message on its
 * own. Competency, rule and example counts stay outline chips that rely on
 * text.
 */
export function ModuleBadges({ competency, rulesCount, workedExamplesCount }) {
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {competency ? <Badge variant="outline">{competency}</Badge> : null}
      <Badge variant="outline">
        {rulesCount} {rulesCount === 1 ? "rule" : "rules"}
      </Badge>
      <Badge variant="outline">
        {workedExamplesCount} {workedExamplesCount === 1 ? "example" : "examples"}
      </Badge>
    </div>
  );
}

export function StatusBadge({ status, label }) {
  const variant =
    status === "published" ? "default" : status === "archived" ? "outline" : "secondary";

  return <Badge variant={variant}>{label}</Badge>;
}