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

import { createActivity, updateActivity } from "../services/activity-admin-service.js";
import {
  DEFAULT_MASTERY_THRESHOLD,
  MAX_DESCRIPTION_LENGTH,
  MAX_DURATION_MINUTES,
  MAX_TITLE_LENGTH,
  MIN_DURATION_MINUTES,
  validateActivityDraft,
} from "../utils/validation.js";

const FIELD_IDS = {
  title: "activity-title",
  module: "activity-module",
  duration: "activity-duration",
  points: "activity-points",
  threshold: "activity-threshold",
  status: "activity-status",
  description: "activity-description",
};

/**
 * Renders a localized validation error message associated with a form field.
 *
 * @param {object} props
 * @param {string} props.id - HTML ID referenced by aria-describedby
 * @param {string} [props.message] - Validation error message to display
 * @returns {JSX.Element | null}
 */
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
 * Activity authoring and editing form.
 *
 * Seeded from the selected activity prop and handles live validation and submission.
 *
 * @param {object} props
 * @param {object} [props.activity] - Existing activity object when editing, or null when creating
 * @param {Array<object>} props.modules - Available learning modules for the dropdown selector
 * @param {() => void} props.onClose - Dismiss callback
 * @param {(saved: object) => void} props.onSaved - Success callback receiving the saved record
 * @returns {JSX.Element}
 */
