# F2 Reconnaissance & Reconciliation Report

> **Date:** 2026-09-06  
> **Scope:** Feature F2 — Mathematics Diagnostic Assessment  
> **Methodology:** Read-only audit of 5 documentation files against the actual repository

---

## 1. DOCUMENT AUTHORITY MAP

| Document | Apparent Role | Self-Declared Authority |
|---|---|---|
| [`SOURCE_OF_TRUTH.md`](SOURCE_OF_TRUTH.md) | Requirements, architecture, DB schema, API surface, MVP scope, folder structure | **Explicitly declares itself the single source of truth** (line 976–978, 1078: "This document is the single authoritative reference for MathSmart. All other documents provide supporting detail.") |
| [`API_ROUTES.md`](API_ROUTES.md) | Detailed REST API contracts with full request/response schemas | Supporting detail: "Full REST API documentation with request/response schemas." Content substantially mirrors SoT §7 but adds request/response JSON bodies. |
| [`DIAGRAMS.md`](DIAGRAMS.md) | Visual reference — flowcharts, sequence diagram, ERD | Supporting detail. Content is verbatim copy of diagrams already in SoT. **No unique requirements.** |
| [`IMPLEMENTATION_PLAN.md`](IMPLEMENTATION_PLAN.md) | Architecture overview, MVP definition, timeline, roadmap | Supporting detail. Contains one **contradiction** with SoT on backend choice (see §3). |
| [`PROJECT.md`](PROJECT.md) | Tech stack decisions, rationale, project description, folder structure | Supporting detail. Confirms tech stack decisions, contains folder structure identical to SoT. |

### Authority Hierarchy (based on document self-declaration)

```
SOURCE_OF_TRUTH.md  ← authoritative
    ├── API_ROUTES.md  ← detailed API contracts (extends SoT §7)
    ├── DIAGRAMS.md    ← visual duplicate of SoT diagrams
    ├── IMPLEMENTATION_PLAN.md  ← architecture & MVP scope
    └── PROJECT.md     ← tech stack rationale & folder plan
```

---

## 2. VERIFIED F2 CONTRACT

All requirements below are traced to their source document(s).

### F2 Purpose
"Identifies learners' current Mathematics skills and specific learning gaps." *(SoT §2, line 88; PROJECT.md line 45)*

### F2 Responsibilities
1. Present a timed pre-test of **30–40 questions grouped by domain** *(SoT F2 flowchart, line 163)*
2. Display question + timer, capture student's selected answer *(SoT F2 flowchart, lines 164–165)*
3. Let student submit completed assessment *(SoT F2 flowchart, line 168)*
4. Trigger scoring **per competency domain** (performed by backend AI engine) *(SoT F2 flowchart, lines 169–174; SoT sequence diagram, lines 489–491)*
5. Display **Results Summary / Learning Gap Report** *(SoT F2 flowchart, line 178)*
6. Redirect to Module Dashboard *(SoT F2 flowchart, line 179)*

### F2 Inputs
| Input | Source |
|---|---|
| Questions grouped by domain | `GET /assessment/questions` *(SoT line 186; API_ROUTES.md line 214)* |
| Authenticated student identity (Bearer JWT) | Supabase Auth *(SoT §4 line 542; PROJECT.md line 95–101)* |

### F2 Outputs
| Output | Destination |
|---|---|
| Submitted answers payload `{student_id, time_taken_minutes, answers[]}` | `POST /assessment/submit` *(API_ROUTES.md lines 252–267)* |
| Gap report + module path (from backend response) | Display to student + persist in DB *(SoT sequence diagram lines 491–495)* |

### Student Flow (from documents)
```
Student authenticated → Start Diagnostic → GET /assessment/questions 
→ Display questions with timer → Student answers each question
→ Submit all answers → POST /assessment/submit
→ Backend scores per domain → Backend generates gap report + module path
→ Frontend displays results → Redirect to Module Dashboard
```

### Required Screens/States
1. **Assessment start / intro** — entry point to diagnostic *(implied by SoT flowchart "Student Enters Diagnostic")*
2. **Question + timer display** — question-by-question with countdown *(SoT F2 flowchart line 164)*
3. **Results summary / gap report** — per-domain scores, mastery classification *(SoT F2 flowchart line 178)*

