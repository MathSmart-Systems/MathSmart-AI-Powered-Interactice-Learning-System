import Link from "next/link";

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
 * @param {object} props
 * @param {string} props.label - Accessible name for the group, e.g. "Filter questions by state".
 * @param {Array<{id: string, label: string}>} props.tabs
 * @param {string} props.current - The active tab id.
 * @param {(id: string) => string} props.hrefFor
 * @param {number|null} [props.count] - Total rows in the active filter, shown on it alone.
 */
export function StatusTabs({ label, tabs, current, hrefFor, count = null }) {
  return (
    <nav
      aria-label={label}
      className="-mx-1 flex items-center gap-5 overflow-x-auto border-b border-border px-1"
    >
      {tabs.map((tab) => {
        const selected = current === tab.id;

        return (
          <Link
            key={tab.id}
            href={hrefFor(tab.id)}
            aria-current={selected ? "page" : undefined}
            className={
              selected
                ? "-mb-px inline-flex shrink-0 items-center gap-1.5 rounded-t-sm border-b-2 border-primary px-1 pb-2.5 text-sm font-semibold text-primary outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
                : "-mb-px inline-flex shrink-0 items-center gap-1.5 rounded-t-sm border-b-2 border-transparent px-1 pb-2.5 text-sm font-medium text-muted-foreground outline-none transition-colors hover:text-foreground focus-visible:ring-[3px] focus-visible:ring-ring/50"
            }
          >
            {tab.label}
            {selected && typeof count === "number" ? (
              <span className="rounded-full bg-secondary px-1.5 py-0.5 text-xs font-medium text-secondary-foreground">
                {count}
              </span>
            ) : null}
          </Link>
        );
      })}
    </nav>
  );
}
