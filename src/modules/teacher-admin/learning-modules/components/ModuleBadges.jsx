import { Badge } from "@/components/ui/badge";

/**
 * The small fixed chips on each module row. Status is the only badge that
 * carries working meaning, so it is the only one with a colour cue — and the
 * label text always says the word, so the colour is never the message on its
 * own. Competency, rule and example counts stay outline chips that rely on
 * text.
 *
 * The competency chip is allowed to wrap: a competency reads
 * "M6NS-Ia-2 - Numbers and number sense", which is wider than a phone at the
 * whitespace-nowrap the Badge primitive defaults to, and a chip that cannot
 * shrink and cannot wrap pushes the row past the edge of the workspace.
 *
 * The strand is shown when it is known and is never offered as a filter: a
 * strand written under "Other" belongs to the competency that carries it.
 */
export function ModuleBadges({ competency, strand, rulesCount, workedExamplesCount }) {
  return (
    <div className="flex min-w-0 flex-wrap items-center gap-1.5">
      {competency ? (
        <Badge variant="outline" className="max-w-full whitespace-normal">
          {competency}
        </Badge>
      ) : null}
      {strand ? (
        <Badge variant="outline" className="max-w-full whitespace-normal">
          {strand}
        </Badge>
      ) : null}
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