### Question Behavior
- **Count:** 30–40 questions *(SoT line 163, IMPLEMENTATION_PLAN line 219)*
- **Structure:** Grouped by domain *(SoT line 163; API_ROUTES response shows `domains[].questions[]`)*
- **Type:** MCQ (SoT calls them "adaptive questions" in workflow text, but MVP excludes adaptive difficulty — see MVP Excluded)*
- **Source:** Backend question bank via API, NOT local JSON *(SoT sequence diagram lines 484–487)*

### Timer Requirements
- **Timed assessment** *(SoT F2 workflow line 152: "timed")*
- **Specific duration:** `time_limit_minutes: 60` *(API_ROUTES.md line 225 — GET /assessment/questions response)*
- Auto-submit behavior: Not explicitly documented but implied by "timed" nature

> [!WARNING]
> The current implementation uses `TOTAL_SECONDS = 20 * 60` (20 minutes). API_ROUTES.md specifies `time_limit_minutes: 60`. SoT does not specify an exact duration. This is a **documented inconsistency** that needs a team decision.

### Answer Behavior
- Single answer per question (MCQ)
- Answers tracked with `question_id` and `selected_answer` *(API_ROUTES.md lines 258–265)*

### Submission Behavior
- Submit payload: `{student_id, time_taken_minutes, answers[{question_id, selected_answer}]}` *(API_ROUTES.md lines 253–267)*
- Requires Bearer Token authentication *(API_ROUTES.md line 249)*
- Returns `201 Created` with scoring results *(API_ROUTES.md line 270)*

### Result/Report Behavior
The backend response from `POST /assessment/submit` includes *(API_ROUTES.md lines 272–298)*:
- `assessment_id`, `total_score`, `max_score`, `percentage`
- `domain_scores[]` with per-domain: `score`, `max_score`, `percentage`, `mastery_level` ("developing" | "mastered"), `gap_identified`
- `module_path[]` — ordered list of module UUIDs for the personalized learning path

### Authentication Requirements
- All F2 endpoints require `✅ Bearer Token` *(SoT §7, API_ROUTES.md)*
- Student role required for `GET /assessment/questions` and `POST /assessment/submit`
- Results viewable by Student (own), Teacher, Admin via `GET /assessment/result/{student_id}`

### Persistence Requirements
- Assessment results saved to `ASSESSMENT` and `ASSESSMENT_DOMAIN_SCORE` tables *(SoT §6, lines 632–648)*
- Module path saved to DB *(SoT sequence diagram line 492)*

### API Requirements
| Method | Endpoint | F2 Role |
|---|---|---|
| `GET` | `/assessment/questions` | Fetch question bank |
| `POST` | `/assessment/submit` | Submit for scoring |
| `GET` | `/assessment/result/{student_id}` | View saved result |
| `GET` | `/assessment/status/{student_id}` | Check if diagnostic taken |

### Dependencies on Other Features
| Dependency | Owner Feature |
|---|---|
| Student must be authenticated + profiled | **F1** |
| `GET /students/me` for learner identity | **F1** |
| Module Dashboard (redirect target after results) | **F3** |

### Responsibilities Explicitly NOT F2
| Responsibility | Owner |
|---|---|
| Registration, login, profiling | F1 |
| Module content delivery | F3 |
| Activity scoring / mastery | F4 |
| Progress aggregation | F5 |
| Teacher views | F6 |
| Backend scoring engine (`gap_analysis.py`, `scoring.py`, `mastery.py`) | Backend infrastructure |
| Supabase DB setup | Shared backend infrastructure |
| Auth middleware | Shared backend infrastructure |

### F2 Acceptance Criteria *(from SoT §8, lines 929–930)*
- [ ] A student can register, take a diagnostic, and receive a personalized module path
- [ ] Assessment results are stored and reflected in both student and teacher dashboards

---

## 3. DOCUMENT CONTRADICTIONS

### Contradiction 1: Backend Technology

| Document | Says |
|---|---|
| **SoT** (line 540) | "FastAPI (Python)" — definitive |
| **PROJECT.md** (line 66) | "Chosen: FastAPI (Python)" — definitive |
| **IMPLEMENTATION_PLAN.md** (line 189) | "Node.js (Express) **or** Python (FastAPI)" — presents both as options |

