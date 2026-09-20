"use client";

import { Children, cloneElement, isValidElement } from "react";

import { Label } from "@/components/ui/label";

/**
 * A labelled authoring control, its hint, and its validation message.
 *
 * The control is cloned so the hint and the error are actually attached to it.
 * Both authoring dialogs used to render a `<p id={`${id}-error`}>` that nothing
 * referenced, while setting `aria-invalid` on the input — so a screen-reader
 * user was told the field was wrong and never told why. The message existed;
 * it was simply not connected to anything.
 *
 * A child that already sets `aria-describedby` keeps it, with these ids added.
 *
 * @param {object} props
 * @param {string} props.id - The control's id; the hint and error ids derive from it.
 * @param {React.ReactNode} props.label
 * @param {string} [props.error]
 * @param {React.ReactNode} [props.hint]
 * @param {boolean} [props.required]
 * @param {React.ReactNode} props.children - One form control.
 */
export function FormField({ id, label, error, hint, required = false, children }) {
  const errorId = `${id}-error`;
  const hintId = `${id}-hint`;

  const describedBy = [hint ? hintId : null, error ? errorId : null].filter(Boolean);

  const child = Children.only(children);
  const control = isValidElement(child)
    ? cloneElement(child, {
        id: child.props.id ?? id,
        "aria-describedby":
          [child.props["aria-describedby"], ...describedBy].filter(Boolean).join(" ") ||
          undefined,
        "aria-invalid": child.props["aria-invalid"] ?? (error ? true : undefined),
      })
    : child;

  return (
    <div className="flex min-w-0 flex-col gap-2">
      <Label
        htmlFor={id}
        className={
          required ? "after:ml-0.5 after:text-destructive after:content-['*']" : undefined
        }
      >
        {label}
        {required ? <span className="sr-only"> (required)</span> : null}
      </Label>

      {control}

      {hint ? (
        <p id={hintId} className="text-sm leading-relaxed text-muted-foreground">
          {hint}
        </p>
      ) : null}

      {error ? (
        <p id={errorId} className="text-sm text-destructive">
          {error}
        </p>
      ) : null}
    </div>
  );
}
