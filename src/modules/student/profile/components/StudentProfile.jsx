import { PROFILE_STATE, readProfile } from "../services/profile-data";

import { ProfileNoProfile, ProfileServiceError } from "./ProfileUnavailable";
import { ProfileView } from "./ProfileView";

/**
 * Reads the signed-in learner's profile and renders whichever of its three
 * outcomes applies. The route wraps this in a `<Suspense>` boundary, so the
 * workspace shell and the loading shape stay on screen while this awaits.
 */
export async function StudentProfile() {
  const result = await readProfile();

  if (result.state === PROFILE_STATE.NO_PROFILE) {
    return <ProfileNoProfile />;
  }

  if (result.state === PROFILE_STATE.ERROR) {
    return <ProfileServiceError />;
  }

  return <ProfileView model={result.model} />;
}