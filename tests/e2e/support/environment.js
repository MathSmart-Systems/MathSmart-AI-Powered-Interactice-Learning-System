/**
 * Which data the suite is allowed to write.
 *
 * A specification may sign in against any deployment, because signing in reads
 * and writes nothing of its own. Creating rows is different: a test that adds a
 * grade, a section or a question to a hosted project leaves that row behind in
 * real school data — data about real children, which nobody asked this suite to
 * touch. Those specifications therefore run only against the repository's local
 * Supabase stack (`npm run db:start`), and skip everywhere else rather than
 * quietly writing to the hosted project.
 *
 * The guard checks every target a browser test can reach, not just one. The
 * frontend can be served from localhost while it talks to a hosted database —
 * which is exactly the shape the repository's own `.env` has — and checking the
 * Supabase URL alone would have called that arrangement safe.
 *
 * Every other workspace behaviour — the loading shape, the action wording, the
 * keyboard path, the responsive layout, and the create/edit/archive cycle
 * itself — is covered against an intercepted API, so it runs on any deployment
 * without writing anything anywhere.
 */

const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "[::1]", "::1", "0.0.0.0"]);

/** Whether one configured address points at this machine. */
export function isLoopbackUrl(value) {
  if (typeof value !== "string" || !value) {
    return false;
  }

  try {
    return LOCAL_HOSTS.has(new URL(value).hostname);
  } catch {
    return false;
  }
}

/**
 * Every target a mutating browser test reaches, and whether each is loopback.
 *
 * The frontend address comes from the same place Playwright's `baseURL` does,
 * so the check and the run cannot disagree about which application is under
 * test.
 *
 * @returns {Array<{name: string, loopback: boolean, configured: boolean}>}
 */
export function mutationTargets() {
  const port = process.env.PLAYWRIGHT_PORT ?? 3100;
  const entries = [
    ["frontend", process.env.PLAYWRIGHT_BASE_URL ?? `http://localhost:${port}`],
    ["API", process.env.NEXT_PUBLIC_API_BASE_URL],
    ["Supabase", process.env.NEXT_PUBLIC_SUPABASE_URL],
  ];

  return entries.map(([name, value]) => ({
    name,
    configured: Boolean(value),
    loopback: isLoopbackUrl(value),
  }));
}

/**
 * Whether every target is on this machine.
 *
 * Fails closed. An address that is missing, or one this cannot parse, is not
 * local: the only safe answer to "where would this write?" when the answer is
 * unknown is "somewhere it must not".
 */
export function isLocalDataEnvironment() {
  const targets = mutationTargets();
  return targets.length > 0 && targets.every((target) => target.configured && target.loopback);
}

/** The reason a write-bearing specification is being skipped, naming the target. */
export function hostedDataSkipReason() {
  const remote = mutationTargets()
    .filter((target) => !target.loopback)
    .map((target) => (target.configured ? target.name : `${target.name} (not configured)`));

  if (remote.length === 0) {
    return "";
  }

  return (
    `this test creates rows, and ${remote.join(", ")} ` +
    `${remote.length === 1 ? "is" : "are"} not a local address — ` +
    "it will not write to anything but the local Supabase stack"
  );
}

/** Kept as a constant for the specifications that were written against it. */
export const HOSTED_DATA_SKIP_REASON =
  "the configured targets are not all the local stack, so this test will not create rows";
