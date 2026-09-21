"""The advisory support plan: what we ask for, and what we accept back.

A language model asked an open question answers with an essay. The first
version of this feature stored exactly that — three and a half thousand
characters of Markdown — and a teacher standing in front of a case could not
find the one strategy they wanted in it, let alone take that strategy and leave
the rest.

So the contract changed shape. We ask for a small JSON object with named
fields, and we accept only that: one learning gap, at most three strategies,
one scaffolding idea, one next check. Everything is bounded here rather than
trusted, because the model is not bound by anything we write in a prompt. Text
that arrives with Markdown in it is flattened, text that arrives too long is
cut at a sentence, a list that arrives too long is trimmed, and a reply that
cannot be read as a plan at all degrades to a single stripped sentence rather
than to nothing.

Nothing here decides anything. A plan is a suggestion a teacher reads.
"""

from __future__ import annotations

import json
import re
from typing import Any

from pydantic import BaseModel, Field

#: What the interface has room for, and what a teacher will actually read.
MAX_GAP = 240
MAX_STRATEGY = 220
MAX_SCAFFOLD = 240
MAX_NEXT_CHECK = 200
MAX_STRATEGIES = 3

#: A bound on the answer itself, so a runaway reply costs time rather than
#: arriving and being thrown away. Generous against the 180-word budget on
#: purpose: a model cut off mid-object returns no usable content at all, and
#: a truncated reply is worse than a long one we trim ourselves.
MAX_TOKENS = 900

INSTRUCTIONS = (
    "Answer with a single JSON object and nothing else: no Markdown, no code "
    "fence, no commentary. Use exactly these keys: "
    '"gap" (one sentence naming the specific misunderstanding), '
    '"strategies" (an array of at most 3 strings, each one or two short '
    'sentences describing something the teacher can do), '
    '"scaffold" (one sentence describing a concrete scaffold, manipulative or '
    'drawing that makes the idea visible), '
    '"next_check" (one sentence naming how the teacher can tell it worked). '
    "Use plain classroom English a Grade 6 teacher would use. Never use "
    "asterisks, hashes, bullet characters, tables or any other markup. Keep "
    "the whole object under 180 words."
)

#: Markup a model reaches for even when told not to. Stripped rather than
#: escaped: the interface renders text nodes, so a stray asterisk is not a
#: safety problem, it is just something a teacher should never have to read.
#: A lone `*` is left alone, because in a mathematics suggestion it is as
#: likely to be a multiplication sign as a bullet.
_MARKUP = re.compile(
    r"(\*\*|__|`{1,3}|#{1,6}|^\s{0,3}[-*+]\s+|^\s{0,3}\d+[.)]\s+)",
    re.M,
)
_TABLE_ROW = re.compile(r"^\s*\|.*\|\s*$", re.M)
_WHITESPACE = re.compile(r"\s+")


class SupportPlan(BaseModel):
    """One advisory plan, already bounded and cleaned."""

    gap: str = Field(max_length=MAX_GAP)
    strategies: list[str] = Field(default_factory=list, max_length=MAX_STRATEGIES)
    scaffold: str | None = Field(default=None, max_length=MAX_SCAFFOLD)
    next_check: str | None = Field(default=None, max_length=MAX_NEXT_CHECK)


def flatten(value: Any) -> str:
    """One line of plain text, with every markup character taken out.

    A model that has been told not to use Markdown still sometimes does. The
    interface renders text nodes, so this is about readability rather than
    safety: nobody should be shown `**Key idea:**` and have to translate it.
    """
    if value is None:
        return ""
    if isinstance(value, (list, tuple)):
        value = " ".join(str(item) for item in value)

    text = _TABLE_ROW.sub(" ", str(value))
    text = _MARKUP.sub(" ", text)
    text = text.replace("|", " ").replace(">", " ")
    return _WHITESPACE.sub(" ", text).strip()


