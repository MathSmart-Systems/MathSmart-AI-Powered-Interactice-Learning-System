# MathSmart: API Routes Reference
## Planned FastAPI REST Contract

> **Version:** 1.2
> **Last Updated:** September 8, 2026
> **Status:** Planned contract; backend route files are not implemented yet
> **Base Path:** `/api/v1`
> **Local Example:** `http://localhost:8000/api/v1`
> **Curriculum:** DepEd Grade 6 Mathematics
> **AI Provider:** Groq; server-side API credential and model are loaded from `.env`
> **Auth:** Supabase Auth access token in `Authorization: Bearer <token>`
> **Format:** JSON unless an endpoint explicitly returns CSV
> **UI/UX Workflow Baseline:** `../../ui-ux-workflow-reference/`

This contract supports the reference prototype's intended Student and Teacher/Administrator workflows while keeping the production architecture in Next.js, FastAPI, and Supabase. The reference's client-only state, mock records, answer keys, and demo role/persona switching are not part of this API.

---

## Table of Contents

1. [Conventions](#1-conventions)
2. [Shared Types and Rules](#2-shared-types-and-rules)
3. [Authentication and Session](#3-authentication-and-session)
4. [Student Profiles](#4-student-profiles)
5. [Assessments and Results](#5-assessments-and-results)
6. [Competencies and Learning Paths](#6-competencies-and-learning-paths)
7. [Modules](#7-modules)
8. [Activities and Attempts](#8-activities-and-attempts)
9. [Progress](#9-progress)
10. [Teacher/Administrator Dashboard and Analytics](#10-teacheradministrator-dashboard-and-analytics)
11. [Interventions](#11-interventions)
12. [Groq AI Assistance](#12-groq-ai-assistance)
13. [Teacher/Administrator Administration](#13-teacheradministrator-administration)
14. [HTTP Status Codes](#14-http-status-codes)
15. [Role Access Matrix](#15-role-access-matrix)
16. [Security and Privacy Requirements](#16-security-and-privacy-requirements)
17. [Legacy Route Migration](#17-legacy-route-migration)

---

## 1. Conventions

### URL and naming

- Resource names are plural nouns: `/students`, `/assessments`, `/activities`.
- Identifiers are UUID strings unless the field is explicitly a human-readable learner code.
- JSON fields use `snake_case`; timestamps use ISO 8601 UTC strings.
- Route ownership is inferred from the verified token where possible. `/me` endpoints are preferred for student self-service.
- Collection responses are paginated. Default `page_size` is 20; maximum is 100.
- Supported collection parameters are `page`, `page_size`, `search`, `sort`, and the documented resource filters.

### Authentication and authorization

- FastAPI verifies the Supabase access token and derives `user_id` from the trusted `sub` claim.
- Production has exactly two roles: `student` and `teacher_admin`. The reference's `TEACHER_ADMIN` value maps to the canonical lowercase `teacher_admin` claim.
- Trusted roles belong in Supabase `app_metadata` or authoritative application tables, not user-editable `user_metadata`.
- A valid token is authentication, not authorization. FastAPI and database policies also enforce Student ownership, publication state, and `teacher_admin` privileges.
- Students receive own-record and published-learning scope. Teacher/Administrators receive the documented school-wide teaching and administration scope.

### Standard success envelopes

Single resource:

```json
{
  "data": {
    "id": "2cd991b8-60e6-4d17-9e40-cbe5b826c2be"
  }
}
```

Collection:

```json
{
  "data": [],
  "meta": {
    "page": 1,
    "page_size": 20,
    "total_items": 0,
    "total_pages": 0
  }
}
```

### Standard error envelope

```json
{
  "error": {
    "code": "validation_error",
    "message": "The request contains invalid fields.",
    "fields": {
      "grade_id": ["Select an active grade level."]
    },
    "request_id": "req_01J73YVC74Y1TT1F60DVB0J2QX"
  }
}
```

`fields` is omitted for errors that are not field-specific. User-facing messages must not reveal answer keys, internal SQL, provider secrets, or records outside the caller's scope.

### Mutation safety

- Final assessment and activity submissions require an `Idempotency-Key` header so retries cannot create duplicate attempts.
- Update requests may include `If-Match` with a resource version to prevent lost updates.
- Delete operations archive records by default. Hard deletion is reserved for approved retention/privacy workflows.
- Sensitive mutations and exports create an audit record with actor, action, target, timestamp, and request ID.

---

## 2. Shared Types and Rules

### Canonical enums

| Type | Values |
|---|---|
| `user_role` | `student`, `teacher_admin` |
| `diagnostic_status` | `not_started`, `in_progress`, `completed` |
| `assessment_type` | `diagnostic`, `reassessment`, `unit_quiz` |
| `attempt_status` | `in_progress`, `submitted`, `scored`, `voided` |
| `publication_status` | `draft`, `published`, `archived` |
| `question_type` | MVP: `multiple_choice`, `number_input`, `fill_blank`; reserved: `true_false`, `matching`, `ordering` |
| `difficulty` | `easy`, `medium`, `hard` |
| `path_item_status` | `locked`, `available`, `in_progress`, `completed` |
| `mastery_band` | `Mastered`, `Developing`, `Needs Improvement` |
| `monitoring_status` | `active`, `needs_intervention`, `improving`, `mastered`, `inactive` |
| `intervention_severity` | `HIGH`, `MEDIUM`, `LOW` |
| `intervention_status` | `Needs Intervention`, `In Progress`, `Resolved` |
| `intervention_type` | `Additional Exercise`, `One-on-One Remediation`, `Additional Module`, `Teacher Consultation`, `Other` |

### Deterministic defaults

| Rule | Default | Notes |
|---|---:|---|
| Mastered band | 80–100% | Applies to the calculated competency score |
| Developing band | 50–79% | Display band, not the same as activity pass/fail |
| Needs Improvement band | 0–49% | Highest priority for targeted support |
| Activity pass threshold | 75% | Teacher/Administrator-configurable from 60–90 |
| Automatic intervention trigger | 2 unsuccessful attempts | Teacher/Administrator-configurable from 1–5 per competency |

An activity may pass at 75% while the learner remains in the `Developing` band until the aggregate competency score reaches 80%. All scores, bands, attempts, unlocks, and intervention triggers are determined by server-side rules, never by Groq.

### Student summary shape

```json
{
  "id": "e48bf9c4-e0ba-4fde-94b2-9eb0f6cd1afd",
  "learner_id": "STU-2026-001",
  "full_name": "Juan Dela Cruz",
  "grade": {"id": "e31c2b84-e327-4be7-8a9a-f4a14a6e42bb", "name": "Grade 6"},
  "section": {"id": "cc7ef387-7435-4af0-8c50-0a7ce6aa5f5c", "name": "Rizal"},
  "overall_mastery": 63,
  "diagnostic_status": "completed",
  "diagnostic_score": 63,
  "monitoring_status": "needs_intervention",
  "active_intervention_count": 1,
  "modules_completed_count": 1,
  "total_modules_count": 5
}
```

### Question delivery shape

Before submission, question objects may contain `id`, `competency_id`, `competency_name`, `text`, `type`, `choices`, `hint_availability`, `difficulty`, and accessible visual-aid metadata. They must not contain `correct_answer`, an answer-key representation, or an explanation that discloses the solution.

---

## 3. Authentication and Session

Authentication is provided by Supabase Auth. These application endpoints exist as a controlled integration boundary; they do not store password hashes in application tables.

### `POST /auth/register`

Registers a Student account and creates the linked application profile. Teacher/Administrator account creation is controlled by an existing Teacher/Administrator through an audited workflow.

- **Auth:** Public
- **Rate limit:** Required by IP and normalized identifier

Request:

```json
{
  "email": "juan.delacruz@school.edu.ph",
  "password": "SecurePass123!",
  "full_name": "Juan Dela Cruz",
  "grade_id": "e31c2b84-e327-4be7-8a9a-f4a14a6e42bb",
  "section_id": "cc7ef387-7435-4af0-8c50-0a7ce6aa5f5c",
  "school_name": "San Jose Elementary School"
}
```

Response `201 Created`:

```json
{
  "data": {
    "user_id": "376e50ba-37ec-4b32-994f-31376c20d4bd",
    "student_id": "e48bf9c4-e0ba-4fde-94b2-9eb0f6cd1afd",
    "learner_id": "STU-2026-001",
    "email_verification_required": true,
    "next_step": "verify_email"
  }
}
```

### `POST /auth/login`

Authenticates through Supabase Auth and returns the app-safe session summary. For the web application, the refresh token is stored in a secure, HTTP-only, same-site cookie and is not returned in JSON. Clients must accept any successful 2xx status from the upstream OAuth flow rather than assuming only `201`.

Request:

```json
{
  "email": "juan.delacruz@school.edu.ph",
  "password": "SecurePass123!"
}
```

Response `200 OK`:

```json
{
  "data": {
    "access_token": "supabase-access-token",
    "expires_in": 3600,
    "refresh_transport": "secure_http_only_cookie",
    "user": {
      "id": "376e50ba-37ec-4b32-994f-31376c20d4bd",
      "full_name": "Juan Dela Cruz",
      "role": "student"
    },
    "next_route": "/dashboard"
  }
}
```

### `POST /auth/refresh`

Exchanges a valid refresh token through Supabase Auth and returns the refreshed session. No application role is accepted from the request body.

### `POST /auth/logout`

Revokes or signs out the current session according to the selected Supabase session scope. Response: `204 No Content`.

### `GET /auth/me`

Returns the verified user, role, permissions, and role-specific profile summary used to initialize the Next.js application shell.

---

## 4. Student Profiles

### `GET /students/me`

- **Role:** Student
- **Purpose:** Get the current learner's identity, enrollment, diagnostic status, preferences, and summary metrics.

### `PATCH /students/me`

- **Role:** Student
- **Purpose:** Update permitted preferences and profile fields.
- **Forbidden fields:** `user_id`, `learner_id`, `role`, `grade_id`, `section_id`, aggregate scores, and intervention state.

Request:

```json
{
  "avatar_url": "https://assets.mathsmart.app/avatars/learner-12.png",
  "preferences": {
    "reduced_motion": false,
    "high_contrast": false,
    "learning_reminders": true
  }
}
```

### `GET /students`

- **Role:** Teacher/Administrator
- **Filters:** `search`, `grade_id`, `section_id`, `monitoring_status`, `diagnostic_status`
- **Scope:** School-wide, with explicit filters and pagination.

### `POST /students`

- **Role:** Teacher/Administrator
- **Purpose:** Enroll a learner in an active section and provision or invite the linked auth account.
- **Audit:** Required.

### `GET /students/{student_id}`

- **Role:** Student own, Teacher/Administrator
- **Purpose:** Return identity/enrollment plus diagnostic, competency, module, attempt, and intervention summaries permitted to the caller.

### `PATCH /students/{student_id}`

- **Role:** Teacher/Administrator
- **Purpose:** Update enrollment and monitoring fields within the combined role's scope.
- **Rule:** Role and global account-state changes use the audited Teacher/Administrator user-management endpoints, not this learner-profile endpoint.

---

## 5. Assessments and Results

### `GET /assessments`

- **Role:** Student, Teacher/Administrator
- **Filters:** `type`, `grade_id`, `status`
- **Student behavior:** Returns only published assessments available to the learner, plus attempt/eligibility summary.

### `GET /assessments/{assessment_id}`

Returns title, type, grade, question count, duration, description, publication state where permitted, and the caller's eligibility. It does not return questions or answer keys.

### `POST /assessments/{assessment_id}/attempts`

- **Role:** Eligible Student
- **Purpose:** Start a new assessment attempt or resume the caller's existing in-progress attempt.
- **Rule:** Returns question delivery shapes without answer keys. A repeated request must resume instead of creating a second in-progress attempt.

Response `201 Created` for a new attempt or `200 OK` for a resumed attempt:

```json
{
  "data": {
    "attempt_id": "5b2b9640-1cf7-4210-8910-dfd605d30d77",
    "assessment": {
      "id": "30e7f94d-0daa-4c0d-9a4b-908e47029a51",
      "title": "Grade 6 Mathematics Diagnostic Assessment",
      "type": "diagnostic",
      "duration_minutes": 30,
      "total_questions": 2
    },
    "questions": [
      {
        "id": "a89d7d3f-8e80-4564-9681-11531088fab9",
        "competency_id": "13ec5f06-746e-45fb-a58a-92f4ce42621c",
        "competency_name": "Multiplication and Division of Integers",
        "text": "What is (-9) × (-8)?",
        "type": "multiple_choice",
        "choices": ["-72", "72", "-17", "17"],
        "difficulty": "medium"
      },
      {
        "id": "b330846f-09ba-4777-a4b9-0560be4e8cd1",
        "competency_id": "849511d1-4ddf-4f04-a9e8-f69677eb151d",
        "competency_name": "Operations with Decimals",
        "text": "What is 12.6 ÷ 3?",
        "type": "number_input",
        "difficulty": "easy"
      }
    ],
    "saved_answers": {},
    "started_at": "2026-09-08T04:00:00Z"
  }
}
```

### `POST /assessment-attempts/{attempt_id}/submit`

Finalizes an in-progress attempt. The server grades the saved and submitted answers deterministically, persists immutable responses and per-competency results, and generates the targeted learning path in one transaction.

Submission request:

```json
{
  "answers": [
    {"question_id": "a89d7d3f-8e80-4564-9681-11531088fab9", "answer": "72"},
    {"question_id": "b330846f-09ba-4777-a4b9-0560be4e8cd1", "answer": "4.2"}
  ]
}
```

Response `200 OK`:

```json
{
  "data": {
    "attempt_id": "5b2b9640-1cf7-4210-8910-dfd605d30d77",
    "status": "scored",
    "overall_score": 100,
    "submitted_at": "2026-09-08T04:21:00Z",
    "competency_results": [
      {
        "competency_id": "13ec5f06-746e-45fb-a58a-92f4ce42621c",
        "competency_name": "Multiplication and Division of Integers",
        "raw_score": 1,
        "max_score": 1,
        "percentage": 100,
        "mastery_band": "Mastered"
      },
      {
        "competency_id": "849511d1-4ddf-4f04-a9e8-f69677eb151d",
        "competency_name": "Operations with Decimals",
        "raw_score": 1,
        "max_score": 1,
        "percentage": 100,
        "mastery_band": "Mastered"
      }
    ],
    "recommended_learning_path": [],
    "next_action": {"type": "dashboard", "label": "Return to Dashboard"}
  }
}
```

### `PATCH /assessment-attempts/{attempt_id}`

- **Role:** Student owner
- **Purpose:** Autosave one or more answers during an in-progress attempt.
- **Rule:** Submitted, scored, or voided attempts are immutable.

### `GET /assessment-attempts/{attempt_id}`

- **Role:** Student owner, Teacher/Administrator
- **Purpose:** Return resumable state before submission or the complete scored report afterward. Correct answers and explanations are available only after submission and only according to assessment review policy.

### `GET /students/{student_id}/assessment-attempts`

Returns paginated diagnostic, reassessment, and unit-quiz history with title, type, dates, score, question count, and status.

### `GET /students/{student_id}/diagnostic-status`

Response:

```json
{
  "data": {
    "status": "completed",
    "latest_attempt_id": "5b2b9640-1cf7-4210-8910-dfd605d30d77",
    "latest_score": 63,
    "reassessment_eligible": false,
    "reassessment_reason": null
  }
}
```

### `POST /students/{student_id}/reassessment-authorizations`

- **Role:** Teacher/Administrator
- **Purpose:** Authorize a reassessment and record the pedagogical reason.
- **Audit:** Required.

---

## 6. Competencies and Learning Paths

### `GET /competencies`

- **Role:** All authenticated users
- **Filters:** `grade_id`, `domain`, `status`, `search`
- **Student behavior:** Published competencies only.

### `GET /competencies/{competency_id}`

Returns code, name, grade, domain, description, prerequisite IDs, publication state where permitted, module summary, and the caller's progress where applicable.

### `GET /learning-path/me`

- **Role:** Student
- **Purpose:** Return the current learner's ordered targeted path.

### `GET /learning-path/{student_id}`

- **Role:** Teacher/Administrator
- **Purpose:** Return an authorized learner's ordered path and recommendation reasons.

Learning-path response:

```json
{
  "data": [
    {
      "id": "821a14d6-c49a-4f42-bc04-96388ec76a31",
      "priority": 1,
      "reason": "Diagnostic score of 35% indicates a foundational sign-rule gap.",
      "status": "available",
      "competency": {
        "id": "13ec5f06-746e-45fb-a58a-92f4ce42621c",
        "code": "MATH6-INT-02",
        "name": "Multiplication and Division of Integers"
      },
      "module": {
        "id": "4a39d286-e93e-4e75-9644-b873fcac185c",
        "title": "Multiplication and Division of Integers",
        "estimated_minutes": 15
      }
    }
  ]
}
```

---

## 7. Modules

### `GET /modules`

- **Role:** All authenticated users
- **Filters:** `competency_id`, `grade_id`, `status`, `search`
- **Student behavior:** Returns only published modules visible through the learner's path or general curriculum policy, including `path_status` and completion percentage.

### `GET /modules/{module_id}`

Returns the structured module used by the reference workflow:

```json
{
  "data": {
    "id": "4a39d286-e93e-4e75-9644-b873fcac185c",
    "competency_id": "13ec5f06-746e-45fb-a58a-92f4ce42621c",
    "competency_name": "Multiplication and Division of Integers",
    "title": "Multiplication and Division of Integers",
    "grade": "Grade 6",
    "estimated_minutes": 15,
    "learning_objective": "Apply sign rules to integer multiplication and division.",
    "short_explanation": "The result is positive for equal signs and negative for different signs.",
    "rules": [
      {
        "title": "Same signs",
        "rule_formula": "(-a) × (-b) = +(ab)",
        "explanation": "Two equal signs produce a positive product.",
        "visual_example": "A number-line direction reversal shown twice.",
        "highlight": "Same signs → positive"
      }
    ],
    "worked_examples": [
      {
        "problem": "(-6) × (-4)",
        "steps": ["Identify two negative signs.", "Apply the same-sign rule.", "Multiply 6 × 4."],
        "solution": "24",
        "tip": "Check the sign before multiplying the magnitudes."
      }
    ],
    "associated_activities": [
      {
        "id": "fd80cc3c-4951-439c-894e-f93cbf7a23e1",
        "title": "Integer Sign Practice",
        "status": "available"
      }
    ],
    "progress": {"completion_percentage": 40, "is_complete": false}
  }
}
```

### `PATCH /modules/{module_id}/progress`

- **Role:** Student
- **Purpose:** Save section-level progress and the last viewed section.

Request:

```json
{
  "completed_section_ids": ["objective", "concept", "rule_same_sign"],
  "last_section_id": "rule_same_sign"
}
```

### `POST /modules/{module_id}/complete`

- **Role:** Student
- **Purpose:** Validate required sections, mark the module complete, and evaluate linked activity availability.
- **Failure:** `412 Precondition Failed` if required content is incomplete.

### `GET /modules/{module_id}/progress/{student_id}`

- **Role:** Student own, Teacher/Administrator
- **Purpose:** Return module progress and timestamps within permitted scope.

---

## 8. Activities and Attempts

### `GET /activities`

- **Role:** All authenticated users
- **Filters:** `module_id`, `competency_id`, `status`, `search`
- **Student behavior:** Includes availability, priority, prior attempts, best score, and prerequisite state.

### `GET /activities/{activity_id}`

- **Role:** Authorized Student, Teacher/Administrator
- **Purpose:** Return title, description, competency, estimate, points, pass threshold, and ordered question delivery objects without answer keys.

### `POST /activities/{activity_id}/attempts`

- **Role:** Authorized Student
- **Purpose:** Start a new activity attempt or resume the caller's existing in-progress attempt.
- **Rule:** A repeated request must resume instead of creating a second in-progress attempt.

Response `201 Created` for a new attempt or `200 OK` for a resumed attempt:

```json
{
  "data": {
    "attempt_id": "6169d019-490a-46ae-94a2-3f2f3fe1e8f5",
    "status": "in_progress",
    "attempt_number": 2,
    "saved_answers": {},
    "started_at": "2026-09-08T05:00:00Z"
  }
}
```

### `POST /activity-attempts/{attempt_id}/answer-checks`

Provides immediate deterministic feedback for one answer without finalizing the activity attempt.

Request:

```json
{
  "question_id": "a89d7d3f-8e80-4564-9681-11531088fab9",
  "answer": "-72"
}
```

Response `200 OK`:

```json
{
  "data": {
    "is_correct": false,
    "attempts_for_question": 1,
    "authored_feedback": "Check the signs before multiplying the magnitudes.",
    "explanation": "Two negative factors produce a positive product.",
    "hint_available": true,
    "ai_feedback": null
  }
}
```

### `POST /activity-attempts/{attempt_id}/submit`

Finalizes the activity and applies deterministic score, progress, and intervention rules.

Request:

```json
{
  "answers": [
    {"question_id": "a89d7d3f-8e80-4564-9681-11531088fab9", "answer": "72"}
  ],
  "time_spent_seconds": 420
}
```

Response `200 OK`:

```json
{
  "data": {
    "attempt_id": "6169d019-490a-46ae-94a2-3f2f3fe1e8f5",
    "score": 9,
    "max_score": 10,
    "accuracy": 90,
    "passed": true,
    "attempt_number": 2,
    "previous_competency_score": 35,
    "current_competency_score": 78,
    "mastery_band": "Developing",
    "intervention_created": false,
    "next_action": {"type": "dashboard", "label": "Continue Learning"}
  }
}
```

### `GET /students/{student_id}/activity-attempts`

- **Role:** Student own, Teacher/Administrator
- **Filters:** `activity_id`, `competency_id`, `passed`, date range
- **Purpose:** Return activity title, competency, date, score, maximum score, accuracy, duration, and attempt number.

### `POST /activity-attempts/{attempt_id}/hints`

- **Role:** Authorized Student
- **Purpose:** Return an authored hint first. Optional Groq-enhanced phrasing may be included when enabled.
- **Rule:** The hint must not disclose the final answer and cannot change scoring.

---

## 9. Progress

### `GET /progress/me`

- **Role:** Student
- **Purpose:** Supply the student dashboard and Progress screen.

### `GET /progress/{student_id}`

- **Role:** Student own, Teacher/Administrator
- **Purpose:** Supply an authorized learner drill-down.

Response:

```json
{
  "data": {
    "student_id": "e48bf9c4-e0ba-4fde-94b2-9eb0f6cd1afd",
    "overall_mastery": 63,
    "diagnostic_score": 48,
    "growth": 15,
    "modules_completed_count": 1,
    "total_modules_count": 5,
    "active_intervention_count": 1,
    "recommended_next_action": {
      "type": "module",
      "resource_id": "4a39d286-e93e-4e75-9644-b873fcac185c",
      "label": "Continue Integer Sign Rules"
    },
    "competencies": [
      {
        "competency_id": "13ec5f06-746e-45fb-a58a-92f4ce42621c",
        "competency_code": "MATH6-INT-02",
        "competency_name": "Multiplication and Division of Integers",
        "diagnostic_score": 35,
        "current_score": 78,
        "growth": 43,
        "mastery_band": "Developing",
        "attempt_count": 2,
        "unsuccessful_attempts": 1,
        "trajectory": [
          {"date": "2026-08-10", "score": 35, "label": "Diagnostic"},
          {"date": "2026-09-08", "score": 78, "label": "Activity Attempt 2"}
        ]
      }
    ],
    "recent_activity": []
  }
}
```

---

## 10. Teacher/Administrator Dashboard and Analytics

### `GET /teacher-admin/dashboard`

- **Role:** Teacher/Administrator
- **Filters:** `grade_id`, `section_id`
- **Purpose:** Return total learners, needs-support count, currently-learning count, mastered count, average mastery, priority learner cards, competency overview, and recent activity.

### `GET /teacher-admin/classes`

Returns permitted grade/section summaries and adviser information.

### `GET /teacher-admin/classes/{section_id}/students`

Returns the roster rows needed by the reference: learner identity, class, diagnostic score/status, mastery, intervention count, and monitoring status.

### `GET /teacher-admin/classes/{section_id}/heatmap`

Returns learners by competency with numeric scores and textual mastery bands. The UI must not communicate state through color alone.

### `GET /teacher-admin/students/at-risk`

- **Filters:** `grade_id`, `section_id`, `competency_id`, `severity`
- **Purpose:** Return learners who meet deterministic needs-support or intervention rules.

### `GET /teacher-admin/analytics`

- **Filters:** `grade_id`, `section_id`, date range
- **Purpose:** Return cohort mastery, diagnostic-to-current growth, competency performance, intervention counts, and aggregated misconception patterns.
- **Privacy:** Small-cohort suppression or equivalent disclosure protection must be applied where school policy requires it.

### `GET /teacher-admin/reports/progress.csv`

- **Role:** Teacher/Administrator
- **Purpose:** Export the selected cohort summary.
- **Requirements:** CSV escaping, formula-injection protection, least-data columns, timestamped filename, and audit logging.

---

## 11. Interventions

### `GET /interventions`

- **Role:** Teacher/Administrator
- **Filters:** `student_id`, `grade_id`, `section_id`, `competency_id`, `severity`, `status`
- **Purpose:** Supply the filterable intervention queue.

### `POST /interventions`

Creates a manual case or records the first action on an automatically created case.

Request:

```json
{
  "student_id": "e48bf9c4-e0ba-4fde-94b2-9eb0f6cd1afd",
  "competency_id": "13ec5f06-746e-45fb-a58a-92f4ce42621c",
  "severity": "HIGH",
  "intervention_type": "One-on-One Remediation",
  "educator_notes": "Scheduled a 15-minute guided number-line session during Friday homeroom."
}
```

Response `201 Created`:

```json
{
  "data": {
    "id": "f87d7703-ef37-4bfa-943f-c2bc7e69cb01",
    "status": "In Progress",
    "recorded_at": "2026-09-08T05:30:00Z",
    "recorded_by": "Maria Santos"
  }
}
```

### `GET /interventions/{intervention_id}`

Returns learner/class context, target competency, diagnostic/current scores, attempts, unsuccessful attempts, incorrect patterns, modules attempted, severity/status, optional Groq insight/recommendation, recorded intervention type, educator notes, actor, and timestamps.

### `PATCH /interventions/{intervention_id}`

- **Role:** Teacher/Administrator
- **Purpose:** Update severity, intervention type, educator notes, or lifecycle status.
- **Transition rules:** `Needs Intervention → In Progress → Resolved`; a resolved case may reopen to `In Progress` with a required reason.
- **Audit:** Every status transition and notes update is retained.

### `DELETE /interventions/{intervention_id}`

Archives an incorrect or duplicate case. The Teacher/Administrator action is audited. Response: `204 No Content`.

---

## 12. Groq AI Assistance

These endpoints call Groq through a protected server-side adapter. The adapter loads the existing Groq API credential and selected model from `.env`; neither can be supplied or overridden by an API request. Calls are feature-flagged, rate-limited, redacted, and advisory. They never determine answers, scores, mastery, unlocks, intervention triggers, roles, or permissions.

### `POST /ai/pattern-analysis`

Request fields: learner-safe display context, grade, competency, and incorrect attempts containing question text plus submitted and correct answers. Response fields: `misconception_summary`, `root_cause`, `recommended_remediation`, `confidence_score`, `provider` (`groq`), deployment-selected `model`, and `generated_at`.

### `POST /ai/student-feedback`

Called only after deterministic grading. Response fields: `feedback_text`, `friendly_tip`, and `encouragement`.

### `POST /ai/incorrect-answer-explanation`

Returns a bounded explanation for a completed answer check. It cannot change `is_correct` or the stored score.

### `POST /ai/teacher-insight`

Request fields: permitted learner/class context, competency, diagnostic/current scores, attempts, incorrect patterns, and completed modules. Response fields: `insight_summary`, `learning_gaps`, `suggested_intervention_type`, `recommended_actions`, `urgency_level`, `confidence_score`, and provenance metadata.

### `POST /ai/remediation-support`

Response fields: `recommended_module_title`, `targeted_practice_focus`, `visual_metaphor_advice`, and `scaffolding_steps`.

### AI failure contract

If Groq is disabled by feature policy, times out, is rate-limited, or fails safety validation, the calling learning endpoint succeeds using authored deterministic feedback. Direct AI requests may return `503 Service Unavailable` with `code: "groq_assistance_unavailable"`. No grade or progress transaction may roll back because Groq failed.

---

## 13. Teacher/Administrator Administration

All endpoints in this section require `teacher_admin`. List endpoints support pagination, search, and resource-specific filters. Mutations are audited.

### User administration

| Method | Endpoint | Purpose |
|---|---|---|
| `GET` | `/teacher-admin/users` | List users by role/status/search |
| `GET` | `/teacher-admin/users/{user_id}` | Get account and application-profile summary |
| `PATCH` | `/teacher-admin/users/{user_id}` | Change approved role/status fields |
| `DELETE` | `/teacher-admin/users/{user_id}` | Revoke sessions, then archive/delete according to retention policy |

### Competency administration

| Method | Endpoint | Purpose |
|---|---|---|
| `GET`, `POST` | `/teacher-admin/competencies` | List or create competency drafts |
| `GET`, `PATCH`, `DELETE` | `/teacher-admin/competencies/{competency_id}` | Read, update, or archive a competency |

Required create fields: `code`, `name`, `grade_id`, `domain`, `description`; optional `prerequisite_ids`. Publication fails if codes collide or referenced prerequisites are invalid.

### Module administration

| Method | Endpoint | Purpose |
|---|---|---|
| `GET`, `POST` | `/teacher-admin/modules` | List or create learning-module drafts |
| `GET`, `PATCH`, `DELETE` | `/teacher-admin/modules/{module_id}` | Read, update, or archive a learning module |

Required create fields: `competency_id`, `title`, `estimated_minutes`, `learning_objective`, `short_explanation`, ordered `rules`, ordered `worked_examples`, and `order_index`.

### Activity administration

| Method | Endpoint | Purpose |
|---|---|---|
| `GET`, `POST` | `/teacher-admin/activities` | List or create activity drafts |
| `GET`, `PATCH`, `DELETE` | `/teacher-admin/activities/{activity_id}` | Read, update, or archive an activity |

### Question-bank administration

| Method | Endpoint | Purpose |
|---|---|---|
| `GET`, `POST` | `/teacher-admin/questions` | List or create question drafts |
| `GET`, `PATCH`, `DELETE` | `/teacher-admin/questions/{question_id}` | Read, update, or archive a question |

Question create/update validates type-specific data, competency, difficulty, prompt, answer key, explanation, optional hint, and accessible visual-aid description. Only enabled question types may be published.

### Assessment administration

| Method | Endpoint | Purpose |
|---|---|---|
| `GET`, `POST` | `/teacher-admin/assessments` | List or create assessment drafts |
| `GET`, `PATCH`, `DELETE` | `/teacher-admin/assessments/{assessment_id}` | Read, update, or archive an assessment |
| `PUT` | `/teacher-admin/assessments/{assessment_id}/questions` | Replace ordered question membership atomically |
| `POST` | `/teacher-admin/assessments/{assessment_id}/publish` | Validate and publish an assessment version |

Publication validates active grade, active/published questions, question count, competency coverage, duration, and absence of broken references. Published attempts retain the content version used when submitted.

### Grade and section administration

| Method | Endpoint | Purpose |
|---|---|---|
| `GET`, `POST` | `/teacher-admin/grades` | List or create grade levels |
| `GET`, `PATCH`, `DELETE` | `/teacher-admin/grades/{grade_id}` | Read, update, or archive a grade |
| `GET`, `POST` | `/teacher-admin/sections` | List or create sections |
| `GET`, `PATCH`, `DELETE` | `/teacher-admin/sections/{section_id}` | Read, update, archive, or assign an adviser |

### Settings and operations

| Method | Endpoint | Purpose |
|---|---|---|
| `GET` | `/teacher-admin/settings` | Read effective thresholds, notifications, integrations, Groq feature flags, and a sanitized read-only model identifier; never return credentials or editable model configuration |
| `PATCH` | `/teacher-admin/settings` | Update validated global configuration |
| `GET` | `/teacher-admin/audit-events` | Search authorized audit history |
| `POST` | `/teacher-admin/students/{student_id}/diagnostic-reset` | Void/rescope an attempt and authorize a new diagnostic with a required reason |

The UI may display sanitized Groq health, the active model identifier, and latency only from trusted operational data. The model is read from `.env`; no Student or Teacher/Administrator endpoint may edit it or expose the Groq credential.

---

## 14. HTTP Status Codes

| Code | Meaning | Use |
|---:|---|---|
| `200 OK` | Success | Read/update or action returning data |
| `201 Created` | Resource created | Registration, attempt start, or create mutation |
| `204 No Content` | Success without body | Logout or archive/delete |
| `400 Bad Request` | Malformed request | Invalid syntax or incompatible parameters |
| `401 Unauthorized` | Authentication required | Missing, invalid, expired, or revoked session |
| `403 Forbidden` | Authenticated but not allowed | Ownership, section, role, or publication restriction |
| `404 Not Found` | Resource absent or intentionally hidden | Missing or out-of-scope identifier |
| `409 Conflict` | State or uniqueness conflict | Duplicate code, duplicate active attempt, or version conflict |
| `412 Precondition Failed` | Workflow gate failed | Locked content, incomplete module, or unauthorized reassessment |
| `422 Unprocessable Entity` | Validation failure | Well-formed JSON with invalid field values |
| `429 Too Many Requests` | Rate limit exceeded | Login, submission, export, or AI throttling |
| `500 Internal Server Error` | Unexpected server error | Logged with request ID; internals hidden from client |
| `503 Service Unavailable` | Groq or another dependency unavailable | Groq assistance unavailable or temporary infrastructure outage |

---

## 15. Role Access Matrix

| Capability | Student | Teacher/Administrator |
|---|---|---|
| Authenticate and view own account | Own | Own |
| Edit student preferences | Own permitted fields | School-wide management |
| View learner records | Own | School-wide |
| Enroll/update learners | No | School-wide |
| Take/autosave assessments | Own | No |
| View assessment results/history | Own | School-wide |
| Read learning content | Authorized published content | All publication states |
| Save module progress/submit activities | Own | No |
| View progress | Own | School-wide |
| View dashboards/analytics | No | School-wide |
| Manage interventions | No | School-wide |
| Export progress CSV | No | School-wide |
| Manage curriculum/classes/users | No | Yes |
| Manage thresholds, integrations, Groq feature flags | No | Yes; credential/model remain deployment-only |
| Use bounded Groq assistance | Post-answer only | School-wide learner evidence |

---

## 16. Security and Privacy Requirements

### Supabase Auth and JWT

- Prefer current asymmetric signing keys and verify FastAPI bearer tokens against the project's JWKS endpoint with issuer, audience where configured, expiry, signature, and subject validation.
- Do not place authorization decisions in user-editable metadata. Use trusted `app_metadata` and authoritative assignment tables; refresh tokens after role/assignment changes when immediate claim freshness matters.
- Never expose a Supabase secret/service-role key or the Groq API credential in `NEXT_PUBLIC_*`, browser bundles, logs, or responses. Browser code uses only the Supabase project URL and publishable key; FastAPI alone reads Groq configuration from `.env`.
- User deletion first revokes/suspends active sessions according to policy because deletion alone does not guarantee already-issued access tokens immediately disappear.

### Database and Data API

- Prefer a dedicated exposed API schema or disable direct Data API access if all data passes through FastAPI.
- Explicitly grant only required objects and operations. Grants decide whether a role can reach an object; RLS decides which rows it can access.
- Enable RLS on every table or view in an exposed schema, including tables created by SQL or migrations. `TO authenticated` alone is insufficient; policies must distinguish Student ownership from `teacher_admin` access.
- Update policies require both row-selection (`USING`) and new-row (`WITH CHECK`) constraints. Teacher/Administrator mutations must still validate referential integrity, allowed fields, and audited workflow rules.
- Views exposed to clients must use security-invoker behavior where supported or be kept in an unexposed schema with explicit restricted access.
- Avoid `SECURITY DEFINER`; when unavoidable, keep the function out of exposed schemas, perform explicit authorization inside it, and restrict execute grants.
- Newly created tables may require explicit Data API grants depending on project settings and platform defaults; migrations must declare the intended exposure rather than assume it.

### Learner data and AI

- Send the Groq adapter only the minimum evidence necessary; prefer pseudonymous learner references over names.
- Store AI provenance, confidence, and generated time when advice influences a teacher-facing recommendation. Keep human notes distinct from AI output.
- Do not include secrets, unrelated profile data, raw access tokens, or full class exports in prompts.
- Apply retention, audit, and deletion policies appropriate to learner records and school requirements.

### Testing requirements

- Test RLS and API authorization for own Student record, another Student record, Teacher/Administrator, anonymous, suspended, invalid-role, and stale-token cases.
- Test that pre-submission assessment/activity responses never contain answer keys.
- Test idempotent submissions, concurrent updates, locked resources, reassessment authorization, export scoping, CSV injection protection, and AI timeout fallback.

---

## 17. Legacy Route Migration

Earlier documentation used singular `/assessment` routes and submit verbs. New work must use the resource-oriented contract below.

| Legacy documentation route | Canonical v1.2 route |
|---|---|
| `GET /assessment/questions` | `POST /assessments/{assessment_id}/attempts` |
| `POST /assessment/submit` | `POST /assessment-attempts/{attempt_id}/submit` |
| `GET /assessment/result/{student_id}` | `GET /students/{student_id}/assessment-attempts` or `GET /assessment-attempts/{attempt_id}` |
| `GET /assessment/status/{student_id}` | `GET /students/{student_id}/diagnostic-status` |
| `PATCH /modules/{module_id}/complete` | `POST /modules/{module_id}/complete` |
| `POST /activities/{activity_id}/submit` | `POST /activity-attempts/{attempt_id}/submit` |
| `GET /activities/{activity_id}/attempts/{student_id}` | `GET /students/{student_id}/activity-attempts?activity_id={activity_id}` |
| `GET /teacher/class` | `GET /teacher-admin/dashboard` and `GET /teacher-admin/classes/{section_id}/students` |
| `GET /teacher/class/heatmap` | `GET /teacher-admin/classes/{section_id}/heatmap` |
| `GET /interventions/{student_id}` | `GET /interventions?student_id={student_id}` |
| `POST /admin/assessment/reset/{student_id}` | `POST /teacher-admin/students/{student_id}/diagnostic-reset` |

Legacy routes do not require compatibility aliases because the backend has not yet been implemented. If any route is implemented before this contract is adopted, document its deprecation window explicitly.

---

*End of API Routes Reference*

---

> **Document Owner:** MathSmart Development Team
> **Review Cycle:** Per sprint and for every API/schema change
> **Related Docs:** `SOURCE_OF_TRUTH.md` · `PROJECT.md` · `IMPLEMENTATION_PLAN.md` · `DIAGRAMS.md` · `../../ui-ux-workflow-reference/guide.md`
