"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Archive, Pencil, Plus, Search } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

import { STATUS_FILTERS } from "../utils/constants";

import { ArchiveConfirmDialog } from "./ArchiveConfirmDialog";
import { CompetencyCard } from "./CompetencyCard";
import { CompetencyFormDialog } from "./CompetencyFormDialog";
import { EmptyPanel } from "./EmptyPanel";

/**
 * The Teacher/Administrator competency catalogue.
 *
 * A server component has already read the whole catalogue and the grade list
 * through the MathSmart API; this client view only searches, filters, opens
 * dialogs and re-renders after a server action has saved. Ordering and wording
 * are the only decisions made here — the authoring outcome was the API's.
 */
export function CompetenciesView({ model }) {
  const router = useRouter();
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState("all");
  const [createOpen, setCreateOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [archiving, setArchiving] = useState(null);

  const counts = useMemo(() => {
    const tally = { all: model.items.length, draft: 0, published: 0, archived: 0 };
    for (const item of model.items) {
      if (tally[item.status] !== undefined) {
        tally[item.status] += 1;
      }
    }
    return tally;
  }, [model.items]);

  const query = search.trim().toLowerCase();

  const visible = useMemo(() => {
    if (!model.items.length) {
      return [];
    }
    return model.items.filter((item) => {
      const matchesState = filter === "all" || item.status === filter;
      if (!matchesState) {
        return false;
      }
      if (!query) {
        return true;
      }
      const haystack = [item.name, item.code, item.domain, item.gradeName, item.description]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return haystack.includes(query);
    });
  }, [model.items, filter, query]);

  const filtering = Boolean(query) || filter !== "all";

  function refreshAndClose() {
    setCreateOpen(false);
    setEditing(null);
    setArchiving(null);
    router.refresh();
  }

  return (
    <div className="flex flex-col gap-10">
      <header className="flex flex-col gap-5">
        <div className="flex flex-col gap-2">
          <p className="text-sm text-muted-foreground">Grade 6 mathematics</p>
          <div className="flex flex-wrap items-end justify-between gap-4">
            <h1 className="font-display text-3xl leading-tight font-semibold tracking-tight text-foreground sm:text-4xl">
              Competencies
            </h1>
            <Button type="button" className="h-11 px-5" onClick={() => setCreateOpen(true)}>
              <Plus aria-hidden="true" className="size-4" />
              Add competency
            </Button>
          </div>
          <span aria-hidden="true" className="mt-1 h-0.5 w-16 bg-primary" />
        </div>

        <p className="max-w-prose text-sm leading-relaxed text-muted-foreground">
          The catalogue your learning paths, modules and assessments point at. Drafts stay
          in this workspace until you publish them; archived competencies keep their
          learner history.
        </p>
      </header>

      <section aria-labelledby="catalogue-heading" className="flex flex-col gap-4">
        <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
          <div className="relative w-full sm:max-w-xs">
            <Search
              aria-hidden="true"
              className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground"
            />
            <Input
              type="search"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search name, code or strand"
              aria-label="Search the competency catalogue"
              className="h-11 pl-9"
            />
          </div>

          <div
            role="group"
            aria-label="Filter by publication state"
            className="flex flex-wrap items-center gap-2"
          >
            {STATUS_FILTERS.map((option) => {
              const active = filter === option.value;
              return (
                <Button
                  key={option.value}
                  type="button"
                  variant={active ? "default" : "outline"}
                  className="h-9 gap-1.5 px-3"
                  aria-pressed={active}
                  onClick={() => setFilter(option.value)}
                >
                  {option.label}
                  <span className={active ? "opacity-80" : "text-muted-foreground"}>
                    {counts[option.value]}
                  </span>
                </Button>
              );
            })}
          </div>
        </div>

        {model.gradesUnavailable ? (
          <p className="border-l-[3px] border-border bg-card px-4 py-3 text-sm leading-relaxed text-muted-foreground">
            The grade list could not be loaded, so the catalogue still opens but new
            competencies cannot be saved until the grade service answers again.
          </p>
        ) : null}

        {model.isEmpty ? (
          <EmptyPanel
            title="No competencies yet"
            description="This is where the curriculum lives. Add the first Grade 6 competency as a draft, then publish it when it is ready."
            action={
              <Button type="button" className="h-11 px-5" onClick={() => setCreateOpen(true)}>
                <Plus aria-hidden="true" className="size-4" />
                Add the first competency
              </Button>
            }
          />
        ) : visible.length === 0 ? (
          <EmptyPanel
            title="Nothing matches that search"
            description="No competency matches the current search and filter. Clear them to see the whole catalogue again."
            action={
              <Button
                type="button"
                variant="outline"
                className="h-11 px-5"
                onClick={() => {
                  setSearch("");
                  setFilter("all");
                }}
              >
                Clear search and filters
              </Button>
            }
          />
        ) : (
          <>
            <h2 id="catalogue-heading" className="sr-only">
              Competency catalogue
            </h2>
            <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              {visible.map((item) => (
                <li key={item.id}>
                  <CompetencyCard
                    competency={item}
                    actions={
                      item.status === "archived" ? null : (
                        <>
                          <Button
                            type="button"
                            variant="outline"
                            className="h-9 px-3"
                            onClick={() => setEditing(item)}
                          >
                            <Pencil aria-hidden="true" className="size-3.5" />
                            Edit
                          </Button>
                          <Button
                            type="button"
                            variant="ghost"
                            className="h-9 px-3"
                            onClick={() => setArchiving(item)}
                          >
                            <Archive aria-hidden="true" className="size-3.5" />
                            Archive
                          </Button>
                        </>
                      )
                    }
                  />
                </li>
              ))}
            </ul>
            {filtering ? (
              <p className="text-sm text-muted-foreground">
                {visible.length} of {counts.all} competencies shown.
              </p>
            ) : model.truncated ? (
              <p className="text-sm text-muted-foreground">
                Showing the first {model.items.length} of {model.totalCount} competencies.
              </p>
            ) : null}
          </>
        )}
      </section>

      <CompetencyFormDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        grades={model.grades}
        gradesUnavailable={model.gradesUnavailable}
        onSaved={refreshAndClose}
      />

      <CompetencyFormDialog
        open={Boolean(editing)}
        onOpenChange={(openNext) => {
          if (!openNext) {
            setEditing(null);
          }
        }}
        competency={editing}
        grades={model.grades}
        gradesUnavailable={model.gradesUnavailable}
        onSaved={refreshAndClose}
      />

      <ArchiveConfirmDialog
        open={Boolean(archiving)}
        onOpenChange={(openNext) => {
          if (!openNext) {
            setArchiving(null);
          }
        }}
        competency={archiving}
        onSaved={refreshAndClose}
      />
    </div>
  );
}