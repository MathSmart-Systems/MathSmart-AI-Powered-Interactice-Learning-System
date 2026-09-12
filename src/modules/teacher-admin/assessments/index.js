/**
 * The assessment administration module's public surface.
 *
 * The page renders `TeacherAssessmentsView`; everything else here is exported
 * because a test or another Teacher/Administrator feature has a stated reason
 * to use it. The service and the validation rules stay private: an assessment
 * is authored through this workspace, so a second caller would be a second
 * source of truth for the same contract.
 */

export { TeacherAssessmentsView } from "./components/TeacherAssessmentsView.jsx";
export { AssessmentStatusBadge } from "./components/AssessmentStatusBadge.jsx";
export {
  ASSESSMENT_TYPES,
  formatAssessmentStatus,
  formatAssessmentType,
  formatDate,
  formatDuration,
  formatQuestionCount,
} from "./utils/format.js";
