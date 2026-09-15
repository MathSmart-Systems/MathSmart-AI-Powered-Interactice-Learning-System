"use client"

import * as React from "react"
import { X } from "lucide-react"
import { cn } from "cn"
import { Dialog as DialogPrimitive } from "radix-ui"

/** Provides the root state container for a modal dialog. */
function Dialog(props) {
  return <DialogPrimitive.Root data-slot="dialog" {...props} />
}

/** Renders the control that opens its associated dialog. */
function DialogTrigger(props) {
  return <DialogPrimitive.Trigger data-slot="dialog-trigger" {...props} />
}

/** Portals dialog content outside the surrounding document flow. */
function DialogPortal(props) {
  return <DialogPrimitive.Portal data-slot="dialog-portal" {...props} />
}

/** Renders a control that closes its associated dialog. */
function DialogClose(props) {
  return <DialogPrimitive.Close data-slot="dialog-close" {...props} />
}

/** Covers the page behind an open dialog and applies its transition styles. */
function DialogOverlay({ className, ...props }) {
  return (
    <DialogPrimitive.Overlay
      data-slot="dialog-overlay"
      className={cn(
        "fixed inset-0 z-50 bg-foreground/60 transition-opacity duration-200 data-[state=closed]:opacity-0 data-[state=open]:opacity-100",
        className
      )}
      {...props}
    />
  )
}

/** Renders the modal panel, overlay, and optional close control. */
function DialogContent({ className, children, showCloseButton = true, ...props }) {
  return (
    <DialogPortal>
      <DialogOverlay />
      <DialogPrimitive.Content
        data-slot="dialog-content"
        className={cn(
          "fixed top-1/2 left-1/2 z-50 grid w-full max-w-[calc(100vw-2rem)] -translate-x-1/2 -translate-y-1/2 gap-4 rounded-lg border bg-background p-6 shadow-lg transition duration-200 data-[state=closed]:scale-95 data-[state=closed]:opacity-0 data-[state=open]:scale-100 data-[state=open]:opacity-100 sm:max-w-lg",
          className
        )}
        {...props}
      >
        {children}
        {showCloseButton ? (
          <DialogPrimitive.Close
            data-slot="dialog-close-button"
            className="absolute top-4 right-4 rounded-xs opacity-70 transition-opacity hover:opacity-100 focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none"
          >
            <X className="size-4" />
            <span className="sr-only">Close</span>
          </DialogPrimitive.Close>
        ) : null}
      </DialogPrimitive.Content>
    </DialogPortal>
  )
}

/** Groups a dialog's heading and supporting description. */
function DialogHeader({ className, ...props }) {
  return (
    <div
      data-slot="dialog-header"
      className={cn("flex flex-col gap-1.5 text-left", className)}
      {...props}
    />
  )
}

/** Lays out the action controls at the bottom of a dialog. */
function DialogFooter({ className, ...props }) {
  return (
    <div
      data-slot="dialog-footer"
      className={cn("flex flex-col-reverse gap-2 pt-2 sm:flex-row sm:justify-end", className)}
      {...props}
    />
  )
}

/** Provides the accessible title for a dialog. */
function DialogTitle({ className, ...props }) {
  return (
    <DialogPrimitive.Title
      data-slot="dialog-title"
      className={cn("text-lg leading-none font-semibold", className)}
      {...props}
    />
  )
}

/** Provides supporting accessible text for a dialog. */
function DialogDescription({ className, ...props }) {
  return (
    <DialogPrimitive.Description
      data-slot="dialog-description"
      className={cn("text-sm leading-relaxed text-muted-foreground", className)}
      {...props}
    />
  )
}

export {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogOverlay,
  DialogPortal,
  DialogTitle,
  DialogTrigger,
}
