/**
 * Teacher Administration Settings module public interface.
 */

export { TeacherSettingsView } from "./components/TeacherSettingsView.jsx";
export {
  fetchSettings,
  updateSettings,
  fetchSettingsAuditEvents,
} from "./services/settings-admin-service.js";
export { createApiClient, CLIENT_FAILURE, readErrorEnvelope } from "./services/api-client.js";
export { validateSettingsDraft } from "./utils/validation.js";
export {
  FIELD_IDS,
  MIN_PASSING_THRESHOLD,
  MAX_PASSING_THRESHOLD,
  DEFAULT_PASSING_THRESHOLD,
  MIN_INTERVENTION_ATTEMPTS,
  MAX_INTERVENTION_ATTEMPTS,
  DEFAULT_INTERVENTION_ATTEMPTS,
  DEFAULT_GROQ_FEATURE_ENABLED,
  DEFAULT_DAILY_ALERTS_ENABLED,
} from "./utils/constants.js";

