import { formatScore } from "../utils/format";

/*
 * The learner's journey as two plotted points.
 *
 * MathSmart's mark is a plotted point on graph paper, and the login page says
 * what the product is for: plot the gap, close the gap. This is that sentence
 * drawn with the learner's own two numbers — where the diagnostic put them, and
 * where they stand now — joined by the segment between. Nothing is drawn that
 * is not one of those values, so the picture cannot say more than the records.
 *
 * The drawing is decorative in the accessibility sense only: every value in it
 * is written out in the description list beside it, which is what a screen
 * reader reads and what anyone reads when the plot is too small to squint at.
 */

const VIEW = { width: 320, height: 200 };
const PLOT = { left: 54, right: 302, top: 26, bottom: 156 };
const BASELINE_X = 110;
const CURRENT_X = 250;

/** Score to canvas position. 0 sits on the axis, 100 at the top rule. */
function y(score) {
  const clamped = Math.min(Math.max(score, 0), 100);
  return PLOT.bottom - (clamped / 100) * (PLOT.bottom - PLOT.top);
}

function Point({ x, score }) {
  return (
    <g>
      <circle
        cx={x}
        cy={y(score)}
        r="10"
        className="fill-card stroke-primary"
        strokeWidth="1.5"
        strokeOpacity="0.4"
      />
      <circle cx={x} cy={y(score)} r="5" className="fill-primary" />
    </g>
  );
}

function PendingPoint({ x }) {
  return (
    <circle
      cx={x}
      cy={y(0)}
      r="5.5"
      className="fill-none stroke-muted-foreground"
      strokeWidth="1.5"
      strokeDasharray="3 3"
    />
  );
}

/**
 * A score, set in the display face at figure size. "Not scored yet" is set in
 * the body face at body size instead: it is a sentence, and typesetting it like
 * a result would give a learner a number-shaped thing that is not a number.
 */
function Score({ value }) {
  const score = formatScore(value);

  return score === null ? (
    <span className="text-sm text-muted-foreground">Not scored yet</span>
  ) : (
    <span className="font-display text-2xl font-semibold tracking-tight">{score}</span>
  );
}

function Figure({ term, children }) {
  return (
    <div className="bg-card px-4 py-3">
      <dt className="text-sm text-muted-foreground">{term}</dt>
      <dd className="mt-1 text-foreground">{children}</dd>
    </div>
  );
}

/**
 * @param {object} props
 * @param {number|null} props.diagnosticScore first plotted point
 * @param {number|null} props.currentScore    second plotted point
 * @param {number|null} props.growthValue     the rise between them, from the API
 * @param {{direction: string, text: string}} props.growth growth in words
 */
export function GrowthPlot({ diagnosticScore, currentScore, growthValue, growth }) {
  const hasBaseline = diagnosticScore !== null;
  const hasCurrent = currentScore !== null;
  const rise = hasBaseline && hasCurrent && growthValue !== null && Math.round(growthValue) !== 0;

  return (
    <div className="grid items-center gap-6 sm:grid-cols-[minmax(0,1fr)_minmax(0,15rem)]">
      <svg
        aria-hidden="true"
        viewBox={`0 0 ${VIEW.width} ${VIEW.height}`}
        className="h-auto w-full"
        preserveAspectRatio="xMidYMid meet"
      >
        {[0, 25, 50, 75, 100].map((score) => (
          <line
            key={score}
            x1={PLOT.left}
            x2={PLOT.right}
            y1={y(score)}
            y2={y(score)}
            className="stroke-border"
            strokeWidth="1"
          />
        ))}

        <line
          x1={PLOT.left}
          x2={PLOT.left}
          y1={PLOT.top - 10}
          y2={PLOT.bottom}
          className="stroke-foreground"
          strokeWidth="1.25"
        />
        <line
          x1={PLOT.left}
          x2={PLOT.right}
          y1={PLOT.bottom}
          y2={PLOT.bottom}
          className="stroke-foreground"
          strokeWidth="1.25"
        />

        {[0, 50, 100].map((score) => (
          <text
            key={score}
            x={PLOT.left - 9}
            y={y(score) + 5}
            textAnchor="end"
            fontSize="13"
            className="fill-muted-foreground"
          >
            {score}%
          </text>
        ))}

        {hasBaseline && hasCurrent ? (
          <line
            x1={BASELINE_X}
            y1={y(diagnosticScore)}
            x2={CURRENT_X}
            y2={y(currentScore)}
            className="stroke-primary"
            strokeWidth="2.25"
            strokeLinecap="round"
          />
        ) : null}

        {rise ? (
          <line
            x1={CURRENT_X}
            y1={y(diagnosticScore)}
            x2={CURRENT_X}
            y2={y(currentScore)}
            className="stroke-primary"
            strokeWidth="1.25"
            strokeDasharray="3 3"
            strokeOpacity="0.7"
          />
        ) : null}

        {hasBaseline ? (
          <Point x={BASELINE_X} score={diagnosticScore} />
        ) : (
          <PendingPoint x={BASELINE_X} />
        )}

        {hasCurrent ? (
          <Point x={CURRENT_X} score={currentScore} />
        ) : (
          <PendingPoint x={CURRENT_X} />
        )}

        <text
          x={BASELINE_X}
          y={PLOT.bottom + 26}
          textAnchor="middle"
          fontSize="14"
          className="fill-muted-foreground"
        >
          Diagnostic
        </text>
        <text
          x={CURRENT_X}
          y={PLOT.bottom + 26}
          textAnchor="middle"
          fontSize="14"
          className="fill-muted-foreground"
        >
          Now
        </text>
      </svg>

      <dl className="grid gap-px overflow-hidden border border-border bg-border">
        <Figure term="Diagnostic score">
          <Score value={diagnosticScore} />
        </Figure>
        <Figure term="Overall mastery now">
          <Score value={currentScore} />
        </Figure>
        <Figure term="Growth since then">
          <span className="text-sm leading-relaxed">{growth.text}</span>
        </Figure>
      </dl>
    </div>
  );
}
