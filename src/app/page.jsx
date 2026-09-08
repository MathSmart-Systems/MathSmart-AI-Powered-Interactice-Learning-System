import { redirect } from "next/navigation";

import { AUTH_NOTICE, loginPathWithNotice } from "@/lib/auth/notices";
import { LOGIN_PATH, homePathForRole } from "@/lib/auth/roles";
import { getVerifiedSession } from "@/modules/auth";

export const dynamic = "force-dynamic";

/** Sends every visitor to the workspace their verified role allows. */
export default async function RootPage() {
  const session = await getVerifiedSession();

  if (session.status === "unconfigured") {
    redirect(loginPathWithNotice(AUTH_NOTICE.CONFIGURATION));
  }

  if (session.status === "unavailable") {
    redirect(loginPathWithNotice(AUTH_NOTICE.SERVICE));
  }

  if (session.status === "anonymous") {
    redirect(LOGIN_PATH);
  }

  if (!session.role) {
    redirect(loginPathWithNotice(AUTH_NOTICE.NO_WORKSPACE));
  }

  redirect(homePathForRole(session.role));
}
