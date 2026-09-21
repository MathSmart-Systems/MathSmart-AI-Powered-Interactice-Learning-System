"""The advisory teaching note: what we ask for, and what we accept back.

The Students workspace shows one short note about a learner's weakest
competency. Asked an open question, the model answered with several hundred
words of Markdown — headings, bold, tables, a closing pep talk — and the page
printed it verbatim. A teacher reading a record needs four things and no more:
what the gap is, what in the record shows it, what to try, and how to tell it
worked.

So the note has that shape and nothing else. We ask for a small JSON object and
then enforce every limit here, because a prompt is a request and not a
guarantee:

- a learning gap of at most two short sentences;
- at most two pieces of evidence, each quoting numbers the request actually
  carried — a figure the model invented is dropped, and when nothing honest
  survives the evidence is written from the recorded numbers instead;
- at most three practical actions;
- one next check;
- no more than 150 words in all, with no markup, no links, no repeated
  conclusion and no motivational filler.

Nothing here decides anything. The note is a suggestion a teacher reads.
"""

from __future__ import annotations

import re
from typing import Any

from pydantic import BaseModel, Field

from modules.ai.support_plan import _loads, clip, flatten

MAX_WORDS = 150
MAX_GAP_SENTENCES = 2
MAX_EVIDENCE = 2
MAX_ACTIONS = 3

MAX_GAP = 260
MAX_EVIDENCE_ITEM = 160
MAX_ACTION = 180
MAX_NEXT_CHECK = 180

#: Generous against the word budget on purpose: a reply cut off mid-object has
#: no usable content at all, and a long reply is something we can trim.
MAX_TOKENS = 700

INSTRUCTIONS = (
    "Answer with a single JSON object and nothing else: no Markdown, no code "
    "fence, no commentary. Use exactly these keys: "
    '"gap" (at most two short sentences naming the specific learning gap), '
    '"evidence" (an array of at most 2 short strings, each citing a number '
    "from the evidence you were given, such as a score or an attempt count; "
    "never invent a figure), "
    '"actions" (an array of at most 3 short, practical things the teacher can '
    "do in class), "
    '"next_check" (one short sentence naming how the teacher can tell it '
    "worked). "
    "Keep the whole object under 120 words. Use plain classroom English. "
    "Never use asterisks, hashes, bullet characters, tables, links or any "
    "other markup. Do not repeat a point, do not summarise at the end, and do "
    "not add encouragement or motivational remarks."
)

_URL = re.compile(r"(https?://\S+|www\.\S+)", re.I)
_MARKDOWN_LINK = re.compile(r"\[([^\]]+)\]\([^)]*\)")
_SENTENCE_BREAK = re.compile(r"(?<=[.!?])\s+")
_NUMBER = re.compile(r"\d+(?:\.\d+)?")
_WORD = re.compile(r"\S+")

#: Sentences that add length and nothing a teacher can act on. Matched per
#: sentence, so a useful sentence is never lost because of its neighbour.
_FILLER = re.compile(
    r"(\bgreat job\b|\bwell done\b|\bkeep (it )?up\b|\bkeep going\b|"
    r"\byou(\'ve| have)? got this\b|\bbelieve in\b|\bstay positive\b|"
    r"\bdon\'t give up\b|\bnever give up\b|\bevery (child|student|learner) can\b|"
    r"\blearning (is a journey|takes time)\b|\bcelebrate\b|\bproud of\b|"
    r"\bwith (patience|persistence|practice),? .{0,40}\b(will|can) (succeed|improve)\b|"
    r"^(in summary|in conclusion|overall|to sum up|to conclude)\b)",
    re.I,
)


class TeachingNote(BaseModel):
    """One advisory note, already bounded and cleaned."""

    gap: str = Field(max_length=MAX_GAP)
    evidence: list[str] = Field(default_factory=list, max_length=MAX_EVIDENCE)
    actions: list[str] = Field(default_factory=list, max_length=MAX_ACTIONS)
    next_check: str | None = Field(default=None, max_length=MAX_NEXT_CHECK)

    def word_count(self) -> int:
        return words(self.gap, *self.evidence, *self.actions, self.next_check or "")


