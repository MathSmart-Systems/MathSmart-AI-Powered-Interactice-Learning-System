/**
 * What a bulk drop has been asked to act on.
 *
 * Two kinds of selection, kept apart on purpose. A section is selected by its
 * id and resolved by the server, so "drop this section" means the section as
 * it stands at that moment rather than the page the browser happened to load.
 * Individual learners are selected by their own account id.
 *
 * That distinction is not fussiness. The roster reads one page, so a section
 * holding more learners than the page shows can be dropped whole — that is
 * what the section id is for — but it cannot be dropped *except for* someone,
 * because the browser has never seen everyone it would have to name. Rows in
 * such a section are locked while the section is selected, and `rowLocked`
 * says which ones.
 */

/** The group key for learners who have no section yet. */
export const UNASSIGNED = "";

/** A section id as a group key, with the unassigned group folded in. */
export function sectionKey(sectionId) {
  return sectionId ?? UNASSIGNED;
}

/** Nothing selected. */
export function emptySelection() {
  return { sections: new Set(), users: new Set() };
}

/** How many learners a section holds, from the API's own per-section counts. */
export function enrolledIn(counts, sectionId) {
  if (!Array.isArray(counts)) return 0;
  const key = sectionKey(sectionId);
  const row = counts.find((entry) => sectionKey(entry?.section_id) === key);
  return Number(row?.enrolled) || 0;
}

/** How many dropped learners a section holds. */
export function droppedIn(counts, sectionId) {
  if (!Array.isArray(counts)) return 0;
  const key = sectionKey(sectionId);
  const row = counts.find((entry) => sectionKey(entry?.section_id) === key);
  return Number(row?.dropped) || 0;
}

/**
 * The API's per-section counts, floored at what the page is showing.
 *
 * The API's number is the one to trust: it sees the whole roster rather than
 * the first page of it. But it can be missing — an older reply, a refresh that
 * failed, a server not yet restarted — and a heading reading "0 enrolled"
 * above a list of names is a worse lie than a slightly low count. So the rows
 * on screen set the floor.
 *
 * @param {Array} counts - `meta.sections` from the roster reply
 * @param {Array<{section_id: string|null, loaded: number}>} loadedBySection
 */
export function withLoadedFloor(counts, loadedBySection) {
  return (loadedBySection ?? []).map(({ section_id, loaded }) => ({
    section_id,
    enrolled: Math.max(enrolledIn(counts, section_id), Number(loaded) || 0),
    dropped: droppedIn(counts, section_id),
  }));
}

export function isSectionSelected(selection, sectionId) {
  return selection.sections.has(sectionKey(sectionId));
}

export function isLearnerSelected(selection, learner) {
  return (
    selection.users.has(learner?.user_id) || isSectionSelected(selection, learner?.section_id)
  );
}

/**
 * Whether a row may not be unticked on its own.
 *
 * True only inside a selected section the page has not fully loaded. Offering
 * a checkbox there would let a teacher believe they had excluded someone from
 * a drop the server is about to apply to the whole section.
 */
export function rowLocked(selection, learner, { loaded, enrolled }) {
  if (!isSectionSelected(selection, learner?.section_id)) return false;
  return enrolled > loaded;
}

/**
 * Selects or deselects every loaded row of a section, by name.
 *
 * The id-based counterpart to `toggleSection`, and the only one available when
 * the roster is showing dropped learners. "Drop this whole section" is a
 * server-side operation with a section id behind it; restoring or purging a
 * whole section is not, and inventing one for a permanent deletion would be
 * reckless. So here the rows on screen are the rows acted on, and the count in
 * the bar is the number of names actually selected.
 */
export function toggleSectionRows(selection, learnersInSection) {
  const rows = learnersInSection ?? [];
  const users = new Set(selection.users);
  const everyOneAlready = rows.length > 0 && rows.every((learner) => users.has(learner.user_id));

  for (const learner of rows) {
    if (everyOneAlready) users.delete(learner.user_id);
    else users.add(learner.user_id);
  }

  return { sections: new Set(selection.sections), users };
}

/** Selects or deselects a whole section, discarding its individual picks. */
export function toggleSection(selection, sectionId, learnersInSection) {
  const key = sectionKey(sectionId);
  const sections = new Set(selection.sections);
  const users = new Set(selection.users);

  for (const learner of learnersInSection ?? []) users.delete(learner.user_id);

  if (sections.has(key)) sections.delete(key);
  else sections.add(key);

  return { sections, users };
}

/**
 * Selects or deselects one learner.
 *
 * Unticking a row inside a selected section converts that section back into
 * the learners the page actually holds, minus this one — which is only sound
 * when the page holds all of them. `rowLocked` is what keeps the other case
 * from reaching here.
 */
export function toggleLearner(selection, learner, learnersInSection) {
  const key = sectionKey(learner?.section_id);
  const sections = new Set(selection.sections);
  const users = new Set(selection.users);

  if (sections.has(key)) {
    sections.delete(key);
    for (const other of learnersInSection ?? []) {
      if (other.user_id !== learner.user_id) users.add(other.user_id);
    }
    return { sections, users };
  }

  if (users.has(learner.user_id)) users.delete(learner.user_id);
  else users.add(learner.user_id);

  return { sections, users };
}

/**
 * How many learners the selection stands for.
 *
 * A selected section counts everyone in it, taken from the API's count rather
 * than the rows on screen. That number is what the confirmation has to say:
 * "Drop 72 students" when the page is showing 38 of them.
 */
export function selectionSize(selection, counts) {
  let total = selection.users.size;
  for (const key of selection.sections) {
    total += enrolledIn(counts, key === UNASSIGNED ? null : key);
  }
  return total;
}

/** Whether anything at all is selected. */
export function hasSelection(selection) {
  return selection.sections.size > 0 || selection.users.size > 0;
}

/**
 * The requests one drop needs.
 *
 * The API takes one target per call — a section, or a list of accounts — so a
 * mixed selection becomes a short sequence. Sections go first: they are the
 * larger, more deliberate act, and if a later request fails the teacher has
 * still had the effect they mostly asked for, reported honestly.
 */
export function dropRequests(selection) {
  const requests = [];
  for (const key of selection.sections) {
    if (key === UNASSIGNED) continue;
    requests.push({ section_id: key });
  }
  // A learner with no section can only be named, never dropped by section.
  if (selection.users.size > 0) {
    requests.push({ user_ids: [...selection.users] });
  }
  return requests;
}

/**
 * The sentence on the confirmation.
 *
 * Says the count and, when it is a whole section, says the section by name —
 * a teacher clearing the year should be reading back the thing they meant.
 */
export function dropSummary(selection, counts, sectionNameOf) {
  const total = selectionSize(selection, counts);
  const plural = total === 1 ? "student" : "students";

  if (selection.sections.size === 1 && selection.users.size === 0) {
    const [key] = [...selection.sections];
    const name = key === UNASSIGNED ? "no section" : sectionNameOf(key);
    return `Drop all ${total} ${plural} from ${name}?`;
  }

  if (selection.sections.size > 1 && selection.users.size === 0) {
    return `Drop all ${total} ${plural} from ${selection.sections.size} sections?`;
  }

  return `Drop ${total} ${plural}?`;
}
