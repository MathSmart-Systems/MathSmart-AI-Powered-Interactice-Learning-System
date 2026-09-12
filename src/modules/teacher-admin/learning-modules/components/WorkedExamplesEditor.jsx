"use client";

import { useId } from "react";
import { GripVertical, Minus, Plus, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

/**
 * The repeatable worked-example editor. Each example is a { problem, steps,
 * solution, tip } block. Steps carry the example index in their field name
 * (`example_step_<index>`) because each example keeps its own ordered list.
 */
export function WorkedExamplesEditor({ examples, onChange, error }) {
  const baseId = useId();
  const errorId = `${baseId}-examples-error`;

  function updateExample(index, patch) {
    const next = examples.slice();
    next[index] = { ...next[index], ...patch };
    onChange(next);
  }

  function addStep(exampleIndex) {
    const example = examples[exampleIndex];
    updateExample(exampleIndex, { steps: [...example.steps, ""] });
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
    });
  }

  return (
    <div className="flex flex-col gap-4">
      <div>
        <Label className="after:ml-0.5 after:text-destructive after:content-['*']">
          Worked examples
        </Label>
        <p className="text-sm leading-relaxed text-muted-foreground">
          Step-by-step calculations a learner studies before trying one
          themselves. A published module needs at least one complete example.
        </p>
      </div>

      <div className="flex flex-col gap-4">
        {examples.map((example, exampleIndex) => (
          <div
            key={exampleIndex}
            className="flex flex-col gap-3 rounded-lg border border-border bg-card p-4"
          >
            <div className="flex items-center justify-between gap-2">
              <span className="inline-flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                <GripVertical aria-hidden="true" className="size-4" />
                Example {exampleIndex + 1}
              </span>
              {examples.length > 1 ? (
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  aria-label={`Remove example ${exampleIndex + 1}`}
                  onClick={() => onChange(examples.filter((_, i) => i !== exampleIndex))}
                >
                  <Minus aria-hidden="true" className="size-4" />
                </Button>
              ) : null}
            </div>

            <div className="flex flex-col gap-3">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor={`${baseId}-example-${exampleIndex}-problem`}>Problem</Label>
                <Input
                  id={`${baseId}-example-${exampleIndex}-problem`}
                  name="example_problem"
                  value={example.problem}
                  onChange={(event) => updateExample(exampleIndex, { problem: event.target.value })}
                  placeholder="e.g. Calculate (-3) x (-4)."
                />
              </div>

              <fieldset className="flex flex-col gap-2">
                <legend className="flex items-center gap-2 text-sm font-medium text-foreground">
                  Steps
                </legend>
                <div className="flex flex-col gap-2">
                  {example.steps.map((step, stepIndex) => (
                    <div key={stepIndex} className="flex items-center gap-2">
                      <Input
                        name={`example_step_${exampleIndex}`}
                        value={step}
                        onChange={(event) => updateStep(exampleIndex, stepIndex, event.target.value)}
                        aria-label={`Example ${exampleIndex + 1}, step ${stepIndex + 1}`}
                        placeholder={`Step ${stepIndex + 1}`}
                        className="flex-1"
                      />
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon-sm"
                        aria-label={`Remove step ${stepIndex + 1}`}
                        onClick={() => removeStep(exampleIndex, stepIndex)}
                      >
                        <Trash2 aria-hidden="true" className="size-4" />
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
        onClick={() =>
          onChange([...examples, { problem: "", steps: [], solution: "", tip: "" }])
        }
      >
        <Plus aria-hidden="true" className="size-4" />
        Add another example
      </Button>

      {error ? (
        <p id={errorId} role="alert" className="text-sm text-destructive">
          {error}
        </p>
      ) : null}
    </div>
  );
}