> **Impact:** IMPLEMENTATION_PLAN.md hedges the backend choice while SoT and PROJECT.md have committed to FastAPI. Since SoT is self-declared authoritative, **FastAPI is the decided backend.**

### Contradiction 2: Timer Duration

| Document | Says |
|---|---|
| **SoT** (line 152) | "timed" — no specific duration |
| **API_ROUTES.md** (line 225) | `time_limit_minutes: 60` |
| **Current implementation** (`page.jsx` line 33) | `TOTAL_SECONDS = 20 * 60` (20 minutes) |
| **Intro screen** (`page.jsx` line 369) | "~20 minutes" |

> **Impact:** The API contract says 60 minutes. The UI says 20 minutes. These cannot both be correct. **Requires team decision.**

### Contradiction 3: Question Count

| Document | Says |
|---|---|
| **SoT** (line 163) | "30–40 Questions" |
| **API_ROUTES.md** (line 224) | `total_questions: 40` |
| **Current implementation** (`diagnosticQuestions.json`) | **20 questions** |
| **Intro screen** (`page.jsx` line 368) | Dynamically shows `total` (currently 20), says "Twenty questions" |

> **Impact:** Documented requirement is 30–40. Current data has 20. The intro screen dynamically displays the count from data, so it will be correct once questions come from the API. **Questions need to come from the backend.**

### Contradiction 4: Database Choice

| Document | Says |
|---|---|
| **SoT** (line 541), **PROJECT.md** (line 80) | "Supabase (PostgreSQL)" |
| **IMPLEMENTATION_PLAN.md** (line 190) | "PostgreSQL (relational) + Redis (session/cache)" — no mention of Supabase |

> **Impact:** SoT and PROJECT.md specify Supabase. IMPLEMENTATION_PLAN mentions raw PostgreSQL + Redis. Since SoT is authoritative, **Supabase is the decided database platform.**

### Contradiction 5: Sequence Diagram Endpoint Discrepancy

| Document | Says |
|---|---|
| **SoT sequence diagram** (line 489) | `POST /assessment/submit {learner_id, answers[]}` |
| **API_ROUTES.md** (line 253) | `POST /assessment/submit {student_id, time_taken_minutes, answers[]}` |
| **IMPLEMENTATION_PLAN.md** (line 167) | `POST /assessment/submit` (no payload detail) |

> **Impact:** The SoT sequence diagram uses `learner_id` while API_ROUTES uses `student_id` with an additional `time_taken_minutes` field. API_ROUTES.md is the detailed API contract and should be treated as authoritative for payload shape.

---

## 4. REPOSITORY REALITY

### Frontend — Verified Files

| Path | Status | Contents |
|---|---|---|
| [`src/app/(student)/diagnostic/page.jsx`](../src/app/(student)/diagnostic/page.jsx) | ✅ Exists (940 lines) | Self-contained client-side quiz with 3 screens: intro, test, report |
| [`src/data/diagnosticQuestions.json`](../src/data/diagnosticQuestions.json) | ✅ Exists (20 items) | Local static questions — **should come from API per SoT** |
| `src/config/` | ⚠️ `.gitkeep` only | No Supabase client, no API base URL config |
| `src/services/` | ⚠️ `.gitkeep` only | No API service layer |
| `src/hooks/` | ⚠️ `.gitkeep` only | No `useAuth`, no `useStudent` |
| `src/constants/` | ⚠️ `.gitkeep` only | No mastery thresholds, domains, roles |
| `src/enums/` | ⚠️ `.gitkeep` only | No `MasteryLevel`, `StudentStatus` |
| `src/models/` | ⚠️ `.gitkeep` only | No entity models |
| `src/utils/index.js` | ✅ Exists (1 line) | Empty export only |
| `src/lib/utils.js` | ✅ Exists | `export { cn } from "cn"` — shadcn utility |
| `src/components/ui/` | ✅ 4 components | `button.jsx`, `card.jsx`, `badge.jsx`, `input.jsx` (shadcn/ui New York) |

### Backend — Verified Files

