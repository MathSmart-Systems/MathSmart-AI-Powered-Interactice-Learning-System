"use client";

import { useActionState, useEffect, useId, useRef, useState } from "react";
import { Eye, EyeOff, LoaderCircle, TriangleAlert } from "lucide-react";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

import { SIGN_IN_INITIAL_STATE } from "../action-state";
import { AUTH_MESSAGES } from "../messages";
import { signInAction } from "../services/actions";

export function LoginForm({ isConfigured }) {
  const [state, formAction, isPending] = useActionState(
    signInAction,
    SIGN_IN_INITIAL_STATE,
  );
  const [showPassword, setShowPassword] = useState(false);
  const formRef = useRef(null);

  // Marks the form as interactive once React has hydrated it. The password
  // control and the pending state only work from that point on.
  useEffect(() => {
    formRef.current?.setAttribute("data-hydrated", "true");
  }, []);

  const emailId = useId();
  const passwordId = useId();
  const emailErrorId = `${emailId}-error`;
  const passwordErrorId = `${passwordId}-error`;

  const formError = isConfigured
    ? (state?.formError ?? null)
    : AUTH_MESSAGES.configuration;
  const emailError = state?.fieldErrors?.email ?? null;
  const passwordError = state?.fieldErrors?.password ?? null;

  return (
    <form ref={formRef} action={formAction} className="flex flex-col gap-5">
      {formError ? (
        <p
          role="alert"
          data-testid="login-error"
          className="flex items-start gap-2.5 border-l-[3px] border-destructive bg-destructive/5 px-4 py-3 text-sm text-destructive"
        >
          <TriangleAlert aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
          <span>{formError}</span>
        </p>
      ) : null}

      <div className="flex flex-col gap-2">
        <Label htmlFor={emailId}>Email address</Label>
        <Input
          id={emailId}
          name="email"
          type="email"
          autoComplete="email"
          required
          autoFocus
          aria-invalid={emailError ? true : undefined}
          aria-describedby={emailError ? emailErrorId : undefined}
          className="h-11 bg-card text-base"
        />
        {emailError ? (
          <p id={emailErrorId} className="text-sm text-destructive">
            {emailError}
          </p>
        ) : null}
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor={passwordId}>Password</Label>
        <div className="relative">
          <Input
            id={passwordId}
            name="password"
            type={showPassword ? "text" : "password"}
            autoComplete="current-password"
            required
            aria-invalid={passwordError ? true : undefined}
            aria-describedby={passwordError ? passwordErrorId : undefined}
            className="h-11 bg-card pr-12 text-base"
          />
          <button
            type="button"
            onClick={() => setShowPassword((visible) => !visible)}
            aria-pressed={showPassword}
            aria-controls={passwordId}
            className="absolute inset-y-0 right-0 flex w-11 items-center justify-center rounded-md text-muted-foreground transition-colors hover:text-foreground"
          >
            {showPassword ? (
              <EyeOff aria-hidden="true" className="size-4" />
            ) : (
              <Eye aria-hidden="true" className="size-4" />
            )}
            <span className="sr-only">
              {showPassword ? "Hide password" : "Show password"}
            </span>
          </button>
        </div>
        {passwordError ? (
          <p id={passwordErrorId} className="text-sm text-destructive">
            {passwordError}
          </p>
        ) : null}
      </div>

      <button
        type="submit"
        disabled={isPending}
        className="mt-1 flex min-h-11 items-center justify-center gap-2 rounded-md bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90 disabled:pointer-events-none disabled:opacity-60"
      >
        {isPending ? (
          <LoaderCircle aria-hidden="true" className="size-4 animate-spin" />
        ) : null}
        <span>{isPending ? "Signing in…" : "Sign in"}</span>
      </button>

      <p aria-live="polite" className="sr-only">
        {isPending ? "Checking your details." : ""}
      </p>
    </form>
  );
}
