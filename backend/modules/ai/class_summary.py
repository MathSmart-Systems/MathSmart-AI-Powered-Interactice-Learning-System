"""The advisory class summary on Reports: what we ask for, and what we accept.

A teacher reading a class report can ask for a short explanation of it. The
numbers on the page are the database's and stay exactly as they are; this
only puts them into plain words and names the patterns in the questions the
class missed most. It has the same discipline as the teaching note:

- an overview of at most two short sentences;
- at most two patterns, each quoting numbers the request actually carried —
  a figure the model invented is dropped with the sentence that carried it;
- at most three class-level actions;
- no more than 150 words in all, with no markup, no links, no repeated point
  and no motivational filler.

The evidence it is given is aggregate only: counts, averages and question
text, with no learner in it. Nothing here decides a score, a band, a trigger
or a case.
"""

from __future__ import annotations

from typing import Any

from pydantic import BaseModel, Field

from modules.ai.support_plan import _loads, clip
from modules.ai.teaching_note import (
    _NUMBER,
    _as_list,
    _clip_words,
    _first_sentences,
    _is_recorded,
    _key,
    _plain,
    _sentences,
    _without_repeats,
    words,
)

MAX_WORDS = 150
MAX_OVERVIEW_SENTENCES = 2
MAX_PATTERNS = 2
MAX_ACTIONS = 3

MAX_OVERVIEW = 300
MAX_PATTERN = 200
MAX_ACTION = 180

MAX_TOKENS = 700

INSTRUCTIONS = (
    "You are summarising a Grade 6 mathematics class report for its teacher. "
    "The figures were calculated by the school system; do not calculate, "
    "change or round any of them, and never invent one. There is no learner "
    "in the evidence and you must not refer to individual learners. "
    "Answer with a single JSON object and nothing else: no Markdown, no code "
    "fence, no commentary. Use exactly these keys: "
    '"overview" (at most two short sentences explaining what the figures show), '
    '"patterns" (an array of at most 2 short strings, each naming a likely '
    "misunderstanding behind the most-missed questions and citing a number "
    "from the evidence, such as how many answers were incorrect), "
    '"actions" (an array of at most 3 short, practical things to do with the '
    "whole class). "
    "Keep the whole object under 120 words. Use plain classroom English. "
    "Never use asterisks, hashes, bullet characters, tables, links or any "
    "other markup. Do not repeat a point, do not summarise at the end, and do "
    "not add encouragement or motivational remarks."
)


class ClassSummary(BaseModel):
    """One advisory summary, already bounded and cleaned."""

    overview: str = Field(max_length=MAX_OVERVIEW)
    patterns: list[str] = Field(default_factory=list, max_length=MAX_PATTERNS)
    actions: list[str] = Field(default_factory=list, max_length=MAX_ACTIONS)

    def word_count(self) -> int:
        return words(self.overview, *self.patterns, *self.actions)


def recorded_figures(evidence: Any) -> set[float]:
    """Every number the request carried, and the rates drawn from its counts.

    Numbers written inside question text count too: a pattern may quote the
    question it is about.
    """
    figures: set[float] = set()

    def add(value: Any) -> None:
        if isinstance(value, bool) or value is None:
            return
        if isinstance(value, (int, float)):
            figures.add(round(float(value), 1))
        elif isinstance(value, str):
            for match in _NUMBER.findall(value):
                figures.add(round(float(match), 1))
        elif isinstance(value, dict):
            for item in value.values():
                add(item)
            answered, incorrect = value.get("answered"), value.get("incorrect")
            if isinstance(answered, int) and isinstance(incorrect, int) and answered > 0:
                rate = incorrect * 100 / answered
                figures.update({round(rate, 1), float(round(rate))})
        elif isinstance(value, (list, tuple)):
            for item in value:
                add(item)

    add(evidence)
    return figures


def _fit_budget(summary: ClassSummary) -> ClassSummary:
    overview = summary.overview
    patterns, actions = list(summary.patterns), list(summary.actions)

    def total() -> int:
        return words(overview, *patterns, *actions)

    while total() > MAX_WORDS and len(actions) > 1:
        actions.pop()
    while total() > MAX_WORDS and len(patterns) > 1:
        patterns.pop()
    if total() > MAX_WORDS and actions:
        room = MAX_WORDS - words(overview, *patterns)
        actions = [_clip_words(actions[0], room)] if room > 0 else []
    if total() > MAX_WORDS:
        overview = _clip_words(overview, max(MAX_WORDS - words(*patterns, *actions), 1))
    return ClassSummary(overview=overview, patterns=patterns, actions=actions)


def parse_class_summary(text: str | None, evidence: dict[str, Any]) -> ClassSummary | None:
    """Reads a model's reply as a summary, or as the nearest honest thing to one.

    Prose becomes an overview and actions. A pattern that cites no number, or a
    number the request did not carry, is dropped: a misconception claim with
    nothing behind it is worse than none. An empty reply is nothing, and the
    caller answers 503.
    """
    if not text or not text.strip():
        return None

    parsed = _loads(text)
    overview = ""
    claimed: list[str] = []
    actions: list[str] = []

    if isinstance(parsed, dict):
        overview = _first_sentences(
            _plain(parsed.get("overview") or parsed.get("summary")),
            MAX_OVERVIEW_SENTENCES,
            MAX_OVERVIEW,
        )
        claimed = [clip(_plain(item), MAX_PATTERN) for item in _as_list(parsed.get("patterns"))]
        actions = [clip(_plain(item), MAX_ACTION) for item in _as_list(parsed.get("actions"))]

    if not overview:
        pieces = _sentences(_plain(text))
        if not pieces:
            return None
        overview = clip(" ".join(pieces[:MAX_OVERVIEW_SENTENCES]), MAX_OVERVIEW)
        actions = [clip(piece, MAX_ACTION) for piece in pieces[MAX_OVERVIEW_SENTENCES:]]
        claimed = []

    figures = recorded_figures(evidence)
    seen = [_key(overview)]
    patterns = _without_repeats(
        [item for item in claimed if item and _is_recorded(item, figures)], seen
    )[:MAX_PATTERNS]
    actions = _without_repeats([item for item in actions if item], seen)[:MAX_ACTIONS]

    return _fit_budget(ClassSummary(overview=overview, patterns=patterns, actions=actions))
