import React from "react";
import Link from "next/link";
import { ClipboardList, PencilRuler } from "lucide-react";

import { LinkPending } from "@/modules/shared";

import { STUDENT_ROUTE } from "../utils/dashboard-model";

function Item({ item, icon: Icon }) {
  return (
    <li>
      <Link
        href={item.href}
        className="flex items-start gap-3 rounded-lg px-2 py-2 transition-colors hover:bg-secondary/60 focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
      >
        <Icon aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-primary" />
        <span className="flex min-w-0 flex-1 flex-col">
          <span className="truncate text-sm font-medium text-foreground">{item.title}</span>
          <span className="text-xs text-muted-foreground">
            {[item.detail, item.minutes ? `About ${item.minutes} minutes` : null]
              .filter(Boolean)
              .join(" · ") || (item.started ? "Started" : "Ready to start")}
          </span>
        </span>
        <LinkPending />
      </Link>
    </li>
  );
}

function Column({ id, title, items, count, total, emptyText, unavailableText, href, icon }) {
  return (
    <div className="flex min-w-0 flex-col gap-2">
      <div className="flex items-baseline justify-between gap-3">
        <h3 id={id} className="text-sm font-semibold text-foreground">
          {title}
          {count !== null ? (
            <span className="ml-1.5 font-normal tabular-nums text-muted-foreground">({count})</span>
          ) : null}
        </h3>
        <Link
          href={href}
          className="text-xs font-semibold text-primary underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
        >
          See all
        </Link>
      </div>
      {items === null ? (
        <p className="text-sm text-muted-foreground">{unavailableText}</p>
      ) : items.length === 0 ? (
        <p className="text-sm text-muted-foreground">{emptyText}</p>
      ) : (
        <>
          <ul aria-labelledby={id} className="-mx-2 flex flex-col">
            {items.map((item) => (
              <Item key={item.id} item={item} icon={icon} />
            ))}
          </ul>
          {total > items.length ? (
            <p className="text-xs text-muted-foreground">{total - items.length} more open.</p>
          ) : null}
        </>
      )}
    </div>
  );
}

/**
 * The practice and assessments open to this learner right now.
 *
 * Both lists are the server's answer: an activity is offered when the server
 * marks it ready and open on this learner's path, an assessment when its
 * `availability` says it can be sat. The page used to link to both catalogues
 * and show neither, so a learner had to go and look to find out whether
 * anything was waiting.
 *
 * A list that could not be read says so rather than claiming nothing is open.
 */
export function ReadyForYou({ ready }) {
  return (
    <section
      aria-labelledby="ready-heading"
      className="flex flex-col gap-4 rounded-2xl border border-border bg-card p-5"
    >
      <h2 id="ready-heading" className="font-display text-lg font-bold tracking-tight text-foreground">
        Ready for you
      </h2>
      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
        <Column
          id="ready-practice-heading"
          title="Practice"
          items={ready.activities}
          count={ready.activityCount}
          total={ready.activityCount ?? 0}
          emptyText="No practice is open right now. Finish your current lesson to open the next one."
          unavailableText="Your practice list could not be loaded just now."
          href={STUDENT_ROUTE.ACTIVITIES}
          icon={PencilRuler}
        />
        <Column
          id="ready-assessments-heading"
          title="Assessments"
          items={ready.assessments}
          count={ready.assessmentCount}
          total={ready.assessmentCount ?? 0}
          emptyText="No assessment is waiting for you right now."
          unavailableText="Your assessment list could not be loaded just now."
          href={STUDENT_ROUTE.ASSESSMENTS}
          icon={ClipboardList}
        />
      </div>
    </section>
  );
}
