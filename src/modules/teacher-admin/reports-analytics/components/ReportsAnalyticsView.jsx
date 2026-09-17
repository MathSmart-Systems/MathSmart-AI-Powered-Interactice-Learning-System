"use client";

import { useCallback, useState } from "react";
import {
  BarChart3,
  Download,
  TrendingUp,
  Users,
  AlertTriangle,
  CheckCircle2,
} from "lucide-react";

import { MetricCard } from "./MetricCard";
import { SectionFilter } from "./SectionFilter";
import { CompetencyMasteryBreakdown } from "./CompetencyMasteryBreakdown";
import { StudentGrowthMatrix } from "./StudentGrowthMatrix";
import { fetchDashboard, fetchAnalytics, fetchCsvExportUrl } from "../services/api";

export function ReportsAnalyticsView({ initialDashboard, initialAnalytics, initialSections, initialError }) {
  const [dashboard, setDashboard] = useState(initialDashboard);
  const [analytics, setAnalytics] = useState(initialAnalytics);
  const [sections] = useState(initialSections);
  const [selectedSectionId, setSelectedSectionId] = useState(null);
  const [loading, setLoading] = useState(false);
  const [pageError, setPageError] = useState(initialError);
  const [exportSuccess, setExportSuccess] = useState(false);
  const [exporting, setExporting] = useState(false);

  const totals = dashboard?.totals ?? {};
  const competencies = analytics?.competencies ?? dashboard?.competencies ?? [];
  const cohort = analytics?.cohort ?? {};
  const sectionCount = sections.length;

  const avgMastery = totals.average_mastery ?? cohort.average_mastery;
  const avgMasteryDisplay = avgMastery != null ? `${Math.round(avgMastery)}%` : "—";

  const openInterventions = totals.open_intervention_count ?? cohort.open_intervention_count ?? 0;

  const masteredCount = totals.mastered_count ?? 0;
  const learnerCount = totals.learner_count ?? cohort.learner_count ?? 0;
  const masteredPercent = learnerCount > 0 ? Math.round((masteredCount / learnerCount) * 100) : 0;

  const handleSectionChange = useCallback(async (sectionId) => {
    setSelectedSectionId(sectionId);
    setLoading(true);
    setPageError(null);

    try {
      const [dashRes, anaRes] = await Promise.all([
        fetchDashboard({ sectionId }),
        fetchAnalytics({ sectionId }),
      ]);

      if (dashRes.ok && anaRes.ok) {
        setDashboard(dashRes.data);
        setAnalytics(anaRes.data);
      } else if (!dashRes.ok && !anaRes.ok) {
        setPageError("Could not refresh report data.");
      } else {
        setPageError("Some report data could not be refreshed. Showing the previous report.");
      }
    } catch {
      setPageError("Could not refresh report data.");
    } finally {
      setLoading(false);
    }
  }, []);

  const handleExport = useCallback(async () => {
    setExporting(true);
    setExportSuccess(false);
    try {
      const url = await fetchCsvExportUrl({ sectionId: selectedSectionId });
      if (!url) {
        setPageError("Export failed. Please try again.");
        return;
      }
      const link = document.createElement("a");
      link.href = url;
      link.download = `MathSmart_Report_${new Date().toISOString().slice(0, 10)}.csv`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
      setExportSuccess(true);
      setTimeout(() => setExportSuccess(false), 3000);
    } catch {
      setPageError("Export failed. Please try again.");
    } finally {
      setExporting(false);
    }
  }, [selectedSectionId]);

  return (
    <div className="flex flex-col gap-8">
      <header className="flex flex-col gap-3">
        <p className="inline-flex w-fit items-center gap-2 rounded-full bg-primary/10 px-3 py-1 text-xs font-semibold text-primary">
          <BarChart3 aria-hidden="true" className="size-3.5" />
          Reports & Analytics
        </p>
        <h1 className="font-display text-3xl font-semibold tracking-tight text-foreground">
          Reports and Analytics
        </h1>
        <span aria-hidden="true" className="h-0.5 w-16 bg-primary" />
        <div className="flex items-center justify-between gap-4">
          <p className="max-w-prose text-sm leading-relaxed text-muted-foreground">
            Cohort mastery, competency performance, and learner growth across sections.
          </p>
          <button
            onClick={handleExport}
            disabled={exporting}
            className="inline-flex shrink-0 items-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-xs font-bold text-primary-foreground shadow-xs transition-colors hover:bg-primary/90 disabled:pointer-events-none disabled:opacity-60"
          >
            <Download aria-hidden="true" className="size-4" />
            {exporting ? "Exporting..." : "Export CSV"}
          </button>
        </div>
      </header>

      {pageError ? (
        <p role="alert" className="rounded-lg border border-destructive/40 bg-destructive/5 px-3 py-2 text-sm text-destructive">
          {pageError}
        </p>
      ) : null}

      {exportSuccess ? (
        <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
          <CheckCircle2 aria-hidden="true" className="mr-1 inline size-4 text-emerald-600" />
          Report exported successfully.
        </div>
      ) : null}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <MetricCard
          label="Cohort Average Mastery"
          value={avgMasteryDisplay}
          icon={TrendingUp}
          iconColor="text-primary"
          detail={learnerCount > 0 ? `${learnerCount} learners tracked` : undefined}
        />
        <MetricCard
          label="At/Above Mastery"
          value={`${masteredPercent}%`}
          icon={Users}
          iconColor="text-primary"
          detail={`${masteredCount} of ${learnerCount} students`}
        />
        <MetricCard
          label="Open Interventions"
          value={openInterventions}
          icon={AlertTriangle}
          iconColor="text-destructive"
          detail={openInterventions > 0 ? "Cases need attention" : "No active cases"}
          detailColor={openInterventions > 0 ? "text-destructive" : "text-muted-foreground"}
        />
        <MetricCard
          label="Sections"
          value={sectionCount}
          icon={BarChart3}
          iconColor="text-primary"
          detail="Class sections with data"
        />
      </div>

      <SectionFilter
        sections={sections}
        selectedSectionId={selectedSectionId}
        onChange={handleSectionChange}
        disabled={loading}
      />

      {loading ? (
        <div className="rounded-xl border border-border bg-card p-6 text-center text-sm text-muted-foreground">
          Loading report data...
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          <CompetencyMasteryBreakdown competencies={competencies} />
          <StudentGrowthMatrix dashboard={dashboard} />
        </div>
      )}
    </div>
  );
}
