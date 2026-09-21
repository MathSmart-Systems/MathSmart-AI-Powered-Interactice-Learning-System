/**
 * The Groq status and the email change, read and worded without guessing.
 */

import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  EMAIL_CHANGE_SENT,
  emailChangeOutcome,
  emailChangeResult,
  readAccountEmail,
  validateNewEmail,
} from "../utils/email-change.js";
import {
  GROQ_STATUS,
  describeSettingsAudit,
  readGroqStatus,
  withClassroomSetting,
} from "../utils/groq-status.js";

describe("readGroqStatus", () => {
  it("reads a missing groq block as unavailable and off, never as on", () => {
    assert.deepEqual(readGroqStatus({}), {
      serverConfigured: false,
      classroomEnabled: false,
      status: GROQ_STATUS.UNAVAILABLE,
      model: null,
    });
    assert.equal(readGroqStatus(null).classroomEnabled, false);
  });

  it("keeps the server and the classroom setting apart", () => {
    const status = readGroqStatus({
      groq: { server: "not_configured", classroom_enabled: true, status: "unavailable" },
    });
    assert.equal(status.serverConfigured, false);
    assert.equal(status.classroomEnabled, true);
    assert.equal(status.status, GROQ_STATUS.UNAVAILABLE);
  });

  it("shows the model only while the server uses one", () => {
    assert.equal(
      readGroqStatus({ groq: { server: "configured", model: " m-1 " } }).model,
      "m-1",
    );
    assert.equal(readGroqStatus({ groq: { server: "not_configured", model: "m-1" } }).model, null);
  });

  it("derives the status when the reply leaves it out", () => {
    assert.equal(
      readGroqStatus({ groq: { server: "configured", classroom_enabled: true } }).status,
      GROQ_STATUS.ENABLED,
    );
    assert.equal(
      readGroqStatus({ groq: { server: "configured", classroom_enabled: false } }).status,
      GROQ_STATUS.DISABLED,
    );
  });

  it("changing the classroom setting cannot make an unconfigured server available", () => {
    const off = readGroqStatus({ groq: { server: "not_configured" } });
    assert.equal(withClassroomSetting(off, true).status, GROQ_STATUS.UNAVAILABLE);

    const ready = readGroqStatus({ groq: { server: "configured" } });
    assert.equal(withClassroomSetting(ready, true).status, GROQ_STATUS.ENABLED);
    assert.equal(withClassroomSetting(ready, false).status, GROQ_STATUS.DISABLED);
  });
});

describe("describeSettingsAudit", () => {
  it("says what changed, from what, to what", () => {
    assert.deepEqual(
      describeSettingsAudit({
        changes: [
          { key: "features.groq_advisory", from: false, to: true },
          { key: "thresholds.activity_pass_percentage", from: 75, to: 80 },
        ],
      }),
      [
        "AI suggestions changed from Off to On",
        "Default activity pass threshold changed from 75% to 80%",
      ],
    );
  });

  it("names an older record's duplicate Groq keys once", () => {
    assert.deepEqual(
      describeSettingsAudit({ updated_keys: ["features.groq_advisory", "features.groq_enabled"] }),
      ["AI suggestions"],
    );
  });
});

describe("validateNewEmail", () => {
  it("trims and lowercases", () => {
    assert.deepEqual(validateNewEmail("  New.Teacher@School.EDU.ph ", "old@school.edu.ph"), {
      ok: true,
      email: "new.teacher@school.edu.ph",
    });
  });

  it("refuses empty, malformed and unchanged addresses", () => {
    assert.equal(validateNewEmail("", "a@b.co").ok, false);
    assert.equal(validateNewEmail("not-an-email", "a@b.co").ok, false);
    assert.equal(validateNewEmail("a@b", "a@b.co").ok, false);
    const same = validateNewEmail(" A@B.co ", "a@b.co");
    assert.equal(same.ok, false);
    assert.match(same.error, /already your email/);
  });
});

describe("emailChangeOutcome", () => {
  it("a sent request and an address owned by someone else read exactly the same", () => {
    const sent = emailChangeOutcome({ error: null });
    const taken = emailChangeOutcome({ error: { code: "email_exists", status: 422 } });
    const takenByText = emailChangeOutcome({
      error: { status: 422, message: "A user with this email address has already been registered" },
    });
    assert.deepEqual(taken, sent);
    assert.deepEqual(takenByText, sent);
    assert.equal(sent.message, EMAIL_CHANGE_SENT);
  });

  it("names rate limits, invalid addresses and failed delivery without leaking the provider's text", () => {
    const limited = emailChangeOutcome({ error: { code: "over_email_send_rate_limit", status: 429 } });
    assert.equal(limited.tone, "error");
    assert.match(limited.message, /Too many/);

    const invalid = emailChangeOutcome({ error: { code: "email_address_invalid", status: 400 } });
    assert.match(invalid.message, /valid email/);

    const smtp = emailChangeOutcome({ error: { status: 500, message: "Error sending email change email: dial tcp 10.0.0.1:25" } });
    assert.match(smtp.message, /could not be sent/);
    assert.doesNotMatch(smtp.message, /tcp|10\.0/);
  });
});

describe("readAccountEmail", () => {
  it("an unconfirmed address is never the account's email", () => {
    assert.deepEqual(
      readAccountEmail({ email: "old@school.edu.ph", new_email: "new@school.edu.ph" }),
      { current: "old@school.edu.ph", pending: "new@school.edu.ph" },
    );
  });

  it("there is nothing pending once the change is confirmed", () => {
    assert.deepEqual(readAccountEmail({ email: "new@school.edu.ph", new_email: "" }), {
      current: "new@school.edu.ph",
      pending: null,
    });
  });
});

describe("emailChangeResult", () => {
  it("knows only its own outcomes", () => {
    assert.equal(emailChangeResult("confirmed").tone, "success");
    assert.equal(emailChangeResult("failed").tone, "error");
    assert.equal(emailChangeResult("toString"), null);
    assert.equal(emailChangeResult(null), null);
  });
});
