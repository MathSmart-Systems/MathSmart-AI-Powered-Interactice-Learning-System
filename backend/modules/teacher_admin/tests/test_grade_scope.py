"""The MVP curriculum scope rule.

These are about the rule itself rather than the routes that apply it: which
level counts as in scope, and when a grade's name is claiming to be a grade it
is not.
"""

from modules.teacher_admin.grade_scope import (
    MVP_GRADE_LEVEL,
    is_mvp_level,
    name_contradicts_level,
)


def test_the_mvp_level_is_grade_six():
    """The product invariant, stated once so nothing else has to guess it."""
    assert MVP_GRADE_LEVEL == 6


def test_only_grade_six_is_in_scope():
    assert is_mvp_level(6)
    assert not is_mvp_level(5)
    assert not is_mvp_level(7)
    assert not is_mvp_level(None)


def test_a_name_without_a_number_claims_nothing():
    """A section-style name cannot contradict a level it never mentions."""
    assert not name_contradicts_level("Rizal", 6)
    assert not name_contradicts_level("Mathematics", 6)
    assert not name_contradicts_level("", 6)
    assert not name_contradicts_level(None, 6)


def test_a_name_naming_its_own_level_agrees_with_it():
    assert not name_contradicts_level("Grade 6", 6)
    assert not name_contradicts_level("grade 6", 6)
    assert not name_contradicts_level("Mathematics 6", 6)
    assert not name_contradicts_level("Grade 6 - Mathematics", 6)


def test_a_name_naming_another_grade_contradicts_the_level():
    """The defect this rule exists for: a record reading Grade 3, stored as 6."""
    assert name_contradicts_level("Grade 3", 6)
    assert name_contradicts_level("grade 1", 6)
    assert name_contradicts_level("Grade 12", 6)


def test_a_name_naming_two_grades_contradicts_either_of_them():
    assert name_contradicts_level("Grade 5 and Grade 6", 6)


def test_a_year_is_not_a_grade_claim():
    """2026 is not a grade level, so it cannot contradict one."""
    assert not name_contradicts_level("Grade 6 (2026)", 6)
    assert not name_contradicts_level("2026", 6)


def test_a_level_of_none_cannot_be_contradicted():
    assert not name_contradicts_level("Grade 3", None)


def test_the_rule_reads_the_level_it_is_given_not_the_mvp_level():
    """A legacy level-3 record named 'Grade 3' is consistent, not a defect."""
    assert not name_contradicts_level("Grade 3", 3)
    assert name_contradicts_level("Grade 6", 3)
