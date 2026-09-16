"use client";

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";

/*
 * The login panel as a working coordinate plane.
 *
 * MathSmart's promise is written on this panel: plot the gap, close the gap.
 * This draws that sentence. One point is fixed — the goal, the thing the
 * tagline is anchored to. The other is wherever the pointer is, snapped to the
 * same 24px ruling the whole product is drawn on. The dashed line between them
 * is the gap, and it is the only thing joining them. Bring the two together and
 * the line collapses, the moving point takes the goal's colour, and the gap is
 * closed.
 *
 * Everything here is decoration in the accessibility sense: the panel is
 * aria-hidden, nothing inside it takes focus, and nothing it shows is
 * information the form does not already carry. It is also completely still
 * until a pointer moves over it — there is no ambient animation on this page.
 */

const GRID = 24;

/** How far from the goal the plotted point waits, in grid cells. */
const REST_CELLS = 4;

/** One expanding ring, then gone. Matches the .gap-mark-ring keyframes. */
const MARK_MS = 420;

const STEP = "200ms cubic-bezier(0.22, 1, 0.36, 1)";
const TRAIL = "260ms cubic-bezier(0.22, 1, 0.36, 1)";

function snap(value) {
  return Math.round(value / GRID) * GRID;
}

/** Snap to the ruling, then keep the result one cell inside the panel. */
function snapWithin(value, extent) {
  const limit = Math.max(GRID, snap(extent - GRID));
  return Math.min(Math.max(snap(value), GRID), limit);
}

/**
 * The goal sits on the ruling intersection nearest one third across and two
 * thirds down — the position the panel has always used, moved the few pixels
 * needed to land on the grid rather than beside it. A percentage cannot do
 * this: the goal has to be computed from the panel's measured size.
 */
function goalFor(width, height) {
  if (!width || !height) {
    return null;
  }

  return {
    x: snapWithin(width / 3, width),
    y: snapWithin((height * 2) / 3, height),
  };
}

/** Where the plotted point waits when nobody is pointing at the panel. */
function restFor(goal, width, height) {
  return {
    x: snapWithin(goal.x + REST_CELLS * GRID, width),
    y: snapWithin(goal.y - REST_CELLS * GRID, height),
  };
}

/*
 * Pointer tracking is for people using a real pointer who have not asked for
 * less motion. Everyone else gets the same composition, held still. This reads
 * the media queries as an external store so the server and the first client
 * render agree, and so a change to either query re-renders without an effect.
 */
function subscribeToInput(onChange) {
  const still = window.matchMedia("(prefers-reduced-motion: reduce)");
  const fine = window.matchMedia("(hover: hover) and (pointer: fine)");

  still.addEventListener("change", onChange);
  fine.addEventListener("change", onChange);

  return () => {
    still.removeEventListener("change", onChange);
    fine.removeEventListener("change", onChange);
  };
}

function readInput() {
  return (
    window.matchMedia("(hover: hover) and (pointer: fine)").matches &&
    !window.matchMedia("(prefers-reduced-motion: reduce)").matches
  );
}

