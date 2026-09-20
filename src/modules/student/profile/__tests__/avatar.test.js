/**
 * What may be uploaded, and where it goes.
 *
 * The bucket enforces these limits again server-side, so none of this is the
 * boundary. It exists so a learner is told what is wrong before a slow upload
 * fails, and so the object path can never be built from anything they supplied.
 */

import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  ACCEPTED_TYPES,
  AVATAR_BUCKET,
  MAX_BYTES,
  SIGNED_URL_TTL_SECONDS,
  avatarPath,
  rejectionReason,
} from "../utils/avatar.js";

const USER_ID = "11111111-1111-4111-8111-111111111111";

function file({ type = "image/png", size = 1024 } = {}) {
  return { type, size };
}

describe("rejectionReason", () => {
  it("accepts the three types the bucket accepts", () => {
    for (const type of ACCEPTED_TYPES) {
      assert.equal(rejectionReason(file({ type })), null, type);
    }
  });

  it("refuses a type the bucket would refuse anyway", () => {
    assert.match(rejectionReason(file({ type: "image/gif" })), /JPEG, PNG or WebP/);
    assert.match(rejectionReason(file({ type: "application/pdf" })), /JPEG, PNG or WebP/);
  });

  it("refuses a script wearing an image name", () => {
    // The type comes from the browser, not the filename, and the bucket
    // checks it a second time.
    assert.match(rejectionReason(file({ type: "text/html" })), /JPEG, PNG or WebP/);
  });

  it("refuses an image past the bucket's own limit", () => {
    const refusal = rejectionReason(file({ size: MAX_BYTES + 1 }));
    assert.match(refusal, /2\.0 MB/);
  });

  it("accepts an image exactly at the limit", () => {
    assert.equal(rejectionReason(file({ size: MAX_BYTES })), null);
  });

  it("says the size in a unit a learner reads", () => {
    assert.match(rejectionReason(file({ size: 5 * 1024 * 1024 })), /5\.0 MB/);
  });

  it("refuses an empty file", () => {
    assert.match(rejectionReason(file({ size: 0 })), /empty/);
  });

  it("refuses nothing at all", () => {
    assert.match(rejectionReason(null), /Choose an image/);
    assert.match(rejectionReason(undefined), /Choose an image/);
  });
});

describe("avatarPath", () => {
  it("is the owner's id and nothing else", () => {
    assert.equal(avatarPath(USER_ID), USER_ID);
  });

  it("never builds a path from anything a learner supplied", () => {
    // The defence this encodes: an uploaded filename never reaches the path,
    // so there is no traversal to escape and no extension to spoof.
    for (const hostile of [
      "../../etc/passwd",
      `${USER_ID}/../other`,
      `${USER_ID}.png`,
      "avatars/evil.svg",
      "",
      "   ",
    ]) {
      assert.equal(avatarPath(hostile), null, hostile);
    }
  });

  it("answers nothing for a missing or non-string id", () => {
    assert.equal(avatarPath(null), null);
    assert.equal(avatarPath(undefined), null);
    assert.equal(avatarPath(12345), null);
  });

  it("tolerates surrounding whitespace on a real id", () => {
    assert.equal(avatarPath(`  ${USER_ID}  `), USER_ID);
  });
});

describe("the bucket contract", () => {
  it("names the private bucket the migration creates", () => {
    assert.equal(AVATAR_BUCKET, "avatars");
  });

  it("keeps a signed link short-lived", () => {
    // A photograph of a child should not stay reachable through a link that
    // outlives the page it was minted for.
    assert.ok(SIGNED_URL_TTL_SECONDS > 0);
    assert.ok(SIGNED_URL_TTL_SECONDS <= 600, "a signed avatar URL must expire quickly");
  });

  it("matches the types the migration allows", () => {
    assert.deepEqual([...ACCEPTED_TYPES], ["image/jpeg", "image/png", "image/webp"]);
  });

  it("matches the size the migration allows", () => {
    assert.equal(MAX_BYTES, 2097152);
  });
});
