import * as React from "react"
import { cn } from "cn"

function Card({
  className,
  ...props
}) {
  return (
    <div
      data-slot="card"
      className={cn(
        "flex flex-col gap-6 rounded-xl border bg-card py-6 text-card-foreground shadow-sm",
        className
      )}
      {...props}
    />
  )
}

function CardHeader({
  className,
  ...props
}) {
  return (
    <div
      data-slot="card-header"
      className={cn(
        "@container/card-header grid auto-rows-min grid-rows-[auto_auto] items-start gap-2 px-6 has-data-[slot=card-action]:grid-cols-[1fr_auto] [.border-b]:pb-6",
        className
      )}
      {...props}
    />
  )
}

/**
 * The title line of a card. It renders a plain `div` by default, which is
 * presentational only: a screen-reader user navigating a page by heading skips
 * straight past it. Screens where each card is a real section of the document
 * outline should pass `as` to promote the title to the heading level that its
 * position in that outline calls for, for example `as="h2"` for a card sitting
 * directly under the page `h1`.
 *
 * The prop is spelled `as` and takes a tag name rather than `headingLevel`
 * taking a number. Two reasons. First, `Button` and `Badge` in this directory
 * already swap their rendered element through a local `Comp` binding for
 * `asChild`, so an element-valued prop is the shape a reader of this directory
 * already expects, whereas a number would be a second, parallel convention for
 * the same idea. Second, a number can only ever mean a heading, and some cards
 * legitimately want something else here: a `p` for a card whose title is a
 * sentence rather than a section label, or the default `div` for a card that
 * repeats a heading already announced elsewhere on the screen. Promoting every
 * card title to a heading is as bad for navigation as promoting none.
 *
 * `as` is deliberately opt-in and defaults to `"div"`, so existing callers keep
 * the exact element, classes, and `data-slot` they render today. Playwright
 * specs and sibling CSS selectors key off `data-slot="card-title"`, which is set
 * here on whatever element `as` resolves to and therefore survives the swap.
 *
 * @param {React.HTMLAttributes<HTMLElement> & { as?: React.ElementType }} props
 * @returns {JSX.Element}
 */
function CardTitle({
  className,
  as: Comp = "div",
  ...props
}) {
  return (
    <Comp
      data-slot="card-title"
      className={cn("leading-none font-semibold", className)}
      {...props}
    />
  )
}

function CardDescription({
  className,
  ...props
}) {
  return (
    <div
      data-slot="card-description"
      className={cn("text-sm text-muted-foreground", className)}
      {...props}
    />
  )
}

function CardAction({
  className,
  ...props
}) {
  return (
    <div
      data-slot="card-action"
      className={cn(
        "col-start-2 row-span-2 row-start-1 self-start justify-self-end",
        className
      )}
      {...props}
    />
  )
}

function CardContent({
  className,
  ...props
}) {
  return (
    <div
      data-slot="card-content"
      className={cn("px-6", className)}
      {...props}
    />
  )
}

function CardFooter({
  className,
  ...props
}) {
  return (
    <div
      data-slot="card-footer"
      className={cn("flex items-center px-6 [.border-t]:pt-6", className)}
      {...props}
    />
  )
}

export {
  Card,
  CardHeader,
  CardFooter,
  CardTitle,
  CardAction,
  CardDescription,
  CardContent,
}
