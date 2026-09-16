---
name: groq-integration
description: Specification, wire contracts, module audit, and implementation boundaries for Groq generative AI in MathSmart (DepEd Grade 6 Mathematics). Load when planning or implementing AI feedback, explanations, hints, teacher insights, pattern analysis, or remediation.
---

# Groq AI Integration — Specification and Audit

Audited at `origin/main` (commit `60e3c6d`).

This reference document contains four parts:
- **Part 1**: Target specification stating what Groq is designed to do in MathSmart.
- **Part 2**: Audit of current state across all modules and error handling.
- **Part 3**: Wire contracts and developer reference for `/api/v1/ai/*`.
- **Part 4**: Implementation map detailing backend insertion points and data availability.

> **Note for implementing agents**:
> This is a reference document, not a task list. Do not change code based on it without an explicit instruction saying what to build.
> All rules derive from and are governed by `AGENTS.md` (Product invariants & Groq boundaries).

## Architectural Principles & Decisions

1. **Model Selection**: `GROQ_MODEL` is configured server-side in `.env` (e.g., `groq/compound-mini`).
2. **Output Shape & Bounded Prompts**: Standard endpoints send a system prompt and evidence. Formatting and length constraints must be managed carefully by the caller or parsed via robust defensive utility parsers.
3. **Language**: Grade 6 learner-appropriate English/Filipino contextual phrasing as defined by curriculum requirements.

---

## At a glance — which modules use Groq

| Module | Uses Groq? | Endpoint it would call | Status |
|---|---|---|---|
| **Student Activities** | Yes | `/ai/incorrect-answer-explanation`, `/ai/student-feedback` | Endpoints exist, never called. Response fields hardcoded null. |
| **Student Assessments** | Yes | `/ai/student-feedback`, `/ai/incorrect-answer-explanation` | Wired for student-friendly advisory results summary via diagnostic feedback service. |
| **Teacher Students** | Yes | `/ai/pattern-analysis`, `/ai/teacher-insight` | Endpoints exist, never called. View makes no AI calls. |
| **Teacher Interventions** | Yes | `/ai/remediation-support`, `/ai/teacher-insight` | Endpoints exist. Database columns exist with no writer. No UI. |
| **Teacher Reports and Analytics** | Yes | `/ai/pattern-analysis` | Not wired. No reporting route touches Groq. |
| **Teacher Settings** | Support only | none — reads configuration status | Status endpoint partial. Toggle is cosmetic. No UI. |
| Authentication | No | — | Built, apart from registration page |
| Student Dashboard | No | — | Built |
| Student My Learning | No | — | Backend only, frontend placeholder |
| Student Progress | No | — | Backend only, frontend placeholder |
| Student Profile | No | — | Built |
| Teacher Dashboard | No | — | Backend only, frontend placeholder |
| Teacher Assessments | No | — | Built |
| Teacher Competencies | No | — | Built |
| Teacher Learning Modules | No | — | Built |
| Teacher Activities | No | — | Built |
| Teacher Question Bank | No | — | Built |
| Teacher Grades and Sections | No | — | Built |

---

# PART 1 — TARGET SPECIFICATION

## Modules that use Groq AI

**1. Student Activities**
- Explain incorrect answers
- Improve authored hints
- Give encouraging feedback after answer checking

**2. Student Assessments**
- Explain incorrect answers after submission (when question data is retained)
- Provide a student-friendly results summary
- Never calculate scores or correctness

**3. Teacher Students**
- Summarize a learner's recurring mistakes
- Explain possible learning gaps

**4. Teacher Interventions**
- Suggest remediation strategies
- Suggest intervention actions
- Recommend scaffolding steps and visual explanations
- The teacher makes the final decision

**5. Teacher Reports and Analytics**
- Summarize class misconception patterns
- Explain deterministic statistics in teacher-friendly language

## Groq support only

**Teacher Settings**
- Enable or disable Groq features
- Display sanitized Groq status and model information
- Never display or edit the API key

## Governing Rules (from AGENTS.md)

1. Groq is advisory only.
2. Groq must never calculate scores.
3. Groq must never decide whether an answer is correct.
4. Groq must never calculate mastery or growth.
5. Groq must never unlock learning modules.
6. Groq must never create intervention triggers or severity.
7. Groq must never decide roles or permissions.
8. The system must continue working when Groq is unavailable.
9. Groq is called only by the FastAPI backend.
10. The Groq API key and model remain inside the server-side `.env`.
11. Do not automatically generate or publish questions with Groq in the MVP.
12. All Groq-generated recommendations must be reviewed by a teacher.

