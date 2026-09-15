"use client";

import { useId } from "react";
import { GripVertical, Minus, Plus } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

/**
 * The repeatable core-rule editor. Each rule is a { title, ruleFormula,
 * explanation, visualExample } block submitted under four repeated field names
 * (`rule_title`, `rule_formula`, `rule_explanation`, `rule_visual_example`),
 * which the server action reads back in DOM order.
 */
export function RulesEditor({ rules, onChange, error }) {
  const baseId = useId();
  const errorId = `${baseId}-rules-error`;

  function updateRule(index, patch) {
    const next = rules.slice();
    next[index] = { ...next[index], ...patch };
    onChange(next);
  }

  return (
    <div className="flex flex-col gap-4">
      <div>
        <Label className="after:ml-0.5 after:text-destructive after:content-['*']">
          Core rules
        </Label>
        <p className="text-sm leading-relaxed text-muted-foreground">
          The fundamental rules a learner must remember. A published module
          needs at least one complete rule.
        </p>
      </div>

      <div className="flex flex-col gap-4">
        {rules.map((rule, index) => (
          <div
            key={index}
            className="flex flex-col gap-3 rounded-lg border border-border bg-card p-4"
          >
            <div className="flex items-center justify-between gap-2">
              <span className="inline-flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                <GripVertical aria-hidden="true" className="size-4" />
                Rule {index + 1}
              </span>
              {rules.length > 1 ? (
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  aria-label={`Remove rule ${index + 1}`}
                  onClick={() => onChange(rules.filter((_, i) => i !== index))}
                >
                  <Minus aria-hidden="true" className="size-4" />
                </Button>
              ) : null}
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <div className="flex flex-col gap-1.5 sm:col-span-2">
                <Label htmlFor={`${baseId}-rule-${index}-title`}>Title</Label>
                <Input
                  id={`${baseId}-rule-${index}-title`}
                  name="rule_title"
                  value={rule.title}
                  onChange={(event) => updateRule(index, { title: event.target.value })}
                  placeholder="e.g. Multiplying a negative by a negative"
                />
              </div>

              <div className="flex flex-col gap-1.5">
                <Label htmlFor={`${baseId}-rule-${index}-formula`}>Formula</Label>
                <Input
                  id={`${baseId}-rule-${index}-formula`}
                  name="rule_formula"
                  value={rule.ruleFormula}
                  onChange={(event) => updateRule(index, { ruleFormula: event.target.value })}
                  placeholder="e.g. (-a) x (-b) = +(ab)"
                />
              </div>

              <div className="flex flex-col gap-1.5">
                <Label htmlFor={`${baseId}-rule-${index}-visual`}>Visual example</Label>
                <Input
                  id={`${baseId}-rule-${index}-visual`}
                  name="rule_visual_example"
                  value={rule.visualExample}
                  onChange={(event) => updateRule(index, { visualExample: event.target.value })}
                  placeholder="e.g. (-3) x (-4) = 12"
                />
              </div>

              <div className="flex flex-col gap-1.5 sm:col-span-2">
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
        onClick={() => onChange([...rules, { title: "", ruleFormula: "", explanation: "", visualExample: "" }])}
      >
        <Plus aria-hidden="true" className="size-4" />
        Add another rule
      </Button>

      {error ? (
        <p id={errorId} role="alert" className="text-sm text-destructive">
          {error}
        </p>
      ) : null}
    </div>
  );
}