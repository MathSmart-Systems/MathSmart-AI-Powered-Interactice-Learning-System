"use client";

import React from "react";
import { AlertCircle, RefreshCw, Users } from "lucide-react";

import { FIELD_IDS } from "../utils/constants.js";

export function DashboardSkeleton() {
  return (
    <div className="space-y-8 animate-pulse" aria-label="Loading teacher dashboard" aria-busy="true">
      {/* 1. Header Banner Skeleton */}
      <div className="bg-card rounded-2xl p-6 sm:p-8 border border-border flex flex-col md:flex-row items-start md:items-center justify-between gap-6">
        <div className="space-y-3">
          <div className="h-5 w-48 bg-muted rounded-full" />
          <div className="h-8 w-72 bg-muted rounded-lg" />
          <div className="h-4 w-96 bg-muted rounded-md" />
        </div>
        <div className="h-10 w-44 bg-muted rounded-xl" />
      </div>

      {/* 2. KPI Metrics Grid Skeleton */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="bg-card p-5 rounded-xl border border-border space-y-3">
            <div className="flex items-center justify-between">
              <div className="h-3 w-20 bg-muted rounded" />
              <div className="size-4 bg-muted rounded-full" />
            </div>
            <div className="h-8 w-16 bg-muted rounded-lg" />
            <div className="h-3 w-28 bg-muted rounded" />
          </div>
        ))}
      </div>

      {/* 3. Priority Learners Grid Skeleton */}
      <div className="bg-card rounded-2xl border border-border p-6 sm:p-8 space-y-6">
        <div className="h-6 w-56 bg-muted rounded-lg" />
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {Array.from({ length: 2 }).map((_, i) => (
            <div key={i} className="p-5 rounded-xl border border-border space-y-4">
              <div className="flex items-center gap-3">
                <div className="size-10 rounded-full bg-muted" />
                <div className="space-y-2">
                  <div className="h-4 w-32 bg-muted rounded" />
                  <div className="h-3 w-24 bg-muted rounded" />
                </div>
              </div>
              <div className="h-16 bg-muted/50 rounded-lg" />
              <div className="flex gap-2">
                <div className="h-8 flex-1 bg-muted rounded-lg" />
                <div className="h-8 flex-1 bg-muted rounded-lg" />
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* 4. Competency Overview Skeleton */}
      <div className="bg-card rounded-2xl p-6 border border-border space-y-4">
        <div className="h-6 w-64 bg-muted rounded-lg" />
        <div className="space-y-4 pt-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="space-y-2">
              <div className="flex justify-between">
                <div className="h-4 w-48 bg-muted rounded" />
                <div className="h-4 w-20 bg-muted rounded" />
              </div>
              <div className="h-2.5 w-full bg-muted rounded-full" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export function DashboardEmptyState({ sectionName = null }) {
  return (
    <div className="bg-card rounded-2xl border border-dashed border-border p-12 text-center space-y-4">
      <div className="size-12 rounded-full bg-muted flex items-center justify-center mx-auto text-muted-foreground">
        <Users className="size-6" />
      </div>
      <div>
        <h3 className="text-lg font-bold text-foreground font-display">
          No Student Activity Recorded Yet
        </h3>
        <p className="text-sm text-muted-foreground mt-1 max-w-md mx-auto">
          {sectionName
            ? `There are no enrolled learners or assessment records for section ${sectionName} yet.`
            : "Enrolled learners and diagnostic assessment results will populate this monitoring hub automatically."}
        </p>
      </div>
    </div>
  );
}

export function DashboardErrorState({ error, onRetry, retriesExhausted = false }) {
  return (
    <div
      role="alert"
      className="bg-card rounded-2xl border border-destructive/30 p-8 text-center space-y-4"
    >
      <div className="size-12 rounded-full bg-destructive/10 flex items-center justify-center mx-auto text-destructive">
        <AlertCircle className="size-6" />
      </div>
      <div>
        <h3 className="text-lg font-bold text-foreground font-display">
          Dashboard Unavailable
        </h3>
        <p className="text-sm text-muted-foreground mt-1 max-w-md mx-auto">
          {error || "Unable to retrieve class monitoring data. Please check your connection."}
        </p>
      </div>
      {retriesExhausted ? (
        <p className="text-xs text-muted-foreground">
          Multiple attempts failed. Please refresh the page or contact your system administrator.
        </p>
      ) : onRetry ? (
        <button
          id={FIELD_IDS.RETRY_BTN}
          type="button"
          onClick={onRetry}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-primary text-primary-foreground text-xs font-bold hover:bg-primary/90 transition-colors cursor-pointer"
        >
          <RefreshCw className="size-3.5" />
          <span>Try Again</span>
        </button>
      ) : null}
    </div>
  );
}
