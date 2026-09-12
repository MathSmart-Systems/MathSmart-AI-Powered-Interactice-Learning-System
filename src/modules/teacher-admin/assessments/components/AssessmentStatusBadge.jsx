import { Archive, CheckCircle2, PencilLine } from "lucide-react";

import { Badge } from "@/components/ui/badge";

import { formatAssessmentStatus } from "../utils/format.js";

/** One shape per state, so the badge never relies on its colour alone. */
const ICONS = {
  published: CheckCircle2,
  archived: Archive,
  draft: PencilLine,
};

/**
 * An assessment's publication state.
 *
 * This is a label, not an announcement: a listing of twenty rows carries twenty
 * of these, and marking each one a live region would make a screen reader read
 * the whole table aloud on every change.
 */
export function AssessmentStatusBadge({ status, className }) {
  const { label, tone, icon } = formatAssessmentStatus(status);
  const Icon = ICONS[icon] ?? PencilLine;

  return (
    <Badge variant={tone} className={className}>
      <Icon aria-hidden="true" />
      {label}
    </Badge>
  );
}
