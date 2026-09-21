/**
 * Writes a git-ignored `.env.local` pointing every MathSmart target at the
 * Supabase stack on this machine.
 *
 * Why a separate file rather than an edit: `.env` holds the hosted project,
 * and nothing here reads it, copies it or changes it. Next.js already loads
 * `.env.local` in preference to `.env`, so the local values win for the web
 * app without the hosted ones being touched or lost — switching back is
 * deleting one file.
 *
 * Keys come from `supabase status -o json` and are written straight to disk.
 * They are never printed, and the summary this prints names variables only.
 */

import { spawnSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const root = process.cwd();
const target = resolve(root, ".env.local");

function say(message) {
  process.stdout.write(`${message}\n`);
}

/** What `supabase status` reports, as an object. */
function readStatus() {
  const run = spawnSync("npx", ["supabase", "status", "-o", "json"], {
    cwd: root,
    encoding: "utf8",
    shell: process.platform === "win32",
  });

  const text = run.stdout ?? "";
  const start = text.indexOf("{");
  if (start === -1) {
    throw new Error(
      "Could not read `supabase status`. Start the local stack first: npm run db:start",
    );
  }
  return JSON.parse(text.slice(start));
}

const status = readStatus();

/** Reads one field, refusing to write a file with a hole in it. */
function required(field) {
  const value = status[field];
  if (typeof value !== "string" || !value) {
    throw new Error(`\`supabase status\` did not report ${field}.`);
  }
  return value;
}

const apiUrl = required("API_URL");
const anonKey = status.ANON_KEY || required("PUBLISHABLE_KEY");
const secretKey = status.SERVICE_ROLE_KEY || required("SECRET_KEY");
const dbUrl = required("DB_URL");

// Carried over from `.env` rather than restated: these are settings, not
// addresses, and repeating them here would mean two places to keep in step.
// `.env.local` only overrides what has to point somewhere else.
const CARRY_OVER = [
  "NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME",
  "GROQ_API_KEY",
  "GROQ_MODEL",
  "GROQ_ENABLED",
  "GROQ_TIMEOUT_SECONDS",
];

const lines = [
  "# MathSmart — local Supabase stack.",
  "#",
  "# Written by `npm run env:local` from `supabase status`. Git-ignored by the",
  "# `.env*` rule, and loaded in preference to `.env` by Next.js, by the API",
  "# launcher, and by the seed scripts. `.env` still holds the hosted project",
  "# and is neither read nor changed by this file.",
  "#",
  "# To go back to hosted: delete this file and restart `npm run dev`.",
  "",
  `NEXT_PUBLIC_SUPABASE_URL=${apiUrl}`,
  `NEXT_PUBLIC_SUPABASE_ANON_KEY=${anonKey}`,
  "NEXT_PUBLIC_API_BASE_URL=http://127.0.0.1:8000/api/v1",
  "",
  `SUPABASE_URL=${apiUrl}`,
  `SUPABASE_SECRET_KEY=${secretKey}`,
  `SUPABASE_DB_URL=${dbUrl}`,
  `SUPABASE_JWKS_URL=${apiUrl}/auth/v1/.well-known/jwks.json`,
  `SUPABASE_JWT_ISSUER=${apiUrl}/auth/v1`,
  "SUPABASE_JWT_AUDIENCE=authenticated",
  "",
  "CORS_ORIGINS=http://localhost:3000,http://127.0.0.1:3000",
  "",
];

// Anything already in `.env.local` that this file does not set is kept: a
// teacher or learner credential added by hand should survive a rewrite.
const KNOWN = new Set(lines.filter((line) => line.includes("=")).map((line) => line.split("=")[0]));
const kept = [];
if (existsSync(target)) {
  for (const line of readFileSync(target, "utf8").split(/\r?\n/)) {
    const name = line.split("=")[0];
    if (!line.includes("=") || line.trimStart().startsWith("#")) continue;
    if (!KNOWN.has(name)) kept.push(line);
  }
}
if (kept.length > 0) {
  lines.push("# Kept from the previous .env.local.", ...kept, "");
}

writeFileSync(target, lines.join("\n"), "utf8");

say("Wrote .env.local, pointing at the local Supabase stack.");
say("");
say("  set here   : NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY,");
say("               NEXT_PUBLIC_API_BASE_URL, SUPABASE_URL, SUPABASE_SECRET_KEY,");
say("               SUPABASE_DB_URL, SUPABASE_JWKS_URL, SUPABASE_JWT_ISSUER,");
say("               SUPABASE_JWT_AUDIENCE, CORS_ORIGINS");
say(`  from .env  : ${CARRY_OVER.join(", ")}`);
if (kept.length > 0) {
  say(`  kept       : ${kept.map((line) => line.split("=")[0]).join(", ")}`);
}
say("");
say("No value was printed, and .env was not read or changed.");