---

# PART 2 — AUDIT OF CURRENT STATE

## Shared foundation (applies to every module below)

The Groq adapter at `backend/modules/shared/groq_adapter.py` calls Groq's OpenAI-compatible HTTP endpoint via `httpx` and exposes one advisory method. Configuration lives in `backend/app/config.py` (`GROQ_ENABLED`, `GROQ_API_KEY`, `GROQ_MODEL`, `GROQ_TIMEOUT_SECONDS`), and enabling Groq without a key or model fails at startup. Five advisory endpoints exist under `/api/v1/ai/`, with teacher-only routes role-gated. Tests cover the adapter, endpoints, and configuration.

One limitation affects all five modules: the adapter returns a single unstructured text blob. There is no JSON mode and no schema parsing, so every structured field in the responses — `root_cause`, `learning_gaps`, `scaffolding_steps`, `confidence_score` — is hardcoded to null or an empty list.

---

## GROQ AI MODULES

### 1. Student Activities — Partial. Endpoints exist, nothing calls them.

- **Explain incorrect answers:** endpoint `/api/v1/ai/incorrect-answer-explanation` is implemented and tested. It accepts correctness as an input and returns only an explanation, never a verdict.
- **Improve authored hints:** no implementation. The hint response hardcodes `ai_hint` to null (`activities/router.py:229`).
- **Encouraging feedback after answer checking:** endpoint `/api/v1/ai/student-feedback` exists, but the answer-check response hardcodes `ai_feedback` to null (`activities/router.py:213`). The `friendly_tip` and `encouragement` fields are hardcoded null.
- **Frontend:** the student activities page is still a placeholder; the module directory is empty.
- Closing this gap is the smallest remaining task, because the schema slots already exist and only need a writer.

### 2. Student Assessments

- **Explain incorrect answers after submission:** not wired. The assessment router states explicitly that nothing in it consults Groq (`assessments/router.py:418`).
- **Student-friendly results summary:** wired via student diagnostic feedback service (`diagnostic-feedback.js`) calling `/api/v1/ai/student-feedback` with structured feedback rendering (`FeedbackMarkdown.jsx`).
- **Never calculate scores or correctness:** satisfied. Scoring is handled entirely by database functions.

### 3. Teacher Students — Partial. Endpoints exist, nothing calls them.

- **Summarize recurring mistakes:** endpoint `/api/v1/ai/pattern-analysis` is implemented (teacher-only). It returns a misconception summary; the `root_cause` and `recommended_remediation` fields are hardcoded null.
- **Explain learning gaps:** endpoint `/api/v1/ai/teacher-insight` is implemented (teacher-only), but `learning_gaps` is returned as a hardcoded empty list.
- **Frontend:** the Students view exists and is functional, but makes zero AI calls. The per-student drill-down page has not been built.

### 4. Teacher Interventions — Partial. Endpoint exists; no write path, no UI.

- **Suggest remediation strategies and scaffolding steps:** endpoint `/api/v1/ai/remediation-support` is implemented (teacher-only), but `scaffolding_steps` is a hardcoded empty list and `targeted_practice_focus` and `visual_metaphor_advice` are hardcoded null.
- **Suggest intervention actions:** the `/ai/teacher-insight` route returns `recommended_actions` as a hardcoded empty list and `suggested_intervention_type` as null.
- **Persistence:** the database columns `app.interventions.ai_insight` and `ai_recommendation` exist and are read back by the interventions router, but no code anywhere writes to them. Clients are explicitly forbidden from supplying them, and a test enforces that.
- **Teacher makes the final decision:** satisfied by construction — nothing is auto-persisted.
- **Frontend:** placeholder page only; the module directory is empty.

### 5. Teacher Reports and Analytics — Not implemented.

- **Summarize class misconception patterns:** not wired. None of the seven reporting routes (dashboard, classes, heatmap, at-risk, analytics, CSV export) reference Groq.
- **Explain deterministic statistics in teacher-friendly language:** not implemented.
- **Frontend:** placeholder page only; the module directory is empty.

---

## GROQ SUPPORT ONLY

### Teacher Settings — Partial, with two real gaps.

