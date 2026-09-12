import { Archive, CheckCircle2, FileEdit } from "lucide-react";

import { Badge } from "@/components/ui/badge";

import { formatActivityStatus } from "../utils/format";

const ICONS = {
  published: CheckCircle2,
  archived: Archive,
  draft: FileEdit,
};

/**
 * Visual badge for activity publication status.
 *
 * Uses both shape/icon and semantic badge variant to ensure color alone is
 * never the sole indicator of status.
 */
export function ActivityStatusBadge({ status, className }) {
  const meta = formatActivityStatus(status);
  const Icon = ICONS[meta.icon] || FileEdit;

  return (
    <Badge variant={meta.tone} className={className}>
      <Icon className="size-3 mr-1 shrink-0" aria-hidden="true" />
      <span>{meta.label}</span>
    </Badge>
  );
}
