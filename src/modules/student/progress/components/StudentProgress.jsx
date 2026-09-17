import React from "react";

import { PROGRESS_STATE, readProgress } from "../services/progress-data.js";
import { StudentProgressView } from "./StudentProgressView.jsx";
import { ProgressNoProfile, ProgressServiceError } from "./ProgressStates.jsx";

/**
 * Async Server Component that loads the authenticated student's progress
 * and resolves appropriate state views.
 */
export async function StudentProgress() {
  const result = await readProgress();

  if (result.state === PROGRESS_STATE.NO_PROFILE) {
    return <ProgressNoProfile />;
  }

  if (result.state === PROGRESS_STATE.ERROR) {
    return <ProgressServiceError />;
  }

  return <StudentProgressView model={result.model} />;
}
