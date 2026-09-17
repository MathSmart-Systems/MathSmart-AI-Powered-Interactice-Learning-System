export const MASTERY_BAND = Object.freeze({
  Mastered: Object.freeze({ label: "Mastered", variant: "default" }),
  Developing: Object.freeze({ label: "Developing", variant: "secondary" }),
  "Needs Improvement": Object.freeze({ label: "Needs Improvement", variant: "destructive" }),
});

export function masteryBand(value) {
  return MASTERY_BAND[value] ?? { label: "Not assessed", variant: "outline" };
}

export const MONITORING_STATUS = Object.freeze({
  active: Object.freeze({ label: "Active", variant: "secondary" }),
  needs_intervention: Object.freeze({ label: "Needs intervention", variant: "destructive" }),
  improving: Object.freeze({ label: "Improving", variant: "outline" }),
  mastered: Object.freeze({ label: "Mastered", variant: "default" }),
  inactive: Object.freeze({ label: "Inactive", variant: "outline" }),
});

export function monitoringStatus(value) {
  return MONITORING_STATUS[value] ?? { label: "Not available", variant: "outline" };
}

export function masteryColor(score) {
  if (score == null) return "text-muted-foreground";
  if (score >= 80) return "text-emerald-700";
  if (score >= 50) return "text-amber-700";
  return "text-rose-700";
}

export function masteryBarColor(score) {
  if (score == null) return "bg-muted";
  if (score >= 80) return "bg-emerald-500";
  if (score >= 50) return "bg-amber-500";
  return "bg-rose-500";
}
