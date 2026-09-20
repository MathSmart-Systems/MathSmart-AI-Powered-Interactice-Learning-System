/**
 * What counts as a usable profile picture, decided in one place.
 *
 * The browser checks these so a learner is told what is wrong before a slow
 * upload fails; the bucket enforces the same limits again, because a check
 * that only runs in the browser is a courtesy, not a boundary.
 */

/** The bucket. Private: nothing here is ever served from a public URL. */
export const AVATAR_BUCKET = "avatars";

/** What the bucket accepts, and what the file input should offer. */
export const ACCEPTED_TYPES = Object.freeze(["image/jpeg", "image/png", "image/webp"]);

/** 2 MiB, matching `file_size_limit` on the bucket. */
export const MAX_BYTES = 2 * 1024 * 1024;

/**
 * How long a signed URL lives.
 *
 * Short on purpose. A profile picture of a child should not be reachable by a
 * link that outlives the page it was minted for, and the page re-reads on
 * every navigation anyway.
 */
export const SIGNED_URL_TTL_SECONDS = 300;

/** Human-readable sizes, for a message a learner can act on. */
function megabytes(bytes) {
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/**
 * Whether this file may be uploaded, and why not when it may not.
 *
 * Returns `null` when the file is fine, so callers read it as "no complaint".
 *
 * @param {{type?: string, size?: number}|null|undefined} file
 * @returns {string|null}
 */
export function rejectionReason(file) {
  if (!file) {
    return "Choose an image first.";
  }

  if (!ACCEPTED_TYPES.includes(file.type)) {
    return "Choose a JPEG, PNG or WebP image.";
  }

  if (typeof file.size !== "number" || file.size <= 0) {
    return "That file seems to be empty.";
  }

  if (file.size > MAX_BYTES) {
    return `That image is ${megabytes(file.size)}. The largest allowed is ${megabytes(MAX_BYTES)}.`;
  }

  return null;
}

/**
 * Where a learner's picture lives.
 *
 * The object is named after the owner and nothing else. The name a learner's
 * file arrived with never reaches the path, so there is no traversal to
 * escape, no extension to spoof, and no way for two learners to collide.
 * Replacing a picture overwrites this same object, so orphans cannot
 * accumulate and a purge has exactly one object to remove.
 *
 * @param {string} userId
 * @returns {string|null}
 */
export function avatarPath(userId) {
  const id = typeof userId === "string" ? userId.trim() : "";
  // A uuid, or nothing. Anything else is not an id this application issued.
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id) ? id : null;
}
