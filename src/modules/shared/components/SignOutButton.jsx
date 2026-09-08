"use client";

import { useActionState } from "react";
import { LoaderCircle, LogOut } from "lucide-react";

import { SIGN_OUT_INITIAL_STATE, signOutAction } from "@/modules/auth/actions";

/**
 * Ends the session server-side. The button disables itself while the request is
 * in flight so it cannot be submitted twice, and announces both the pending
 * state and any failure to assistive technology.
 */
export function SignOutButton() {
  const [state, formAction, isPending] = useActionState(
    signOutAction,
    SIGN_OUT_INITIAL_STATE,
  );

  return (
    <form action={formAction} className="flex flex-col gap-2">
      <button
        type="submit"
        disabled={isPending}
        className="flex min-h-11 w-full items-center justify-center gap-2 rounded-md border border-shell-border bg-white/5 px-4 py-2.5 text-sm font-medium text-shell-foreground transition-colors hover:bg-white/10 hover:text-white disabled:pointer-events-none disabled:opacity-60"
      >
        {isPending ? (
          <LoaderCircle aria-hidden="true" className="size-4 animate-spin" />
        ) : (
          <LogOut aria-hidden="true" className="size-4" />
        )}
        <span>{isPending ? "Signing out…" : "Log out"}</span>
      </button>

      <p aria-live="polite" className="sr-only">
        {isPending ? "Signing out." : ""}
      </p>

      {state?.error ? (
        <p role="alert" className="text-xs text-shell-accent">
          {state.error}
        </p>
      ) : null}
    </form>
  );
}
