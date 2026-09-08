import { redirect } from "next/navigation";

import { AUTH_NOTICE, parseAuthNotice } from "@/lib/auth/notices";
import { homePathForRole } from "@/lib/auth/roles";
import { LoginView, getVerifiedSession } from "@/modules/auth";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Sign in | MathSmart",
  description: "Sign in to your MathSmart Grade 6 mathematics workspace.",
};

export default async function LoginPage({ searchParams }) {
  const params = await searchParams;
  const session = await getVerifiedSession();

  if (session.status === "authenticated" && session.role) {
    redirect(homePathForRole(session.role));
  }

  const isConfigured = session.status !== "unconfigured";
  const notice = parseAuthNotice(params?.notice);

  return (
    <LoginView
      // The form already explains a missing configuration; don't say it twice.
      notice={!isConfigured && notice === AUTH_NOTICE.CONFIGURATION ? null : notice}
      isConfigured={isConfigured}
    />
  );
}
