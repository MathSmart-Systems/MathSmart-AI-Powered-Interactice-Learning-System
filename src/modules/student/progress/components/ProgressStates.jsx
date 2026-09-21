"use client";

import React, { useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  AlertCircle,
  ArrowRight,
  BookOpen,
  LoaderCircle,
  LogIn,
  RefreshCw,
  Sparkles,
} from "lucide-react";

import { LOGIN_PATH } from "@/lib/auth/roles";

import { FIELD_IDS, STUDENT_ROUTE } from "../utils/constants.js";

/**
 * One placeholder block, on the same terms as every other student skeleton.
 *
 * The pulse lives on each block rather than on the container. A container
 * that animates as a whole reads as one grey slab rather than as the shape of
 * a page, and `bg-secondary` is the surface the other four screens reserve
 * space with — `bg-muted` here made this one screen look unlike the rest.
 */
function ProgressBlock({ className }) {
  return (
    <div
      aria-hidden="true"
      className={`animate-pulse bg-secondary motion-reduce:animate-none ${className}`}
    />
  );
}

export function ProgressSkeleton() {
  return (
    <div className="mx-auto max-w-6xl space-y-8 pb-16" aria-busy="true">
      {/* A spoken line rather than only `aria-label`: a name on a generic
          container is not announced on its own, so the page was silent while
          it loaded. Every other student skeleton says this the same way. */}
      <p role="status" className="sr-only">
        Loading your progress
      </p>

      <div className="space-y-2">
        {/* `max-w-*` rather than a fixed width. `w-96` is 384px, which is
            wider than a 360px phone, so the placeholder pushed the whole page
            sideways before any real content had loaded. */}
        <ProgressBlock className="h-8 w-full max-w-72 rounded-lg" />
        <ProgressBlock className="h-4 w-full max-w-96 rounded-md" />
      </div>

      {/* The three metric cards, then the recommended action, the competency
          table and the learning history — the order the finished page uses. */}
      <div className="grid grid-cols-1 gap-5 sm:grid-cols-3">
        <ProgressBlock className="h-36 rounded-2xl border border-border" />
        <ProgressBlock className="h-36 rounded-2xl border border-border" />
        <ProgressBlock className="h-36 rounded-2xl border border-border" />
      </div>

      <ProgressBlock className="h-28 rounded-2xl border border-border" />
      <ProgressBlock className="h-72 rounded-2xl border border-border" />
      <ProgressBlock className="h-64 rounded-2xl border border-border" />
    </div>
  );
}


export function ProgressNoProfile() {
  return (
    <div className="max-w-xl mx-auto my-12 p-8 text-center bg-card rounded-2xl border border-border shadow-xs space-y-4">
      <div className="w-12 h-12 rounded-2xl bg-muted text-muted-foreground flex items-center justify-center mx-auto">
        <BookOpen className="w-6 h-6" aria-hidden="true" />
      </div>
      {/* This card replaces the whole page, so its heading is the page heading.
          Starting the outline at `h2` left the page with no `h1` at all. */}
      <h1 className="text-lg font-bold text-foreground font-display">
        Learner Record Being Prepared
      </h1>
      <p className="text-xs text-muted-foreground max-w-md mx-auto leading-relaxed">
        Your student profile is being registered in your classroom section.
        Please ask your mathematics teacher to verify your enrollment.
      </p>
      <div className="pt-2">
        <Link
          href={STUDENT_ROUTE.DASHBOARD}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-primary hover:bg-primary/90 text-primary-foreground text-xs font-bold transition-all shadow-xs"
        >
          Return to Dashboard
        </Link>
      </div>
    </div>
  );
}

export function ProgressNoDiagnostic() {
  return (
    <div className="space-y-6 max-w-4xl mx-auto my-8">
      <div className="p-8 bg-card rounded-2xl border border-primary/30 shadow-xs text-center space-y-4">
        <div className="w-12 h-12 rounded-2xl bg-primary/10 text-primary flex items-center justify-center mx-auto">
          <Sparkles className="w-6 h-6" aria-hidden="true" />
        </div>
        <div className="space-y-1">
          <h1 className="text-xl font-extrabold text-foreground font-display">
            Start Your Mathematics Diagnostic
          </h1>
          <p className="text-xs text-muted-foreground max-w-md mx-auto leading-relaxed">
            Taking the Grade 6 baseline assessment establishes your starting
            proficiency, identifies your strengths, and generates your personal
            competency growth chart.
          </p>
        </div>
        <div className="pt-2">
          <Link
            id={FIELD_IDS.START_DIAGNOSTIC_BTN}
            href={STUDENT_ROUTE.DIAGNOSTIC}
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-primary hover:bg-primary/90 text-primary-foreground text-xs font-bold transition-all shadow-xs cursor-pointer"
          >
            <span>Take Diagnostic Assessment</span>
            <ArrowRight className="w-4 h-4" aria-hidden="true" />
          </Link>
        </div>
      </div>
    </div>
  );
}

