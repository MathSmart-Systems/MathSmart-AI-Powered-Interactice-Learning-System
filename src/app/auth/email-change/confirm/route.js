import { NextResponse } from "next/server";

import { createClient } from "@/lib/supabase/server";

/**
 * Where a secure email-change confirmation link lands.
 *
 * Only the email change uses this route; it is the `emailRedirectTo` of the
 * request made from Teacher Settings. Password recovery and invitations have
 * their own confirmation and are not handled here.
 *
 * Supabase has already done the work by the time a browser arrives. Its
 * `/auth/v1/verify` endpoint checks the link and, with Secure Email Change on,
 * needs one link from the current address and one from the new address:
 *
 * - After either link it may redirect here with a PKCE `code` (or, without
 *   PKCE, a `message` after the first). Exchanging the code refreshes this
 *   browser's session; the account then says whether the change is finished
 *   or still waiting for its other link. The exchange can fail when the link
 *   was opened in a different browser from the one that asked; the account
 *   read afterwards still decides the outcome.
 * - A link that has expired or was already used arrives with an `error`.
 *
 * A template that sends `token_hash` and `type=email_change` instead is
 * verified here with `verifyOtp`, with the same three outcomes.
 *
 * Every outcome goes to one fixed destination; nothing in the request chooses
 * where the browser is sent.
 */

const DESTINATION = "/teacher/settings";

function settle(request, outcome) {
  const url = new URL(DESTINATION, request.url);
  url.search = "";
  url.searchParams.set("tab", "profile");
  url.searchParams.set("email_change", outcome);
  return NextResponse.redirect(url);
}

/**
 * Where the change stands, read from the signed-in account: finished when
 * nothing is pending, waiting when a new address is still listed. With no
 * session in this browser there is nothing to read, and the teacher is told
 * how to check.
 */
async function outcomeFromAccount(supabase) {
  const { data } = await supabase.auth.getUser().catch(() => ({ data: null }));
  const user = data?.user;
  if (!user) return "check";
  return user.new_email ? "pending" : "confirmed";
}

export async function GET(request) {
  const params = new URL(request.url).searchParams;

  if (params.get("error") || params.get("error_code")) {
    return settle(request, "failed");
  }

  const supabase = await createClient();

  const tokenHash = params.get("token_hash");
  if (tokenHash) {
    if (params.get("type") !== "email_change") return settle(request, "failed");
    const { data, error } = await supabase.auth.verifyOtp({
      type: "email_change",
      token_hash: tokenHash,
    });
    if (error) return settle(request, "failed");
    return settle(request, data?.session ? await outcomeFromAccount(supabase) : "pending");
  }

  const code = params.get("code");
  if (code) {
    // Supabase sends a code after either link, so the code alone does not say
    // whether the change is finished. The account does: a change still
    // waiting for its other link is still listed as `new_email`.
    await supabase.auth.exchangeCodeForSession(code).catch(() => null);
    return settle(request, await outcomeFromAccount(supabase));
  }

  if (params.get("message")) {
    return settle(request, "pending");
  }

  return settle(request, "failed");
}
