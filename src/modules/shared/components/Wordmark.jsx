import { cn } from "cn";

/**
 * MathSmart identity: the wordmark beside a plotted-point mark that repeats the
 * product's grid-paper signature.
 */
export function Wordmark({ className, markClassName }) {
  return (
    <span className={cn("flex items-center gap-2.5", className)}>
      <svg
        aria-hidden="true"
        viewBox="0 0 24 24"
        className={cn("size-6 shrink-0", markClassName)}
      >
        <rect
          x="0.75"
          y="0.75"
          width="22.5"
          height="22.5"
          rx="2"
          fill="none"
          stroke="currentColor"
          strokeOpacity="0.45"
          strokeWidth="1.5"
        />
        <path
          d="M8.5 1v22M15.5 1v22M1 8.5h22M1 15.5h22"
          stroke="currentColor"
          strokeOpacity="0.28"
          strokeWidth="1"
        />
        <circle cx="15.5" cy="8.5" r="3" fill="currentColor" />
      </svg>
      <span className="font-display text-lg font-semibold tracking-tight">
        MathSmart
      </span>
    </span>
  );
}
