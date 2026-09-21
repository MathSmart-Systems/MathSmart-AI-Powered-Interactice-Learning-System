import { Circle, CircleCheck, CircleDot, Lock } from "lucide-react";

const ICON_FOR_STATUS = {
  locked: Lock,
  available: Circle,
  in_progress: CircleDot,
  completed: CircleCheck,
};

/**
 * The glyph that travels with a written status.
 *
 * Four statuses, four different shapes: a lock, an empty ring, a ring with a
 * centre, a ring with a tick. They are drawn in one colour on purpose, so that
 * taking the colour away — a greyscale print, a learner who cannot separate
 * the hues — still leaves four distinguishable marks beside four different
 * words. It lives in its own file because the list rows and the lesson reader
 * both print a status and must not grow two vocabularies of shapes between
 * them; `in_progress` in particular used to be unreachable, and the reader's
 * header answered every status with a tick.
 */
export function StatusIcon({ status, className }) {
  const Icon = ICON_FOR_STATUS[status] ?? Circle;
  return <Icon aria-hidden="true" className={className} />;
}
