/**
 * Server-side surface of the auth module: session verification, the login
 * screen, and user-facing copy.
 *
 * Client components must import the actions from `@/modules/auth/actions`
 * instead, which is the module's client-safe contract.
 */
export { AUTH_MESSAGES, messageForNotice } from "./messages";
export { getVerifiedSession, requireWorkspace } from "./services/session";
export { LoginView } from "./components/LoginView";
