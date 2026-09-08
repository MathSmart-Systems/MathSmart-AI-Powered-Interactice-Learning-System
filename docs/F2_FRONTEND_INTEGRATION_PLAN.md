# F2 Frontend Integration Plan

> **Scope:** Align existing F2 frontend prototype (`src/app/(student)/diagnostic/page.jsx`) with the documented contract in `SOURCE_OF_TRUTH.md`, `API_ROUTES.md`, and `F2_RECONNAISSANCE_REPORT.md`.
> **Strategy:** Frontend-first. Build the page against a mock API adapter matching `API_ROUTES.md` exact shapes, so the backend can be swapped in later without frontend changes.
> **Authority for payload shapes:** `API_ROUTES.md` (report §3, Contradiction 5).

---

## Guiding decisions (resolved from report §9)

| # | Decision | Basis |
|---|---|---|
| 1 | `student_id` (not `learner_id`) in submit payload | `API_ROUTES.md` line 253 |
| 2 | Timer from `time_limit_minutes` response field, fallback 60 | `API_ROUTES.md` line 225 |
| 3 | Question count 30–40 from API, fallback 40 | SoT line 163 |
| 4 | Per-domain `mastery_level` ("developing" \| "mastered") + `gap_identified`, not single ARAL tier | `API_ROUTES.md` lines 278–296 |
| 5 | No correct answers from API — scoring server-side only | `API_ROUTES.md` line 235 (`options[]` strings, no `correctAnswer`) |
| 6 | Single-take: remove "Retake" self-service button | `GET /assessment/status` + admin reset contract |
| 7 | Auth stub behind a hook, swap for Supabase later | Phase 3 |

---

## Phase 0 — Contract fixtures (no backend)

**Goal:** Create the API-shape data the page will consume, so every later slice is testable immediately.

**Files:**
- `src/data/diagnostic.mock.json` — re-shape existing 20 items into `API_ROUTES.md` `GET /assessment/questions` shape:
  ```json
  {
    "assessment_version": "v1.0",
    "total_questions": 40,
    "time_limit_minutes": 60,
    "domains": [
      { "domain": "Number Sense", "competency_id": "uuid-comp-1",
        "questions": [ { "question_id": "uuid-q1", "question_text": "...",
          "question_type": "mcq", "options": ["a","b","c","d"], "order_index": 1 } ] }
    ]
  }
  ```
- `src/data/submit.mock.json` — example `POST /assessment/submit` response:
  `{ assessment_id, total_score, max_score, percentage, domain_scores[{domain, competency_id, score, max_score, percentage, mastery_level, gap_identified}], module_path[] }`

**Slices (independent, order irrelevant):**
- S0.1 — Expand question bank to 40 items across 4 domains (content authoring; can start with the 20 + 20 new).
- S0.2 — Define the two mock JSON blobs above.

**Acceptance:** Both files parse; mock question shape has zero `correctAnswer` keys (enforces server-only scoring).

---

## Phase 1 — Service layer (adapter pattern)

**Goal:** Introduce the single seam where mock ↔ real backend switches.

**Files:**
- `src/config/api.js` — `API_BASE_URL` from `NEXT_PUBLIC_API_BASE_URL` (exists in `.env.example`).
- `src/services/assessmentService.js` — exports `getQuestions()`, `submitAssessment(payload)`, `getStatus(studentId)`. Internally reads a flag (`NEXT_PUBLIC_USE_MOCK === "true"`) to return mock JSON vs `fetch`.

**Slices:**
- S1.1 — `api.js` base URL helper.
- S1.2 — `assessmentService.getQuestions()` returning mock with simulated latency.
- S1.3 — `assessmentService.submitAssessment()` returning mock scoring.
- S1.4 — `assessmentService.getStatus()` returning `{ diagnostic_taken: false }`.

**Acceptance:** All three functions resolve mock data; flipping `NEXT_PUBLIC_USE_MOCK` to false makes them hit `fetch` (fails until backend exists — expected).

---

## Phase 2 — Page rewire: fetch + data normalization

