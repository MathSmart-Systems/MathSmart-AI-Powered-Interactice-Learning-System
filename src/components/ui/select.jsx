"use client"

import * as React from "react"
import { cn } from "cn"
import { Select as SelectPrimitive } from "radix-ui"
import { Check, ChevronDown, ChevronUp } from "lucide-react"

/**
 * Root component that manages state and context for a select dropdown.
 *
 * @param {import("radix-ui").SelectProps} props
 * @returns {JSX.Element}
 */
function Select({ ...props }) {
  return <SelectPrimitive.Root data-slot="select" {...props} />
}

/**
 * Groups related select items with optional section labels.
 *
 * @param {import("radix-ui").SelectGroupProps} props
 * @returns {JSX.Element}
 */
function SelectGroup({ ...props }) {
  return <SelectPrimitive.Group data-slot="select-group" {...props} />
}

/**
 * Displays the selected value or placeholder text within the select trigger.
 *
 * @param {import("radix-ui").SelectValueProps} props
 * @returns {JSX.Element}
 */
function SelectValue({ ...props }) {
  return <SelectPrimitive.Value data-slot="select-value" {...props} />
}

/**
 * Interactive button that opens the select dropdown menu.
 *
 * @param {React.ComponentPropsWithoutRef<typeof SelectPrimitive.Trigger> & { size?: "default" | "sm" }} props
 * @returns {JSX.Element}
 */
function SelectTrigger({ className, size = "default", children, ...props }) {
  return (
    <SelectPrimitive.Trigger
      data-slot="select-trigger"
      data-size={size}
      className={cn(
        "flex w-full items-center justify-between gap-2 rounded-md border border-input bg-transparent px-3 py-2 text-sm whitespace-nowrap shadow-xs transition-[color,box-shadow] outline-none data-[placeholder]:text-muted-foreground disabled:cursor-not-allowed disabled:opacity-50 data-[size=default]:h-9 data-[size=sm]:h-8 *:data-[slot=select-value]:truncate [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4 [&_svg:not([class*='text-'])]:text-muted-foreground",
        "focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50",
        "aria-invalid:border-destructive aria-invalid:ring-destructive/20",
        className
      )}
      {...props}
    >
      {children}
      <SelectPrimitive.Icon asChild>
        <ChevronDown className="size-4 opacity-60" />
      </SelectPrimitive.Icon>
    </SelectPrimitive.Trigger>
  )
}

/**
 * Dropdown popover surface containing select items and scroll buttons.
 *
 * @param {React.ComponentPropsWithoutRef<typeof SelectPrimitive.Content>} props
 * @returns {JSX.Element}
 */
function SelectContent({ className, children, position = "popper", ...props }) {
  return (
    <SelectPrimitive.Portal>
      <SelectPrimitive.Content
        data-slot="select-content"
        position={position}
        className={cn(
          "relative z-50 max-h-(--radix-select-content-available-height) min-w-[8rem] overflow-x-hidden overflow-y-auto rounded-md border border-border bg-popover text-popover-foreground shadow-lg",
          position === "popper" &&
            "data-[side=bottom]:translate-y-1 data-[side=top]:-translate-y-1",
          className
        )}
        {...props}
      >
        <SelectScrollUpButton />
        <SelectPrimitive.Viewport
          className={cn(
            "p-1",
            position === "popper" &&
              "h-(--radix-select-trigger-height) w-full min-w-(--radix-select-trigger-width) scroll-my-1"
          )}
        >
          {children}
        </SelectPrimitive.Viewport>
        <SelectScrollDownButton />
      </SelectPrimitive.Content>
    </SelectPrimitive.Portal>
  )
}

/**
 * Non-interactive label for a group of select items.
 *
 * @param {React.ComponentPropsWithoutRef<typeof SelectPrimitive.Label>} props
 * @returns {JSX.Element}
 */
function SelectLabel({ className, ...props }) {
  return (
    <SelectPrimitive.Label
      data-slot="select-label"
      className={cn("px-2 py-1.5 text-xs text-muted-foreground", className)}
      {...props}
    />
  )
}

/**
 * Selectable item within the select dropdown list.
 *
 * @param {React.ComponentPropsWithoutRef<typeof SelectPrimitive.Item>} props
 * @returns {JSX.Element}
 */
function SelectItem({ className, children, ...props }) {
  return (
    <SelectPrimitive.Item
      data-slot="select-item"
      className={cn(
        "relative flex w-full cursor-default items-center gap-2 rounded-sm py-1.5 pr-8 pl-2 text-sm outline-none select-none focus:bg-accent focus:text-accent-foreground data-[disabled]:pointer-events-none data-[disabled]:opacity-50 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
        className
      )}
      {...props}
    >
      <span className="absolute right-2 flex size-3.5 items-center justify-center">
        <SelectPrimitive.ItemIndicator>
          <Check className="size-4" />
        </SelectPrimitive.ItemIndicator>
      </span>
      <SelectPrimitive.ItemText>{children}</SelectPrimitive.ItemText>
    </SelectPrimitive.Item>
  )
}

/**
 * Visual divider separating groups of select items.
 *
 * @param {React.ComponentPropsWithoutRef<typeof SelectPrimitive.Separator>} props
 * @returns {JSX.Element}
 */
function SelectSeparator({ className, ...props }) {
  return (
    <SelectPrimitive.Separator
      data-slot="select-separator"
      className={cn("pointer-events-none -mx-1 my-1 h-px bg-border", className)}
      {...props}
    />
  )
}

/**
 * Scroll indicator button rendered at the top of the select viewport.
 *
 * @param {React.ComponentPropsWithoutRef<typeof SelectPrimitive.ScrollUpButton>} props
 * @returns {JSX.Element}
 */
function SelectScrollUpButton({ className, ...props }) {
  return (
    <SelectPrimitive.ScrollUpButton
      data-slot="select-scroll-up-button"
      className={cn("flex cursor-default items-center justify-center py-1", className)}
      {...props}
    >
      <ChevronUp className="size-4" />
    </SelectPrimitive.ScrollUpButton>
  )
}

/**
 * Scroll indicator button rendered at the bottom of the select viewport.
 *
 * @param {React.ComponentPropsWithoutRef<typeof SelectPrimitive.ScrollDownButton>} props
 * @returns {JSX.Element}
 */
function SelectScrollDownButton({ className, ...props }) {
  return (
    <SelectPrimitive.ScrollDownButton
      data-slot="select-scroll-down-button"
      className={cn("flex cursor-default items-center justify-center py-1", className)}
      {...props}
    >
      <ChevronDown className="size-4" />
    </SelectPrimitive.ScrollDownButton>
  )
}

export {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectScrollDownButton,
  SelectScrollUpButton,
  SelectSeparator,
  SelectTrigger,
  SelectValue,
}
