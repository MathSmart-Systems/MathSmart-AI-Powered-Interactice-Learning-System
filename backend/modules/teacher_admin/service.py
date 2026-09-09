"""Deterministic reporting rules: disclosure control and CSV safety.

Both are pure functions of their input, which is what lets them be tested
directly and reasoned about without a database.
"""

from __future__ import annotations

import csv
import io
from collections.abc import Iterable
from datetime import UTC, datetime
from typing import Any

#: Below this many learners, an average describes individuals rather than a
#: cohort, so it is withheld. The counts stay: knowing that a competency has
#: three learners is not a disclosure, and the school still needs the shape of
#: its data.
MIN_COHORT_FOR_AVERAGE = 5

#: Spreadsheet software executes a cell that begins with one of these. A CSV is
#: data, so every value is neutralised before it is written.
FORMULA_PREFIXES = ("=", "+", "-", "@", "\t", "\r")


def suppressed(learners_tracked: int | None) -> bool:
    """True when the cohort is too small for an average to be reported."""
    return (learners_tracked or 0) < MIN_COHORT_FOR_AVERAGE


def growth(current: Any, diagnostic: Any) -> float | None:
    if current is None or diagnostic is None:
        return None
    return round(float(current) - float(diagnostic), 2)


def neutralised(value: Any) -> str:
    """A CSV cell that cannot be executed as a formula."""
    if value is None:
        return ""
    text = str(value)
    if text.startswith(FORMULA_PREFIXES):
        return "'" + text
    return text


def export_filename(now: datetime | None = None) -> str:
    """A timestamped name, so one export never silently replaces another."""
    stamp = (now or datetime.now(UTC)).strftime("%Y%m%d-%H%M%SZ")
    return f"mathsmart-progress-{stamp}.csv"


def to_csv(header: list[str], rows: Iterable[Iterable[Any]]) -> str:
    """The export, escaped by the csv module and neutralised cell by cell."""
    buffer = io.StringIO()
    writer = csv.writer(buffer, lineterminator="\n")
    writer.writerow(header)
    for row in rows:
        writer.writerow([neutralised(cell) for cell in row])
    return buffer.getvalue()
