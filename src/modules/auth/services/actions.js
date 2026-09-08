"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { AUTH_NOTICE, loginPathWithNotice } from "@/lib/auth/notices";
import { LOGIN_PATH, homePathForRole, parseTrustedRole } from "@/lib/auth/roles";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { createClient } from "@/lib/supabase/server";

import { AUTH_MESSAGES } from "../messages";

function failure(formError, fieldErrors = {}) {
  return { formError, fieldErrors };
}

/**
 * Signs a user in with email and password, then routes them by the role carried
 * in their verified `app_metadata.role` claim. Accounts without one of the two
 * production roles get no workspace and are signed out again.
 */
export async function signInAction(_previousState, formData) {
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");

  const fieldErrors = {};

  if (!email) {
    fieldErrors.email = AUTH_MESSAGES.missingEmail;
  }

  if (!password) {
    fieldErrors.password = AUTH_MESSAGES.missingPassword;
  }

  if (Object.keys(fieldErrors).length > 0) {
    return failure(null, fieldErrors);
  }

  if (!isSupabaseConfigured()) {
    return failure(AUTH_MESSAGES.configuration);
  }

  let destination;

  try {
    const supabase = await createClient();
    const { error: signInError } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (signInError) {
      // Any rejected credential returns the same message so the form never
      // reveals whether an email address is registered.
      const status = signInError.status ?? 0;
      return failure(
        status >= 400 && status < 500
          ? AUTH_MESSAGES.invalidCredentials
          : AUTH_MESSAGES.service,
      );
    }

    const { data, error: claimsError } = await supabase.auth.getClaims();

    if (claimsError) {
      return failure(AUTH_MESSAGES.service);
    }

    const role = parseTrustedRole(data?.claims);

    if (!role) {
      await supabase.auth.signOut({ scope: "local" });
      destination = loginPathWithNotice(AUTH_NOTICE.NO_WORKSPACE);
    } else {
      destination = homePathForRole(role);
    }
  } catch {
    return failure(AUTH_MESSAGES.service);
  }

  revalidatePath("/", "layout");
  redirect(destination);
}

/**
 * Ends the current browser session and clears its Supabase cookies. Sessions on
 * the user's other devices are left alone.
 */
export async function signOutAction() {
  if (isSupabaseConfigured()) {
    try {
      const supabase = await createClient();
      const { error } = await supabase.auth.signOut({ scope: "local" });

      if (error) {
        return { error: AUTH_MESSAGES.signOutFailed };
      }
    } catch {
      return { error: AUTH_MESSAGES.signOutFailed };
    }
  }

  revalidatePath("/", "layout");
  redirect(`${LOGIN_PATH}?notice=${AUTH_NOTICE.SIGNED_OUT}`);
}
