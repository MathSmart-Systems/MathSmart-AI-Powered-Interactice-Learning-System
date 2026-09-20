/**
 * Moving one item of an ordered list, in the one place every editor uses.
 *
 * Ordering is authored in four places — a module's rules, its worked examples,
 * an activity's questions and an assessment's questions — and all four mean the
 * same thing by it: the position an item holds is its place in the list that
 * gets saved.
 */

/**
 * A copy of `items` with the entry at `index` moved by `offset`.
 *
 * Returns the original array when the move would fall off either end, so a
 * caller can compare identities to know whether anything happened.
 *
 * @template T
 * @param {T[]} items
 * @param {number} index
 * @param {number} offset - -1 to move earlier, 1 to move later.
 * @returns {T[]}
 */
export function moveItem(items, index, offset) {
  if (!Array.isArray(items)) {
    return items;
  }

  const target = index + offset;

  if (index < 0 || index >= items.length || target < 0 || target >= items.length) {
    return items;
  }

  const next = items.slice();
  [next[index], next[target]] = [next[target], next[index]];
  return next;
}

/**
 * What to say after a move, for a live region.
 *
 * Named by what moved rather than by the index it used to hold: "question 3"
 * describes a position that has just changed, which is the one thing a caller
 * cannot rely on after a reorder.
 *
 * @param {string} name - The item, e.g. "What is 2 + 2?" or "Rule 1".
 * @param {number} position - Its new one-based place.
 * @param {number} total
 */
export function movedMessage(name, position, total) {
  return `${name} moved to position ${position} of ${total}.`;
}
