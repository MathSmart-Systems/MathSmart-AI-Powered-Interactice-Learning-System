"use client"

import * as React from "react"
import { cn } from "cn"
import { Dialog as DialogPrimitive } from "radix-ui"
import { X } from "lucide-react"

/** Carries the root's open state down to the surface, for focus return. */
const DialogOpenContext = React.createContext(undefined)

/**
 * Root component that manages open/closed state for a dialog modal.
 *
 * @param {import("radix-ui").DialogProps} props
 * @returns {JSX.Element}
 */
function Dialog({ ...props }) {
  return (
    <DialogOpenContext.Provider value={props.open}>
      <DialogPrimitive.Root data-slot="dialog" {...props} />
    </DialogOpenContext.Provider>
  )
}

/**
 * Trigger element that opens the dialog when activated.
 *
 * @param {import("radix-ui").DialogTriggerProps} props
 * @returns {JSX.Element}
 */
function DialogTrigger({ ...props }) {
  return <DialogPrimitive.Trigger data-slot="dialog-trigger" {...props} />
}

/**
 * Portals dialog content into the document body.
 *
 * @param {import("radix-ui").DialogPortalProps} props
 * @returns {JSX.Element}
 */
function DialogPortal({ ...props }) {
  return <DialogPrimitive.Portal data-slot="dialog-portal" {...props} />
}

/**
 * Button element that closes the active dialog when clicked.
 *
 * @param {import("radix-ui").DialogCloseProps} props
 * @returns {JSX.Element}
 */
function DialogClose({ ...props }) {
  return <DialogPrimitive.Close data-slot="dialog-close" {...props} />
}

/**
 * Semi-transparent backdrop overlay rendered behind the dialog surface.
 *
 * @param {React.ComponentPropsWithoutRef<typeof DialogPrimitive.Overlay>} props
 * @returns {JSX.Element}
 */
function DialogOverlay({ className, ...props }) {
  return (
    <DialogPrimitive.Overlay
      data-slot="dialog-overlay"
      className={cn("fixed inset-0 z-50 bg-shell/60", className)}
      {...props}
    />
  )
}

/**
 * Sends focus back where it came from when the dialog closes.
 *
 * Radix returns focus to its own `DialogTrigger`. Every dialog in MathSmart is
 * opened from state instead — the row's Edit button sets a flag — so there is
 * no trigger for Radix to return to, and focus was landing on `<body>`. That
 * drops a keyboard or screen-reader user at the top of the page each time they
 * press Escape.
 *
 * The control that opened the dialog still has focus on the portal's first
 * render, before Radix moves focus inside, so that is when it is remembered.
 *
 * @returns {(event: Event) => void} a handler for `onCloseAutoFocus`
 */
function useFocusReturn(open, onCloseAutoFocus) {
  const openerRef = React.useRef(null)

  // A dialog that is mounted only while it is open has no closed render to
  // learn from, so its first render is the moment of opening.
  const [openerOnMount] = React.useState(() =>
    typeof document === "undefined" ? null : document.activeElement
  )

  React.useEffect(() => {
    if (open) return undefined

    // While the dialog is closed, keep track of what has focus. The last thing
    // recorded before it opens is the control that opened it.
    //
    // Focus moving into a dialog is skipped: that happens in the same commit
    // as the open, before this listener is torn down, and recording it would
    // leave the return pointing at a surface that is about to be unmounted.
    const remember = (event) => {
      const target = event.target
      if (target instanceof Element && target.closest('[role="dialog"]')) return
      openerRef.current = target
    }
    // Deliberately not seeded from `document.activeElement` here. This effect
    // also runs as the dialog closes, and seeding it then would overwrite the
    // opener with whatever the dialog left focused.
    document.addEventListener("focusin", remember)
    return () => document.removeEventListener("focusin", remember)
  }, [open])

  return React.useCallback(
    (event) => {
      onCloseAutoFocus?.(event)
      if (event.defaultPrevented) return

      const opener = openerRef.current ?? openerOnMount
      if (opener && opener.isConnected && typeof opener.focus === "function") {
        event.preventDefault()
        opener.focus()
      }
    },
    [onCloseAutoFocus, openerOnMount]
  )
}

