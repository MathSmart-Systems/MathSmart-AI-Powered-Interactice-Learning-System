import { createBrowserClient } from "@supabase/ssr";

import { getSupabaseConfig } from "./config";

/**
 * Supabase client for browser code. `createBrowserClient` is a singleton, so
 * calling this repeatedly is cheap.
 */
export function createClient() {
  const { url, publicKey } = getSupabaseConfig();

  return createBrowserClient(url, publicKey);
}
