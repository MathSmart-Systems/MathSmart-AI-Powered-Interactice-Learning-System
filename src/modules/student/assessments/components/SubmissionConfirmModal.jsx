"use client";

import { AlertDialog } from "radix-ui";
import { AlertCircle, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";

export function SubmissionConfirmModal({
  open,
  onOpenChange,
  confirmation,
  submitting = false,
  onConfirm,
  onCancel,
  onReviewQuestion,
  dialogInitialFocusRef,
  onCloseAutoFocus,
}) {
  const unanswered = confirmation?.unanswered ?? [];
  const isComplete = confirmation?.isComplete ?? false;

  return (
    <AlertDialog.Root
      open={open}
      onOpenChange={(isOpen) => {
        if (!isOpen && !submitting) {
          onOpenChange?.(false);
        }
      }}
    >
      <AlertDialog.Portal>
        <AlertDialog.Overlay className="fixed inset-0 z-40 bg-shell/70" />
        <AlertDialog.Content
          data-testid="submission-confirmation"
          onOpenAutoFocus={(event) => {
            event.preventDefault();
            dialogInitialFocusRef?.current?.focus();
          }}
          onCloseAutoFocus={onCloseAutoFocus}
          className={`fixed top-1/2 left-1/2 z-50 flex max-h-[85svh] w-[calc(100%-2rem)] max-w-lg -translate-x-1/2 -translate-y-1/2 flex-col gap-4 overflow-y-auto rounded-xl border-l-[3px] bg-card p-6 text-card-foreground shadow-xl outline-none ${
            isComplete ? "border-primary" : "border-destructive"
          }`}
        >
          <AlertDialog.Title className="flex items-start gap-3 font-display text-xl font-semibold text-foreground">
            {isComplete ? (
              <CheckCircle2 aria-hidden="true" className="mt-1 size-5 shrink-0 text-primary" />
            ) : (
              <AlertCircle aria-hidden="true" className="mt-1 size-5 shrink-0 text-destructive" />
            )}
            Confirm assessment submission
          </AlertDialog.Title>
          <AlertDialog.Description className="text-sm leading-relaxed text-muted-foreground">
            {confirmation?.message}
          </AlertDialog.Description>

          {unanswered.length > 0 && (
            <div className="flex flex-wrap gap-2" aria-label="Unanswered questions">
              {unanswered.map((question, unansweredIndex) => (
                <AlertDialog.Cancel asChild key={question.id}>
                  <Button
                    ref={unansweredIndex === 0 ? dialogInitialFocusRef : undefined}
                    type="button"
                    variant="outline"
                    size="xs"
                    disabled={submitting}
                    onClick={() => onReviewQuestion?.(question.number - 1)}
                  >
                    Review Q{question.number}
                  </Button>
                </AlertDialog.Cancel>
              ))}
            </div>
          )}

          <div className="flex flex-wrap gap-3 pt-1">
            <Button
              ref={isComplete ? dialogInitialFocusRef : undefined}
              size="sm"
              onClick={onConfirm}
              disabled={submitting}
            >
              {submitting ? "Submitting…" : "Confirm and finish"}
            </Button>
            <AlertDialog.Cancel asChild>
              <Button
                size="sm"
                variant="outline"
                onClick={onCancel}
                disabled={submitting}
              >
                Cancel and review
              </Button>
            </AlertDialog.Cancel>
          </div>
        </AlertDialog.Content>
      </AlertDialog.Portal>
    </AlertDialog.Root>
  );
}
