import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

import { getSupabaseConfig } from "./config";

/**
 * Supabase client for Server Components, Server Actions, and Route Handlers.
 * A new client is created per request because it carries that request's cookies.
 */
export async function createClient() {
  const { url, publicKey } = getSupabaseConfig();
  const cookieStore = await cookies();

  return createServerClient(url, publicKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet, _headers) {
        try {
          cookiesToSet.forEach(({ name, value, options }) =>
            cookieStore.set(name, value, options),
          );
        } catch {
          // Server Components cannot write cookies. The proxy refreshes the
          // session on every request, so this can be ignored.
        }
      },
    },
  });
}
