"use client";

import { useActionState, useEffect, useState } from "react";
import { Dialog as DialogPrimitive } from "radix-ui";
import { Pencil, X } from "lucide-react";
import { cn } from "cn";

import { Button } from "@/components/ui/button";
import { useFocusReturn } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

import {
  createCompetencyAction,
  updateCompetencyAction,
} from "../actions/competencies";
import { MVP_GRADE_NAME } from "../utils/constants";
import { FORM_STATUSES } from "../utils/competency-status";
import { OTHER_STRAND, STRAND_MAX, STRAND_OPTIONS, initialStrand } from "../utils/strand";

const NAME_MAX = 300;
const DESCRIPTION_MAX = 4000;
const CODE_MAX = 64;

/**
 * The create and edit dialog for one competency.
 *
 * A Teacher/Administrator writes the code, name, strand and optional
 * description, then chooses whether it stays a draft or goes live.
 *
 * There is no grade field. MathSmart teaches one grade and the server resolves
 * it, so a competency cannot be created or moved outside the curriculum that
 * has questions, modules and assessments behind it — and the form does not
 * offer a choice that the API would refuse. The chosen
 * form action runs on the server through the MathSmart API, which validates and
 * persists; the dialog only adds readable copy and the browser's fast rules.
 *
 * Status is the one state-change a person may make here, and it is written out
 * for both options instead of being carried by the controls' look alone: going
 * Published means the exact words "learners will see this on their next visit".
 */
export function CompetencyFormDialog({
  trigger,
  open,
  onOpenChange,
  competency,
  onSaved,
}) {
  const editing = Boolean(competency);
  const action = editing ? updateCompetencyAction : createCompetencyAction;

  // Shared with the dialog primitive, so this surface returns focus the
  // same way the ones built on it do.
  const handleCloseAutoFocus = useFocusReturn(open);

  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      {trigger ? <DialogPrimitive.Trigger asChild>{trigger}</DialogPrimitive.Trigger> : null}

      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-black/45" />
        <DialogPrimitive.Content className="fixed top-1/2 left-1/2 z-50 flex max-h-[calc(100dvh-2rem)] w-[calc(100%-2rem)] max-w-lg -translate-x-1/2 -translate-y-1/2 flex-col outline-none" aria-describedby={undefined} onCloseAutoFocus={handleCloseAutoFocus}>
          <div className="flex min-h-0 flex-1 flex-col overflow-y-auto overscroll-contain rounded-lg border border-border bg-card p-6 shadow-lg">
            <div className="flex items-start justify-between gap-4">
              <div className="flex flex-col gap-1">
                <DialogPrimitive.Title className="font-display text-xl font-semibold tracking-tight text-foreground">
                  {editing ? "Edit competency" : "Add competency"}
                </DialogPrimitive.Title>
                <DialogPrimitive.Description className="text-sm text-muted-foreground">
                  {editing
                    ? "Update the details and publication state. Saved changes reach learners on their next visit."
                    : "A draft is invisible to learners until you publish it."}
                </DialogPrimitive.Description>
              </div>
              <DialogPrimitive.Close asChild>
                <Button type="button" variant="ghost" size="icon" aria-label="Close dialog">
                  <X aria-hidden="true" />
                </Button>
              </DialogPrimitive.Close>
            </div>

            <CompetencyFormContent
              key={competency?.id ?? "new"}
              action={action}
              editing={editing}
              competency={competency}
              onSaved={onSaved}
            />
          </div>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}

