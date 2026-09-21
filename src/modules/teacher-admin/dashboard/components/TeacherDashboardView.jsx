"use client";

import { useTransition } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { LoaderCircle } from "lucide-react";

import { Button } from "@/components/ui/button";
import { ResultAnnouncer } from "@/modules/shared";
import { NATIVE_SELECT_CLASS } from "@/modules/shared/utils/native-select";

import { FIELD_IDS, TEACHER_ROUTES } from "../utils/constants.js";
import {
  ClassSummary,
  CompetencySummary,
  InterventionSummary,
  PriorityLearners,
  RecentActivity,
} from "./DashboardSections.jsx";

/**
 * The Teacher/Administrator dashboard, for one section or the whole grade.
 *
 * The section lives in the address. Choosing one replaces the URL inside a
 * transition, so the server renders the new section while the old one stays
 * on screen, dimmed, where the teacher left it: no skeleton, no jump back to
 * the top. The version this replaced kept the section in component state, so
 * a refresh or the back button quietly returned the whole school.
 *
 * A failed read is an error beside the filter, not a replacement for the page
 * and never a page of zeros. The filter stays, so a teacher can pick another
 * section or try again without losing their place.
 *
 * @param {object} props
 * @param {object} props.model - From `buildDashboardModel`
 * @param {string|null} [props.error] - Why the dashboard could not be read
 * @param {boolean} [props.classesUnavailable] - The section list failed on its own
 */
export function TeacherDashboardView({ model, error = null, classesUnavailable = false }) {
  const router = useRouter();
  const pathname = usePathname();
  const [pending, startTransition] = useTransition();

  const chooseSection = (sectionId) => {
    const query = sectionId ? `?section=${encodeURIComponent(sectionId)}` : "";
    startTransition(() => {
      router.replace(`${pathname}${query}`, { scroll: false });
    });
  };

  const retry = () => {
    startTransition(() => router.refresh());
  };

  const scope = model.selectedSection ? model.selectedSection.name : "All Grade 6 sections";
  const announcement = error
    ? ""
    : `Showing ${scope}: ${model.summary.learners ?? "unknown"} students.`;

  return (
    <div className="flex flex-col gap-5">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div className="min-w-0">
          <p className="text-sm text-muted-foreground">Class overview</p>
          <h1 className="font-display text-3xl font-semibold tracking-tight text-foreground">
            Grade 6 Mathematics
          </h1>
          <span aria-hidden="true" className="mt-2 block h-0.5 w-16 bg-primary" />
        </div>

        <div className="flex w-full min-w-0 flex-col gap-1 sm:w-64">
          <label htmlFor={FIELD_IDS.SECTION_FILTER} className="text-xs font-medium text-muted-foreground">
            Section
          </label>
          <select
            id={FIELD_IDS.SECTION_FILTER}
            className={NATIVE_SELECT_CLASS}
            value={model.selectedSectionId ?? ""}
            onChange={(event) => chooseSection(event.target.value || null)}
            disabled={classesUnavailable && model.sections.length === 0}
            aria-describedby="teacher-dashboard-sections-note"
          >
            <option value="">All Grade 6 sections</option>
            {model.sections.map((section) => (
              <option key={section.id} value={section.id}>
                {section.name}
                {section.learnerCount === null
                  ? ""
                  : ` (${section.learnerCount} student${section.learnerCount === 1 ? "" : "s"})`}
              </option>
            ))}
          </select>
          {/* One reserved line under the filter, for whichever of these is
              true. Reserved, so neither pushes the page down when it appears. */}
          <p
            id="teacher-dashboard-sections-note"
            className="flex min-h-4 items-center gap-1.5 text-xs text-muted-foreground"
          >
            {pending ? (
              <>
                <LoaderCircle aria-hidden="true" className="size-3.5 animate-spin motion-reduce:animate-none" />
                Updating the dashboard…
              </>
            ) : classesUnavailable ? (
              "The section list could not be loaded. Showing all sections."
            ) : null}
          </p>
        </div>
      </header>
      <ResultAnnouncer message={announcement} />

      {error ? (
        <section
          role="alert"
          className="flex flex-col gap-3 rounded-xl border-l-[3px] border-destructive bg-destructive/5 px-4 py-4"
        >
          <div>
            <h2 className="font-semibold text-foreground">The dashboard could not be loaded</h2>
            <p className="mt-1 text-sm text-muted-foreground">{error}</p>
          </div>
          <div>
            <Button id={FIELD_IDS.RETRY_BTN} type="button" variant="outline" size="sm" onClick={retry} disabled={pending}>
              {pending ? "Trying again…" : "Try again"}
            </Button>
          </div>
        </section>
      ) : (
        <div
          aria-busy={pending}
          className={`flex flex-col gap-5 transition-opacity motion-reduce:transition-none ${
            pending ? "opacity-60" : ""
          }`}
        >
          {model.isEmpty ? (
            <section className="rounded-xl border border-border bg-card px-4 py-6">
              <h2 className="font-display text-lg font-semibold text-foreground">
                No students in {model.selectedSection ? model.selectedSection.name : "Grade 6"} yet
              </h2>
              <p className="mt-1 max-w-prose text-sm text-muted-foreground">
                Enrol learners from{" "}
                <Link
                  href={TEACHER_ROUTES.STUDENTS}
                  className="font-medium text-primary underline-offset-4 hover:underline"
                >
                  Students
                </Link>
                , and their diagnostic, progress and any support they need will appear here.
              </p>
            </section>
          ) : (
            <>
              <ClassSummary summary={model.summary} selectedSection={model.selectedSection} />

              {/* Two columns on a wide screen, one on a phone — and on a phone
                  the three intervention counts come before the long lists,
                  because they are the part a teacher acts on first. The column
                  wrappers step out of the way below lg so their panels can be
                  ordered individually. */}
              <div className="flex flex-col gap-5 lg:grid lg:grid-cols-3">
                <div className="contents lg:col-span-2 lg:flex lg:min-w-0 lg:flex-col lg:gap-5">
                  <div className="order-2 min-w-0 lg:order-none">
                    <PriorityLearners priority={model.priority} />
                  </div>
                  <div className="order-3 min-w-0 lg:order-none">
                    <CompetencySummary competencies={model.competencies} />
                  </div>
                </div>
                <div className="contents lg:flex lg:min-w-0 lg:flex-col lg:gap-5">
                  <div className="order-1 min-w-0 lg:order-none">
                    <InterventionSummary interventions={model.interventions} />
                  </div>
                  <div className="order-4 min-w-0 lg:order-none">
                    <RecentActivity items={model.recentActivity} />
                  </div>
                </div>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