/** @param {{children?: React.ReactNode}} props the tagline anchored to the goal */
export function GapPlot({ children }) {
  const rootRef = useRef(null);
  const frameRef = useRef(0);
  const pendingRef = useRef(null);
  const markTimerRef = useRef(0);
  const closedRef = useRef(false);

  const [size, setSize] = useState({ width: 0, height: 0 });
  const [plotted, setPlotted] = useState(null);
  const [marked, setMarked] = useState(false);

  const interactive = useSyncExternalStore(subscribeToInput, readInput, () => false);

  useEffect(() => {
    const node = rootRef.current;

    if (!node) {
      return undefined;
    }

    const observer = new ResizeObserver(([entry]) => {
      const { width, height } = entry.contentRect;

      setSize((current) =>
        current.width === width && current.height === height
          ? current
          : { width, height },
      );
    });

    observer.observe(node);

    return () => observer.disconnect();
  }, []);

  useEffect(
    () => () => {
      cancelAnimationFrame(frameRef.current);
      clearTimeout(markTimerRef.current);
    },
    [],
  );

  const mark = useCallback(() => {
    clearTimeout(markTimerRef.current);
    setMarked(true);
    markTimerRef.current = setTimeout(() => setMarked(false), MARK_MS);
  }, []);

  const settle = useCallback(() => {
    cancelAnimationFrame(frameRef.current);
    pendingRef.current = null;
    closedRef.current = false;
    setPlotted(null);
  }, []);

  /*
   * Working in the form settles the panel, so nobody types against a moving
   * background. Both halves are needed: focus catches someone moving into a
   * field, and typing catches the email field, which is focused on load and so
   * never fires a focus event of its own. Moving the pointer back over the
   * plane starts it again — if the pointer is out here, this is not the moment
   * someone is typing.
   */
  useEffect(() => {
    const onFormActivity = (event) => {
      if (event.target instanceof Element && event.target.closest("form")) {
        settle();
      }
    };

    document.addEventListener("focusin", onFormActivity);
    document.addEventListener("keydown", onFormActivity);

    return () => {
      document.removeEventListener("focusin", onFormActivity);
      document.removeEventListener("keydown", onFormActivity);
    };
  }, [settle]);

  const handlePointerMove = useCallback(
    (event) => {
      if (!interactive || !rootRef.current) {
        return;
      }

      const bounds = rootRef.current.getBoundingClientRect();

      pendingRef.current = {
        x: event.clientX - bounds.left,
        y: event.clientY - bounds.top,
        width: bounds.width,
        height: bounds.height,
      };

      // Several pointer events can land inside one frame; only the last is
      // worth a render, and a render only happens at all when the snapped
      // coordinate actually changes cell.
      cancelAnimationFrame(frameRef.current);
      frameRef.current = requestAnimationFrame(() => {
        const next = pendingRef.current;
        const goal = next && goalFor(next.width, next.height);

        if (!next || !goal) {
          return;
        }

        const point = {
          x: snapWithin(next.x, next.width),
          y: snapWithin(next.y, next.height),
        };

        setPlotted((current) =>
          current && current.x === point.x && current.y === point.y ? current : point,
        );

        // Reaching the goal earns the same single ring a deliberate click gets,
        // and earns it once — not on every frame spent standing there.
        const isClosed = point.x === goal.x && point.y === goal.y;

        if (isClosed && !closedRef.current) {
          mark();
        }

        closedRef.current = isClosed;
      });
    },
    [interactive, mark],
  );

  const handlePointerDown = useCallback(() => {
    if (interactive) {
      mark();
    }
  }, [interactive, mark]);

  const goal = goalFor(size.width, size.height);
  // A plotted point only counts while tracking is on; turning reduced motion on
  // mid-session returns the panel to its still composition without an effect.
  const active = interactive ? plotted : null;
  const point = active ?? (goal ? restFor(goal, size.width, size.height) : { x: 0, y: 0 });
  const closed = Boolean(active) && Boolean(goal) && point.x === goal.x && point.y === goal.y;
  const state = active ? (closed ? "closed" : "tracking") : "rest";

  return (
    <div
      ref={rootRef}
      data-testid="gap-plot"
      data-plot-state={state}
      data-plot-motion={interactive ? "full" : "reduced"}
      data-plot-mark={marked ? "on" : "off"}
      data-plot-x={point.x}
      data-plot-y={point.y}
      data-goal-x={goal?.x ?? 0}
      data-goal-y={goal?.y ?? 0}
      onPointerMove={handlePointerMove}
      onPointerLeave={settle}
      onPointerDown={handlePointerDown}
      className={`absolute inset-0 overflow-hidden ${interactive ? "cursor-crosshair" : ""}`}
    >
      <div className="grid-paper absolute inset-0" />
      <div
        className="grid-paper-glow absolute inset-0"
        data-lit={state === "rest" ? "false" : "true"}
        style={{ "--plot-x": `${point.x}px`, "--plot-y": `${point.y}px` }}
      />

      {goal ? (
        <svg
          aria-hidden="true"
          width={size.width}
          height={size.height}
          viewBox={`0 0 ${size.width} ${size.height}`}
          className="absolute inset-0"
        >
          {/* The goal's own axes. These never move; the tagline hangs off them. */}
          <line
            x1={goal.x}
            y1={0}
            x2={goal.x}
            y2={size.height}
            className="stroke-shell-accent/40"
            strokeWidth="1"
          />
          <line
            x1={0}
            y1={goal.y}
            x2={size.width}
            y2={goal.y}
            className="stroke-shell-accent/40"
            strokeWidth="1"
          />

          {/* The plotted point's own reading, trailing it very slightly. */}
          <line
            x1={point.x}
            y1={0}
            x2={point.x}
            y2={size.height}
            className="stroke-shell-accent/20"
            strokeWidth="1"
            style={{ transition: `x1 ${TRAIL}, x2 ${TRAIL}` }}
          />
          <line
            x1={0}
            y1={point.y}
            x2={size.width}
            y2={point.y}
            className="stroke-shell-accent/20"
            strokeWidth="1"
            style={{ transition: `y1 ${TRAIL}, y2 ${TRAIL}` }}
          />

          {/* The gap. */}
          <line
            x1={goal.x}
            y1={goal.y}
            x2={point.x}
            y2={point.y}
            className="stroke-shell-accent/55"
            strokeWidth="1"
            strokeDasharray="4 4"
            strokeLinecap="round"
            style={{ transition: `x2 ${STEP}, y2 ${STEP}` }}
          />

          {/*
           * Both points carry a stroke in the shell colour so they stay round
           * and readable where they cross a ruling line. It is a knockout, not
           * a shadow — this system has none.
           */}
          <circle
            cx={goal.x}
            cy={goal.y}
            r="6"
            className="fill-shell-accent stroke-shell"
            strokeWidth="2"
          />

          {marked ? (
            <circle
              cx={point.x}
              cy={point.y}
              r="5"
              fill="none"
              className="gap-mark-ring stroke-shell-accent"
              strokeWidth="1.5"
            />
          ) : null}

          <circle
            cx={0}
            cy={0}
            r="5"
            className={`stroke-shell ${closed ? "fill-shell-accent" : "fill-shell-muted"}`}
            strokeWidth="2"
            style={{
              transform: `translate(${point.x}px, ${point.y}px)`,
              transition: `transform ${STEP}, fill ${STEP}`,
            }}
          />
        </svg>
      ) : null}

      {goal && children ? (
        <div className="absolute" style={{ left: `${goal.x}px`, top: `${goal.y}px` }}>
          {children}
        </div>
      ) : null}
    </div>
  );
}
