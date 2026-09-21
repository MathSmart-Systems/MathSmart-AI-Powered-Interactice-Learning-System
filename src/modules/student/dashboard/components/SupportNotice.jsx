import React from "react";
import { Award, HeartHandshake } from "lucide-react";

/**
 * A calm word about support, shown only when there is something to say.
 *
 * Status role, not alert: this is reassurance, not a warning. It never names
 * a severity, a reason or a status — the learner is told their teacher is
 * helping, and that is all the data behind it can say.
 */
export function SupportNotice({ notice }) {
  const Icon = notice.tone === "praise" ? Award : HeartHandshake;

  return (
    <aside
      role="status"
      aria-label="Support from your teacher"
      className="flex items-start gap-3 rounded-2xl border border-primary/20 bg-primary/5 px-4 py-3"
    >
      <Icon aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-primary" />
      <div className="flex flex-col gap-0.5 text-sm">
        <p className="font-semibold text-foreground">{notice.heading}</p>
        <p className="text-muted-foreground leading-relaxed">
          {notice.body}
        </p>
      </div>
    </aside>
  );
}
