"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "cn";

function isActive(pathname, href) {
  return pathname === href || pathname.startsWith(`${href}/`);
}

/**
 * Workspace navigation list. The active destination is marked with a solid left
 * rule and a heavier label as well as colour, so the state does not rely on
 * colour alone.
 */
export function SidebarNav({ groups, onNavigate }) {
  const pathname = usePathname();

  return (
    <nav aria-label="Workspace" className="flex flex-col gap-6">
      {groups.map((group, groupIndex) => (
        <div key={group.heading ?? `group-${groupIndex}`} className="flex flex-col gap-1">
          {group.heading ? (
            <h2 className="px-4 pb-1 text-xs font-medium text-shell-muted">
              {group.heading}
            </h2>
          ) : null}

          <ul className="flex flex-col gap-0.5">
            {group.items.map((item) => {
              const active = isActive(pathname, item.href);
              const Icon = item.icon;

              return (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    aria-current={active ? "page" : undefined}
                    onClick={onNavigate}
                    className={cn(
                      "flex min-h-11 items-center gap-3 border-l-[3px] px-4 py-2.5 text-sm transition-colors",
                      active
                        ? "border-shell-accent bg-white/8 font-semibold text-white"
                        : "border-transparent font-normal text-shell-foreground hover:bg-white/5 hover:text-white",
                    )}
                  >
                    <Icon
                      aria-hidden="true"
                      className={cn(
                        "size-4 shrink-0",
                        active ? "text-shell-accent" : "text-shell-muted",
                      )}
                    />
                    <span>{item.label}</span>
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </nav>
  );
}
