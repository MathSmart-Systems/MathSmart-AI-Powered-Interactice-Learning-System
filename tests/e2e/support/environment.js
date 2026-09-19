/**
 * Which data the suite is allowed to write.
 *
 * A specification may sign in against any deployment, because signing in reads
 * and writes nothing of its own. Creating rows is different: a test that adds a
 * grade or a section to a hosted project leaves that row behind in real school
 * data. Those specifications therefore run only against the repository's local
 * Supabase stack (`npm run db:start`), and skip everywhere else rather than
 * quietly writing to the hosted project.
 *
 * Every other workspace behaviour — the loading shape, the action wording, the
 * keyboard path, the responsive layout, and the create/edit/deactivate cycle
 * itself — is covered against an intercepted directory API, so it runs on any
 * deployment without writing anything anywhere.
 */

const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "[::1]", "::1", "0.0.0.0"]);

/** Whether `NEXT_PUBLIC_SUPABASE_URL` points at a local stack. */
export function isLocalDataEnvironment() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!url) return false;

  try {
    return LOCAL_HOSTS.has(new URL(url).hostname);
  } catch {
    return false;
  }
}

/** The reason a write-bearing specification is being skipped. */
export const HOSTED_DATA_SKIP_REASON =
  "the configured Supabase project is not the local stack, so this test will not create rows in it";
