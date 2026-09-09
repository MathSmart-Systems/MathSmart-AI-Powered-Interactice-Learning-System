# MathSmart: Diagrams Reference
## Flowcharts, Sequence Diagram & Entity Relationship Diagram

> **Version:** 1.2 | **Last Updated:** September 8, 2026
> **Curriculum:** DepEd Grade 6 Mathematics
> **AI Provider:** Groq; server-side API credential and model are loaded from `.env`
> **UI/UX Workflow Baseline:** `../../ui-ux-workflow-reference/`

---

## Table of Contents

1. [Master End-to-End Flowchart](#1-master-end-to-end-flowchart)
2. [Experience Navigation Map](#2-experience-navigation-map)
3. [Feature Flowcharts](#3-feature-flowcharts)
   - [F1 — Student Profiling](#f1--student-profiling)
   - [F2 — Diagnostic Assessment](#f2--diagnostic-assessment)
   - [F3 — ARAL Learning Modules](#f3--aral-learning-modules)
   - [F4 — Interactive Activities](#f4--interactive-activities)
   - [F5 — Student Progress Dashboard](#f5--student-progress-dashboard)
   - [F6 — Teacher/Administrator Intervention Dashboard](#f6--teacheradministrator-intervention-dashboard)
   - [F7 — Teacher/Administrator Curriculum and Class Administration](#f7--teacheradministrator-curriculum-and-class-administration)
4. [System Sequence Diagram](#4-system-sequence-diagram)
5. [AI Responsibility Boundary](#5-ai-responsibility-boundary)
6. [Entity Relationship Diagram (ERD)](#6-entity-relationship-diagram-erd)
   - [ERD Diagram](#erd-diagram)
   - [Entity Descriptions](#entity-descriptions)
   - [Relationships Summary](#relationships-summary)

---

## 1. Master End-to-End Flowchart

```mermaid
flowchart TD
    START([Student Opens MathSmart]) --> REG{Has Account?}
    REG -->|No| SIGNUP[Register & Fill Profile]
    REG -->|Yes| LOGIN[Login]
    SIGNUP --> PROFILE[Complete Student Profile]
    LOGIN --> CHECK{Profile Complete?}
    PROFILE --> DIAG_GATE
    CHECK -->|No| PROFILE
    CHECK -->|Yes| DIAG_GATE{Diagnostic Taken?}

    DIAG_GATE -->|No| DIAG[Take Diagnostic Assessment]
    DIAG_GATE -->|Yes| DASH[Open Student Dashboard]

    DIAG --> SCORE[Deterministically Score Per Competency]
    SCORE --> GAP[Learning Gap Report Generated]
    GAP --> PATH[Targeted Learning Path Created]
    PATH --> DASH
    DASH --> MODULES[Access ARAL Learning Modules]

    MODULES --> MOD_CONTENT[Study Module Content]
    MOD_CONTENT --> ACTIVITY[Complete Module Activity]
    ACTIVITY --> PASS{Score Meets Configured Pass Threshold?}

    PASS -->|Yes| MASTERY[Recalculate Competency Progress]
    PASS -->|No| RETRY{Below Intervention Trigger?}
    RETRY -->|Yes| ACTIVITY
    RETRY -->|No| FLAG[Create or Update Intervention Case]

    MASTERY --> MORE{Recommended Next Step?}
    MORE -->|Yes| MODULES
    MORE -->|Reassess| REASSESS[Authorized Reassessment]
    REASSESS --> SCORE
    MORE -->|Path complete| COMPLETE[Learning Path Complete]

    MASTERY --> S_DASH[Update Dashboard and Progress]
    FLAG --> T_DASH[Update Teacher/Admin Dashboard]
    COMPLETE --> T_DASH

    T_DASH --> TEACHER_ADMIN([Teacher/Administrator Reviews Evidence])
    TEACHER_ADMIN --> NOTE[Record Typed Intervention and Notes]
    NOTE --> STATUS[Track In Progress or Resolved]
    STATUS --> STUDENT([Student Receives Guidance])
```

---

## 2. Experience Navigation Map

```mermaid
flowchart LR
    subgraph STUDENT_WS["Student Workspace"]
        SL[Login/Register] --> SD[Dashboard]
        SD --> SA[Assessments]
        SA --> DP[Diagnostic Player]
        DP --> DR[Diagnostic Results]
        DR --> ML[My Learning]
        SD --> ML
        ML --> MV[Module Viewer]
        MV --> AL[Activities]
        AL --> AP[Activity Player]
        AP --> AC[Activity Completion]
        AC --> SD
        SD --> SP[Progress]
        SD --> PR[Profile]
    end

    subgraph TEACHER_ADMIN_WS["Teacher/Administrator Workspace"]
        TD[Dashboard] --> ST[Students]
        ST --> LD[Learner Drill-down]
        TD --> IN[Interventions]
        LD --> IN
        TD --> AS[Assessments]
        TD --> CO[Competencies]
        TD --> MO[Learning Modules]
        TD --> AT[Activities]
        TD --> QB[Question Bank]
        TD --> GS[Grades / Sections]
        TD --> AN[Reports / Analytics]
        TD --> SE[Settings / Groq Feature Flags]
    end
```

The reference's combined Teacher/Admin workspace matches the production role model. Production replaces the prototype state machine with authenticated Next.js routes and persisted server data while enforcing the two canonical claims: `student` and `teacher_admin`.

---

## 3. Feature Flowcharts

### F1 — Student Profiling

```mermaid
flowchart TD
    A([Student Opens App]) --> B{Has Account?}
    B -->|No| C[Click Register]
    B -->|Yes| D[Login]
    C --> E[Fill Profile Form\nName · Grade · Section · School]
    E --> F{All Fields Valid?}
    F -->|No ❌| G[Show Validation Errors]
    G --> E
    F -->|Yes ✅| H[Create Supabase Auth Identity]
    H --> I[Generate Learner ID + Save Linked Profile]
    I --> J[Send Verification or Welcome Message]
    J --> K[Redirect to Diagnostic Assessment]
    D --> L{Profile Complete?}
    L -->|No| E
    L -->|Yes| M{Diagnostic Taken?}
    M -->|No| K
    M -->|Yes| N[Go to Module Dashboard]
```

---

### F2 — Diagnostic Assessment

```mermaid
flowchart TD
    A([Student Enters Diagnostic]) --> B[Load Published Fixed Question Set\nGrouped by Competency]
    B --> C[Display Question + Progress + Navigator]
    C --> D[Student Selects Answer]
    D --> E{Navigate or Submit?}
    E -->|Previous / Next / Jump| C
    E -->|Submit| F{Unanswered Items?}
    F -->|Yes| G[Warn and Confirm]
    F -->|No| H[Confirm Submission]
    G --> H
    H --> I[Deterministically Score Per Competency]
    I --> J{Apply Competency Bands}
    J -->|80–100| K[Mastered]
    J -->|50–79| L[Developing]
    J -->|0–49| M[Needs Improvement]
    K & L & M --> N[Build Results and Gap Report]
    N --> O[Map Non-Mastered Competencies to Modules]
    O --> P[Save Attempt, Responses, Results, and Path]
    P --> Q[Show Results Summary]
    Q --> R[Start Recommended Module or Return to Dashboard]
```

---

### F3 — ARAL Learning Modules

```mermaid
flowchart TD
    A([Student Opens Module Dashboard]) --> B[Display Unlocked Modules\nbased on Gap Report]
    B --> C[Student Selects Module]
    C --> D[Show: Learning Objectives]
    D --> E[Show: Concept Explanation]
    E --> F[Show: Worked Examples]
    F --> G[Show: Key Takeaways]
    G --> H{All Sections Completed?}
    H -->|No| E
    H -->|Yes ✅| I[Mark Module as Complete]
    I --> J[Unlock Module Activity]
    J --> K[Update Progress Tracker]
    K --> L{More Modules in Path?}
    L -->|Yes| B
    L -->|No| M[🎉 Module Path Complete]
```

---

### F4 — Interactive Activities

```mermaid
flowchart TD
    A([Student Clicks Start Activity]) --> B[Load Activity Questions\nfor Completed Module]
    B --> C[Display Question]
    C --> D[Student Submits Answer]
    D --> E[Show Instant Feedback\nCorrect or Incorrect + Explanation]
    E --> F{More Questions?}
    F -->|Yes| C
    F -->|No| G[Calculate Total Score\nScore = Correct / Total × 100]
    G --> L[Log Attempt, Score, and Time]
    L --> H{Score ≥ Configured Pass Threshold?}
    H -->|Yes| I[Recalculate Competency Band]
    H -->|No| J{Below Automatic Intervention Trigger?}
    J -->|Yes — Retry| B
    J -->|No — Max Reached| K[🚩 Flag for Teacher/Admin Intervention]
    I --> M[Update Student Dashboard]
    K --> M
    I --> N[Update Teacher/Admin Dashboard]
    K --> N
    M & N --> O([Return to Module Dashboard])
```

---

### F5 — Student Progress Dashboard

```mermaid
flowchart TD
    A([Student Clicks My Progress]) --> B[Fetch All Records\nby Learner ID]
    B --> C[Aggregate Diagnostic Scores]
    B --> D[Aggregate Module Completion %]
    B --> E[Aggregate Activity Scores\n& Attempt Counts]
    C & D & E --> F[Render Progress Dashboard]
    F --> G[Show Competency Mastery\nNeeds Improvement / Developing / Mastered]
    F --> H[Show Module Cards\nComplete / In Progress / Locked]
    F --> I[Show Activity Score History]
    F --> J[Show Recommended Next Action]
    J --> K{Student Acts on Recommendation?}
    K -->|Yes| L[Navigate to Module or Activity]
    K -->|No| M([Stay on Dashboard])
```

---

### F6 — Teacher/Administrator Intervention Dashboard

```mermaid
flowchart TD
    A([Teacher/Administrator Logs In]) --> B[Load School/Class Roster]
    B --> C[Display Overview\nTotal · Active · Needs Support · Improving · Mastered]
    C --> D{Teacher/Admin Action?}
    D -->|View Heatmap| E[Open Competency Heatmap\nClass × Domain Grid]
    D -->|Filter Students| F[Search and Filter\nGrade / Section / Status]
    D -->|View Individual| G[Open Student Drill-Down Report]
    E --> H[Identify Class-Wide Weak Domains]
    F --> I[Select Student to Review]
    G --> J[View Diagnostic · Growth · Attempts · Patterns · Modules]
    H & I & J --> K[Open Intervention Evidence]
    K --> L[Review Groq Insight and Suggested Actions]
    L --> M[Select Intervention Type + Add Educator Notes]
    M --> N[Save as In Progress + Audit Actor and Time]
    N --> O{Outcome Reviewed?}
    O -->|Continue| K
    O -->|Goal Met| P[Resolve Case + Timestamp]
    P --> Q([Continue Monitoring or Reassess])
```

---

### F7 — Teacher/Administrator Curriculum and Class Administration

```mermaid
flowchart TD
    A([Teacher/Administrator Opens Management]) --> B{Choose Area}
    B -->|Curriculum| C[Competencies / Modules / Activities / Questions / Assessments]
    B -->|Classes| D[Grades / Sections / Adviser Assignments]
    B -->|Users| E[Accounts / Roles / Status]
    B -->|Settings| F[Thresholds / Notifications / Groq Feature Flags]
    C --> G[Create or Edit Draft]
    G --> H{Validation Passes?}
    H -->|No| I[Show Field and Relationship Errors]
    I --> G
    H -->|Yes| J[Publish or Archive]
    D --> K[Validate Enrollment and Adviser Scope]
    E --> L[Apply RBAC Policy and Audit Change]
    F --> M[Validate Safe Range and Audit Change]
    J & K & L & M --> N[Persist + Invalidate Relevant Cache]
    N --> O[Updated Data Appears in Authorized Workspaces]
```

---

## 4. System Sequence Diagram

```mermaid
sequenceDiagram
    actor S as 🎓 Student
    actor T as 👩‍🏫 Teacher/Administrator
    participant FE as Next.js Frontend
    participant API as FastAPI Backend
    participant RULES as Deterministic Rules
    participant AI as Groq AI Adapter
    participant AUTH as Supabase Auth
    participant DB as Supabase (PostgreSQL)

    Note over S, DB: ── REGISTRATION & PROFILING ──
    S->>FE: Register + Fill Profile Form
    FE->>API: POST /auth/register
    API->>AUTH: Create identity and verification flow
    AUTH-->>API: user_id + verification state
    API->>DB: Insert student profile → Generate Learner ID
    DB-->>API: Learner ID confirmed
    API-->>FE: 201 Created + next step
    FE-->>S: Verify/sign in → Diagnostic status routing

    Note over S, DB: ── DIAGNOSTIC ASSESSMENT ──
    S->>FE: Start Diagnostic
    FE->>API: POST /assessments/{assessment_id}/attempts
    API->>DB: Fetch question bank by domain
    DB-->>API: Questions[]
    API-->>FE: Render question set
    S->>FE: Submit all answers
    FE->>API: POST /assessment-attempts/{attempt_id}/submit {answers[]}
    API->>RULES: Grade responses per competency
    RULES-->>API: {competency_results[], gap_report, learning_path[]}
    API->>DB: Save assessment result + module path
    DB-->>API: Saved
    API-->>FE: Gap report + module path
    FE-->>S: Show results → Redirect to Modules

    Note over S, DB: ── MODULE STUDY ──
    S->>FE: Open Module
    FE->>API: GET /modules/{module_id}
    API->>DB: Fetch module content
    DB-->>API: {objectives, content, examples, summary}
    API-->>FE: Render module
    S->>FE: Mark all sections complete
    FE->>API: POST /modules/{module_id}/complete
    API->>DB: Update completion status
    DB-->>API: Updated
    API-->>FE: Unlock activity

    Note over S, DB: ── ACTIVITY ──
    S->>FE: Start Activity
    FE->>API: POST /activities/{activity_id}/attempts
    API-->>FE: Attempt ID and activity state
    S->>FE: Submit Activity Answers
    FE->>API: POST /activity-attempts/{attempt_id}/submit {answers[]}
    API->>RULES: Grade + evaluate mastery/intervention rules
    RULES-->>API: {score, passed, mastery_status, attempt_count}
    opt AI explanation enabled
        API->>AI: Minimum necessary misconception context
        AI-->>API: Advisory feedback or deterministic fallback
    end
    API->>DB: Save score + mastery flag + attempt count
    DB-->>API: Saved
    API-->>FE: Score result + next step
    FE-->>S: Show feedback + updated dashboard

    Note over T, DB: ── TEACHER/ADMIN MONITORING ──
    T->>FE: Open Teacher/Admin Dashboard
    FE->>API: GET /teacher-admin/dashboard?section_id={section_id}
    API->>DB: Aggregate all student records for section
    DB-->>API: Class performance data[]
    API-->>FE: Render class dashboard
    T->>FE: Add Intervention Note for student
    FE->>API: POST /interventions {student_id, competency_id, type, notes}
    API->>DB: Save intervention + timestamp
    DB-->>API: Saved
    API-->>FE: 201 Created
    FE-->>T: Note confirmed
```

---

## 5. AI Responsibility Boundary

```mermaid
flowchart LR
    INPUT[Student answer or learning evidence] --> RULES[Deterministic Rules]
    RULES --> GRADE[Correctness, score, attempts, mastery, unlocks, flags]
    GRADE --> DB[(Persisted Record)]
    GRADE --> UI[Required UI Result]
    GRADE -. minimum context .-> AI[Groq AI Adapter]
    AI -->|success| ADVICE[Explanation, misconception summary, suggested support]
    AI -->|timeout / disabled / failure| FALLBACK[Deterministic authored feedback]
    ADVICE --> UI
    FALLBACK --> UI
    TEACHER_ADMIN[Teacher/Admin Configuration] --> AI
    AI -. never controls .-> GRADE
```

Groq never determines correctness, grades, mastery bands, authorization, or intervention triggers. All Groq calls are server-side, redacted, and rate-limited; the API credential and selected model come from `.env`. A timeout, feature-policy disablement, or Groq failure falls back to deterministic authored feedback.

---

## 6. Entity Relationship Diagram (ERD)

### ERD Diagram

```mermaid
erDiagram
    USER_PROFILE {
        uuid user_id PK
        string full_name
        string email
        string role
    }

    STUDENT_PROFILE {
        uuid student_id PK
        uuid user_id FK
        string learner_id UK
        uuid grade_id FK
        uuid section_id FK
        string monitoring_status
    }

    TEACHER_ADMIN_PROFILE {
        uuid teacher_admin_id PK
        uuid user_id FK
        string employee_id UK
    }

    GRADE_LEVEL {
        uuid grade_id PK
        string name
        int level
        boolean is_active
    }

    SECTION {
        uuid section_id PK
        uuid grade_id FK
        uuid adviser_id FK
        string name
    }

    COMPETENCY {
        uuid        competency_id PK
        string      code UK
        uuid        grade_id FK
        string      domain
        string      name
        string      description
        string      status
    }

    MODULE {
        uuid        module_id PK
        uuid        competency_id FK
        string      title
        text        learning_objective
        text        short_explanation
        jsonb       rules
        jsonb       worked_examples
        string      status
        int         version
        int         order_index
    }

    QUESTION {
        uuid        question_id PK
        uuid        competency_id FK
        string      question_type
        string      difficulty
        text        prompt
        jsonb       answer_key
        string      status
        int         version
    }

    ASSESSMENT {
        uuid        assessment_id PK
        uuid        grade_id FK
        string      title
        string      assessment_type
        string      status
        int         version
    }

    ASSESSMENT_QUESTION {
        uuid        assessment_id FK
        uuid        question_id FK
        int         position
    }

    ASSESSMENT_ATTEMPT {
        uuid        attempt_id PK
        uuid        assessment_id FK
        uuid        student_id FK
        string      status
        float       overall_score
        timestamp   submitted_at
    }

    ASSESSMENT_RESPONSE {
        uuid        response_id PK
        uuid        attempt_id FK
        uuid        question_id FK
        jsonb       answer
        boolean     is_correct
    }

    COMPETENCY_RESULT {
        uuid        result_id PK
        uuid        attempt_id FK
        uuid        competency_id FK
        float       percentage
        string      mastery_band
    }

    LEARNING_PATH_ITEM {
        uuid        path_item_id PK
        uuid        student_id FK
        uuid        competency_id FK
        uuid        module_id FK
        int         priority
        string      status
    }

    STUDENT_MODULE_PROGRESS {
        uuid        progress_id PK
        uuid        student_id FK
        uuid        module_id FK
        float       completion_percentage
        boolean     is_complete
        timestamp   started_at
        timestamp   completed_at
    }

    ACTIVITY {
        uuid        activity_id PK
        uuid        module_id FK
        string      title
        text        description
        int         mastery_threshold
        string      status
        int         version
    }

    ACTIVITY_QUESTION {
        uuid        activity_id FK
        uuid        question_id FK
        int         position
    }

    ACTIVITY_ATTEMPT {
        uuid        attempt_id PK
        uuid        student_id FK
        uuid        activity_id FK
        int         attempt_number
        float       score_percentage
        int         time_spent_seconds
        boolean     passed
        string      mastery_status
        timestamp   submitted_at
    }

    COMPETENCY_PROGRESS {
        uuid        progress_id PK
        uuid        student_id FK
        uuid        competency_id FK
        float       diagnostic_score
        float       current_score
        string      mastery_band
        int         unsuccessful_attempts
    }

    INTERVENTION {
        uuid        intervention_id PK
        uuid        student_id FK
        uuid        teacher_admin_id FK
        uuid        competency_id FK
        string      severity
        string      status
        string      intervention_type
        jsonb       incorrect_patterns
        text        ai_insight
        text        educator_notes
        timestamp   created_at
        timestamp   resolved_at
    }

    SYSTEM_SETTING {
        string      setting_key PK
        jsonb       setting_value
        uuid        updated_by FK
        timestamp   updated_at
    }

    USER_PROFILE    ||--o| STUDENT_PROFILE         : "owns"
    USER_PROFILE    ||--o| TEACHER_ADMIN_PROFILE   : "owns"
    GRADE_LEVEL     ||--o{ SECTION                 : "contains"
    GRADE_LEVEL     ||--o{ COMPETENCY              : "scopes"
    SECTION         ||--o{ STUDENT_PROFILE         : "enrolls"
    TEACHER_ADMIN_PROFILE ||--o{ SECTION           : "advises"
    STUDENT_PROFILE ||--o{ ASSESSMENT_ATTEMPT      : "takes"
    ASSESSMENT      ||--o{ ASSESSMENT_QUESTION     : "contains"
    QUESTION        ||--o{ ASSESSMENT_QUESTION     : "assigned to"
    ASSESSMENT      ||--o{ ASSESSMENT_ATTEMPT      : "has"
    ASSESSMENT_ATTEMPT ||--o{ ASSESSMENT_RESPONSE  : "records"
    QUESTION        ||--o{ ASSESSMENT_RESPONSE     : "answers"
    ASSESSMENT_ATTEMPT ||--o{ COMPETENCY_RESULT    : "produces"
    COMPETENCY      ||--o{ COMPETENCY_RESULT       : "measures"
    COMPETENCY      ||--o{ MODULE                  : "covered by"
    STUDENT_PROFILE ||--o{ LEARNING_PATH_ITEM      : "receives"
    COMPETENCY      ||--o{ LEARNING_PATH_ITEM      : "prioritizes"
    MODULE          ||--o{ LEARNING_PATH_ITEM      : "recommends"
    MODULE          ||--o{ STUDENT_MODULE_PROGRESS : "tracked via"
    STUDENT_PROFILE ||--o{ STUDENT_MODULE_PROGRESS : "tracks"
    MODULE          ||--o{ ACTIVITY                : "has practice"
    ACTIVITY        ||--o{ ACTIVITY_QUESTION       : "contains"
    QUESTION        ||--o{ ACTIVITY_QUESTION       : "assigned to"
    ACTIVITY        ||--o{ ACTIVITY_ATTEMPT        : "attempted in"
    STUDENT_PROFILE ||--o{ ACTIVITY_ATTEMPT        : "submits"
    STUDENT_PROFILE ||--o{ COMPETENCY_PROGRESS     : "develops"
    COMPETENCY      ||--o{ COMPETENCY_PROGRESS     : "tracks"
    STUDENT_PROFILE ||--o{ INTERVENTION            : "receives"
    TEACHER_ADMIN_PROFILE ||--o{ INTERVENTION      : "records"
    COMPETENCY      ||--o{ INTERVENTION            : "targets"
    USER_PROFILE    ||--o{ SYSTEM_SETTING          : "updates"
```

---

### Entity Descriptions

| Entity | Description |
|---|---|
| **USER_PROFILE** | Application identity linked to Supabase Auth; credentials remain in the auth provider. |
| **STUDENT_PROFILE / TEACHER_ADMIN_PROFILE** | Role-specific school and learner/educator-administrator data. |
| **GRADE_LEVEL / SECTION** | Enrollment and adviser structure. |
| **COMPETENCY** | Curriculum skill with code, domain, grade, and publication state. |
| **MODULE** | Structured targeted content tied to a competency. |
| **QUESTION** | Reusable question-bank item with a server-only answer key. |
| **ASSESSMENT / ASSESSMENT_QUESTION** | Assessment definition and ordered question membership. |
| **ASSESSMENT_ATTEMPT / ASSESSMENT_RESPONSE / COMPETENCY_RESULT** | Learner submission, individual answers, and deterministic result breakdown. |
| **LEARNING_PATH_ITEM** | Ordered learner-to-competency/module recommendation with an explicit state. |
| **STUDENT_MODULE_PROGRESS** | Tracks completion percentage and status for each student-module pair. |
| **ACTIVITY / ACTIVITY_QUESTION** | Practice definition and ordered question membership. |
| **ACTIVITY_ATTEMPT** | Learner attempt, duration, score, pass result, and resulting mastery state. |
| **COMPETENCY_PROGRESS** | Diagnostic baseline, current score, mastery band, and unsuccessful-attempt count. |
| **INTERVENTION** | Auditable evidence, priority, optional Groq advice, educator action/notes, and lifecycle state. |
| **SYSTEM_SETTING** | Audited Teacher/Administrator configuration for thresholds, notifications, and Groq feature flags; never credentials or model selection. |

---

### Relationships Summary

| Relationship | Type | Description |
|---|---|---|
| Auth user → Role profile | One-to-Zero-or-One per role profile | Authentication and application profile data stay separated |
| Grade → Section → Student | One-to-Many | Models school enrollment and class organization |
| Student → Assessment Attempt | One-to-Many | Preserves diagnostic, reassessment, and quiz history |
| Assessment/Activity → Question | Many-to-Many | Reuses question-bank items with explicit ordering |
| Assessment Attempt → Competency Result | One-to-Many | Produces the per-competency gap analysis |
| Assessment Attempt → Response | One-to-Many | Retains submitted answers and deterministic correctness |
| Competency → Module | One-to-Many | A competency can have multiple ARAL modules |
| Student → Learning Path Item | One-to-Many | Stores the reason, priority, target module, and state |
| Module → Activity | One-to-Many | Allows targeted practice and later extension activities |
| Student → Activity Attempt | One-to-Many | Retains attempt history; escalation is a configurable rule, not a storage limit |
| Student + Competency → Progress | One-to-One pair | Supplies current dashboard/mastery state |
| Teacher/Administrator → Intervention | One-to-Many | Records authorized, auditable intervention actions |
| Teacher/Administrator User → System Setting | One-to-Many updates | Audits changes to thresholds, notifications, and Groq feature flags; deployment owns credential/model configuration |

---

*End of Diagrams Reference*

---
> 📌 **Document Owner:** MathSmart Development Team  
> 🔄 **Review Cycle:** Per sprint / major feature release  
> 📁 **Related Docs:** `SOURCE_OF_TRUTH.md` · `PROJECT.md` · `IMPLEMENTATION_PLAN.md` · `API_ROUTES.md` · `../../ui-ux-workflow-reference/guide.md`
