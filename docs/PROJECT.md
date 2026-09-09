# MathSmart: AI-Powered Interactive Learning System
## Project Overview

> **Version:** 1.2
> **Last Updated:** September 8, 2026
> **Type:** Web-Based Adaptive Learning Platform  
> **Target Users:** Grade 6 Elementary Learners · Teacher/Administrators
> **AI Provider:** Groq; server-side API credential and model are loaded from `.env`
> **UI/UX Workflow Baseline:** `../../ui-ux-workflow-reference/`

---

## Table of Contents

1. [Project Description](#project-description)
2. [Core Features](#core-features)
3. [Experience and Workflow Baseline](#experience-and-workflow-baseline)
4. [Technology Stack](#technology-stack)
   - [Confirmed](#confirmed)
   - [Backend API](#backend-api)
   - [Database](#database)
   - [Authentication](#authentication)
   - [Python AI / Math Service](#python-ai--math-service)
   - [Deployment](#deployment)
   - [Full Stack at a Glance](#full-stack-at-a-glance)
5. [User Roles](#user-roles)
6. [Project Documents](#project-documents)
7. [Folder Structure](#folder-structure-target)

---

## Project Description

**MathSmart** is an AI-powered, web-based interactive learning system built to enhance Mathematics skills among elementary learners. The system follows a **Diagnose → Target → Practice → Monitor → Reassess** cycle, powered by the **ARAL (Assist, Remediate, Accelerate, Learn)** framework and aligned with DepEd Grade 6 Mathematics competencies.

The sibling `ui-ux-workflow-reference/` prototype defines the intended functional journey, screen coverage, interaction concepts, and general visual direction. It is not production code and is not a pixel-perfect limit. The production interface should preserve required workflow outcomes while improving accessibility, responsiveness, clarity, consistency, and usability.

The platform serves exactly two types of users:
- **Students** — who take assessments, go through personalized learning modules, and track their own progress
- **Teacher/Administrators** — who monitor learners, manage interventions, administer curriculum/content, maintain classes and accounts, and configure the system

---

## Core Features

| # | Feature | Description |
|---|---|---|
| 1 | **Student Profiling** | Records learner identity, enrollment, learning status, and preferences for individualized monitoring |
| 2 | **Mathematics Diagnostic Assessment** | Uses a fixed MVP question set, deterministic scoring, competency breakdowns, and a prioritized learning-gap report |
| 3 | **ARAL-Based Learning Modules** | Presents targeted objectives, explanations, rules, visuals, worked examples, and a linked practice activity |
| 4 | **Interactive Mathematics Activities** | Supports guided practice, deterministic answer checking, hints, explanations, retries, and completion feedback |
| 5 | **Progress Monitoring Dashboard** | Tracks diagnostic baseline, current mastery, growth, module completion, attempts, recent work, and next actions |
| 6 | **Teacher/Administrator Intervention Dashboard** | Shows class and learner performance, incorrect patterns, intervention priority, status, actions, and notes |

Supporting platform capabilities shown by the reference include student assessment history, student profile and preferences, Teacher/Administrator analytics and CSV reporting, student and class administration, learning-content management, Teacher/Administrator-controlled thresholds, and Groq feature flags. Groq credentials and model selection remain deployment configuration in the working application's `.env`.

---

## Experience and Workflow Baseline

### Reference policy

- Use `../../ui-ux-workflow-reference/src/App.tsx` for the prototype's screen composition.
- Use `../../ui-ux-workflow-reference/src/context/AppContext.tsx` for intended transitions and state concepts.
- Use `../../ui-ux-workflow-reference/src/types/mathsmart.ts` for a domain vocabulary cross-check, not as the production schema.
- Use only the matching feature under `src/modules/student/`, `src/modules/teacher-admin/`, or `src/modules/shared/` when implementing a screen.
- Do not copy the Vite runtime, client-only global state, mock data, demo role switcher, demo learner picker, simulated latency, or client-side CSV logic as production architecture.

### Student experience map

| Area | Required experience |
|---|---|
| **Login and profile** | Authenticate, show learner identity and enrollment context, allow safe preference/profile updates, and protect immutable school-managed fields |
| **Dashboard** | Show diagnostic status, one clear next action, learning-path snapshot, mastery summary, module completion, and recent activity |
| **Assessments** | Show available assessments and history; launch the diagnostic; allow question navigation; confirm submission; display competency results and the recommended path |
| **My Learning** | Show ordered targeted modules with completed, current, available, and locked states |
| **Module viewer** | Present objectives, concepts, rules/formulas, visual examples, worked examples, takeaways, and the linked activity action |
| **Activities** | Browse relevant practice, interact with supported question types, receive immediate deterministic feedback, request optional hints, retry, and view a completion summary |
| **Progress** | Compare diagnostic and current scores, show growth and status by competency, and expose module/activity history and next steps |

### Teacher/Administrator experience map

| Area | Required experience |
|---|---|
| **Dashboard** | Show class counts, average mastery, intervention volume, priority learners, competency performance, and recent activity |
| **Students** | Search and filter the roster, enroll learners when authorized, and open a drill-down with diagnostic, mastery, modules, and interventions |
| **Interventions** | Filter by severity, status, and competency; review evidence and AI-assisted insight; record a typed action and notes; move cases through Needs Intervention, In Progress, and Resolved |
| **Assessments and content** | Manage competencies, modules, activities, question bank entries, and assessment definitions with draft/published state |
| **Grades and sections** | Maintain grade/section records and adviser relationships; the MVP UI is Grade 6-first even if the schema remains extensible |
| **Reports and analytics** | Filter cohorts, inspect growth and misconception trends, and export a safe CSV summary; PDF reporting remains post-MVP |
| **Settings** | Teacher/Administrators maintain their profile and notification preferences and control global thresholds, integrations, and Groq feature availability. The Groq API credential and model are server-side `.env` values, not UI-editable settings |

The reference's combined Teacher/Admin workspace matches the production role model. Production has exactly two authorization claims: `student` and `teacher_admin`. Demo role/persona switching remains prototype-only, and all privileges are enforced server-side.

### UI quality requirements

- Use the reference as a starting point, then improve information hierarchy, readable density, responsive behavior, empty/loading/error states, keyboard operation, focus visibility, form labeling, color contrast, and screen-reader meaning.
- Do not use color alone to communicate mastery, priority, correctness, or status.
- Keep a single dominant next action on learner screens and preserve progress when navigating away from an assessment or activity.
- Confirm destructive or irreversible actions and show actionable validation messages.
- Replace prototype-only technical banners with audience-appropriate status or help content in production.

---

## Technology Stack

### Confirmed

| Layer | Technology | Reason |
|---|---|---|
| **Frontend** | Next.js (React) | SSR support, file-based routing, fast DX, production-ready |
| **Math / AI Logic** | Python | Handles diagnostic scoring, gap analysis, mastery evaluation |

---

### Backend API

> **Chosen: FastAPI (Python)**

| Option | Verdict | Notes |
|---|---|---|
| **FastAPI (Python)** ⭐ | **Recommended** | Math logic stays in Python; async, fast, auto-generates Swagger API docs |
| Next.js API Routes | Possible | Would require calling Python as a separate microservice — added complexity |
| Node.js + Python microservice | Alternative | Clean separation but two backends to deploy and maintain |

**Rationale:** Since the core math and AI logic is written in Python, keeping the backend in FastAPI eliminates a bridge layer. Next.js communicates with FastAPI via REST/HTTP calls.

---

### Database

> **Chosen: Supabase (PostgreSQL)**

| Option | Verdict | Notes |
|---|---|---|
| **Supabase** ⭐ | **Recommended** | Managed PostgreSQL + built-in auth + file storage + real-time in one platform |
| PostgreSQL (raw) | Alternative | Full control but requires separate auth and hosting setup |
| MongoDB | Not recommended | Flexible schema but overkill for structured relational learner data |
| SQLite | Dev only | Not suitable for multi-user production |

**Rationale:** Supabase cuts MVP setup time significantly. It provides auth with role support, a relational database (perfect for student → scores → modules relationships), file storage for module assets, and real-time capabilities for live dashboard updates.

---

### Authentication

> **Chosen: Supabase Auth**

| Option | Verdict | Notes |
|---|---|---|
| **Supabase Auth** ⭐ | **Recommended** | Managed identities and sessions; application metadata and policies enforce `student` and `teacher_admin` roles |
| NextAuth.js | Alternative | Handles auth at the Next.js layer; good if not using Supabase |
| JWT (custom via FastAPI) | Fallback | Full control but requires building session management from scratch |

**Role-Based Access:**
- 🎓 **Student** — Portal, modules, activities, own progress
- 👩‍🏫 **Teacher/Administrator** — Dashboards, learner management, interventions, curriculum/content administration, grades/sections, reports, and settings

---

### Python AI / Math Service

| Library | Purpose |
|---|---|
| **FastAPI** | Exposes Python math logic as REST API endpoints |
| **NumPy** | Numerical computation and array operations |
| **SymPy** | Symbolic math, equation solving and simplification |
| **scikit-learn** | Scoring models, gap analysis, simple ML classification |
| **Pandas** | Data processing for assessment results and analytics |
| **Groq SDK behind a server-side adapter** | Misconception analysis, learner-friendly feedback, and teacher-facing intervention suggestions using the model selected in `.env` |

Correctness, scores, attempt counts, mastery percentages, thresholds, unlock rules, and progress updates must be calculated by deterministic application code. Groq may explain misconceptions, personalize supportive wording, summarize patterns, and suggest interventions, but it must never be the authority for grades or access decisions. All Groq calls run through a protected server-side adapter. The Groq API credential and selected model are loaded from the working application's existing `.env`. The credential must never reach the browser, API responses, logs, or documentation; the model identifier may appear only as read-only sanitized provenance and is never client-editable.

---

### Deployment

| Layer | Platform | Notes |
|---|---|---|
| **Next.js Frontend** | Vercel | Managed Next.js deployment with Git-based CI/CD; confirm the current plan and limits before launch |
| **FastAPI Backend** | Railway / Render | Both support Python deployments; final choice depends on operational requirements and current plans |
| **Database** | Supabase | Managed PostgreSQL, authentication, storage, and policy enforcement; validate current capacity and pricing before launch |
| **Media / Module Assets** | Supabase Storage and/or Cloudinary | Select according to access control, media delivery, operations, and current pricing |

---

### Full Stack at a Glance

```
┌──────────────────────────────────────────┐
│         Next.js  (Frontend)              │  ← Hosted on Vercel
│         React · Tailwind CSS             │
└─────────────────┬────────────────────────┘
                  │ HTTP / REST
┌─────────────────▼────────────────────────┐
│         FastAPI  (Backend)               │  ← Hosted on Railway / Render
│         Python · NumPy · SymPy           │
│         scikit-learn · Pandas            │
│         Math Logic · Gap Analysis        │
└─────────────────┬────────────────────────┘
                  │
┌─────────────────▼────────────────────────┐
│   Supabase  (Database + Auth + Storage)  │  ← Managed Cloud
│   PostgreSQL · Supabase Auth             │
│   Supabase Storage (module files)        │
└──────────────────────────────────────────┘
                  +
┌──────────────────────────────────────────┐
│  Supabase Storage / Cloudinary (Media)   │
│       Module images · Diagrams           │
└──────────────────────────────────────────┘
                  + server-side AI
┌──────────────────────────────────────────┐
│  Groq AI Adapter · Model from .env       │
│  Misconception summaries · Suggestions   │
└──────────────────────────────────────────┘
```

---

## User Roles

| Role | Access Level | Key Capabilities |
|---|---|---|
| 🎓 **Student** | Own learner workspace | Authenticate, manage allowed profile fields, take assessments, follow the learning path, complete activities, and view own progress |
| 👩‍🏫 **Teacher/Administrator** (`teacher_admin`) | School-wide teaching and administration workspace | View dashboards and analytics, manage learners and interventions, administer assessments and curriculum content, maintain grades/sections and accounts, export reports, and configure permitted global settings |

---

## Project Documents

| Document | File | Description |
|---|---|---|
| **Source of Truth** | `SOURCE_OF_TRUTH.md` | Single authoritative reference for the entire project |
| **Project Overview** | `PROJECT.md` ← *this file* | High-level project description, tech stack, roles |
| **Implementation Plan** | `IMPLEMENTATION_PLAN.md` | Architecture, MVP scope, timeline, roadmap |
| **API Routes** | `API_ROUTES.md` | Full REST API documentation |
| **Diagrams** | `DIAGRAMS.md` | Flowcharts, sequence diagrams, ERD |
| **UI/UX Workflow Guide** | `../../ui-ux-workflow-reference/guide.md` | How to use the improvable reference prototype without treating it as production code |

---

## Folder Structure (Target)

> **Based on:** [nghiemledo/nextjs-project-structure](https://github.com/nghiemledo/nextjs-project-structure)

This is the approved module-first architecture. Its route, frontend-module, backend-module, and test boundaries were scaffolded on September 8, 2026. Next.js route files stay thin; feature UI, state, services, schemas, and unit tests live in independently owned modules. The landing page, root layout/styles, and a small set of UI primitives are implemented; feature directories that do not yet contain implementation remain tracked with `.gitkeep` placeholders.

```
MathSmart/
├── .env.example                  # Environment variable names only; no secrets
├── .env                          # Server-only secrets + Groq model; never print or commit
├── eslint.config.mjs             # ESLint configuration
├── next.config.mjs               # Next.js configuration
├── package.json                  # Dependencies & scripts
├── README.md                     # Project documentation
│
├── docs/                         # Project documentation files
│   ├── PROJECT.md                # Project overview & tech stack
│   ├── IMPLEMENTATION_PLAN.md    # Architecture & MVP definition
│   ├── DIAGRAMS.md               # Flowcharts, sequence diagram & ERD
│   ├── API_ROUTES.md             # Full REST API reference
│   └── SOURCE_OF_TRUTH.md        # Single authoritative reference
│
├── public/                       # Static files (images, fonts)
│   ├── images/
│   └── fonts/
│
├── src/                          # Next.js frontend
│   ├── app/                      # Thin route composition only
│   │   ├── (auth)/
│   │   │   ├── login/page.jsx
│   │   │   └── register/page.jsx
│   │   ├── (student)/student/
│   │   │   ├── layout.jsx
│   │   │   ├── dashboard/page.jsx
│   │   │   ├── my-learning/page.jsx
│   │   │   ├── my-learning/[moduleId]/page.jsx
│   │   │   ├── activities/page.jsx
│   │   │   ├── activities/[activityId]/page.jsx
│   │   │   ├── assessments/page.jsx
│   │   │   ├── assessments/[assessmentId]/page.jsx
│   │   │   ├── progress/page.jsx
│   │   │   └── profile/page.jsx
│   │   ├── (teacher-admin)/teacher/
│   │   │   ├── layout.jsx
│   │   │   ├── dashboard/page.jsx
│   │   │   ├── students/page.jsx
│   │   │   ├── students/[studentId]/page.jsx
│   │   │   ├── interventions/page.jsx
│   │   │   ├── assessments/page.jsx
│   │   │   ├── competencies/page.jsx
│   │   │   ├── learning-modules/page.jsx
│   │   │   ├── activities/page.jsx
│   │   │   ├── question-bank/page.jsx
│   │   │   ├── grades-sections/page.jsx
│   │   │   ├── reports-analytics/page.jsx
│   │   │   └── settings/page.jsx
│   │   ├── layout.jsx
│   │   ├── page.jsx
│   │   └── globals.css
│   ├── modules/                  # Independently owned vertical feature modules
│   │   ├── auth/
│   │   ├── student/
│   │   │   ├── dashboard/
│   │   │   ├── my-learning/
│   │   │   ├── activities/
│   │   │   ├── assessments/
│   │   │   ├── progress/
│   │   │   └── profile/
│   │   ├── teacher-admin/
│   │   │   ├── dashboard/
│   │   │   ├── students/
│   │   │   ├── interventions/
│   │   │   ├── assessments/
│   │   │   ├── competencies/
│   │   │   ├── learning-modules/
│   │   │   ├── activities/
│   │   │   ├── question-bank/
│   │   │   ├── grades-sections/
│   │   │   ├── reports-analytics/
│   │   │   └── settings/
│   │   └── shared/               # Reuse by two or more feature modules only
│   │       ├── components/
│   │       ├── hooks/
│   │       ├── services/
│   │       ├── schemas/
│   │       ├── constants/
│   │       └── utils/
│   ├── components/ui/            # shadcn/Radix primitives; no feature logic
│   ├── lib/                      # Infrastructure clients and framework helpers
│   ├── styles/                   # Additional global design tokens/styles
│   └── resources/                # Shared static content and illustrations
│
├── backend/                      # FastAPI backend, split by business module
│   ├── app/
│   │   ├── main.py               # FastAPI entry point
│   │   ├── config.py             # Validated server environment settings
│   │   └── dependencies.py       # Shared request dependencies
│   ├── requirements.txt          # Python dependencies
│   ├── modules/
│   │   ├── auth/
│   │   ├── students/
│   │   ├── assessments/
│   │   ├── competencies/
│   │   ├── learning_modules/
│   │   ├── activities/
│   │   ├── progress/
│   │   ├── interventions/
│   │   ├── teacher_admin/
│   │   ├── reports/
│   │   ├── settings/
│   │   └── shared/               # Database/Groq helpers without domain policy
│   └── middleware/               # JWT, request ID, and error middleware
│
└── tests/                        # Cross-module integration and end-to-end tests
    ├── integration/
    └── e2e/
        ├── student/
        └── teacher-admin/
```

Each frontend feature directory owns `components/`, `hooks/`, `services/`, `schemas/`, `utils/`, `__tests__/`, and `index.js` when those concerns are needed. Each backend business directory owns `router.py`, `schemas.py`, `service.py`, `repository.py`, and `tests/`. Empty folders are not created speculatively. A module exposes its supported surface through its `index.js` or router/service contract; other modules must not deep-import its private files.

The sibling `../../ui-ux-workflow-reference/` directory (relative to this document) is intentionally outside this repository. It is a read-only design and workflow input unless the user explicitly requests changes to it.

---

*End of Project Overview*

---
> 📌 **Document Owner:** MathSmart Development Team  
> 🔄 **Review Cycle:** Per sprint / major feature release
> 📁 **Related Docs:** `SOURCE_OF_TRUTH.md` · `IMPLEMENTATION_PLAN.md` · `API_ROUTES.md` · `DIAGRAMS.md` · `../../ui-ux-workflow-reference/guide.md`