def clip(text: str, limit: int) -> str:
    """Cut to the limit, preferring the end of a sentence over mid-word.

    A suggestion that stops in the middle of a word reads as a bug. One that
    stops at a full stop reads as brevity, which is what was asked for.
    """
    text = text.strip()
    if len(text) <= limit:
        return text

    window = text[:limit]
    for mark in (". ", "! ", "? "):
        cut = window.rfind(mark)
        if cut > limit * 0.5:
            return window[: cut + 1].strip()

    space = window.rfind(" ")
    return (window[:space] if space > limit * 0.5 else window).strip() + "…"


def _loads(text: str) -> Any:
    """The first JSON object in a reply, however it was wrapped."""
    candidate = text.strip()
    if candidate.startswith("```"):
        candidate = re.sub(r"^```[a-zA-Z]*\s*", "", candidate)
        candidate = re.sub(r"\s*```$", "", candidate)

    try:
        return json.loads(candidate)
    except (ValueError, TypeError):
        pass

    # A model that wraps its JSON in a sentence, or follows it with one, has
    # still answered. Scanning for a balanced object finds it where trusting
    # the last brace in the string does not — a trailing "}" in prose, or a
    # second object after the first, defeated that and sent a perfectly good
    # reply down the prose fallback with its own JSON as the summary.
    start = candidate.find("{")
    if start == -1:
        return None

    depth = 0
    in_string = False
    escaped = False
    for index in range(start, len(candidate)):
        char = candidate[index]
        if in_string:
            if escaped:
                escaped = False
            elif char == "\\":
                escaped = True
            elif char == '"':
                in_string = False
            continue
        if char == '"':
            in_string = True
        elif char == "{":
            depth += 1
        elif char == "}":
            depth -= 1
            if depth == 0:
                try:
                    return json.loads(candidate[start : index + 1])
                except (ValueError, TypeError):
                    return None
    return None


def _sentences(text: str, limit: int) -> list[str]:
    """A blob of prose split into pieces small enough to be strategies."""
    parts = [part.strip() for part in re.split(r"(?<=[.!?])\s+", text) if part.strip()]
    return [clip(part, limit) for part in parts if part]


def parse_support_plan(text: str | None) -> SupportPlan | None:
    """Reads a model's reply as a plan, or as the nearest honest thing to one.

    Three outcomes, in order of preference: a JSON object with the fields we
    asked for; a reply that is prose, which becomes a gap sentence and as many
    strategies as its remaining sentences allow; or nothing, when there is not
    one readable word in it.
    """
    if not text or not text.strip():
        return None

    parsed = _loads(text)

    if isinstance(parsed, dict):
        gap = clip(flatten(parsed.get("gap")), MAX_GAP)
        raw = parsed.get("strategies")
        if isinstance(raw, (str, bytes)):
            raw = [raw]
        strategies = [
            clip(flatten(item), MAX_STRATEGY)
            for item in (raw if isinstance(raw, list) else [])
        ]
        strategies = [item for item in strategies if item][:MAX_STRATEGIES]
        scaffold = clip(flatten(parsed.get("scaffold")), MAX_SCAFFOLD) or None
        next_check = clip(flatten(parsed.get("next_check")), MAX_NEXT_CHECK) or None

        if not gap and strategies:
            # A plan whose summary went missing is still a plan; promote the
            # first strategy rather than throwing the rest away.
            gap = strategies[0]
            strategies = strategies[1:]

        if gap:
            return SupportPlan(
                gap=gap, strategies=strategies, scaffold=scaffold, next_check=next_check
            )

    # Not JSON, or JSON with nothing usable in it. The reply is still words a
    # teacher can read, so it degrades to a plan rather than to a 503.
    flat = flatten(text)
    if not flat:
        return None

    pieces = _sentences(flat, MAX_STRATEGY)
    if not pieces:
        return None

    return SupportPlan(
        gap=clip(pieces[0], MAX_GAP),
        strategies=pieces[1 : 1 + MAX_STRATEGIES],
        scaffold=None,
        next_check=None,
    )


def plan_as_note(plan: SupportPlan) -> str:
    """The plan as one editable paragraph, for a teacher to sign or rewrite."""
    parts = [plan.gap, *plan.strategies]
    if plan.scaffold:
        parts.append(plan.scaffold)
    if plan.next_check:
        parts.append(plan.next_check)
    return " ".join(part.rstrip() for part in parts if part)