function ActivityForm({ activity, modules, onClose, onSaved }) {
  const isEditing = Boolean(activity?.activity_id);

  const [values, setValues] = useState(() => ({
    title: activity?.title ?? "",
    module_id: activity?.module_id ?? (modules.length === 1 ? modules[0].module_id : ""),
    estimated_minutes: String(activity?.estimated_minutes ?? 15),
    points: String(activity?.points ?? 100),
    mastery_threshold: String(activity?.mastery_threshold ?? DEFAULT_MASTERY_THRESHOLD),
    status: activity?.status ?? "draft",
    description: activity?.description ?? "",
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

    const validation = validateActivityDraft(values);
    if (!validation.isValid) {
      setErrors(validation.errors);
      return;
    }

    setIsSaving(true);
    setServerError(null);

    const payload = {
      title: values.title.trim(),
      module_id: values.module_id,
      estimated_minutes: Number(values.estimated_minutes),
      points: Number(values.points),
      mastery_threshold: Number(values.mastery_threshold),
      status: values.status,
      description: values.description.trim() || null,
    };

    const result = isEditing
      ? await updateActivity(activity.activity_id, payload)
      : await createActivity(payload);

    setIsSaving(false);

    if (result.ok) {
      onSaved(result.data);
      return;
    }

    if (result.fields && Object.keys(result.fields).length > 0) {
      setErrors(result.fields);
    }
    setServerError(result.error);
  }

  return (
    <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-0">
      <DialogBody className="flex flex-col gap-5">
        {serverError ? (
          <p
            role="alert"
            className="flex gap-2 border-l-[3px] border-destructive bg-destructive/5 px-4 py-3 text-sm leading-relaxed text-foreground"
          >
            <TriangleAlert
              aria-hidden="true"
              className="mt-0.5 size-4 shrink-0 text-destructive"
            />
            {serverError}
          </p>
        ) : null}

        <div className="flex flex-col gap-2">
          <Label htmlFor={FIELD_IDS.title}>
            Activity title <span className="text-destructive">*</span>
          </Label>
          <Input
            id={FIELD_IDS.title}
            type="text"
            required
            maxLength={MAX_TITLE_LENGTH}
            value={values.title}
            aria-invalid={Boolean(errors.title)}
            aria-describedby={errors.title ? `${FIELD_IDS.title}-error` : undefined}
            placeholder="e.g. Multiplying Integers Application Drills"
            onChange={(e) => change("title", e.target.value)}
          />
          <FieldError id={`${FIELD_IDS.title}-error`} message={errors.title} />
        </div>

        <div className="flex flex-col gap-2">
          <Label htmlFor={FIELD_IDS.module}>
            Learning module <span className="text-destructive">*</span>
          </Label>
          <Select
            value={values.module_id}
            onValueChange={(val) => change("module_id", val)}
          >
            <SelectTrigger
              id={FIELD_IDS.module}
              aria-invalid={Boolean(errors.module_id)}
              aria-describedby={errors.module_id ? `${FIELD_IDS.module}-error` : undefined}
            >
              <SelectValue placeholder="Select an ARAL learning module" />
            </SelectTrigger>
            <SelectContent>
              {modules.map((mod) => (
                <SelectItem key={mod.module_id} value={mod.module_id}>
                  {mod.title}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <FieldError id={`${FIELD_IDS.module}-error`} message={errors.module_id} />
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <div className="flex flex-col gap-2">
            <Label htmlFor={FIELD_IDS.duration}>
              Estimated time <span className="text-destructive">*</span>
            </Label>
            <div className="relative">
              <Input
                id={FIELD_IDS.duration}
                type="number"
                min={MIN_DURATION_MINUTES}
                max={MAX_DURATION_MINUTES}
                required
                value={values.estimated_minutes}
                aria-invalid={Boolean(errors.estimated_minutes)}
                aria-describedby={
                  errors.estimated_minutes ? `${FIELD_IDS.duration}-error` : undefined
                }
                onChange={(e) => change("estimated_minutes", e.target.value)}
              />
              <span
                aria-hidden="true"
                className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-xs text-muted-foreground"
              >
                mins
              </span>
            </div>
            <FieldError
              id={`${FIELD_IDS.duration}-error`}
              message={errors.estimated_minutes}
            />
          </div>

          <div className="flex flex-col gap-2">
            <Label htmlFor={FIELD_IDS.points}>Points</Label>
            <Input
              id={FIELD_IDS.points}
              type="number"
              min={0}
              value={values.points}
              aria-invalid={Boolean(errors.points)}
              aria-describedby={errors.points ? `${FIELD_IDS.points}-error` : undefined}
              onChange={(e) => change("points", e.target.value)}
            />
            <FieldError id={`${FIELD_IDS.points}-error`} message={errors.points} />
          </div>

          <div className="flex flex-col gap-2">
            <Label htmlFor={FIELD_IDS.threshold}>Pass threshold</Label>
            <div className="relative">
              <Input
                id={FIELD_IDS.threshold}
                type="number"
                min={1}
                max={100}
                value={values.mastery_threshold}
                aria-invalid={Boolean(errors.mastery_threshold)}
                aria-describedby={
                  errors.mastery_threshold ? `${FIELD_IDS.threshold}-error` : undefined
                }
                onChange={(e) => change("mastery_threshold", e.target.value)}
              />
              <span
                aria-hidden="true"
                className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-xs text-muted-foreground"
              >
                %
              </span>
            </div>
            <FieldError
              id={`${FIELD_IDS.threshold}-error`}
              message={errors.mastery_threshold}
            />
          </div>
        </div>

        <div className="flex flex-col gap-2">
          <Label htmlFor={FIELD_IDS.status}>Publication status</Label>
          <Select value={values.status} onValueChange={(val) => change("status", val)}>
            <SelectTrigger id={FIELD_IDS.status}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="draft">Draft (Work in progress)</SelectItem>
              <SelectItem value="published">Published (Available for practice)</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="flex flex-col gap-2">
          <div className="flex items-center justify-between">
            <Label htmlFor={FIELD_IDS.description}>Description</Label>
            <span className="text-xs text-muted-foreground">Optional</span>
          </div>
          <Textarea
            id={FIELD_IDS.description}
            rows={3}
            maxLength={MAX_DESCRIPTION_LENGTH}
            value={values.description}
            aria-invalid={Boolean(errors.description)}
            aria-describedby={
              errors.description ? `${FIELD_IDS.description}-error` : undefined
            }
            placeholder="Outline the mathematical focus or skills practiced..."
            onChange={(e) => change("description", e.target.value)}
          />
          <FieldError
            id={`${FIELD_IDS.description}-error`}
            message={errors.description}
          />
        </div>
      </DialogBody>

      <DialogFooter>
        <Button
          type="button"
          variant="outline"
          className="h-11 px-5"
          disabled={isSaving}
          onClick={onClose}
        >
          Cancel
        </Button>
        <Button
          type="submit"
          className="h-11 px-5 bg-primary hover:bg-primary/90 text-primary-foreground"
          disabled={isSaving}
        >
          {isSaving ? <Loader2 aria-hidden="true" className="animate-spin" /> : null}
          {isEditing ? "Save changes" : "Create activity"}
        </Button>
      </DialogFooter>
    </form>
  );
}

/**
 * Dialog wrapper for creating or updating practice activities.
 *
 * @param {object} props
 * @param {boolean} props.open - Whether the modal dialog is open
 * @param {(open: boolean) => void} props.onOpenChange - Callback invoked when the modal visibility toggles
 * @param {(saved: object) => void} [props.onSaved] - Callback invoked when an activity is saved
 * @param {object} [props.activity] - Target activity to edit, or null when creating
 * @param {Array<object>} props.modules - List of learning modules available for selection
 * @returns {JSX.Element}
 */
export function ActivityFormModal({ open, onOpenChange, onSaved, activity, modules = [] }) {
  const isEditing = Boolean(activity?.activity_id);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>
            {isEditing ? "Edit activity" : "Create new practice activity"}
          </DialogTitle>
          <DialogDescription>
            {isEditing
              ? "Update activity details, duration, points, or pass threshold."
              : "Author a practice activity linked to an ARAL learning module."}
          </DialogDescription>
        </DialogHeader>

        {open ? (
          <ActivityForm
            key={activity?.activity_id ?? "new"}
            activity={activity}
            modules={modules}
            onClose={() => onOpenChange(false)}
            onSaved={(saved) => {
              onOpenChange(false);
              onSaved?.(saved);
            }}
          />
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
