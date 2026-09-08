"use client";

import { useState } from "react";
import Link from "next/link";
import { Menu, X } from "lucide-react";
import { Dialog } from "radix-ui";

import { Wordmark } from "./Wordmark";
import { SignOutButton } from "./SignOutButton";

function SidebarBody({ workspace, email, renderNav, onNavigate }) {
  return (
    <div className="on-shell flex h-full flex-col bg-shell text-shell-foreground">
      <div className="flex flex-col gap-1 border-b border-shell-border px-4 py-5">
        <Wordmark className="text-white" markClassName="text-shell-accent" />
        <p className="mt-2 text-sm font-medium text-white">{workspace.name}</p>
        <p className="text-xs text-shell-muted">{workspace.detail}</p>
      </div>

      <div className="flex-1 overflow-y-auto py-5">{renderNav(onNavigate)}</div>

      <div className="flex flex-col gap-3 border-t border-shell-border px-4 py-4">
        {email ? (
          <p className="truncate text-xs text-shell-muted" title={email}>
            Signed in as {email}
          </p>
        ) : null}
        <SignOutButton />
      </div>
    </div>
  );
}

/**
 * Workspace sidebar. It is persistent from the large breakpoint up and becomes a
 * modal drawer below it, where Radix Dialog provides the focus trap, the Escape
 * shortcut, and the inert background.
 */
export function SidebarFrame({ workspace, email, homeHref, renderNav }) {
  const [open, setOpen] = useState(false);
  const close = () => setOpen(false);

  return (
    <>
      <aside className="hidden lg:sticky lg:top-0 lg:flex lg:h-svh lg:w-[268px] lg:shrink-0 lg:flex-col lg:border-r lg:border-shell-border">
        <SidebarBody workspace={workspace} email={email} renderNav={renderNav} />
      </aside>

      <Dialog.Root open={open} onOpenChange={setOpen}>
        <div className="on-shell sticky top-0 z-30 flex items-center gap-3 border-b border-shell-border bg-shell px-4 py-3 text-shell-foreground lg:hidden">
          <Dialog.Trigger className="flex size-11 items-center justify-center rounded-md border border-shell-border text-shell-foreground transition-colors hover:bg-white/10 hover:text-white">
            <Menu aria-hidden="true" className="size-5" />
            <span className="sr-only">Open workspace menu</span>
          </Dialog.Trigger>

          <Link href={homeHref} className="text-white">
            <Wordmark markClassName="text-shell-accent" />
            <span className="sr-only">{workspace.name}</span>
          </Link>
        </div>

        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 z-40 bg-shell/70 lg:hidden" />
          <Dialog.Content
            aria-describedby={undefined}
            className="fixed inset-y-0 left-0 z-50 flex w-[288px] max-w-[85vw] flex-col shadow-xl outline-none lg:hidden"
          >
            <Dialog.Title className="sr-only">{workspace.name} menu</Dialog.Title>
            <Dialog.Close className="on-shell absolute top-3 right-3 flex size-11 items-center justify-center rounded-md text-shell-foreground transition-colors hover:bg-white/10 hover:text-white">
              <X aria-hidden="true" className="size-5" />
              <span className="sr-only">Close workspace menu</span>
            </Dialog.Close>
            <SidebarBody
              workspace={workspace}
              email={email}
              renderNav={renderNav}
              onNavigate={close}
            />
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    </>
  );
}