**Goal:** Replace static JSON import with service call; adapt `normalizeQuestions` to the API shape (`domains[].questions[]`, `question_id`, `question_text`, `options[]`).

**Files:** `src/app/(student)/diagnostic/page.jsx`

**Slices:**
- S2.1 — Add loading / error states (API pending, unreachable).
- S2.2 — Replace `import rawQuestions` with `useEffect` fetch via `assessmentService`.
- S2.3 — Rewrite `normalizeQuestions` to flatten `domains[].questions[]`, map `question_id→id`, `question_text→prompt`, `options[] (strings)→ {key,label}`.
- S2.4 — Derive `total` and timer from response `total_questions` / `time_limit_minutes` (remove hardcoded `TOTAL_SECONDS = 20*60`).
- S2.5 — Intro screen copy driven by `total` and `time_limit_minutes` (remove hardcoded "Twenty questions", "~20 minutes").

**Acceptance:** Page renders 40 questions from mock, timer counts down from 60:00, intro shows dynamic numbers.

---

## Phase 3 — Auth stub + student identity

**Goal:** Obtain a `student_id` for submission without blocking on F1.

**Files:**
- `src/hooks/useAuth.js` — returns `{ studentId, learnerId, loading }`; stub returns a hardcoded dev ID when mock mode is on.
- `src/app/(student)/diagnostic/page.jsx` — consume hook; gate (redirect/notice) if no session in real mode.

**Slices:**
- S3.1 — `useAuth` stub.
- S3.2 — Page gates on auth (mock bypasses).
- S3.3 — `student_id` threaded into submit payload.

**Acceptance:** In mock mode page loads with a dev `student_id`; real mode redirects unauthenticated users (switch-ready).

---

## Phase 4 — Submission + server-shaped results

**Goal:** Submit answers to service; render `POST /assessment/submit` response shape instead of client-computed scoring.

**Files:** `src/app/(student)/diagnostic/page.jsx`

**Slices:**
- S4.1 — Build payload `{ student_id, time_taken_minutes, answers[{question_id, selected_answer}] }` from component state (`answers` stores option label now, since API sends `selected_answer` string).
- S4.2 — `finish()` becomes async: call `submitAssessment`, show submitting state, set report from response.
- S4.3 — Map response → report UI: `total_score/max_score/percentage`, per-domain bars from `domain_scores[]`, gaps from `gap_identified === true`, `mastery_level` badge.
- S4.4 — Remove client-side `results` `useMemo` scoring + `tierFor`/`TIERS` overall tier (keep only per-domain mastery).
- S4.5 — Retake button removed (or gated by `getStatus` — single-take contract).

**Acceptance:** Submit returns 201-shaped mock; report renders `domain_scores`, `mastery_level`, `module_path`; no client scoring.

---

## Phase 5 — F3 handoff

**Goal:** Navigate to module dashboard carrying `module_path`.

**Files:** `src/app/(student)/diagnostic/page.jsx` (F3 route is out of F2 scope).

**Slices:**
- S5.1 — "Start Recommended Modules" passes `module_path[]` (query param or context).
- S5.2 — Link target updated to `/(student)/modules` (F3 stub route).

**Acceptance:** Post-submit navigation carries the module path; lands on a valid (even stub) route.

---

## Backend-swap checklist (later)

1. Implement `GET /assessment/questions`, `POST /assessment/submit`, `GET /assessment/status/{id}` in FastAPI per `API_ROUTES.md`.
2. Set `NEXT_PUBLIC_USE_MOCK=false` and populate `.env.local`.
3. Replace `useAuth` stub with Supabase session → JWT in `assessmentService` headers.
4. Delete `src/data/diagnostic.mock.json` + `submit.mock.json` (or keep behind a demo flag).

---

## Explicitly deferred (per report §10)

- Component splitting / custom hooks — after integration shape is confirmed.
- State library, visual redesign, contextual images, F1/F3/F4/F5/F6 work — out of F2 scope.
- PDF export, `GET /assessment/result` read-back — not core F2 flow.