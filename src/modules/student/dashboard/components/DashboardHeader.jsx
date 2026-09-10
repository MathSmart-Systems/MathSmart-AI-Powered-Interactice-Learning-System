import { ClipboardCheck } from "lucide-react";

import { greetingFor } from "../utils/format";

/**
 * The greeting, and the one fact everything else on the page depends on.
 *
 * The diagnostic sets the learner's baseline, decides whether a path exists and
 * therefore decides what the next step is, so its status is stated plainly here
 * before anything else is claimed.
 */
export function DashboardHeader({ learner, diagnostic }) {
  const name = learner.firstName;

  return (
    <header className="flex flex-col gap-5">
      <div className="flex flex-col gap-2">
        <p className="text-sm text-muted-foreground">Grade 6 mathematics</p>
        <h1 className="font-display text-3xl leading-tight font-semibold tracking-tight text-foreground sm:text-4xl">
          {greetingFor()}
          {name ? `, ${name}` : ""}
        </h1>
        <span aria-hidden="true" className="mt-1 h-0.5 w-16 bg-primary" />
      </div>

      <div className="flex gap-3 border-l-[3px] border-primary bg-card px-5 py-4">
        <ClipboardCheck aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-primary" />
        <div className="flex flex-col gap-1">
          <p className="text-sm text-foreground">
            <span className="text-muted-foreground">Diagnostic status</span>{" "}
            <span className="font-semibold">{diagnostic.label}</span>
          </p>
          <p className="max-w-prose text-sm leading-relaxed text-muted-foreground">
            {diagnostic.summary}
          </p>
        </div>
      </div>
    </header>
  );
}
