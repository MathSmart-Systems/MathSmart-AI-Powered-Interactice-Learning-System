import React from "react";
import { Award, HelpCircle, LifeBuoy } from "lucide-react";

/**
 * Learner support card conforming to the MathSmart UI/UX reference.
 * Renders advisory guidance, encouragement, or teacher feedback in a clean card.
 */
export function SupportNotice({ notice }) {
  const Icon = notice.tone === "praise" ? Award : HelpCircle;

  return (
    <aside
      aria-label="Learner support"
      className="bg-primary/5 rounded-2xl p-5 border border-primary/20 shadow-xs flex items-start gap-3"
    >
      <Icon aria-hidden="true" className="size-4 shrink-0 text-primary mt-0.5" />
      <div className="flex flex-col gap-1 text-xs">
        <p className="font-bold text-foreground">{notice.heading}</p>
        <p className="text-muted-foreground leading-relaxed">
          {notice.body}
        </p>
      </div>
    </aside>
  );
}