| Path | Status | Contents |
|---|---|---|
| `backend/` | ⚠️ Directory structure only | **No `main.py`**, no `requirements.txt` |
| `backend/routers/` | ❌ `.gitkeep` only | No `assessment.py`, no route handlers |
| `backend/services/` | ❌ `.gitkeep` only | No `scoring.py`, `gap_analysis.py`, `mastery.py` |
| `backend/models/` | ❌ `.gitkeep` only | No Pydantic schemas |
| `backend/db/queries/` | ❌ `.gitkeep` only | No SQL queries |
| `backend/middleware/` | ❌ `.gitkeep` only | No JWT auth middleware |

### Configuration — Verified

| Item | Status | Details |
|---|---|---|
| `.env.example` | ✅ Exists | Defines `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `NEXT_PUBLIC_API_BASE_URL=http://localhost:8000/api/v1`, `NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME` |
| `.env.local` | ❌ Not found | Not committed (expected) |
| `components.json` | ✅ Exists | shadcn/ui New York style, JSX, aliases configured |
| `package.json` | ✅ Exists | Next.js 16.3.4, React 19.2.8, Tailwind v4, **no Supabase SDK installed** |

---

## 5. DOCUMENT ↔ REPOSITORY GAPS

| Area | Documentation Says | Repository Actually Has | Status |
|---|---|---|---|
| **Auth** | Supabase Auth with JWT Bearer tokens, `useAuth` hook in `src/hooks/` | No Supabase SDK in `package.json`. No auth hooks. No auth middleware. `src/hooks/` contains only `.gitkeep`. | ❌ Missing |
| **Supabase** | Supabase client in `src/config/` | `src/config/` contains only `.gitkeep`. No `@supabase/supabase-js` in `package.json`. | ❌ Missing |
| **API base URL** | `NEXT_PUBLIC_API_BASE_URL=http://localhost:8000/api/v1` | Defined in `.env.example` but no code reads it. No fetch utility, no API config module. | ⚠️ Defined but unused |
| **Questions API** | `GET /assessment/questions` returns domain-grouped question set from backend | Questions loaded from local `@/data/diagnosticQuestions.json`. No API call. No backend endpoint exists. | ❌ Missing |
| **Submit API** | `POST /assessment/submit` with `{student_id, time_taken_minutes, answers[]}` | No submission to any API. `finish()` just sets `screen = "report"`. Scoring computed client-side. | ❌ Missing |
| **Learner identity** | `GET /students/me` returns `student_id`, `learner_id` | No student identity handling anywhere. No auth context. No user state. | ❌ Missing |
| **Scoring** | Backend Python AI engine: `scoring.py`, `gap_analysis.py`, `mastery.py` | All scoring computed client-side in `useMemo` at line 221–273. No backend scoring exists. | ❌ Inverted (client vs server) |
| **Results** | Backend returns `{assessment_id, domain_scores[], module_path[]}` via `POST /assessment/submit` response | Client-side `results` object with `{correct, percent, tier, byDomain[], gaps[]}`. Different shape. No `module_path`. | ⚠️ Shape mismatch |
| **Persistence** | Results saved to `ASSESSMENT` + `ASSESSMENT_DOMAIN_SCORE` tables | Nothing persisted. All state is ephemeral React state. | ❌ Missing |
| **F3 handoff** | "Redirect to Module Dashboard" with personalized `module_path[]` | Report screen links to `/dashboard` via `<Link href="/dashboard">`. Module dashboard does not exist. | ⚠️ Link exists, target empty |

---

## 6. FEATURE OWNERSHIP / DEPENDENCIES

| Capability | Owner | Basis | Status in Repo |
|---|---|---|---|
| Student registration & login | **F1** | SoT F1 section | ❌ Not implemented |
| Authentication (Supabase Auth + JWT) | **Shared backend infra** | SoT §4–5, PROJECT.md | ❌ Not implemented |
| `GET /students/me` endpoint | **F1** / **Shared backend** | SoT F1 API table | ❌ Not implemented |
| Supabase client initialization | **Shared frontend infra** | SoT §11 folder structure: `src/config/` | ❌ Not implemented |
| API fetch/service layer | **Shared frontend infra** | SoT §11 folder structure: `src/services/` | ❌ Not implemented |
| `GET /assessment/questions` endpoint | **Backend team** (F2 related) | SoT F2 API table | ❌ Not implemented |
| `POST /assessment/submit` endpoint | **Backend team** (F2 related) | SoT F2 API table | ❌ Not implemented |
| Scoring engine (`scoring.py`) | **Backend team** | SoT §11, PROJECT.md folder structure | ❌ Not implemented |
| Gap analysis (`gap_analysis.py`) | **Backend team** | SoT §11, PROJECT.md folder structure | ❌ Not implemented |
| Mastery classification (`mastery.py`) | **Backend team** | SoT §11, PROJECT.md folder structure | ❌ Not implemented |
| Question bank seeding (30–40 items) | **Backend team / unresolved** | SoT F2 | ❌ Not implemented (only 20 local items) |
| F2 frontend page (`diagnostic/page.jsx`) | **F2** | SoT F2 | ✅ Prototype exists |
| Results display UI | **F2** | SoT F2 flowchart | ✅ Prototype exists |
| Module Dashboard (F3 redirect target) | **F3** | SoT F3 | ❌ Not implemented |
| Database tables (ASSESSMENT, etc.) | **Shared backend infra / DBA** | SoT §6 | ❌ Not implemented |

