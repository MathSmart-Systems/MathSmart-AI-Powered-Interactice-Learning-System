/**
 * Server-side reads for the Grades & Sections workspace.
 *
 * This module runs only on the server. It forwards the caller's own
 * Supabase access token to the MathSmart API for list data; it never
 * touches a secret key and never decides a result of its own.
 */

import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/config";

const REQUEST_TIMEOUT_MS = 10_000;

function apiBaseUrl() {
  const base = process.env.NEXT_PUBLIC_API_BASE_URL;
  return typeof base === "string" && base ? base.replace(/\/+$/, "") : null;
}

async function accessToken() {
  if (!isSupabaseConfigured()) return null;

  try {
    const supabase = await createClient();
    const { data, error } = await supabase.auth.getSession();
    return error ? null : (data?.session?.access_token ?? null);
  } catch {
    return null;
  }
}

async function readFromApi(path, token, base) {
  let response;
  try {
    response = await fetch(`${base}${path}`, {
      headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
      cache: "no-store",
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
  } catch {
    return { ok: false, status: null };
  }

  if (!response.ok) return { ok: false, status: response.status };

  try {
    const body = await response.json();
    return { ok: true, data: body?.data ?? [] };
  } catch {
    return { ok: false, status: response.status };
  }
}

/**
 * Reads the initial grades, sections, and adviser directory.
 *
 * @returns {Promise<{grades: Array, sections: Array, advisers: Object, error?: string}>}
 */
export async function readGradesSections() {
  const base = apiBaseUrl();

  if (!base) {
    return { grades: [], sections: [], advisers: {}, error: "unconfigured" };
  }

  const token = await accessToken();
  if (!token) {
    return { grades: [], sections: [], advisers: {}, error: "session" };
  }

  const [gradesRes, sectionsRes, usersRes] = await Promise.all([
    readFromApi("/teacher-admin/grades", token, base),
    readFromApi("/teacher-admin/sections", token, base),
    readFromApi("/teacher-admin/users?role=teacher_admin&account_status=active&page_size=100", token, base),
  ]);

  const advisers = {};
  if (usersRes.ok && Array.isArray(usersRes.data)) {
    for (const user of usersRes.data) {
      // Only include users who have all required fields and are valid teacher_admin accounts
      if (
        user &&
        user.user_id &&
        user.role === "teacher_admin" &&
        user.account_status === "active" &&
        user.full_name &&
        typeof user.full_name === 'string' &&
        user.full_name.trim()
      ) {
        advisers[String(user.user_id)] = user.full_name.trim();
      }
    }
  }

  return {
    grades: gradesRes.ok ? gradesRes.data : [],
    sections: sectionsRes.ok ? sectionsRes.data : [],
    advisers,
    error: !gradesRes.ok && !sectionsRes.ok
      ? "unavailable"
      : undefined,
  };
}
