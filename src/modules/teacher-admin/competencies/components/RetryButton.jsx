"use client";

import { useRouter } from "next/navigation";
import { RotateCw } from "lucide-react";

import { Button } from "@/components/ui/button";

/**
 * Retry for a failed catalogue read.
 *
 * `router.refresh()` re-runs the server render with the same session, so
 * nothing about the request is rebuilt on the client. Kept feature-local until
 * a second module also needs the exact control; at that point it belongs in
 * `src/modules/shared/`.
 */
export function RetryButton({ label = "Try again" }) {
  const router = useRouter();

  return (
    <Button type="button" className="h-11 px-5" onClick={() => router.refresh()}>
      <RotateCw aria-hidden="true" className="size-4" />
      {label}
    </Button>
  );
}