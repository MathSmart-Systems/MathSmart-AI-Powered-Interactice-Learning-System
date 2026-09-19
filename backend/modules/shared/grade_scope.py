"""The MVP curriculum scope: DepEd Grade 6 mathematics, and nothing else.

Shared rather than owned by one feature: the directory decides which grade a
section may belong to, and enrolment decides which grade a learner may join.
Both answers have to be the same one, so the rule is stated here once.

MathSmart teaches one grade. Left to the API alone a Teacher/Administrator
could add Grade 3, hang sections off it, and enrol learners into a curriculum
that has no competencies, no modules and no assessments behind it. The refusal
lives here rather than in each route so the rule is stated once, and so the
frontend and the API cannot drift into disagreeing about what it is.

This is a product-scope rule, not a permission and not a grading decision. It
refuses a request; it never decides a learner's result.
"""

from __future__ import annotations

import re

#: The only grade level MathSmart supports.
MVP_GRADE_LEVEL = 6

#: Numbers in a grade name that could plausibly name a grade level. A year such
#: as 2026 is not one of them, so "Grade 6 (2026)" reads as Grade 6.
_GRADE_LIKE = range(1, 13)

_NUMBERS = re.compile(r"\d+")

SCOPE_REFUSAL = (
    f"MathSmart supports the Grade {MVP_GRADE_LEVEL} curriculum only. "
    f"Grade {MVP_GRADE_LEVEL} is the single grade level, and every section belongs to it."
)

SCOPE_CODE = "grade_scope"


def is_mvp_level(level: int | None) -> bool:
    """Whether this level is the one grade MathSmart teaches."""
    return level == MVP_GRADE_LEVEL


def name_contradicts_level(name: str | None, level: int | None) -> bool:
    """Whether a grade's name claims a different grade level than its number.

    A name carrying no grade-like number claims nothing, so it cannot
    contradict anything. A name carrying one has to agree with the level, which
    is what stops a record reading "Grade 3" while it is stored as level 6.
    """
    if not name or level is None:
        return False

    claimed = {int(found) for found in _NUMBERS.findall(name) if int(found) in _GRADE_LIKE}
    if not claimed:
        return False
    return claimed != {level}
