import { Card, CardContent } from "@/components/ui/card";

function Block({ className }) {
  return <div aria-hidden="true" className={`animate-pulse rounded bg-secondary ${className}`} />;
}

/**
 * The profile while it is still being read.
 *
 * Every block here is sized against the element it stands in for, measured on
 * the rendered page rather than guessed: the heading is `text-3xl` so its
 * placeholder is `h-10`, the status tiles are `rounded-xl` so these are too,
 * and the paragraph that closes the status card has a placeholder because
 * without one the whole section below it jumped when the real content landed.
 *
 * The accent rule under the header is drawn rather than faked. It is two
 * pixels tall and already its final size, so animating it as a placeholder
 * would be pretending to load something that is simply there.
 */
export function ProfileSkeleton() {
  return (
    <div className="flex flex-col gap-10">
      <p role="status" className="sr-only">
        Loading your profile
      </p>

      <div className="flex flex-col gap-3">
        <Block className="h-5 w-40" />
        <Block className="h-10 w-80 max-w-full" />
        <Block className="h-5 w-full max-w-prose" />
        <span aria-hidden="true" className="mt-1 h-0.5 w-16 bg-primary" />
      </div>

      <Card>
        <CardContent className="flex flex-col gap-6">
          <div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex flex-col gap-5 sm:flex-row sm:items-center sm:gap-6">
              <div className="flex items-center gap-4">
                <Block className="size-20 shrink-0 rounded-xl" />
                <div className="flex flex-col gap-2">
                  <Block className="h-8 w-28 rounded-md" />
                  <Block className="h-4 w-36" />
                </div>
              </div>
              <div className="flex flex-col gap-2">
                <Block className="h-8 w-44 rounded-md" />
                <Block className="h-5 w-56 max-w-full" />
              </div>
            </div>
            <Block className="h-9 w-28 shrink-0 rounded-md" />
          </div>

          <div className="grid grid-cols-1 gap-x-6 gap-y-4 border-t border-border pt-5 sm:grid-cols-3">
            {Array.from({ length: 3 }, (_, index) => (
              <div key={index} className="flex flex-col gap-1.5">
                <Block className="h-3 w-16" />
                <Block className="h-5 w-32 max-w-full" />
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="flex flex-col gap-6">
          <Block className="h-7 w-40" />
          <div className="grid gap-4 sm:grid-cols-2">
            <Block className="h-34 w-full rounded-xl" />
            <Block className="h-34 w-full rounded-xl" />
          </div>
          {/* The closing paragraph. Two lines at every width this page uses. */}
          <div className="flex flex-col gap-1.5">
            <Block className="h-4 w-full" />
            <Block className="h-4 w-2/3" />
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
