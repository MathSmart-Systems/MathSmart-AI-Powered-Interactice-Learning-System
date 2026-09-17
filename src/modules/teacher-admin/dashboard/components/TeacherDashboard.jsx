import React from "react";

import { DASHBOARD_STATE } from "../utils/constants.js";
import { readDashboardData } from "../services/dashboard-data.js";
import { DashboardErrorState } from "./DashboardStates.jsx";
import { TeacherDashboardView } from "./TeacherDashboardView.jsx";

export async function TeacherDashboard() {
  const result = await readDashboardData();

  if (result.state === DASHBOARD_STATE.ERROR) {
    return <DashboardErrorState error={result.error} />;
  }

  return <TeacherDashboardView initialModel={result.model} />;
}
