/**
 * The mastery band as a shape.
 *
 * Three graph-paper cells, filled from the left: one for practice still needed,
 * two for developing, three for mastered. The band is always written out beside
 * it, so the glyph is a second reading of the same fact and never the only one.
 */
export function BandGlyph({ fill = 0 }) {
  return (
    <svg aria-hidden="true" viewBox="0 0 34 12" className="h-3 w-[34px] shrink-0">
      {[0, 1, 2].map((index) => (
        <rect
          key={index}
          x={index * 11 + 0.75}
          y="0.75"
          width="10.5"
          height="10.5"
          className={index < fill ? "fill-primary stroke-primary" : "fill-none stroke-input"}
          strokeWidth="1.5"
        />
      ))}
    </svg>
  );
}
