import { Badge } from "@/components/ui/badge";
import { CheckCircle2, Clock, AlertTriangle, Info } from "lucide-react";

const SEVERITY_STYLES = {
  HIGH: "border-rose-500/40 bg-rose-500/10 text-rose-700 dark:text-rose-300",
  MEDIUM: "border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-300",
  LOW: "border-blue-500/40 bg-blue-500/10 text-blue-700 dark:text-blue-300",
};

const STATUS_STYLES = {
  "Needs Intervention": "border-rose-500/40 bg-rose-500/10 text-rose-700 dark:text-rose-300",
  "In Progress": "border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-300",
  Resolved: "border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
};

function SeverityIcon({ value }) {
  if (value === "HIGH") return <AlertTriangle aria-hidden="true" className="size-3 text-inherit" />;
  if (value === "MEDIUM") return <Clock aria-hidden="true" className="size-3 text-inherit" />;
  return <Info aria-hidden="true" className="size-3 text-inherit" />;
}

function StatusIcon({ value }) {
  if (value === "Resolved") return <CheckCircle2 aria-hidden="true" className="size-3 text-inherit" />;
  if (value === "In Progress") return <Clock aria-hidden="true" className="size-3 text-inherit" />;
  return <AlertTriangle aria-hidden="true" className="size-3 text-inherit" />;
}

/**
 * A single badge for an intervention severity or lifecycle status.
 *
 * Color carries emphasis but never the whole message: the badge always includes
 * the label text, so a colour-vision-impaired teacher still reads the value.
 *
 * @param {object} props
 * @param {"severity"|"status"} props.kind
 * @param {string|null|undefined} props.value
 */
export function CaseStatusBadge({ kind, value }) {
  const styles = kind === "severity" ? SEVERITY_STYLES : STATUS_STYLES;
  const map = kind === "severity" ? { HIGH: "High", MEDIUM: "Medium", LOW: "Low" } : {};
  const label = kind === "severity" ? (map[value] ?? value ?? "Unknown") : (value ?? "Unknown");
  const style = styles[value] ?? "border-border bg-muted text-muted-foreground";

  return (
    <Badge variant="outline" className={style}>
      {kind === "severity" ? (
        <SeverityIcon value={value} />
      ) : (
        <StatusIcon value={value} />
      )}
      {label}
    </Badge>
  );
}