def words(*texts: str) -> int:
    return sum(len(_WORD.findall(text or "")) for text in texts)


def _plain(value: Any) -> str:
    """One line of text with links, markup and filler sentences taken out."""
    if value is None:
        return ""
    if isinstance(value, (list, tuple)):
        value = " ".join(str(item) for item in value)
    text = _MARKDOWN_LINK.sub(r"\1", str(value))
    text = _URL.sub(" ", text)
    text = flatten(text)
    kept = [part for part in _sentences(text) if not _FILLER.search(part)]
    return " ".join(kept).strip()


def _sentences(text: str) -> list[str]:
    return [part.strip() for part in _SENTENCE_BREAK.split(text or "") if part.strip()]


def _first_sentences(text: str, count: int, limit: int) -> str:
    return clip(" ".join(_sentences(text)[:count]), limit)


def _clip_words(text: str, budget: int) -> str:
    """At most `budget` words, ending on a sentence where one fits."""
    tokens = _WORD.findall(text)
    if len(tokens) <= budget:
        return text
    if budget <= 0:
        return ""
    kept = ""
    for sentence in _sentences(text):
        candidate = f"{kept} {sentence}".strip()
        if words(candidate) > budget:
            break
        kept = candidate
    return kept or " ".join(tokens[:budget]).rstrip(",;:") + "…"


def _key(text: str) -> str:
    return re.sub(r"[^a-z0-9]+", " ", text.lower()).strip()


def _repeats(key: str, other: str) -> bool:
    """The same point twice: identical, or one wholly restating the other.

    Containment counts only for a phrase long enough to be a point in its own
    right, so a short action is not lost because the gap happens to share it.
    """
    if key == other:
        return True
    shorter, longer = sorted((key, other), key=len)
    return len(shorter.split()) >= 6 and shorter in longer


def _without_repeats(items: list[str], seen: list[str]) -> list[str]:
    """Items that say something not already said, in their original order."""
    kept: list[str] = []
    for item in items:
        key = _key(item)
        if not key or any(_repeats(key, other) for other in seen):
            continue
        seen.append(key)
        kept.append(item)
    return kept


def _as_list(value: Any) -> list[Any]:
    if isinstance(value, (str, bytes)):
        return [value]
    return value if isinstance(value, list) else []


def _figure(value: Any) -> str | None:
    if value is None or isinstance(value, bool):
        return None
    try:
        number = float(value)
    except (TypeError, ValueError):
        return None
    return str(int(number)) if number.is_integer() else f"{number:g}"


def recorded_figures(evidence: dict[str, Any]) -> set[float]:
    """Every number the request carried, plus the ones plainly derived from it.

    Evidence may quote a score, an attempt count, the successful attempts, or
    the change since the diagnostic. It may not quote anything else, because
    anything else was not recorded.
    """
    figures: set[float] = set()

    def collect(value: Any) -> None:
        if isinstance(value, dict):
            for item in value.values():
                collect(item)
        elif isinstance(value, (list, tuple)):
            for item in value:
                collect(item)
        elif isinstance(value, bool):
            return
        elif isinstance(value, (int, float)):
            figures.add(round(float(value), 1))
        elif isinstance(value, str):
            figures.update(round(float(match), 1) for match in _NUMBER.findall(value))

    collect(evidence)

    diagnostic = evidence.get("diagnostic_score")
    current = evidence.get("current_score")
    if isinstance(diagnostic, (int, float)) and isinstance(current, (int, float)):
        figures.add(round(abs(float(current) - float(diagnostic)), 1))
    attempts = evidence.get("attempt_count")
    unsuccessful = evidence.get("unsuccessful_attempts")
    if isinstance(attempts, int) and isinstance(unsuccessful, int):
        figures.add(float(max(attempts - unsuccessful, 0)))
    return figures


def _is_recorded(item: str, figures: set[float]) -> bool:
    """True when the item cites at least one number, and every number is recorded."""
    found = [round(float(match), 1) for match in _NUMBER.findall(item)]
    return bool(found) and all(number in figures for number in found)


