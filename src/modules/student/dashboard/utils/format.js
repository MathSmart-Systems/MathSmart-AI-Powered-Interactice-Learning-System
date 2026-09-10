/**
 * Presentation formatting for the learner dashboard.
 *
 * Nothing here decides a result. Mastery, growth, bands and progression are
 * computed by the backend from authoritative records; these functions only
 * choose the words and the digits a Grade 6 learner reads. Keeping them pure
 * and separate is what lets them be tested without a request.
 */

/** A finite number, or `null` for anything the API left unanswered. */
export function toNumber(value) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

/** A score as a whole percentage, or `null` when there is no score yet. */
export function formatScore(value) {
  const score = toNumber(value);
  return score === null ? null : `${Math.round(score)}%`;
}

/** Percentage points, unsigned, for growth wording that supplies its own verb. */
export function formatPoints(value) {
  const points = toNumber(value);

  if (points === null) {
    return null;
  }

  const size = Math.abs(Math.round(points));
  return `${size} ${size === 1 ? "point" : "points"}`;
}

/**
 * How a learner's growth reads in words.
 *
 * The direction is returned alongside the sentence so the interface can pair it
 * with an icon and a heading, and never rely on colour to say which way it went.
 */
export function describeGrowth(value) {
  const growth = toNumber(value);

  if (growth === null) {
    return { direction: "unknown", text: "Your growth appears after your diagnostic." };
  }

  const points = formatPoints(growth);

  if (Math.round(growth) === 0) {
    return { direction: "level", text: "Level with your diagnostic score." };
  }

  return growth > 0
    ? { direction: "up", text: `Up ${points} since your diagnostic.` }
    : { direction: "down", text: `${points} below your diagnostic so far.` };
}

/** The learner's given name, for a greeting that sounds like a person wrote it. */
export function firstName(fullName) {
  if (typeof fullName !== "string") {
    return null;
  }

  const [given] = fullName.trim().split(/\s+/);
  return given || null;
}

/**
 * School time, not server time.
 *
 * The page is rendered on the server, so a greeting taken from the process
 * clock would tell a learner in Nueva Ecija good evening at breakfast. MathSmart
 * serves DepEd schools in one time zone, so the greeting is resolved in that
 * one rather than in whichever zone the deployment happens to run in.
 */
const SCHOOL_TIME_ZONE = "Asia/Manila";

const HOUR_FORMAT = new Intl.DateTimeFormat("en-PH", {
  hour: "numeric",
  hourCycle: "h23",
  timeZone: SCHOOL_TIME_ZONE,
});

export function greetingFor(date = new Date()) {
  const hour = Number(HOUR_FORMAT.format(date));

  if (!Number.isFinite(hour) || hour < 12) {
    return "Good morning";
  }

  return hour < 18 ? "Good afternoon" : "Good evening";
}

// Day-first, as Philippine school records are written.
const DATE_FORMAT = new Intl.DateTimeFormat("en-GB", {
  day: "numeric",
  month: "short",
  year: "numeric",
});

/** A calendar date a learner can read, or `null` when the record has no date. */
export function formatDate(value) {
  if (!value) {
    return null;
  }

  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : DATE_FORMAT.format(date);
}

const DAY_MS = 86_400_000;

// `en-CA` is the shortest way to a plain `YYYY-MM-DD`. The point is the time
// zone: "Today" has to mean today at the learner's school, not today wherever
// the render happened to run, or work finished in the evening reads as
// yesterday's.
const SCHOOL_DAY_FORMAT = new Intl.DateTimeFormat("en-CA", {
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  timeZone: SCHOOL_TIME_ZONE,
});

function startOfSchoolDay(date) {
  return Date.parse(`${SCHOOL_DAY_FORMAT.format(date)}T00:00:00Z`);
}

/**
 * "Today", "Yesterday", "4 days ago", then a plain date. Recent work is easier
 * to recognise by how long ago it was; older work is easier to place by date.
 */
export function formatWhen(value, now = new Date()) {
  if (!value) {
    return null;
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return null;
  }

  const days = Math.round((startOfSchoolDay(now) - startOfSchoolDay(date)) / DAY_MS);

  if (days === 0) {
    return "Today";
  }

  if (days === 1) {
    return "Yesterday";
  }

  if (days > 1 && days < 7) {
    return `${days} days ago`;
  }

  return formatDate(value);
}

/** The date attribute for a `<time>` element, or `null`. */
export function toDateTimeAttribute(value) {
  if (!value) {
    return null;
  }

  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

/** Whole minutes as words, for an estimate a learner can plan around. */
export function formatMinutes(value) {
  const minutes = toNumber(value);

  if (minutes === null || minutes <= 0) {
    return null;
  }

  const whole = Math.round(minutes);
  return `About ${whole} ${whole === 1 ? "minute" : "minutes"}`;
}

/** `2 of 8`, and never a division by zero. */
export function formatCount(done, total) {
  const finished = toNumber(done) ?? 0;
  const all = toNumber(total) ?? 0;
  return { finished, total: all, text: `${finished} of ${all}` };
}

/** Completion as a whole percentage, or `null` when nothing is published yet. */
export function completionPercent(done, total) {
  const { finished, total: all } = formatCount(done, total);
  return all <= 0 ? null : Math.round((finished / all) * 100);
}
