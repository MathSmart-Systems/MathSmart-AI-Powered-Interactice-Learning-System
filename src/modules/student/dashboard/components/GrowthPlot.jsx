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
 * The chart names itself: the two values are its accessible label and its
 * caption. The description list that used to sit beside it repeated the
 * figures the dashboard now shows once, in the strip above, so it is gone.
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

  const baselineText = formatScore(diagnosticScore) ?? "not scored yet";
  const currentText = formatScore(currentScore) ?? "not scored yet";
  const label = `Diagnostic ${baselineText}, now ${currentText}. ${growth.text}`;

  return (
    <figure className="flex flex-col gap-2">
      <svg
        role="img"
        aria-label={label}
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

      <figcaption className="text-xs text-muted-foreground">
        Diagnostic <span className="font-medium text-foreground">{baselineText}</span> · now{" "}
        <span className="font-medium text-foreground">{currentText}</span>
      </figcaption>
    </figure>
  );
}
