/**
 * Server start-up for the Vercel deployment.
 *
 * On Vercel, server-rendered pages read the API from the current deployment's
 * own URL (`https://${VERCEL_URL}/api/v1`; see `src/lib/api/base-url.js`).
 * When Vercel Deployment Protection covers that URL, those server-to-self
 * requests are stopped at Vercel's edge like any unauthenticated visitor.
 *
 * If the project has "Protection Bypass for Automation" enabled, Vercel
 * exposes its secret to the server as `VERCEL_AUTOMATION_BYPASS_SECRET`. This
 * adds that secret as the `x-vercel-protection-bypass` header to server-side
 * requests aimed at exactly that deployment's origin, and to nothing else. It
 * never reaches the browser: this file runs in the Node.js server only, and
 * the variable has no `NEXT_PUBLIC_` prefix.
 *
 * Locally none of these variables exist, and nothing is changed.
 */

export function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;

  const secret = process.env.VERCEL_AUTOMATION_BYPASS_SECRET;
  const host = process.env.VERCEL_URL;
  if (!secret || !host) return;

  const origin = `https://${host.toLowerCase()}`;
  const originalFetch = globalThis.fetch;

  globalThis.fetch = function fetchWithDeploymentBypass(input, init) {
    let target;
    try {
      target = new URL(typeof input === "string" || input instanceof URL ? input : input.url);
    } catch {
      return originalFetch(input, init);
    }
    if (target.origin !== origin) return originalFetch(input, init);

    const headers = new Headers(init?.headers ?? (input instanceof Request ? input.headers : undefined));
    headers.set("x-vercel-protection-bypass", secret);
    return originalFetch(input, { ...init, headers });
  };
}
