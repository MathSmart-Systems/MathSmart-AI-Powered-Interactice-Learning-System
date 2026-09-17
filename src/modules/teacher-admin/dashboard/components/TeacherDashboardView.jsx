"use client";

import React, { useState } from "react";

import { fetchDashboardClient } from "../services/api.js";
import { DashboardEmptyState, DashboardErrorState } from "./DashboardStates.jsx";
import { DashboardHeader } from "./DashboardHeader.jsx";
import { DashboardMetricCards } from "./DashboardMetricCards.jsx";
import { PriorityLearnersSection } from "./PriorityLearnersSection.jsx";
import { CompetencyOverviewSection } from "./CompetencyOverviewSection.jsx";

export function TeacherDashboardView({ initialModel }) {
  const [model, setModel] = useState(initialModel);
  const [selectedSectionId, setSelectedSectionId] = useState(initialModel.selectedSectionId || null);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState(null);
  const [retryCount, setRetryCount] = useState(0);

  const MAX_RETRIES = 3;

  const handleSectionChange = async (newSectionId) => {
    setSelectedSectionId(newSectionId);
    setIsRefreshing(true);
    setError(null);

    const res = await fetchDashboardClient({
      sectionId: newSectionId,
      existingSections: model.sections,
    });

    setIsRefreshing(false);
    if (res.ok && res.model) {
      setModel(res.model);
    } else {
      setError(res.error || "Unable to update dashboard for the selected section.");
    }
  };

  const handleRetry = () => {
    if (retryCount >= MAX_RETRIES) return;
    setRetryCount((c) => c + 1);
    handleSectionChange(selectedSectionId);
  };

  if (error) {
    return (
      <DashboardErrorState
        error={error}
        onRetry={retryCount < MAX_RETRIES ? handleRetry : undefined}
        retriesExhausted={retryCount >= MAX_RETRIES}
      />
    );
  }

  return (
    <div
      className={`space-y-8 pb-16 transition-opacity duration-200 ${
        isRefreshing ? "opacity-60 pointer-events-none" : "opacity-100"
      }`}
    >
      {/* 1. Header with ARAL Badge, Section Selector, and Interventions CTA */}
      <DashboardHeader
        model={model}
        selectedSectionId={selectedSectionId}
        onSectionChange={handleSectionChange}
        isRefreshing={isRefreshing}
      />

      {/* 2. Primary KPI Metric Cards (5 columns) */}
      <DashboardMetricCards model={model} />

      {/* 3. Empty State check if no students enrolled */}
      {!model.hasData ? (
        <DashboardEmptyState sectionName={model.selectedSection?.name} />
      ) : (
        <>
          {/* 4. Priority Learners: Students Requiring Attention */}
          <PriorityLearnersSection learners={model.priorityLearners} />

          {/* 5. Class Competency Performance Overview */}
          <CompetencyOverviewSection competencies={model.competencies} />
        </>
      )}
    </div>
  );
}
