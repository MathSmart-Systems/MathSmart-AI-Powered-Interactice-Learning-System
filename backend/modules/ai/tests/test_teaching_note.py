"""The teaching note on a learner record: short, structured, and honest.

The first version printed whatever the model wrote — hundreds of words of
Markdown, a table, a pep talk. These pin the contract that replaced it: the
reply is validated on the server, not trimmed in the browser, and the model
name never leaves the process.
"""

import json
from uuid import UUID

from modules.ai.teaching_note import (
    MAX_ACTIONS,
    MAX_EVIDENCE,
    MAX_WORDS,
    parse_teaching_note,
)
from modules.ai.tests.test_ai import ADVISER_HEADERS, FakeGroq, ai_client

COMPETENCY = UUID("13ec5f06-746e-45fb-a58a-92f4ce42621c")

EVIDENCE = {
    "competency_id": str(COMPETENCY),
    "diagnostic_score": 40,
    "current_score": 55,
    "attempt_count": 5,
    "unsuccessful_attempts": 3,
    "display_context": "Diagnostic 40%. Current 55%. Mastery band: Needs Improvement.",
}

GOOD = json.dumps(
    {
        "gap": "The learner multiplies the numerators but adds the denominators.",
        "evidence": [
            "Current score is 55%, up from 40% at the diagnostic.",
            "3 of 5 attempts were unsuccessful.",
        ],
        "actions": [
            "Model one product with an area grid.",
            "Pair the learner with a partner for two worked examples.",
            "Give three short practice items with feedback after each.",
        ],
        "next_check": "Ask for one product of two fractions without a grid.",
    }
)

MARKDOWN_ESSAY = """## Teaching Note

**Learning gap:** The learner confuses the operations. They add denominators.

| Area | Score |
|------|-------|
| Fractions | 55% |

- **Use** an area model [see here](https://example.com/area).
- Practise with visit www.example.org daily.
- Great job so far, keep up the good work!

In summary, the learner confuses the operations and adds denominators.
"""


def words_in(note):
    return note.word_count()


# ─── The parser ──────────────────────────────────────────────────────


def test_a_well_formed_reply_keeps_every_field():
    note = parse_teaching_note(GOOD, EVIDENCE)

    assert note.gap.startswith("The learner multiplies")
    assert len(note.evidence) == 2
    assert len(note.actions) == 3
    assert note.next_check.startswith("Ask for one product")
    assert words_in(note) <= MAX_WORDS


def test_the_gap_is_at_most_two_sentences():
    reply = json.dumps(
        {"gap": "One. Two sentences here. Three is too many. Four as well.", "actions": ["Do x."]}
    )

    note = parse_teaching_note(reply, EVIDENCE)

    assert note.gap == "One. Two sentences here."


def test_lists_are_capped():
    reply = json.dumps(
        {
            "gap": "A gap.",
            "evidence": [f"Current score {n}." for n in (55, 40, 5, 3)],
            "actions": [f"Action number {n} to try." for n in "abcdef"],
        }
    )

    note = parse_teaching_note(reply, EVIDENCE)

    assert len(note.evidence) <= MAX_EVIDENCE
    assert len(note.actions) <= MAX_ACTIONS


def test_evidence_that_invents_a_figure_is_dropped():
    reply = json.dumps(
        {
            "gap": "A gap.",
            "evidence": ["The learner scored 91% on the unit quiz.", "3 of 5 attempts failed."],
            "actions": ["Do x."],
        }
    )

    note = parse_teaching_note(reply, EVIDENCE)

    assert note.evidence == ["3 of 5 attempts failed."]


def test_evidence_with_no_recorded_figure_falls_back_to_the_record():
    reply = json.dumps(
        {"gap": "A gap.", "evidence": ["The learner struggles a lot.", "Scored 12%."]}
    )

    note = parse_teaching_note(reply, EVIDENCE)

    assert note.evidence == [
        "Diagnostic score 40%, current score 55%.",
        "3 of 5 attempts were unsuccessful.",
    ]


