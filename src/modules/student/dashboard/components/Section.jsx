import Link from "next/link";

/**
 * A dashboard section: one heading, one optional destination, one body.
 *
 * The heading rule is a short pine tick rather than a box, so the page reads as
 * a marked-up page of work rather than a wall of cards.
 */
export function Section({ id, title, description, link, children }) {
  return (
    <section aria-labelledby={id} className="flex flex-col gap-4">
      <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1">
        <div className="flex flex-col gap-1">
          <h2
            id={id}
            className="font-display text-xl font-semibold tracking-tight text-foreground"
          >
            {title}
          </h2>
          {description ? (
            <p className="max-w-prose text-sm leading-relaxed text-muted-foreground">
              {description}
            </p>
          ) : null}
        </div>

        {link ? (
          <Link
            href={link.href}
            className="inline-flex min-h-11 items-center text-sm font-medium text-primary underline-offset-4 hover:underline"
          >
            {link.label}
          </Link>
        ) : null}
      </div>

      {children}
    </section>
  );
}

/** The quiet panel most sections sit on: hairline border, no shadow, no tint. */
export function Panel({ className = "", children }) {
  return (
    <div className={`border border-border bg-card ${className}`.trim()}>{children}</div>
  );
}

/**
 * What a section says when it has nothing to list. Never a shrug: it names what
 * would appear here and what puts it there.
 */
export function EmptyNote({ children }) {
  return (
    <p className="border-l-[3px] border-border bg-card px-5 py-4 text-sm leading-relaxed text-muted-foreground">
      {children}
    </p>
  );
}
