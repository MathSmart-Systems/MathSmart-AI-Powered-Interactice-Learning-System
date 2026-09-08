/**
 * Public Supabase configuration for browser and server clients.
 *
 * Only the public project URL and publishable key are read here. Secret keys
 * must never be referenced from this module because it is imported by browser
 * code. Values are never logged; callers only receive a boolean readiness flag.
 */

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;

// The publishable key is the current key format. The legacy anon key stays as a
// temporary fallback so existing deployments keep working during rotation.
const SUPABASE_PUBLIC_KEY =
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ??
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

export function isSupabaseConfigured() {
  return Boolean(SUPABASE_URL && SUPABASE_PUBLIC_KEY);
}

/**
 * Returns the public credentials, or throws when the app is misconfigured.
 * Call `isSupabaseConfigured()` first so a missing configuration renders a safe
 * message instead of crashing a render or a build.
 */
export function getSupabaseConfig() {
  if (!isSupabaseConfigured()) {
    throw new Error("Supabase public configuration is missing.");
  }

  return { url: SUPABASE_URL, publicKey: SUPABASE_PUBLIC_KEY };
}