function CompetencyFormContent({
  action,
  editing,
  competency,
  onSaved,
}) {
  const [state, formAction, isPending] = useActionState(action, { ok: false });
  const [selectedStatus, setSelectedStatus] = useState(() =>
    editing ? (competency.status === "published" ? "published" : "draft") : "draft",
  );

  const [strand, setStrand] = useState(() =>
    initialStrand(editing ? competency.domain : ""),
  );
  const writingOwnStrand = strand.selection === OTHER_STRAND;

  useEffect(() => {
    if (state?.ok) {
      onSaved();
    }
  }, [state, onSaved]);

  return (
    <form action={formAction} className="mt-5 flex flex-col gap-5">
      {editing ? (
        <input type="hidden" name="competency_id" value={competency.id} />
      ) : null}

      {state?.ok === false && state.error ? (
        <div
          role="alert"
          className="flex flex-col gap-1 border-l-[3px] border-destructive bg-destructive/5 px-4 py-3"
        >
          <p className="text-sm font-medium text-destructive">Nothing was saved</p>
          <p className="text-sm leading-relaxed text-foreground">
            {state.error.message}
          </p>
        </div>
      ) : null}

      <div className="grid gap-5">
        <div className="flex flex-col gap-2">
          <Label htmlFor="competency-name">Competency name</Label>
          <textarea
            id="competency-name"
            name="name"
            required
            defaultValue={editing ? competency.name : ""}
            minLength={2}
            maxLength={NAME_MAX}
            rows={2}
            className="min-h-11 w-full resize-y rounded-md border border-input bg-card px-3 py-2 text-base shadow-xs outline-none transition-[color,box-shadow] focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 md:text-sm"
            aria-describedby="competency-name-help"
          />
          <p id="competency-name-help" className="text-xs text-muted-foreground">
            A short, plain statement of what a Grade 6 learner should be able to do.
          </p>
        </div>

        <div className="grid gap-5 sm:grid-cols-2">
          <div className="flex flex-col gap-2">
            <Label htmlFor="competency-code">Code</Label>
            <Input
              id="competency-code"
              name="code"
              type="text"
              required
              defaultValue={editing ? competency.code : ""}
              minLength={3}
              maxLength={CODE_MAX}
              placeholder="e.g. M6NS-Ia-1"
              className="h-11"
            />
          </div>

        </div>

        <div className="flex flex-col gap-2">
          <Label htmlFor="competency-domain">Content strand</Label>
          {/*
            The select carries `domain` only while a listed strand is chosen.
            On "Other" it gives the name up to the text field below, so the
            form always submits one strand and never the sentinel.
          */}
          <select
            id="competency-domain"
            name={writingOwnStrand ? undefined : "domain"}
            required
            value={strand.selection}
            onChange={(event) =>
              setStrand((current) => ({ ...current, selection: event.target.value }))
            }
            className="h-11 w-full rounded-md border border-input bg-card px-3 text-sm shadow-xs outline-none transition-[color,box-shadow] focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50"
          >
            {STRAND_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>

          {writingOwnStrand ? (
            <div className="mt-1 flex flex-col gap-2 border-l-[3px] border-border pl-4">
              <Label htmlFor="competency-domain-other">Name the strand</Label>
              <Input
                id="competency-domain-other"
                name="domain"
                type="text"
                required
                autoFocus
                value={strand.custom}
                onChange={(event) =>
                  setStrand((current) => ({ ...current, custom: event.target.value }))
                }
                minLength={2}
                maxLength={STRAND_MAX}
                placeholder="e.g. Financial Literacy"
                className="h-11"
                aria-describedby="competency-domain-other-help"
              />
              <p id="competency-domain-other-help" className="text-xs text-muted-foreground">
                Saved on this competency only. The strand list stays as it is,
                so write it the way it should read on the card.
              </p>
            </div>
          ) : null}
        </div>

        <div className="flex flex-col gap-3">
          <fieldset>
            <legend className="text-sm leading-none font-medium">Publication state</legend>
            <p className="mt-1 mb-2 text-xs text-muted-foreground">
              {editing
                ? "Publishing makes it the curriculum you serve; drafting takes it out of learners' view."
                : "You can decide this now and change it later."}
            </p>
            <div className="grid grid-cols-2 gap-2">
              {FORM_STATUSES.map((option) => (
                <label
                  key={option.value}
                  className={cn(
                    "flex min-h-11 cursor-pointer flex-col justify-center rounded-md border px-3 py-2 text-sm transition-colors",
                    selectedStatus === option.value
                      ? "border-primary bg-primary/5"
                      : "border-border bg-card",
                  )}
                >
                  <input
                    type="radio"
                    name="status"
                    value={option.value}
                    checked={selectedStatus === option.value}
                    onChange={() => setSelectedStatus(option.value)}
                    className="sr-only"
                  />
                  <span className="font-medium text-foreground">{option.label}</span>
                  <span className="mt-0.5 text-xs text-muted-foreground">{option.help}</span>
                </label>
              ))}
            </div>
          </fieldset>
        </div>

        <div className="flex flex-col gap-2">
          <Label htmlFor="competency-description">Description</Label>
          <textarea
            id="competency-description"
            name="description"
            defaultValue={editing ? competency.description ?? "" : ""}
            maxLength={DESCRIPTION_MAX}
            rows={3}
            placeholder="What it looks like in practice, and any language or context a learner might meet."
            className="min-h-11 w-full resize-y rounded-md border border-input bg-card px-3 py-2 text-base shadow-xs outline-none transition-[color,box-shadow] focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 md:text-sm"
          />
        </div>
      </div>

      <div className="flex flex-wrap justify-end gap-3 pt-1">
        <DialogPrimitive.Close asChild>
          <Button type="button" variant="outline" className="h-11 px-5">
            Cancel
          </Button>
        </DialogPrimitive.Close>
        <Button type="submit" className="h-11 px-5" disabled={isPending}>
          <Pencil aria-hidden="true" className="size-4" />
          {isPending ? "Saving…" : editing ? "Save changes" : "Add competency"}
        </Button>
      </div>
    </form>
  );
}