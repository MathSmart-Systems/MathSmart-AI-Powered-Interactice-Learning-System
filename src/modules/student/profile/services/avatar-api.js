/**
 * The learner's own profile picture, in the browser.
 *
 * These calls go straight to Supabase Storage under the learner's own session,
 * exactly as the rest of the app forwards the learner's own token. That is the
 * point: the bucket's row-level policies decide what is allowed, so the answer
 * to "can this learner touch that picture" is given by the database and not by
 * this file. No secret key is involved, and nothing here can reach an object
 * that is not named after the signed-in user.
 */

import { createClient } from "@/lib/supabase/client";
import { isSupabaseConfigured } from "@/lib/supabase/config";

import {
  AVATAR_BUCKET,
  SIGNED_URL_TTL_SECONDS,
  avatarPath,
  rejectionReason,
} from "../utils/avatar.js";

/** What every call here answers with, so callers never read a raw driver error. */
function failure(message) {
  return { ok: false, error: message };
}

function client() {
  if (!isSupabaseConfigured()) {
    return null;
  }
  try {
    return createClient();
  } catch {
    return null;
  }
}

/**
 * Replaces the learner's profile picture.
 *
 * `upsert` because a learner has one picture, not a collection: uploading
 * again overwrites the same object rather than leaving the old one behind.
 * The returned signed URL is minted immediately so the page can show the new
 * picture without a reload.
 *
 * @param {string} userId - The signed-in learner's own id
 * @param {File} file
 */
export async function uploadAvatar(userId, file) {
  const refusal = rejectionReason(file);
  if (refusal) {
    return failure(refusal);
  }

  const path = avatarPath(userId);
  if (!path) {
    return failure("Your account could not be identified. Reload the page and try again.");
  }

  const supabase = client();
  if (!supabase) {
    return failure("Picture storage is not available right now.");
  }

  const { error } = await supabase.storage
    .from(AVATAR_BUCKET)
    .upload(path, file, { upsert: true, contentType: file.type });

  if (error) {
    // Deliberately not the driver's message. It can name the bucket, the
    // object and the policy that refused, none of which helps a learner.
    return failure("Your picture could not be uploaded. Please try again.");
  }

  return signedAvatarUrl(userId);
}

/**
 * Removes the learner's profile picture.
 *
 * The page falls back to their initials, which is the same thing it shows for
 * a learner who never uploaded one.
 */
export async function removeAvatar(userId) {
  const path = avatarPath(userId);
  if (!path) {
    return failure("Your account could not be identified. Reload the page and try again.");
  }

  const supabase = client();
  if (!supabase) {
    return failure("Picture storage is not available right now.");
  }

  const { error } = await supabase.storage.from(AVATAR_BUCKET).remove([path]);

  if (error) {
    return failure("Your picture could not be removed. Please try again.");
  }

  return { ok: true, url: null };
}

/**
 * A fresh short-lived link to the learner's own picture.
 *
 * Also the refresh path: the link the page was rendered with expires, so
 * anything that keeps a profile open long enough asks for another one rather
 * than letting the image quietly break.
 */
export async function signedAvatarUrl(userId) {
  const path = avatarPath(userId);
  if (!path) {
    return failure("Your account could not be identified. Reload the page and try again.");
  }

  const supabase = client();
  if (!supabase) {
    return failure("Picture storage is not available right now.");
  }

  const { data, error } = await supabase.storage
    .from(AVATAR_BUCKET)
    .createSignedUrl(path, SIGNED_URL_TTL_SECONDS);

  if (error || !data?.signedUrl) {
    return failure("Your picture could not be loaded.");
  }

  return { ok: true, url: data.signedUrl };
}
