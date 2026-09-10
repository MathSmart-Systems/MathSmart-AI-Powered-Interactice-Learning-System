"""What sections a learning module has.

A module's sections are not stored as rows; they are its content. The objective
and the concept explanation are one section each, then one per rule and one per
worked example. Counting them from the module itself means the list a learner is
shown cannot drift away from the list their progress is measured against.

`app.module_section_ids` derives the same list inside the database, which is
where the percentage is actually computed. This copy exists so the module
payload can tell a client which sections it may report, and an integration test
holds the two to the same answer.
"""

from __future__ import annotations

import json
from typing import Any

OBJECTIVE_SECTION = "objective"
CONCEPT_SECTION = "concept"
RULE_SECTION_PREFIX = "rule_"
EXAMPLE_SECTION_PREFIX = "example_"


def as_list(value: Any) -> list[Any]:
    """jsonb reaches asyncpg as text; a fake or a test hands over a list."""
    if value is None:
        return []
    if isinstance(value, str):
        loaded = json.loads(value)
        return list(loaded) if isinstance(loaded, list) else []
    return list(value)


def section_ids(*, rules: Any, worked_examples: Any) -> list[str]:
    """Every section this module has, in the order a learner meets them."""
    sections = [OBJECTIVE_SECTION, CONCEPT_SECTION]
    sections += [f"{RULE_SECTION_PREFIX}{index}" for index in range(1, len(as_list(rules)) + 1)]
    sections += [
        f"{EXAMPLE_SECTION_PREFIX}{index}"
        for index in range(1, len(as_list(worked_examples)) + 1)
    ]
    return sections
