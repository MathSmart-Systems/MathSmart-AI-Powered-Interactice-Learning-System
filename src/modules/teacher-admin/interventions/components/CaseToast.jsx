"use client";

import { useEffect, useRef, useState } from "react";
import { CheckCircle2, TriangleAlert, X } from "lucide-react";

/** Long enough to read one sentence, short enough not to become furniture. */
const DISMISS_AFTER_MS = 4500;

const TONES = {
  success: {
    icon: CheckCircle2,
    iconClass: "text-primary",
    frame: "border-border bg-card",
    role: "status",
    live: "polite",
  },
  error: {
    icon: TriangleAlert,
    iconClass: "text-destructive",
    frame: "border-destructive/40 bg-card",
    // A failure the teacher asked for is worth interrupting for; a save that
    // worked is not.
    role: "alert",
    live: "assertive",
  },
};

/**
 * A short-lived message about something that just happened, without moving the page.
 *
 * This replaces two things: a success banner that appeared inside the record
 * form, and an error panel that appeared inside the advisory section. Both sat
 * in the flow and pushed the controls somebody had just pressed. Both are now
 * fixed, reserve nothing when absent, and take themselves away.
 *
 * The countdown stops while the pointer is over it or the focus is inside it,
 * because a message that vanishes as somebody reaches for its close button is
 * a message that was never really dismissible.
 *
 * @param {object} props
 * @param {{message: string, tone?: "success"|"error"}|null} props.toast
 * @param {() => void} props.onDismiss
 */
export function CaseToast({ toast, onDismiss }) {
  const [held, setHeld] = useState(false);
  const dismiss = useRef(onDismiss);

  useEffect(() => {
    dismiss.current = onDismiss;
  });

  useEffect(() => {
    if (!toast?.message || held) return undefined;
    const timer = setTimeout(() => dismiss.current?.(), DISMISS_AFTER_MS);
    return () => clearTimeout(timer);
  }, [toast?.message, held]);

  const tone = TONES[toast?.tone ?? "success"] ?? TONES.success;
  const Icon = tone.icon;

  return (
    // Always mounted, never occupying space: the toast is fixed and the
    // wrapper ignores the pointer, so the page below is untouched whether a
    // message is showing or not.
    <div
      aria-live={tone.live}
      className="pointer-events-none fixed inset-x-0 bottom-0 z-50 flex justify-center px-4 pb-4 sm:justify-end sm:px-6 sm:pb-6"
    >
      {toast?.message ? (
        <div
          role={tone.role}
          onMouseEnter={() => setHeld(true)}
          onMouseLeave={() => setHeld(false)}
          onFocusCapture={() => setHeld(true)}
          onBlurCapture={() => setHeld(false)}
          className={`pointer-events-auto flex w-full max-w-sm items-start gap-3 rounded-xl border px-4 py-3 shadow-lg animate-in fade-in slide-in-from-bottom-2 duration-200 motion-reduce:animate-none motion-reduce:duration-0 ${tone.frame}`}
        >
          <Icon aria-hidden="true" className={`mt-0.5 size-4 shrink-0 ${tone.iconClass}`} />
          <p className="min-w-0 flex-1 text-sm leading-relaxed text-foreground">{toast.message}</p>
          <button
            type="button"
            onClick={() => dismiss.current?.()}
            aria-label="Dismiss this message"
            className="-m-1 shrink-0 rounded-md p-1 text-muted-foreground transition-colors hover:bg-muted/40 hover:text-foreground focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
          >
            <X aria-hidden="true" className="size-4" />
          </button>
        </div>
      ) : null}
    </div>
  );
}