---

## 7. CURRENT F2 STATUS

### ✅ Already Working (can remain with modifications)

1. **Three-screen flow (intro → test → report)** — The flow structure matches the SoT-documented flow: student enters diagnostic, answers questions, sees results.
2. **Question rendering** — MCQ display with option selection, keyboard shortcuts, question navigator.
3. **Timer with countdown** — Functional countdown timer with auto-submit at 00:00.
4. **Progress tracking during test** — Progress bar, answered count, unanswered warnings.
5. **Client-side results calculation** — Domain breakdown, gap identification, tier assignment (useful as fallback/preview; will be replaced by backend).
6. **Review answers screen** — Post-assessment answer review with correct/incorrect highlighting and explanations.
7. **shadcn/ui component usage** — Button, Card, Badge all functional.

### ⚠️ Needs Integration

| Item | What Exists | What's Needed |
|---|---|---|
| Question source | `import rawQuestions from "@/data/diagnosticQuestions.json"` | Replace with `GET /assessment/questions` API call |
| Submission | `finish()` sets `screen = "report"` | Add `POST /assessment/submit` API call |
| Results display | Client-computed `results` object | Map from backend response shape (`domain_scores[]`, `module_path[]`) |
| Timer duration | Hardcoded `TOTAL_SECONDS = 20 * 60` | Use `time_limit_minutes` from API response (or team-decided value) |
| Post-results navigation | `<Link href="/dashboard">` | Needs to route to actual F3 module dashboard with `module_path` context |

### ❌ Incorrect According to Project Contract

| Issue | Current Behavior | Contract Requirement |
|---|---|---|
| **Scoring location** | All scoring done client-side in `useMemo` (lines 221–273) | SoT requires backend scoring via Python AI engine. Client should NOT score — it should submit answers and receive scores from the backend. |
| **ARAL tier system** | Uses 3 tiers: `accelerate` (≥75%), `remediate` (≥50%), `assist` (<50%) | SoT/API define `mastery_level` per domain as `"developing"` or `"mastered"`, not a single overall tier. The ARAL tier concept exists in the ARAL framework but is not in the API contract as a single classification. |
| **"Retake" button** | Allows unlimited retakes on the report screen | SoT implies one diagnostic per student. `ASSESSMENT.status` field and `GET /assessment/status/{student_id}` suggest a single-take model. Admin can reset via `POST /admin/assessment/reset/{student_id}`. |
| **No authentication gate** | Page loads without checking auth | All assessment endpoints require Bearer Token auth. F1 flowchart shows student must be authenticated + profiled before reaching diagnostic. |
| **Question data shape** | Local JSON with `{id, domain, competency, question, options[{id, text}], correctAnswer, explanation}` | API returns `{question_id, question_text, question_type, options[], order_index}` — **no `correctAnswer` in API response** (correct answers are server-side only). |

### 🚫 Blocked

| Blocker | Reason | Blocking Feature/Team |
|---|---|---|
| Cannot call `GET /assessment/questions` | No backend exists. No FastAPI `main.py`. No `assessment.py` router. | Backend team |
| Cannot call `POST /assessment/submit` | No backend endpoint. No scoring engine. | Backend team |
| Cannot authenticate student | No Supabase client. No `@supabase/supabase-js` in `package.json`. No auth hook. | F1 / Shared infra |
| Cannot persist results | No database tables. No Supabase connection. | Shared backend infra |
| Cannot redirect to Module Dashboard | F3 module dashboard page does not exist | F3 team |

