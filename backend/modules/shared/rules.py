"""Deterministic scoring, banding and progression rules.

This module is the application-side half of a pair. The database enforces the
same two derivations as CHECK constraints through `app.percentage_for` and
`app.mastery_band_for`, so a row whose stored percentage or band disagrees with
its own evidence cannot be written even if this module were wrong. Keeping both
halves is deliberate: the backend needs to compute a value before it writes it,
and the database needs to refuse a value it did not compute.

Nothing here calls Groq, imports an AI client, or takes an advisory input.
Correct or incorrect, raw and percentage scores, attempt counts, bands, unlock
rules and intervention triggers are decided here and nowhere else.
"""

from __future__ import annotations

from decimal import ROUND_HALF_UP, Decimal
from enum import StrEnum

# Documented deterministic defaults. Both are Teacher/Administrator-configurable
# within the ranges enforced below.
DEFAULT_ACTIVITY_PASS_PERCENTAGE = 75
MINIMUM_ACTIVITY_PASS_PERCENTAGE = 60
MAXIMUM_ACTIVITY_PASS_PERCENTAGE = 90

DEFAULT_INTERVENTION_TRIGGER = 2
MINIMUM_INTERVENTION_TRIGGER = 1
MAXIMUM_INTERVENTION_TRIGGER = 5

# Competency display band boundaries.
MASTERED_FLOOR = Decimal("80")
DEVELOPING_FLOOR = Decimal("50")

_TWO_PLACES = Decimal("0.01")


class MasteryBand(StrEnum):
    """The canonical competency display bands, in their canonical casing."""

    MASTERED = "Mastered"
    DEVELOPING = "Developing"
    NEEDS_IMPROVEMENT = "Needs Improvement"


def percentage_for(raw_score: int, max_score: int) -> Decimal:
    """The percentage a raw score represents, to two places.

    Mirrors `app.percentage_for`, including its rounding, so a value computed
    here is accepted by the database constraint that recomputes it.
    """
    if max_score < 1:
        raise ValueError("max_score must be at least 1")
    if raw_score < 0:
        raise ValueError("raw_score cannot be negative")
    if raw_score > max_score:
        raise ValueError("raw_score cannot exceed max_score")

    return (Decimal(raw_score) * 100 / Decimal(max_score)).quantize(
        _TWO_PLACES, rounding=ROUND_HALF_UP
    )


def mastery_band_for(score: Decimal | None) -> MasteryBand | None:
    """The display band a competency score falls in, or None when unscored.

    Mirrors `app.mastery_band_for`: Mastered at 80-100, Developing at 50-79,
    Needs Improvement at 0-49.
    """
    if score is None:
        return None
    if score >= MASTERED_FLOOR:
        return MasteryBand.MASTERED
    if score >= DEVELOPING_FLOOR:
        return MasteryBand.DEVELOPING
    return MasteryBand.NEEDS_IMPROVEMENT


def activity_passed(score_percentage: Decimal, *, threshold: int) -> bool:
    """Whether an activity attempt met its own pass threshold.

    Passing is not banding. An activity may pass at its threshold while the
    learner stays in a lower display band, because the band follows the
    aggregate competency score rather than one attempt.
    """
    return score_percentage >= Decimal(threshold)


def intervention_triggered(unsuccessful_attempts: int, *, trigger: int) -> bool:
    """Whether the automatic intervention rule has been met."""
    if unsuccessful_attempts < 0:
        raise ValueError("unsuccessful_attempts cannot be negative")
    return unsuccessful_attempts >= trigger


def validate_activity_pass_percentage(value: int) -> int:
    """The configurable activity pass threshold, within its documented range."""
    if not MINIMUM_ACTIVITY_PASS_PERCENTAGE <= value <= MAXIMUM_ACTIVITY_PASS_PERCENTAGE:
        raise ValueError(
            "activity pass percentage must be between "
            f"{MINIMUM_ACTIVITY_PASS_PERCENTAGE} and {MAXIMUM_ACTIVITY_PASS_PERCENTAGE}"
        )
    return value


def validate_intervention_trigger(value: int) -> int:
    """The configurable unsuccessful-attempt trigger, within its documented range."""
    if not MINIMUM_INTERVENTION_TRIGGER <= value <= MAXIMUM_INTERVENTION_TRIGGER:
        raise ValueError(
            "intervention trigger must be between "
            f"{MINIMUM_INTERVENTION_TRIGGER} and {MAXIMUM_INTERVENTION_TRIGGER}"
        )
    return value
