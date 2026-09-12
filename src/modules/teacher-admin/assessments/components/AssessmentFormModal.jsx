"use client";

import { useState } from "react";
import { Loader2, TriangleAlert } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";

import { createAssessment, updateAssessment } from "../services/assessment-admin-service.js";
import { ASSESSMENT_TYPES } from "../utils/format.js";
import {
  MAX_DESCRIPTION_LENGTH,
  MAX_DURATION_MINUTES,
  MAX_TITLE_LENGTH,
  MIN_DURATION_MINUTES,
  validateAssessmentDraft,
} from "../utils/validation.js";

const FIELD_IDS = {
  title: "assessment-title",
  grade: "assessment-grade",
  type: "assessment-type",
  duration: "assessment-duration",
  description: "assessment-description",
};

/** A field's error, wired to the control by `aria-describedby`. */
function FieldError({ id, message }) {
  if (!message) {
    return null;
  }
  return (
    <p id={id} className="text-sm text-destructive">
      {message}
    </p>
  );
}

/**
 * The authoring form.
 *
 * It is a separate component from the dialog so that opening the dialog mounts
 * it fresh: the form is seeded from `assessment` once, and a stale draft from a
 * previous row can never be submitted against a different assessment.
 */
function AssessmentForm({ assessment, grades, onClose, onSaved }) {
  const isEditing = Boolean(assessment?.assessment_id);

  const [values, setValues] = useState(() => ({
    title: assessment?.title ?? "",
    grade_id: assessment?.grade_id ?? (grades.length === 1 ? grades[0].grade_id : ""),
    assessment_type: assessment?.assessment_type ?? "diagnostic",
    duration_minutes: String(assessment?.duration_minutes ?? 60),
    description: assessment?.description ?? "",
  }));
  const [errors, setErrors] = useState({});
  const [serverError, setServerError] = useState(null);
  const [isSaving, setIsSaving] = useState(false);

  function change(field, value) {
    setValues((previous) => ({ ...previous, [field]: value }));
    setErrors((previous) => ({ ...previous, [field]: undefined }));
    setServerError(null);
  }

  async function handleSubmit(event) {
    event.preventDefault();

    const validation = validateAssessmentDraft(values);
    if (!validation.isValid) {
      setErrors(validation.errors);
      return;
    }

    setIsSaving(true);
    setServerError(null);

    const payload = {
      title: values.title.trim(),
      grade_id: values.grade_id,
      assessment_type: values.assessment_type,
      duration_minutes: Number(values.duration_minutes),
      description: values.description.trim() || null,
    };

    const result = isEditing
      ? await updateAssessment(assessment.assessment_id, payload)
      : await createAssessment(payload);

    setIsSaving(false);

    if (result.ok) {
      onSaved(result.data, isEditing ? "updated" : "created");
      return;
    }

    // The API reports per-field refusals in `error.fields`; showing them on the
    // fields is the difference between "invalid" and knowing which box to fix.
    if (result.fields && Object.keys(result.fields).length > 0) {
      setErrors(result.fields);
    }
    setServerError(result.error);
  }

  return (
    <form onSubmit={handleSubmit} className="flex min-h-0 flex-1 flex-col">
      <DialogBody className="flex flex-col gap-5">
        {serverError ? (
          <p
            role="alert"
            className="flex gap-2 border-l-[3px] border-destructive bg-destructive/5 px-4 py-3 text-sm leading-relaxed text-foreground"
          >
            <TriangleAlert aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-destructive" />
            {serverError}
          </p>
        ) : null}

        <div className="flex flex-col gap-2">
          <Label htmlFor={FIELD_IDS.title}>Title</Label>
          <Input
            id={FIELD_IDS.title}
            value={values.title}
            maxLength={MAX_TITLE_LENGTH}
            onChange={(event) => change("title", event.target.value)}
            aria-invalid={Boolean(errors.title)}
            aria-describedby={errors.title ? `${FIELD_IDS.title}-error` : undefined}
          />
          <FieldError id={`${FIELD_IDS.title}-error`} message={errors.title} />
        </div>

        <div className="grid gap-5 sm:grid-cols-2">
          <div className="flex flex-col gap-2">
            <Label htmlFor={FIELD_IDS.grade}>Grade level</Label>
            <Select
              value={values.grade_id || undefined}
              onValueChange={(value) => change("grade_id", value)}
            >
              <SelectTrigger
                id={FIELD_IDS.grade}
                aria-invalid={Boolean(errors.grade_id)}
                aria-describedby={errors.grade_id ? `${FIELD_IDS.grade}-error` : undefined}
              >
                <SelectValue placeholder="Choose a grade level" />
              </SelectTrigger>
              <SelectContent>
                {grades.map((grade) => (
                  <SelectItem key={grade.grade_id} value={grade.grade_id}>
                    {grade.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <FieldError id={`${FIELD_IDS.grade}-error`} message={errors.grade_id} />
          </div>

          <div className="flex flex-col gap-2">
            <Label htmlFor={FIELD_IDS.type}>Type</Label>
            <Select
              value={values.assessment_type}
              onValueChange={(value) => change("assessment_type", value)}
            >
              <SelectTrigger
                id={FIELD_IDS.type}
                aria-invalid={Boolean(errors.assessment_type)}
                aria-describedby={errors.assessment_type ? `${FIELD_IDS.type}-error` : undefined}
              >
                <SelectValue placeholder="Choose a type" />
              </SelectTrigger>
              <SelectContent>
                {ASSESSMENT_TYPES.map((type) => (
                  <SelectItem key={type.value} value={type.value}>
                    {type.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <FieldError id={`${FIELD_IDS.type}-error`} message={errors.assessment_type} />
          </div>
        </div>

        <div className="flex flex-col gap-2">
          <Label htmlFor={FIELD_IDS.duration}>Time limit in minutes</Label>
          <Input
            id={FIELD_IDS.duration}
            type="number"
            inputMode="numeric"
            min={MIN_DURATION_MINUTES}
            max={MAX_DURATION_MINUTES}
            value={values.duration_minutes}
            onChange={(event) => change("duration_minutes", event.target.value)}
            aria-invalid={Boolean(errors.duration_minutes)}
            aria-describedby={
              errors.duration_minutes
                ? `${FIELD_IDS.duration}-error`
                : `${FIELD_IDS.duration}-hint`
            }
            className="sm:max-w-40"
          />
          {errors.duration_minutes ? (
            <FieldError id={`${FIELD_IDS.duration}-error`} message={errors.duration_minutes} />
          ) : (
            <p id={`${FIELD_IDS.duration}-hint`} className="text-sm text-muted-foreground">
              Between {MIN_DURATION_MINUTES} and {MAX_DURATION_MINUTES} minutes.
            </p>
          )}
        </div>

        <div className="flex flex-col gap-2">
          <Label htmlFor={FIELD_IDS.description}>Description</Label>
          <Textarea
            id={FIELD_IDS.description}
            rows={3}
            maxLength={MAX_DESCRIPTION_LENGTH}
            value={values.description}
            onChange={(event) => change("description", event.target.value)}
            aria-invalid={Boolean(errors.description)}
            aria-describedby={
              errors.description
                ? `${FIELD_IDS.description}-error`
                : `${FIELD_IDS.description}-hint`
            }
          />
          {errors.description ? (
            <FieldError id={`${FIELD_IDS.description}-error`} message={errors.description} />
          ) : (
            <p id={`${FIELD_IDS.description}-hint`} className="text-sm text-muted-foreground">
              Optional. What the assessment covers, in the words a learner would read.
            </p>
          )}
        </div>
      </DialogBody>

      <DialogFooter>
        <Button type="button" variant="outline" className="h-11 px-5" onClick={onClose}>
          Cancel
        </Button>
        <Button type="submit" className="h-11 px-5" disabled={isSaving}>
          {isSaving ? <Loader2 aria-hidden="true" className="animate-spin" /> : null}
          {isEditing ? "Save changes" : "Create draft"}
        </Button>
      </DialogFooter>
    </form>
  );
}

/**
 * Creating or editing an assessment.
 *
 * Creation always makes a draft: an assessment becomes deliverable through
 * publication, which checks that it is safe to deliver, and never as a side
 * effect of saving the form.
 */
export function AssessmentFormModal({ open, onOpenChange, onSaved, assessment, grades = [] }) {
  const isEditing = Boolean(assessment?.assessment_id);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>{isEditing ? "Edit assessment" : "New assessment"}</DialogTitle>
          <DialogDescription>
            {isEditing
              ? "Change what this assessment is and how long learners have for it."
              : "Describe the assessment. You add its questions next, and publish it when it is ready."}
          </DialogDescription>
        </DialogHeader>

        {/* Radix unmounts this while the dialog is closed, and the key covers
            the rest: the form is always seeded from the row it was opened for. */}
        <AssessmentForm
          key={assessment?.assessment_id ?? "new"}
          assessment={assessment}
          grades={grades}
          onClose={() => onOpenChange(false)}
          onSaved={onSaved}
        />
      </DialogContent>
    </Dialog>
  );
}