def test_markdown_tables_links_and_filler_are_removed():
    note = parse_teaching_note(MARKDOWN_ESSAY, EVIDENCE)
    text = " ".join([note.gap, *note.evidence, *note.actions, note.next_check or ""])

    for mark in ("**", "##", "|", "- ", "http", "www.", "example"):
        assert mark not in text, f"{mark!r} survived"
    assert "Great job" not in text
    assert "keep up" not in text.lower()
    assert "In summary" not in text
    assert words_in(note) <= MAX_WORDS


def test_a_repeated_conclusion_is_dropped():
    reply = json.dumps(
        {
            "gap": "The learner adds the denominators when multiplying fractions.",
            "actions": [
                "Use an area grid for one product.",
                "The learner adds the denominators when multiplying fractions.",
            ],
            "next_check": "The learner adds the denominators when multiplying fractions.",
        }
    )

    note = parse_teaching_note(reply, EVIDENCE)

    assert note.actions == ["Use an area grid for one product."]
    assert note.next_check is None


def test_a_long_reply_is_brought_within_150_words():
    long = "This sentence has exactly eight words in it. " * 10
    reply = json.dumps(
        {
            "gap": long,
            "evidence": [f"Current score 55%. {long}", f"Diagnostic 40%. {long}"],
            "actions": [long, long + " Also more.", long + " Even more."],
            "next_check": long,
        }
    )

    note = parse_teaching_note(reply, EVIDENCE)

    assert words_in(note) <= MAX_WORDS
    assert note.gap


def test_prose_degrades_to_a_note_rather_than_to_nothing():
    note = parse_teaching_note(
        "The learner adds denominators. They need a visual model. Use an area grid. "
        "Then check one product.",
        EVIDENCE,
    )

    assert note.gap == "The learner adds denominators. They need a visual model."
    assert note.actions == ["Use an area grid.", "Then check one product."]
    assert note.evidence  # written from the record


def test_an_empty_reply_is_nothing():
    assert parse_teaching_note("", EVIDENCE) is None
    assert parse_teaching_note("   ", EVIDENCE) is None
    assert parse_teaching_note("** ## |", EVIDENCE) is None


# ─── The route ───────────────────────────────────────────────────────


def test_the_route_asks_for_the_structured_shape():
    groq = FakeGroq(text=GOOD)
    client = ai_client(groq)

    response = client.post("/api/v1/ai/teacher-insight", json=EVIDENCE, headers=ADVISER_HEADERS)

    assert response.status_code == 200
    call = groq.calls[0]
    assert '"evidence"' in call["instructions"]
    assert "150" in call["instructions"] or "120 words" in call["instructions"]
    assert call["max_tokens"]


def test_the_route_returns_the_structured_note():
    client = ai_client(FakeGroq(text=GOOD))

    data = client.post(
        "/api/v1/ai/teacher-insight", json=EVIDENCE, headers=ADVISER_HEADERS
    ).json()["data"]

    assert data["insight_summary"].startswith("The learner multiplies")
    assert len(data["evidence"]) == 2
    assert len(data["recommended_actions"]) == 3
    assert data["next_check"].startswith("Ask for one product")


def test_the_route_never_exposes_the_provider_the_model_or_the_time():
    client = ai_client(FakeGroq(text=GOOD))

    response = client.post("/api/v1/ai/teacher-insight", json=EVIDENCE, headers=ADVISER_HEADERS)

    data = response.json()["data"]
    for key in ("provider", "model", "generated_at", "confidence_score"):
        assert key not in data
    assert "a-configured-model" not in response.text
    assert "groq" not in response.text.lower()


def test_a_reply_with_nothing_readable_is_the_documented_503():
    client = ai_client(FakeGroq(text="** ## |"))

    response = client.post("/api/v1/ai/teacher-insight", json=EVIDENCE, headers=ADVISER_HEADERS)

    assert response.status_code == 503
    assert response.json()["error"]["code"] == "groq_assistance_unavailable"


def test_an_unavailable_groq_is_still_the_documented_503():
    client = ai_client(FakeGroq(text=None))

    response = client.post("/api/v1/ai/teacher-insight", json=EVIDENCE, headers=ADVISER_HEADERS)

    assert response.status_code == 503