- **Display sanitized Groq status:** the settings endpoint returns `{enabled, model_is_editable: false, model_source: "server environment"}`.
- **Display model information: not implemented.** The spec calls for a sanitized read-only model identifier. The endpoint returns only the literal string `"server environment"` — no model id.
- **Enable or disable Groq features: cosmetic only.** The settings endpoint accepts a feature-flag write, but no code reads that stored flag. The real gate is the `GROQ_ENABLED` server environment variable, checked inside the adapter. Toggling from the UI would have no effect.
- **Never display or edit the API key: fully satisfied.** The key is stored as a secret type, sent only as an authorization header, omitted from logs and object representations, and explicitly rejected by the settings-write validator. Four tests cover this.
- **Frontend:** placeholder page only; the module directory is empty.

---

# PART 3 — DEVELOPER REFERENCE

The AI router is mounted with prefix `/api/v1`. All five routes are `POST`. Every request model — including the nested `IncorrectAttempt` — is declared `extra="forbid"`, so any unrecognised field in the body is rejected with a 422.

Success envelope:
```json
{ "data": { ... } }
```

Every response carries an `X-Request-Id` header.

All five routes return the same provenance block inside `data`: `provider` (always `"groq"`), `model` (value of `GROQ_MODEL`), `generated_at` (ISO-8601 UTC), and `confidence_score` (`null`).

## Endpoint contracts

### 1. `POST /api/v1/ai/pattern-analysis`
Role required: **teacher/admin only**.

Request fields:
- `grade`: string or null (max 60)
- `competency_id`: UUID or null
- `display_context`: string or null (max 2000)
- `incorrect_attempts`: array of items (max 20) with `question_text` (required, max 2000), `submitted_answer` (optional), `correct_answer` (optional)

Response `data`: `misconception_summary` (Groq text), `root_cause` (null), `recommended_remediation` (null), plus provenance.

### 2. `POST /api/v1/ai/student-feedback`
Role required: **any authenticated user**.

Request fields:
- `competency_id`: UUID or null
- `score`: number or null (0–100)
- `mastery_band`: string or null (max 40)
- `display_context`: string or null (max 2000)

Response `data`: `feedback_text` (Groq text), `friendly_tip` (null), `encouragement` (null), plus provenance.

### 3. `POST /api/v1/ai/incorrect-answer-explanation`
Role required: **any authenticated user**.

Request fields:
- `question_text`: string (required, max 2000)
- `submitted_answer`: any (optional)
- `is_correct`: boolean or null (input only)
- `competency_id`: UUID or null

Response `data`: `explanation` (Groq text) plus provenance.

### 4. `POST /api/v1/ai/teacher-insight`
Role required: **teacher/admin only**.

Request fields:
- `competency_id`: UUID or null
- `diagnostic_score`: number or null (0–100)
- `current_score`: number or null (0–100)
- `attempt_count`: integer >= 0 or null
- `unsuccessful_attempts`: integer >= 0 or null
- `incorrect_patterns`: array (max 20)
- `completed_modules`: array (max 20)
- `display_context`: string or null (max 2000)

Response `data`: `insight_summary` (Groq text), `learning_gaps` ([]), `suggested_intervention_type` (null), `recommended_actions` ([]), `urgency_level` (null), plus provenance.

### 5. `POST /api/v1/ai/remediation-support`
Role required: **teacher/admin only**.

Request fields:
- `competency_id`: UUID or null
- `current_score`: number or null (0–100)
- `display_context`: string or null (max 2000)

Response `data`: `recommended_module_title` (carries raw Groq text), `targeted_practice_focus` (null), `visual_metaphor_advice` (null), `scaffolding_steps` ([]), plus provenance.

## Evidence Redaction

Before sending to Groq, keys containing any of the following substrings (case-insensitive) are stripped:
`name, email, phone, avatar, address, token, secret, password, api_key, apikey, credential, key`

---

# PART 4 — IMPLEMENTATION MAP

| Task | Buildable today? | Missing prerequisites |
|---|---|---|
| Student Activities — encouraging feedback | **Yes** | Adapter access in route handler |
| Student Assessments — results summary | **Yes** | Client integration in place |
| Teacher Students — learning gaps | **Yes** | Adapter access; caller decision |
| Teacher Interventions — remediation suggestion | **Yes to generate** | Server-side write path needed to persist |
| Teacher Reports — plain-language statistics | **Yes** | Frontend module to build |
| Student Activities — improved hints | **Yes** | Adapter access in route handler |
| Student Activities — explain incorrect answers | **No** | Question text not loaded at handler |
| Student Assessments — explain incorrect answers | **No** | Per-question correctness not retained after submit |
| Teacher Students — recurring mistakes | **No** | Question-level incorrect evidence not collected |
| Teacher Reports — misconception patterns | **No** | No per-question evidence in reporting aggregates |
