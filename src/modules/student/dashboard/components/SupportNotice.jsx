import { Award, LifeBuoy } from "lucide-react";

/**
 * Learner support, said calmly.
 *
 * Marking-pen red is reserved for something that has actually gone wrong with
 * the software. A learner who needs more help has not done anything wrong, so
 * this notice uses the same pine rule as every other supportive message on the
 * page, and the words explain what happens next rather than what went badly.
 */
export function SupportNotice({ notice }) {
  const Icon = notice.tone === "praise" ? Award : LifeBuoy;

  return (
    <aside
      aria-label="Learner support"
      className="flex gap-3 border-l-[3px] border-primary bg-primary/5 px-5 py-4"
    >
      <Icon aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-primary" />
      <div className="flex flex-col gap-1">
        <p className="text-sm font-semibold text-foreground">{notice.heading}</p>
        <p className="max-w-prose text-sm leading-relaxed text-muted-foreground">
          {notice.body}
        </p>
      </div>
    </aside>
  );
}
