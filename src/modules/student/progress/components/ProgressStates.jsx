"use client";

import React from "react";
import Link from "next/link";
import { AlertCircle, ArrowRight, BookOpen, RefreshCw, Sparkles } from "lucide-react";

import { FIELD_IDS, STUDENT_ROUTE } from "../utils/constants.js";

export function ProgressSkeleton() {
  return (
    <div
      className="space-y-8 max-w-6xl mx-auto pb-16 animate-pulse"
      aria-busy="true"
      aria-label="Loading progress"
    >
      <div className="space-y-2">
        <div className="h-8 w-72 bg-muted rounded-lg" />
        <div className="h-4 w-96 bg-muted rounded-md" />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-5">
        <div className="h-36 bg-muted/60 rounded-2xl border border-border" />
        <div className="h-36 bg-muted/60 rounded-2xl border border-border" />
        <div className="h-36 bg-muted/60 rounded-2xl border border-border" />
      </div>

      <div className="h-28 bg-muted/60 rounded-2xl border border-border" />

      <div className="h-72 bg-muted/60 rounded-2xl border border-border" />

      <div className="h-64 bg-muted/60 rounded-2xl border border-border" />
    </div>
  );
}

export function ProgressNoProfile() {
  return (
    <div className="max-w-xl mx-auto my-12 p-8 text-center bg-card rounded-2xl border border-border shadow-xs space-y-4">
      <div className="w-12 h-12 rounded-2xl bg-muted text-muted-foreground flex items-center justify-center mx-auto">
        <BookOpen className="w-6 h-6" />
      </div>
      <h2 className="text-lg font-bold text-foreground font-display">
        Learner Record Being Prepared
      </h2>
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
          <Sparkles className="w-6 h-6" />
        </div>
        <div className="space-y-1">
          <h2 className="text-xl font-extrabold text-foreground font-display">
            Start Your Mathematics Diagnostic
          </h2>
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
            <ArrowRight className="w-4 h-4" />
          </Link>
        </div>
      </div>
    </div>
  );
}

export function ProgressServiceError() {
  return (
    <div className="max-w-xl mx-auto my-12 p-8 text-center bg-card rounded-2xl border border-border shadow-xs space-y-4">
      <div className="w-12 h-12 rounded-2xl bg-destructive/10 text-destructive flex items-center justify-center mx-auto">
        <AlertCircle className="w-6 h-6" />
      </div>
      <h2 className="text-lg font-bold text-foreground font-display">
        Unable to Load Progress
      </h2>
      <p className="text-xs text-muted-foreground max-w-md mx-auto leading-relaxed">
        Could not retrieve your competency records right now. Check your network
        connection and reload to try again.
      </p>
      <div className="pt-2">
        <button
          id={FIELD_IDS.RETRY_PROGRESS_BTN}
          type="button"
          onClick={() => window.location.reload()}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-foreground hover:bg-foreground/90 text-background text-xs font-bold transition-all shadow-xs cursor-pointer"
        >
          <RefreshCw className="w-3.5 h-3.5" />
          <span>Try Again</span>
        </button>
      </div>
    </div>
  );
}
