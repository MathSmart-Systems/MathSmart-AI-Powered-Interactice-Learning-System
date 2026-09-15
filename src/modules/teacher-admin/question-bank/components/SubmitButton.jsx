"use client";

import { useFormStatus } from "react-dom";
import { LoaderCircle } from "lucide-react";

import { Button } from "@/components/ui/button";

/**
 * A submit button that places the submit handling of its enclosing form. It
 * exists so every save, publish, archive and restore action shows a spinner and
 * disables while its request is in flight, without each form re-implementing
 * the pattern.
 */
export function SubmitButton({ label, pendingLabel, ...props }) {
  const { pending } = useFormStatus();

  return (
    <Button {...props} type="submit" disabled={pending}>
      {pending ? <LoaderCircle aria-hidden="true" className="size-4 animate-spin" /> : null}
      {pending ? pendingLabel : label}
    </Button>
  );
}