### ⏳ Deferred (Not Required for F2 Core MVP)

- `GET /assessment/result/{student_id}` — read-back of saved results (needed for F5/F6, not F2 core flow)
- `GET /assessment/status/{student_id}` — diagnostic-taken check (routing guard, can be added after core flow works)
- PDF export of gap report
- Contextual images in questions

---

## 8. MINIMUM F2 MVP PHASE PLAN

### Phase 1: Shared Infrastructure Foundation

**Objective:** Establish the minimum plumbing required by F2 (and all other features).

**Prerequisites:** None

**Files likely affected:**
- `package.json` (add `@supabase/supabase-js`)
- `src/config/supabase.js` (new — Supabase client init)
- `src/config/api.js` (new — API base URL helper)
- `src/services/assessmentService.js` (new — F2 API calls)

**Behavior introduced:**
- Supabase client initialized from env vars
- API base URL read from `NEXT_PUBLIC_API_BASE_URL`
- `assessmentService` exports `getQuestions()`, `submitAssessment()`, `getResult()`

**Acceptance test:**
- `assessmentService.getQuestions()` can be called (will fail with connection error if backend is not running, which is expected)
- Supabase client initializes without error

**Potential blocker:**
- Team has not confirmed whether the frontend calls Supabase directly for auth or goes through FastAPI. SoT and PROJECT.md both say "Supabase Auth" but the sequence diagram shows all calls going through FastAPI.

---

### Phase 2: Auth Gate & Student Identity

**Objective:** Prevent unauthenticated access to F2 and obtain `student_id` for submissions.

**Prerequisites:** Phase 1 (Supabase client available). F1 auth flow must exist or be stubbed.

**Files likely affected:**
- `src/hooks/useAuth.js` (new or F1-provided)
- `src/app/(student)/diagnostic/page.jsx` (add auth check)
- Potentially a `(student)/layout.jsx` for shared auth guard

**Behavior introduced:**
- Page redirects to login if no valid session
- `student_id` available from session/profile for submission payload

**Acceptance test:**
- Unauthenticated user navigating to `/diagnostic` is redirected to login
- Authenticated user sees the intro screen

**Potential blocker:**
- **F1 must be implemented first**, or auth must be stubbed by the team. This is a hard dependency.

---

### Phase 3: Backend-Sourced Questions

**Objective:** Replace local `diagnosticQuestions.json` with `GET /assessment/questions` API call.

**Prerequisites:** Phase 1, Phase 2. Backend `GET /assessment/questions` endpoint must be running.

**Files likely affected:**
- `src/app/(student)/diagnostic/page.jsx` (replace `import rawQuestions` with async fetch)
- `src/data/diagnosticQuestions.json` (delete or retain as dev fallback)

**Behavior introduced:**
- Questions fetched from backend on page load (with loading/error states)
- Question data conforms to API response shape (domains, question_id, question_text, options)
- Timer duration sourced from `time_limit_minutes` in response
- `normalizeQuestions()` adapted or replaced to handle API shape

**Acceptance test:**
- Questions render from API response
- Timer matches API-provided `time_limit_minutes`
- Error state displayed if API unreachable

**Potential blocker:**
- **Backend `GET /assessment/questions` must exist.** Currently does not.

---

### Phase 4: Backend Submission & Server-Side Scoring

**Objective:** Submit answers to backend instead of scoring client-side.

**Prerequisites:** Phase 1–3. Backend `POST /assessment/submit` endpoint must be running.

**Files likely affected:**
- `src/app/(student)/diagnostic/page.jsx` (replace client `finish()` with API call, replace client `results` with server response)

**Behavior introduced:**
- On submit/timeout, `POST /assessment/submit` called with `{student_id, time_taken_minutes, answers[]}`
- Loading state during submission
- Results display maps to backend response: `domain_scores[]`, `mastery_level`, `module_path[]`
- Client-side scoring removed (or kept only as offline fallback if team decides)
- "Retake" button removed (or gated by `GET /assessment/status`)

**Acceptance test:**
- Submitting assessment returns `201 Created` with scoring results
- Domain scores display correctly from backend response
- `module_path[]` available for F3 handoff

