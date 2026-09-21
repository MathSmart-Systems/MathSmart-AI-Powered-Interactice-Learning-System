import React from "react";
import Link from "next/link";

/**
 * A dashboard section card conforming to the MathSmart UI/UX reference.
 * Renders as an accessible, clean card container with a title, description,
 * optional navigation link, and section body.
 */
export function Section({ id, title, description, link, className = "", children }) {
  return (
    <section
      aria-labelledby={id}
      className={`flex min-w-0 flex-col gap-3 rounded-2xl border border-border bg-card p-5 ${className}`.trim()}
    >
      <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1">
        <div className="flex flex-col gap-0.5">
          <h2
            id={id}
            className="font-display text-lg font-bold tracking-tight text-foreground"
          >
            {title}
          </h2>
          {description ? (
            <p className="max-w-prose text-xs text-muted-foreground leading-relaxed">
              {description}
            </p>
          ) : null}
        </div>

        {link ? (
          <Link
            href={link.href}
            className="inline-flex min-h-8 items-center text-xs font-semibold text-primary underline-offset-4 hover:underline cursor-pointer"
          >
            {link.label}
          </Link>
        ) : null}
      </div>

      {children}
    </section>
  );
}

/**
 * What a section says when it has nothing to list.
 */
export function EmptyNote({ children }) {
  return (
    <p className="rounded-xl border border-dashed border-border bg-muted/20 p-5 text-center text-xs leading-relaxed text-muted-foreground">
      {children}
    </p>
  );
}