/**
 * What each failure actually was, in the learner's words.
 *
 * The transport already distinguishes an expired session from a backend that
 * did not answer, from a backend that answered with something unusable. The
 * view discarded all of it and printed one sentence about the network, which
 * sent a learner whose session had simply lapsed to check their wifi.
 */
const ERROR_COPY = {
  session: {
    title: "Please Sign In Again",
    body: "Your sign-in has expired, so your competency records could not be read. Signing in again will bring them back.",
    canRetry: true,
    signIn: true,
  },
  unconfigured: {
    title: "Progress Is Not Available Here",
    body: "This copy of MathSmart is not connected to the progress service. Nothing is wrong with your records — please tell your mathematics teacher.",
    canRetry: false,
    signIn: false,
  },
  malformed: {
    title: "Your Records Could Not Be Read",
    body: "MathSmart reached your records but could not make sense of the answer, so nothing is shown rather than something wrong. Please try again, and tell your teacher if it keeps happening.",
    canRetry: true,
    signIn: false,
  },
  association: {
    title: "Your Records Could Not Be Matched",
    body: "The records that came back did not belong to your account, so none of them are shown. Please tell your mathematics teacher.",
    canRetry: true,
    signIn: false,
  },
  unavailable: {
    title: "Unable to Load Progress",
    body: "MathSmart could not reach your competency records right now. Check your network connection, then try again.",
    canRetry: true,
    signIn: false,
  },
};

export function ProgressServiceError({ reason }) {
  const router = useRouter();
  const [isRetrying, startRetry] = useTransition();

  const copy = ERROR_COPY[reason] ?? ERROR_COPY.unavailable;

  /*
   * A refetch, not a reload.
   *
   * `window.location.reload()` threw the whole document away: the skeleton came
   * back, the scroll position was reset, and the learner paid a full page load
   * for one failed read. Refreshing the route re-runs the server component that
   * reads the records and swaps in the result, so what is on screen stays where
   * it is until there is something better to put there.
   */
  function retry() {
    startRetry(() => router.refresh());
  }

  return (
    <div className="max-w-xl mx-auto my-12 space-y-3">
      {/*
        A fixed-height strip, so the card below does not shift down by a line
        when a retry starts and back up when it ends.
      */}
      <div className="flex min-h-5 items-center justify-center">
        {isRetrying ? (
          <p className="flex items-center gap-2 text-xs text-muted-foreground">
            <LoaderCircle
              aria-hidden="true"
              className="size-3.5 animate-spin motion-reduce:animate-none"
            />
            Checking your records again…
          </p>
        ) : null}
      </div>
      <p aria-live="polite" className="sr-only">
        {isRetrying ? "Checking your records again" : ""}
      </p>

      <div
        aria-busy={isRetrying}
        className={
          isRetrying
            ? "p-8 text-center bg-card rounded-2xl border border-border shadow-xs space-y-4 opacity-60 transition-opacity motion-reduce:transition-none"
            : "p-8 text-center bg-card rounded-2xl border border-border shadow-xs space-y-4 transition-opacity motion-reduce:transition-none"
        }
      >
        <div className="w-12 h-12 rounded-2xl bg-destructive/10 text-destructive flex items-center justify-center mx-auto">
          <AlertCircle className="w-6 h-6" aria-hidden="true" />
        </div>
        <h1 className="text-lg font-bold text-foreground font-display">
          {copy.title}
        </h1>
        <p className="text-xs text-muted-foreground max-w-md mx-auto leading-relaxed">
          {copy.body}
        </p>
        <div className="pt-2 flex flex-wrap items-center justify-center gap-2">
          {copy.signIn ? (
            <Link
              href={LOGIN_PATH}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-primary hover:bg-primary/90 text-primary-foreground text-xs font-bold transition-all shadow-xs"
            >
              <LogIn className="w-3.5 h-3.5" aria-hidden="true" />
              <span>Sign In Again</span>
            </Link>
          ) : null}
          {copy.canRetry ? (
            <button
              id={FIELD_IDS.RETRY_PROGRESS_BTN}
              type="button"
              onClick={retry}
              disabled={isRetrying}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-foreground hover:bg-foreground/90 text-background text-xs font-bold transition-all shadow-xs cursor-pointer disabled:cursor-not-allowed disabled:opacity-60"
            >
              <RefreshCw className="w-3.5 h-3.5" aria-hidden="true" />
              <span>{isRetrying ? "Trying…" : "Try Again"}</span>
            </button>
          ) : null}
        </div>
      </div>
    </div>
  );
}