**Potential blocker:**
- **Backend `POST /assessment/submit` must exist** with scoring engine. Currently does not.
- Backend response shape must match `API_ROUTES.md` contract.

---

### Phase 5: Result Persistence & F3 Handoff

**Objective:** Verify results are persisted and enable navigation to modules.

**Prerequisites:** Phase 4. Backend saves results to DB. F3 module dashboard has at least a stub route.

**Files likely affected:**
- `src/app/(student)/diagnostic/page.jsx` (update "Start Recommended Modules" link with `module_path` data)
- Potentially `src/app/(student)/modules/page.jsx` or similar (F3's responsibility)

**Behavior introduced:**
- Post-submit, results are confirmed persisted (backend handles this)
- "Start Recommended Modules" navigates to module dashboard with context (e.g., query params or context)
- `GET /assessment/status/{student_id}` check can gate re-entry (optional for MVP)

**Acceptance test:**
- After submission, `GET /assessment/result/{student_id}` returns the saved result
- Clicking "Start Recommended Modules" navigates to a valid route

**Potential blocker:**
- F3 module dashboard must have at least a stub route to navigate to.

---

## 9. BLOCKERS REQUIRING TEAM DECISION

| # | Blocker | Options | Who Decides |
|---|---|---|---|
| 1 | **Timer duration: 20 min vs 60 min** | a) Use API_ROUTES spec (60 min), b) Use current UI (20 min), c) Timer controlled by backend `time_limit_minutes` | Team lead / F2 owner |
| 2 | **Question count: 20 vs 30–40** | a) Backend seeds 30–40 questions per SoT, b) Accept 20 as MVP minimum | Team lead / content author |
| 3 | **Auth approach for frontend** | a) Frontend uses Supabase JS SDK directly for auth, passes token to FastAPI, b) Frontend does all auth through FastAPI which wraps Supabase | Team lead / backend team |
| 4 | **Backend must exist before F2 integration** | a) Backend team builds `GET /assessment/questions` and `POST /assessment/submit` first, b) F2 frontend mocks the API temporarily, c) Both in parallel | Team lead |
| 5 | **Client-side scoring: keep as fallback?** | a) Remove entirely (strict SoT compliance), b) Keep as offline/demo mode | F2 owner |
| 6 | **ARAL tier vs per-domain mastery_level** | a) Display backend's per-domain `mastery_level` only, b) Keep the overall tier classification as a frontend-computed convenience | F2 owner + SoT author |
| 7 | **Retake policy** | a) One diagnostic per student (SoT implied), admin resets, b) Allow self-service retake | Team lead |
| 8 | **`learner_id` vs `student_id` in submission** | SoT sequence diagram says `learner_id`, API_ROUTES says `student_id`. Which field name does the backend expect? | Backend team |

---

## 10. WHAT WE SHOULD NOT TOUCH YET

| Item | Reason |
|---|---|
| **Broad component refactoring** (splitting `page.jsx` into smaller components) | Not required for F2 MVP functionality. Can be done in polish phase. |
| **Custom hooks (`useAssessment`, `useTimer`)** | Premature abstraction before backend integration shape is confirmed. |
| **State management library (Zustand, Jotai, etc.)** | No documented requirement. React state is sufficient for F2's single-page flow. |
| **Visual redesign of diagnostic UI** | Current UI is polished and functional. No documented requirement for changes. |
| **Second diagnostic route or re-assessment flow** | Not in MVP scope. |
| **Contextual images in questions** | Not in MVP scope ("text/image" refers to module content, not diagnostic questions). |
| **F1 auth implementation** | F1 owner's responsibility. F2 should consume it, not build it. |
| **F3/F4/F5/F6 pages** | Out of F2 scope entirely. |
| **Backend infrastructure (FastAPI app, routers, models, DB)** | Backend team's responsibility. F2 frontend should code against the documented API contract and test against the real backend when available. |
| **Database schema creation / Supabase table setup** | DBA or backend team responsibility. |
| **Question bank content authoring (beyond the 20 seed items)** | Content/curriculum team responsibility. |
| **Admin assessment reset feature** | F6/Admin scope. |
| **`src/utils/`, `src/constants/`, `src/enums/` population** | These are project-wide concerns. F2 should only add what it specifically needs. |

---

*End of F2 Reconnaissance & Reconciliation Report*
