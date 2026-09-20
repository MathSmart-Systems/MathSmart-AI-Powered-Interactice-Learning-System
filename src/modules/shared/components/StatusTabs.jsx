import Link from "next/link";

import { LinkPending } from "./LinkPending";

/**
 * The publication-state filter above a server-rendered content list.
 *
 * These were built as an ARIA `tablist` of links, which is two problems at
 * once. A tablist owes the user a roving tabindex and arrow-key movement, and
 * neither was implemented; and each tab pointed `aria-controls` at a panel id
 * that only exists for the selected tab, so two of the three references never
 * resolved. Underneath, the controls were never tabs: they change the address
 * and reload the list.
 *
 * So they are what they always were — navigation. A link marked
 * `aria-current="page"` says which filter is active, every link is reachable
 * with Tab because links are, and nothing promises behaviour that is not
 * there.
 *
 * ## Why the border and the scroller are separate elements
 *
 * A horizontal scroller cannot keep its vertical axis visible: CSS says that
 * when one axis is not `visible`, the other computes to `auto`. So an element
 * carrying only `overflow-x-auto` is also a vertical scroller, and it will
 * grow a real vertical scrollbar — arrow buttons and all — the moment anything
 * inside it exceeds its content box by a pixel. Here that was the active tab's
 * `-mb-px`, which pulled its underline one pixel below the row so it could sit
 * on the border. The result was a tiny pair of up/down arrows next to the
 * tabs, on a row that has nothing to scroll to.
 *
 * The border now lives on a wrapper, the negative pixel is on the scroller
 * rather than on each link, and the scroller pins `overflow-y` to `hidden`
 * deliberately instead of inheriting it. Nothing inside it overflows
 * vertically any more, so nothing is clipped — and the vertical padding leaves
 * room for a focus ring, which a clipping box would otherwise cut.
 *
 * @param {object} props
 * @param {string} props.label - Accessible name for the group, e.g. "Filter questions by state".
 * @param {Array<{id: string, label: string}>} props.tabs
 * @param {string} props.current - The active tab id.
 * @param {(id: string) => string} props.hrefFor
 * @param {Record<string, number>} [props.counts] - Total rows per tab id.
 */
export function StatusTabs({ label, tabs, current, hrefFor, counts = null }) {
  return (
    <div className="border-b border-border">
      <nav
        aria-label={label}
        className="scrollbar-hidden -mb-px flex items-center gap-5 overflow-x-auto overflow-y-hidden px-1 pt-1"
      >
        {tabs.map((tab) => {
          const selected = current === tab.id;
          // `typeof` rather than a truthiness test. Zero is a count: a tab
          // holding nothing has to say so, and dropping the badge made an
          // empty state look like one nobody had counted.
          const total = counts ? counts[tab.id] : undefined;

          return (
            <Link
              key={tab.id}
              href={hrefFor(tab.id)}
              // The list stays where the teacher left it. A Link scrolls to the
              // top by default, which is right for a destination and wrong for
              // a filter applied to the rows already on screen.
              scroll={false}
              aria-current={selected ? "page" : undefined}
              className={
                selected
                  ? "inline-flex shrink-0 items-center gap-1.5 rounded-t-sm border-b-2 border-primary px-1 pb-2.5 text-sm font-semibold text-primary outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
                  : "inline-flex shrink-0 items-center gap-1.5 rounded-t-sm border-b-2 border-transparent px-1 pb-2.5 text-sm font-medium text-muted-foreground outline-none transition-colors hover:text-foreground focus-visible:ring-[3px] focus-visible:ring-ring/50"
              }
            >
              {tab.label}
              <LinkPending />
              {typeof total === "number" ? (
                <span
                  className={
                    selected
                      ? "rounded-full bg-primary px-1.5 py-0.5 text-xs font-medium text-primary-foreground tabular-nums"
                      : "rounded-full bg-secondary px-1.5 py-0.5 text-xs font-medium text-secondary-foreground tabular-nums"
                  }
                >
                  {total}
                  <span className="sr-only"> {tab.label.toLowerCase()}</span>
                </span>
              ) : null}
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