/**
 * The dialog surface.
 *
 * Radix supplies the parts a hand-rolled overlay keeps missing: the focus trap,
 * Escape to dismiss, and the scroll lock. The surface is a column so a long
 * body scrolls while the header and footer stay put.
 *
 * The gutter is the bed's padding rather than a width computed from `vw`. A
 * `vw` length counts the scrollbar, so on a scrolled page it let a dialog sit
 * wider than the space actually on screen and pushed the page sideways. The
 * bed is `dvh` tall, so a phone's collapsing browser chrome cannot leave the
 * footer under it, and `max-h-full` against that bed is what caps the surface
 * at `100dvh` minus the `p-4` gutter on each side.
 *
 * The surface itself does not scroll. It used to carry `overflow-y-auto` as
 * well as `DialogBody`, and a flex column whose only growing child is already
 * a scroller does not need a second one: what it produced was two nested
 * vertical scrollbars on the taller forms, one of which moved nothing. The
 * body is the single scrolling region, which is also what keeps the header and
 * the footer — where Cancel and Save live — pinned in view.
 */
function DialogContent({
  className,
  children,
  showCloseButton = true,
  onCloseAutoFocus,
  ...props
}) {
  const handleCloseAutoFocus = useFocusReturn(
    React.useContext(DialogOpenContext),
    onCloseAutoFocus
  )

  return (
    <DialogPortal>
      <DialogOverlay />
      {/*
       * The bed lets pointer events through so a click on the overlay still
       * dismisses; only the surface itself takes them back.
       */}
      <div className="pointer-events-none fixed inset-0 z-50 flex h-dvh items-center justify-center p-4">
        <DialogPrimitive.Content
          data-slot="dialog-content"
          className={cn(
            "pointer-events-auto relative flex max-h-full w-full max-w-lg flex-col overflow-hidden rounded-xl border border-border bg-card text-card-foreground shadow-lg outline-none",
            className
          )}
          onCloseAutoFocus={handleCloseAutoFocus}
          {...props}
        >
          {children}
          {showCloseButton ? (
            <DialogPrimitive.Close
              data-slot="dialog-close"
              className="absolute top-4 right-4 rounded-md p-1 text-muted-foreground transition-colors outline-none hover:bg-secondary hover:text-foreground focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:pointer-events-none"
            >
              <X className="size-4" />
              <span className="sr-only">Close dialog</span>
            </DialogPrimitive.Close>
          ) : null}
        </DialogPrimitive.Content>
      </div>
    </DialogPortal>
  )
}

/**
 * Header section of the dialog containing title, description, and optional banner.
 *
 * @param {React.HTMLAttributes<HTMLDivElement>} props
 * @returns {JSX.Element}
 */
function DialogHeader({ className, ...props }) {
  return (
    <div
      data-slot="dialog-header"
      className={cn(
        "flex shrink-0 flex-col gap-1 border-b border-border px-6 py-5 pr-14",
        className
      )}
      {...props}
    />
  )
}

/**
 * Scrollable content body container within the dialog surface.
 *
 * @param {React.HTMLAttributes<HTMLDivElement>} props
 * @returns {JSX.Element}
 */
function DialogBody({ className, ...props }) {
  return (
    <div
      data-slot="dialog-body"
      className={cn("min-h-0 flex-1 overflow-y-auto overscroll-contain px-6 py-5", className)}
      {...props}
    />
  )
}

/**
 * Footer section of the dialog containing action buttons.
 *
 * @param {React.HTMLAttributes<HTMLDivElement>} props
 * @returns {JSX.Element}
 */
function DialogFooter({ className, ...props }) {
  return (
    <div
      data-slot="dialog-footer"
      className={cn(
        "flex shrink-0 flex-col-reverse gap-2 border-t border-border px-6 py-4 sm:flex-row sm:items-center sm:justify-end",
        className
      )}
      {...props}
    />
  )
}

/**
 * Accessible title heading for the dialog.
 *
 * @param {React.ComponentPropsWithoutRef<typeof DialogPrimitive.Title>} props
 * @returns {JSX.Element}
 */
function DialogTitle({ className, ...props }) {
  return (
    <DialogPrimitive.Title
      data-slot="dialog-title"
      className={cn(
        "font-display text-lg font-semibold tracking-tight text-foreground",
        className
      )}
      {...props}
    />
  )
}

/**
 * Accessible description text explaining the dialog's purpose.
 *
 * @param {React.ComponentPropsWithoutRef<typeof DialogPrimitive.Description>} props
 * @returns {JSX.Element}
 */
function DialogDescription({ className, ...props }) {
  return (
    <DialogPrimitive.Description
      data-slot="dialog-description"
      className={cn("text-sm text-muted-foreground", className)}
      {...props}
    />
  )
}

export {
  useFocusReturn,
  Dialog,
  DialogTrigger,
  DialogPortal,
  DialogClose,
  DialogOverlay,
  DialogContent,
  DialogHeader,
  DialogBody,
  DialogFooter,
  DialogTitle,
  DialogDescription,
}
