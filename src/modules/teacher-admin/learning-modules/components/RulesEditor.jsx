"use client";

import { useId, useState } from "react";
import { Minus, Plus } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { ReorderControls, ResultAnnouncer } from "@/modules/shared";
import { moveItem, movedMessage } from "@/modules/shared/utils/reorder.js";

function clientIdentifier() {
  return globalThis.crypto.randomUUID();
}

/** Adds an editor-only identity that is never submitted to the API. */
export function editableRule(raw) {
  return {
    ...(raw ?? { title: "", ruleFormula: "", explanation: "", visualExample: "" }),
    clientId: clientIdentifier(),
  };
}

/**
 * The repeatable core-rule editor. Each rule is a { title, ruleFormula,
 * explanation, visualExample } block submitted under four repeated field names
 * (`rule_title`, `rule_formula`, `rule_explanation`, `rule_visual_example`),
 * which the server action reads back in DOM order.
 *
 * That DOM order is the stored order, so rules can be moved. They could only
 * be added and removed before, which meant a rule written in the wrong place
 * could only be fixed by retyping it — while a drag handle sat in the corner
 * of every card promising a gesture that was never implemented.
 *
 * Each card is keyed by an identity of its own rather than by its index.
 * Keying by index makes React reuse the DOM of the card that used to be there,
 * which moves focus and a part-composed IME string onto the wrong field.
 */
export function RulesEditor({ rules, onChange, error }) {
  const baseId = useId();
  const errorId = `${baseId}-rules-error`;
  const [announcement, setAnnouncement] = useState("");

  function updateRule(index, patch) {
    const next = rules.slice();
    next[index] = { ...next[index], ...patch };
    onChange(next);
  }

  function move(index, offset) {
    const next = moveItem(rules, index, offset);
    if (next === rules) {
      return;
    }
    onChange(next);
    setAnnouncement(
      movedMessage(rules[index].title || `Rule ${index + 1}`, index + offset + 1, rules.length),
    );
  }

  return (
    <fieldset className="flex min-w-0 flex-col gap-4">
      <div>
        <legend className="text-sm leading-none font-medium after:ml-0.5 after:text-destructive after:content-['*']">
          Core rules
        </legend>
        <p className="text-sm leading-relaxed text-muted-foreground">
          The fundamental rules a learner must remember, in the order they are taught. A
          published module needs at least one complete rule.
        </p>
      </div>

      <div className="flex flex-col gap-4">
        {rules.map((rule, index) => (
          <div
            key={rule.clientId ?? index}
            className="flex min-w-0 flex-col gap-3 rounded-lg border border-border bg-card p-4"
          >
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
                Rule {index + 1} of {rules.length}
              </span>

              <div className="flex items-center gap-1">
                {rules.length > 1 ? (
                  <ReorderControls
                    itemName={rule.title || `rule ${index + 1}`}
                    index={index}
                    total={rules.length}
                    onMove={(offset) => move(index, offset)}
                  />
                ) : null}

                {rules.length > 1 ? (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="gap-1.5"
                    onClick={() => onChange(rules.filter((_, i) => i !== index))}
                  >
                    <Minus aria-hidden="true" className="size-4" />
                    Remove
                    <span className="sr-only"> {rule.title || `rule ${index + 1}`}</span>
                  </Button>
                ) : null}
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <div className="flex min-w-0 flex-col gap-1.5 sm:col-span-2">
                <Label htmlFor={`${baseId}-rule-${index}-title`}>Title</Label>
                <Input
                  id={`${baseId}-rule-${index}-title`}
                  name="rule_title"
                  value={rule.title}
                  onChange={(event) => updateRule(index, { title: event.target.value })}
                  placeholder="e.g. Multiplying a negative by a negative"
                />
              </div>

              <div className="flex min-w-0 flex-col gap-1.5">
                <Label htmlFor={`${baseId}-rule-${index}-formula`}>Formula</Label>
                <Input
                  id={`${baseId}-rule-${index}-formula`}
                  name="rule_formula"
                  value={rule.ruleFormula}
                  onChange={(event) => updateRule(index, { ruleFormula: event.target.value })}
                  placeholder="e.g. (-a) x (-b) = +(ab)"
                />
              </div>

              <div className="flex min-w-0 flex-col gap-1.5">
                <Label htmlFor={`${baseId}-rule-${index}-visual`}>Visual example</Label>
                <Input
                  id={`${baseId}-rule-${index}-visual`}
                  name="rule_visual_example"
                  value={rule.visualExample}
                  onChange={(event) => updateRule(index, { visualExample: event.target.value })}
                  placeholder="e.g. (-3) x (-4) = 12"
                />
              </div>

              <div className="flex min-w-0 flex-col gap-1.5 sm:col-span-2">
                <Label htmlFor={`${baseId}-rule-${index}-explanation`}>Explanation</Label>
                <Textarea
                  id={`${baseId}-rule-${index}-explanation`}
                  name="rule_explanation"
                  value={rule.explanation}
                  onChange={(event) => updateRule(index, { explanation: event.target.value })}
                  rows={2}
                  placeholder="Why the rule works, in learner-friendly words."
                  className="min-h-14"
                />
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
        onClick={() => onChange([...rules, editableRule()])}
      >
        <Plus aria-hidden="true" className="size-4" />
        Add another rule
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
