"use client";

import { useId, useState } from "react";
import { Minus, Plus, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ReorderControls, ResultAnnouncer } from "@/modules/shared";
import { moveItem, movedMessage } from "@/modules/shared/utils/reorder.js";

function clientIdentifier() {
  return globalThis.crypto.randomUUID();
}

/** Adds editor-only identities that are never submitted to the API. */
export function editableWorkedExample(raw) {
  const example = raw ?? { problem: "", steps: [], solution: "", tip: "" };
  const steps = Array.isArray(example.steps) ? example.steps : [];

  return {
    ...example,
    steps,
    clientId: clientIdentifier(),
    stepIds: steps.map(() => clientIdentifier()),
  };
}

/**
 * The repeatable worked-example editor. Each example is a { problem, steps,
 * solution, tip } block. Steps carry the example index in their field name
 * (`example_step_<index>`) because each example keeps its own ordered list.
 */
export function WorkedExamplesEditor({ examples, onChange, error }) {
  const baseId = useId();
  const errorId = `${baseId}-examples-error`;
  const [announcement, setAnnouncement] = useState("");

  function updateExample(index, patch) {
    const next = examples.slice();
    next[index] = { ...next[index], ...patch };
    onChange(next);
  }

  function addStep(exampleIndex) {
    const example = examples[exampleIndex];
    updateExample(exampleIndex, {
      steps: [...example.steps, ""],
      stepIds: [...example.stepIds, clientIdentifier()],
    });
  }

  function updateStep(exampleIndex, stepIndex, value) {
    const example = examples[exampleIndex];
    const next = example.steps.slice();
    next[stepIndex] = value;
    updateExample(exampleIndex, { steps: next });
  }

  function removeStep(exampleIndex, stepIndex) {
    const example = examples[exampleIndex];
    updateExample(exampleIndex, {
      steps: example.steps.filter((_, i) => i !== stepIndex),
      stepIds: example.stepIds.filter((_, i) => i !== stepIndex),
    });
  }

  function moveExample(index, offset) {
    const next = moveItem(examples, index, offset);
    if (next === examples) {
      return;
    }
    onChange(next);
    setAnnouncement(
      movedMessage(
        examples[index].problem || `Example ${index + 1}`,
        index + offset + 1,
        examples.length,
      ),
    );
  }

  function moveStep(exampleIndex, stepIndex, offset) {
    const example = examples[exampleIndex];
    const steps = moveItem(example.steps, stepIndex, offset);
    if (steps === example.steps) {
      return;
    }
    updateExample(exampleIndex, {
      steps,
      stepIds: moveItem(example.stepIds, stepIndex, offset),
    });
    setAnnouncement(
      movedMessage(
        example.steps[stepIndex] || `Step ${stepIndex + 1}`,
        stepIndex + offset + 1,
        example.steps.length,
      ),
    );
  }

  return (
    <fieldset className="flex min-w-0 flex-col gap-4">
      <div>
        <legend className="text-sm leading-none font-medium after:ml-0.5 after:text-destructive after:content-['*']">
          Worked examples
        </legend>
        <p className="text-sm leading-relaxed text-muted-foreground">
          Step-by-step calculations a learner studies before trying one
          themselves, in the order they are read. A published module needs at
          least one complete example.
        </p>
      </div>

      <div className="flex flex-col gap-4">
        {examples.map((example, exampleIndex) => (
          <div
            key={example.clientId}
            className="flex min-w-0 flex-col gap-3 rounded-lg border border-border bg-card p-4"
          >
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
                Example {exampleIndex + 1} of {examples.length}
              </span>
              {examples.length > 1 ? (
                <div className="flex items-center gap-1">
                  <ReorderControls
                    itemName={example.problem || `example ${exampleIndex + 1}`}
                    index={exampleIndex}
                    total={examples.length}
                    onMove={(offset) => moveExample(exampleIndex, offset)}
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="gap-1.5"
                    onClick={() => onChange(examples.filter((_, i) => i !== exampleIndex))}
                  >
                    <Minus aria-hidden="true" className="size-4" />
                    Remove
                    <span className="sr-only">
                      {" "}
                      {example.problem || `example ${exampleIndex + 1}`}
                    </span>
                  </Button>
                </div>
              ) : null}
            </div>

            <div className="flex flex-col gap-3">
              <div className="flex min-w-0 flex-col gap-1.5">
                <Label htmlFor={`${baseId}-example-${exampleIndex}-problem`}>Problem</Label>
                <Input
                  id={`${baseId}-example-${exampleIndex}-problem`}
                  name="example_problem"
                  value={example.problem}
                  onChange={(event) => updateExample(exampleIndex, { problem: event.target.value })}
                  placeholder="e.g. Calculate (-3) x (-4)."
                />
              </div>

              <fieldset className="flex min-w-0 flex-col gap-2">
                <legend className="flex items-center gap-2 text-sm font-medium text-foreground">
                  Steps
                </legend>
                <div className="flex flex-col gap-2">
                  {example.steps.map((step, stepIndex) => (
                    <div
                      key={example.stepIds[stepIndex]}
                      className="flex min-w-0 flex-wrap items-center gap-2"
                    >
                      <Input
                        name={`example_step_${exampleIndex}`}
                        value={step}
                        onChange={(event) => updateStep(exampleIndex, stepIndex, event.target.value)}
                        aria-label={`Example ${exampleIndex + 1}, step ${stepIndex + 1}`}
                        placeholder={`Step ${stepIndex + 1}`}
                        className="min-w-40 flex-1"
                      />
                      {example.steps.length > 1 ? (
                        <ReorderControls
                          itemName={step || `step ${stepIndex + 1}`}
                          index={stepIndex}
                          total={example.steps.length}
                          onMove={(offset) => moveStep(exampleIndex, stepIndex, offset)}
                        />
                      ) : null}
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="gap-1.5"
                        onClick={() => removeStep(exampleIndex, stepIndex)}
                      >
                        <Trash2 aria-hidden="true" className="size-4" />
                        Remove
                        <span className="sr-only"> step {stepIndex + 1}</span>
                      </Button>
                    </div>
                  ))}
                </div>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="self-start"
                  onClick={() => addStep(exampleIndex)}
                >
                  <Plus aria-hidden="true" className="size-4" />
                  Add a step
                </Button>
              </fieldset>

              <div className="grid gap-3 sm:grid-cols-2">
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor={`${baseId}-example-${exampleIndex}-solution`}>Solution</Label>
                  <Input
                    id={`${baseId}-example-${exampleIndex}-solution`}
                    name="example_solution"
                    value={example.solution}
                    onChange={(event) => updateExample(exampleIndex, { solution: event.target.value })}
                    placeholder="e.g. 12"
                  />
                </div>

                <div className="flex flex-col gap-1.5">
                  <Label htmlFor={`${baseId}-example-${exampleIndex}-tip`}>Tip</Label>
                  <Input
                    id={`${baseId}-example-${exampleIndex}-tip`}
                    name="example_tip"
                    value={example.tip}
                    onChange={(event) => updateExample(exampleIndex, { tip: event.target.value })}
                    placeholder="Optional hint or takeaway."
                  />
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>

      <Button
        type="button"
        variant="outline"
        size="sm"
        className="self-start"
        onClick={() => onChange([...examples, editableWorkedExample()])}
      >
        <Plus aria-hidden="true" className="size-4" />
        Add another example
      </Button>

      <ResultAnnouncer message={announcement} />

      {error ? (
        <p id={errorId} role="alert" className="text-sm text-destructive">
          {error}
        </p>
      ) : null}
    </fieldset>
  );
}
