"use client";

import { useRouter } from "next/navigation";
import { RotateCw } from "lucide-react";

import { Button } from "@/components/ui/button";

/**
 * The only interactive part of the dashboard that needs the browser.
 *
 * A failed read is worth retrying in place rather than making the learner find
 * the reload control, and `router.refresh()` re-runs the server render with the
 * same session, so nothing about the request is rebuilt on the client.
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