def evidence_from_record(evidence: dict[str, Any]) -> list[str]:
    """The evidence written from the recorded numbers alone."""
    lines: list[str] = []
    diagnostic = _figure(evidence.get("diagnostic_score"))
    current = _figure(evidence.get("current_score"))
    if diagnostic is not None and current is not None:
        lines.append(f"Diagnostic score {diagnostic}%, current score {current}%.")
    elif current is not None:
        lines.append(f"Current score {current}%.")
    elif diagnostic is not None:
        lines.append(f"Diagnostic score {diagnostic}%.")

    attempts = _figure(evidence.get("attempt_count"))
    unsuccessful = _figure(evidence.get("unsuccessful_attempts"))
    if attempts is not None and unsuccessful is not None:
        lines.append(f"{unsuccessful} of {attempts} attempts were unsuccessful.")
    elif attempts is not None:
        lines.append(f"{attempts} attempts recorded.")
    return lines[:MAX_EVIDENCE]


def _fit_budget(note: TeachingNote) -> TeachingNote:
    """Brings the whole note within the word budget, dropping the least first."""
    gap, check = note.gap, note.next_check
    evidence, actions = list(note.evidence), list(note.actions)

    def total() -> int:
        return words(gap, *evidence, *actions, check or "")

    while total() > MAX_WORDS and len(actions) > 1:
        actions.pop()
    while total() > MAX_WORDS and len(evidence) > 1:
        evidence.pop()
    if total() > MAX_WORDS and check:
        check = _clip_words(check, max(MAX_WORDS - words(gap, *evidence, *actions), 0)) or None
    if total() > MAX_WORDS and actions:
        room = MAX_WORDS - words(gap, *evidence, check or "")
        actions = [_clip_words(actions[0], max(room, 0))] if room > 0 else []
    if total() > MAX_WORDS:
        gap = _clip_words(gap, max(MAX_WORDS - words(*evidence, *actions, check or ""), 1))

    return TeachingNote(gap=gap, evidence=evidence, actions=actions, next_check=check)


def parse_teaching_note(text: str | None, evidence: dict[str, Any]) -> TeachingNote | None:
    """Reads a model's reply as a note, or as the nearest honest thing to one.

    A JSON object with the fields we asked for is preferred. Prose becomes a
    gap and as many actions as its remaining sentences allow. A reply with no
    readable word in it is nothing, and the caller answers 503.
    """
    if not text or not text.strip():
        return None

    figures = recorded_figures(evidence)
    parsed = _loads(text)

    gap = ""
    claimed: list[str] = []
    actions: list[str] = []
    check: str | None = None

    if isinstance(parsed, dict):
        gap = _first_sentences(_plain(parsed.get("gap")), MAX_GAP_SENTENCES, MAX_GAP)
        claimed = [
            clip(_plain(item), MAX_EVIDENCE_ITEM) for item in _as_list(parsed.get("evidence"))
        ]
        actions = [
            clip(_plain(item), MAX_ACTION)
            for item in _as_list(parsed.get("actions") or parsed.get("strategies"))
        ]
        check = _first_sentences(_plain(parsed.get("next_check")), 1, MAX_NEXT_CHECK) or None
        if not gap and actions:
            gap, actions = actions[0], actions[1:]

    if not gap:
        # Not JSON, or JSON with nothing usable in it. Prose is still words a
        # teacher can read, so it degrades to a note rather than to a 503.
        pieces = _sentences(_plain(text))
        if not pieces:
            return None
        gap = clip(" ".join(pieces[:MAX_GAP_SENTENCES]), MAX_GAP)
        actions = [clip(piece, MAX_ACTION) for piece in pieces[MAX_GAP_SENTENCES:]]
        claimed = []
        check = None

    seen = [_key(gap)]
    honest = [item for item in claimed if item and _is_recorded(item, figures)]
    evidence_lines = _without_repeats(honest, seen)[:MAX_EVIDENCE]
    if not evidence_lines:
        evidence_lines = _without_repeats(evidence_from_record(evidence), seen)
    actions = _without_repeats([item for item in actions if item], seen)[:MAX_ACTIONS]
    if check and not _without_repeats([check], seen):
        check = None

    return _fit_budget(
        TeachingNote(gap=gap, evidence=evidence_lines, actions=actions, next_check=check)
    )
