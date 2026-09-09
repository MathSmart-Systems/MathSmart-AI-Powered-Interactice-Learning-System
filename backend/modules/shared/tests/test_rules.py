"""Deterministic scoring, banding and intervention rules.

These are the values the frozen documentation says are decided by server-side
rules and never by Groq, and they must agree exactly with the CHECK constraints
in the database, which enforce the same two derivations.
"""

from decimal import Decimal

import pytest

from modules.shared.rules import (
    DEFAULT_ACTIVITY_PASS_PERCENTAGE,
    DEFAULT_INTERVENTION_TRIGGER,
    MasteryBand,
    activity_passed,
    intervention_triggered,
    mastery_band_for,
    percentage_for,
    validate_activity_pass_percentage,
    validate_intervention_trigger,
)


@pytest.mark.parametrize(
    ("raw", "maximum", "expected"),
    [(7, 10, "70.00"), (0, 10, "0.00"), (10, 10, "100.00"), (1, 3, "33.33"), (2, 3, "66.67")],
)
def test_percentage_is_raw_over_maximum(raw, maximum, expected):
    assert percentage_for(raw, maximum) == Decimal(expected)


def test_percentage_rejects_a_maximum_of_zero():
    with pytest.raises(ValueError):
        percentage_for(0, 0)


def test_percentage_rejects_more_marks_than_possible():
    with pytest.raises(ValueError):
        percentage_for(11, 10)


@pytest.mark.parametrize(
    ("score", "expected"),
    [
        (100, MasteryBand.MASTERED),
        (80, MasteryBand.MASTERED),
        ("79.99", MasteryBand.DEVELOPING),
        (50, MasteryBand.DEVELOPING),
        ("49.99", MasteryBand.NEEDS_IMPROVEMENT),
        (0, MasteryBand.NEEDS_IMPROVEMENT),
    ],
)
def test_mastery_band_boundaries(score, expected):
    assert mastery_band_for(Decimal(str(score))) is expected


def test_no_score_yields_no_band():
    assert mastery_band_for(None) is None


def test_band_values_match_the_canonical_vocabulary():
    assert [band.value for band in MasteryBand] == ["Mastered", "Developing", "Needs Improvement"]


def test_an_activity_passes_at_its_threshold():
    assert activity_passed(Decimal("75"), threshold=75) is True
    assert activity_passed(Decimal("74.99"), threshold=75) is False


def test_passing_an_activity_does_not_by_itself_reach_the_mastered_band():
    """An activity may pass at 75 while the learner stays Developing."""
    score = Decimal("75")

    assert activity_passed(score, threshold=DEFAULT_ACTIVITY_PASS_PERCENTAGE) is True
    assert mastery_band_for(score) is MasteryBand.DEVELOPING


def test_intervention_triggers_at_the_configured_count():
    assert intervention_triggered(1, trigger=DEFAULT_INTERVENTION_TRIGGER) is False
    assert intervention_triggered(2, trigger=DEFAULT_INTERVENTION_TRIGGER) is True
    assert intervention_triggered(3, trigger=DEFAULT_INTERVENTION_TRIGGER) is True


def test_documented_defaults():
    assert DEFAULT_ACTIVITY_PASS_PERCENTAGE == 75
    assert DEFAULT_INTERVENTION_TRIGGER == 2


@pytest.mark.parametrize("value", [60, 75, 90])
def test_activity_pass_percentage_accepts_the_configurable_range(value):
    assert validate_activity_pass_percentage(value) == value


@pytest.mark.parametrize("value", [59, 91, 0, 100])
def test_activity_pass_percentage_rejects_values_outside_the_range(value):
    with pytest.raises(ValueError):
        validate_activity_pass_percentage(value)


@pytest.mark.parametrize("value", [1, 2, 5])
def test_intervention_trigger_accepts_the_configurable_range(value):
    assert validate_intervention_trigger(value) == value


@pytest.mark.parametrize("value", [0, 6])
def test_intervention_trigger_rejects_values_outside_the_range(value):
    with pytest.raises(ValueError):
        validate_intervention_trigger(value)
