# MathSmart: AI-Powered Interactive Learning System
## Project Overview

> **Version:** 1.0  
> **Last Updated:** September 2026  
> **Type:** Web-Based Adaptive Learning Platform  
> **Target Users:** Grade 7 Elementary Learners · Mathematics Teachers · School Admins

---

## Table of Contents

1. [Project Description](#project-description)
2. [Core Features](#core-features)
3. [Technology Stack](#technology-stack)
   - [Confirmed](#confirmed)
   - [Backend API](#backend-api)
   - [Database](#database)
   - [Authentication](#authentication)
   - [Python AI / Math Service](#python-ai--math-service)
   - [Deployment](#deployment)
   - [Full Stack at a Glance](#full-stack-at-a-glance)
4. [User Roles](#user-roles)
5. [Project Documents](#project-documents)
6. [Folder Structure (Planned)](#folder-structure-planned)

---

## Project Description

**MathSmart** is an AI-powered, web-based interactive learning system built to enhance Mathematics skills among elementary learners. The system follows a **Diagnose → Remediate → Practice → Monitor** cycle, powered by the **ARAL (Assist, Remediate, Accelerate, Learn)** framework fully aligned with DepEd Grade 7 Mathematics competencies.

The platform serves three types of users:
- **Students** — who take assessments, go through personalized learning modules, and track their own progress
- **Teachers** — who monitor class performance and identify learners needing intervention
- **Admins** — who manage content, users, and system configuration

---

## Core Features

| # | Feature | Description |
|---|---|---|
| 1 | **Student Profiling** | Records learner information for individualized monitoring |
| 2 | **Mathematics Diagnostic Assessment** | Identifies current Math skills and learning gaps |
| 3 | **ARAL-Based Learning Modules** | Targeted modules aligned with identified gaps and Grade 7 competencies |
| 4 | **Interactive Mathematics Activities** | Practice and application activities to reinforce concepts |
| 5 | **Progress Monitoring Dashboard** | Tracks learner performance, modules, results, and competency progress |
| 6 | **Teacher Intervention Dashboard** | Shows class-wide and individual performance for targeted support |

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
| **Supabase Auth** ⭐ | **Recommended** | Free, handles sessions, supports roles (Student / Teacher / Admin) |
| NextAuth.js | Alternative | Handles auth at the Next.js layer; good if not using Supabase |
| JWT (custom via FastAPI) | Fallback | Full control but requires building session management from scratch |

**Role-Based Access:**
- 🎓 **Student** — Portal, modules, activities, own progress
- 👩‍🏫 **Teacher** — Class dashboard, individual reports, intervention notes
- ⚙️ **Admin** — User management, content upload, competency config

---

### Python AI / Math Service

| Library | Purpose |
|---|---|
| **FastAPI** | Exposes Python math logic as REST API endpoints |
| **NumPy** | Numerical computation and array operations |
| **SymPy** | Symbolic math, equation solving and simplification |
| **scikit-learn** | Scoring models, gap analysis, simple ML classification |
| **Pandas** | Data processing for assessment results and analytics |
| **OpenAI API** *(post-MVP)* | Step-by-step hint generation, natural language explanations |

---

### Deployment

| Layer | Platform | Notes |
|---|---|---|
| **Next.js Frontend** | Vercel | Free tier, auto CI/CD from GitHub, edge-optimized |
| **FastAPI Backend** | Railway / Render | Both support Python natively; free tiers available |
| **Database** | Supabase | Managed PostgreSQL; free tier sufficient for MVP scale |
| **Media / Module Assets** | Cloudinary | Images and diagrams for modules; generous free tier |

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
│       Cloudinary  (Media Assets)         │
│       Module images · Diagrams           │
└──────────────────────────────────────────┘
```

---

## User Roles

| Role | Access Level | Key Capabilities |
|---|---|---|
| 🎓 **Student** | Portal only | Register, take diagnostic, access modules, do activities, view own progress |
| 👩‍🏫 **Teacher** | Teacher Dashboard | View class/individual dashboards, set interventions, download reports |
| ⚙️ **Admin** | Admin Panel | Manage users, upload content, configure competency mappings |

---

## Project Documents

| Document | File | Description |
|---|---|---|
| **Source of Truth** | `SOURCE_OF_TRUTH.md` | Single authoritative reference for the entire project |
| **Project Overview** | `PROJECT.md` ← *this file* | High-level project description, tech stack, roles |
| **Implementation Plan** | `IMPLEMENTATION_PLAN.md` | Architecture, MVP scope, timeline, roadmap |
| **API Routes** | `API_ROUTES.md` | Full REST API documentation |
| **Diagrams** | `DIAGRAMS.md` | Flowcharts, sequence diagrams, ERD |

---

## Folder Structure

> **Based on:** [nghiemledo/nextjs-project-structure](https://github.com/nghiemledo/nextjs-project-structure)

```
MathSmart/
├── .env.local                    # Environment variables (local dev)
├── .env.production               # Environment variables (production)
├── .eslintrc.json                # ESLint configuration
├── next.config.mjs               # Next.js configuration
├── package.json                  # Dependencies & scripts
├── README.md                     # Project documentation
│
├── docs/                         # Project documentation files
│   ├── PROJECT.md                # Project overview & tech stack
│   ├── IMPLEMENTATION_PLAN.md    # Architecture & MVP definition
│   ├── SYSTEM_WORKFLOW.md        # Feature workflows
│   ├── DIAGRAMS.md               # Flowcharts, sequence diagram & ERD
│   ├── API_ROUTES.md             # Full REST API reference
│   └── SOURCE_OF_TRUTH.md        # Single authoritative reference
│
├── public/                       # Static files (images, fonts)
│   ├── images/
│   └── fonts/
│
├── src/                          # Frontend source code (Next.js)
│   ├── app/                      # App Router — page routing
│   │   ├── (auth)/               # Auth routes (login, register)
│   │   ├── (student)/            # Student portal routes
│   │   │   ├── dashboard/
│   │   │   ├── diagnostic/
│   │   │   ├── modules/[moduleId]/
│   │   │   ├── activities/[activityId]/
│   │   │   └── progress/
│   │   ├── (teacher)/            # Teacher dashboard routes
│   │   │   ├── class/
│   │   │   ├── heatmap/
│   │   │   ├── students/[studentId]/
│   │   │   └── interventions/
│   │   ├── (admin)/              # Admin panel routes
│   │   │   ├── users/
│   │   │   ├── content/
│   │   │   └── competencies/
│   │   ├── layout.jsx
│   │   ├── page.jsx
│   │   └── globals.css
│   ├── components/               # Reusable UI components
│   │   ├── common/               # Button, Modal, Card
│   │   ├── forms/                # Input, Select, FormField
│   │   ├── charts/               # ProgressRing, Heatmap
│   │   ├── layout/               # Navbar, Sidebar, Footer
│   │   └── modules/              # ModuleCard, ActivityQuestion
│   ├── config/                   # API url, Supabase client, site metadata
│   ├── constants/                # Roles, mastery thresholds, domains
│   ├── enums/                    # MasteryLevel, StudentStatus, ARALLevel
│   ├── hooks/                    # useAuth, useStudent, useModules, useProgress
│   ├── models/                   # Entity models (Student, Teacher, Module, etc.)
│   ├── services/                 # API service layer (one per API domain)
│   ├── styles/                   # CSS variables, component styles
│   ├── resources/                # Static content, illustrations
│   └── utils/                    # Formatters, validators, calculations
│
├── backend/                      # FastAPI Python backend
│   ├── main.py                   # FastAPI entry point
│   ├── requirements.txt          # Python dependencies
│   ├── routers/                  # Route handlers per feature
│   │   ├── auth.py
│   │   ├── students.py
│   │   ├── assessment.py
│   │   ├── modules.py
│   │   ├── activities.py
│   │   ├── progress.py
│   │   ├── teacher.py
│   │   └── admin.py
│   ├── services/                 # Business logic
│   │   ├── gap_analysis.py       # AI gap analysis engine
│   │   ├── scoring.py            # Diagnostic scoring
│   │   └── mastery.py            # Mastery threshold evaluation
│   ├── models/                   # Pydantic schemas
│   ├── db/                       # Supabase client + SQL queries
│   └── middleware/               # JWT auth middleware
│
└── tests/                        # Test files
    ├── frontend/
    └── backend/
```

---

*End of Project Overview*

---
> 📌 **Document Owner:** MathSmart Development Team  
> 🔄 **Review Cycle:** Per sprint / major feature release
