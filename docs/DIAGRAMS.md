# MathSmart: Diagrams Reference
## Flowcharts, Sequence Diagram & Entity Relationship Diagram

> **Version:** 1.0 | **Last Updated:** September 2026

---

## Table of Contents

1. [Master End-to-End Flowchart](#1-master-end-to-end-flowchart)
2. [Feature Flowcharts](#2-feature-flowcharts)
   - [F1 — Student Profiling](#f1--student-profiling)
   - [F2 — Diagnostic Assessment](#f2--diagnostic-assessment)
   - [F3 — ARAL Learning Modules](#f3--aral-learning-modules)
   - [F4 — Interactive Activities](#f4--interactive-activities)
   - [F5 — Student Progress Dashboard](#f5--student-progress-dashboard)
   - [F6 — Teacher Intervention Dashboard](#f6--teacher-intervention-dashboard)
3. [System Sequence Diagram](#3-system-sequence-diagram)
4. [Entity Relationship Diagram (ERD)](#4-entity-relationship-diagram-erd)
   - [ERD Diagram](#erd-diagram)
   - [Entity Descriptions](#entity-descriptions)
   - [Relationships Summary](#relationships-summary)

---

## 1. Master End-to-End Flowchart

```mermaid
flowchart TD
    START([🎓 Student Opens MathSmart]) --> REG{Has Account?}
    REG -->|No| SIGNUP[Register & Fill Profile]
    REG -->|Yes| LOGIN[Login]
    SIGNUP --> PROFILE[Complete Student Profile]
    LOGIN --> CHECK{Profile Complete?}
    PROFILE --> DIAG_GATE
    CHECK -->|No| PROFILE
    CHECK -->|Yes| DIAG_GATE{Diagnostic Taken?}

    DIAG_GATE -->|No| DIAG[Take Diagnostic Assessment]
    DIAG_GATE -->|Yes| MODULES

    DIAG --> SCORE[Score Per Competency Domain]
    SCORE --> GAP[Learning Gap Report Generated]
    GAP --> PATH[Personalized Module Path Created]
    PATH --> MODULES[Access ARAL Learning Modules]

    MODULES --> MOD_CONTENT[Study Module Content]
    MOD_CONTENT --> ACTIVITY[Complete Module Activity]
    ACTIVITY --> PASS{Score ≥ 75%?}

    PASS -->|Yes ✅| MASTERY[Mark Competency as Mastered]
    PASS -->|No ❌| RETRY{Retries < 3?}
    RETRY -->|Yes| ACTIVITY
    RETRY -->|No| FLAG[🚩 Flag for Teacher Intervention]

    MASTERY --> MORE{More Modules?}
    MORE -->|Yes| MODULES
    MORE -->|No| COMPLETE[🎉 All Modules Complete]

    MASTERY --> S_DASH[Update Student Dashboard]
    FLAG --> T_DASH[Update Teacher Dashboard]
    COMPLETE --> T_DASH

    T_DASH --> TEACHER([👩‍🏫 Teacher Reviews])
    TEACHER --> NOTE[Add Intervention Note]
    NOTE --> STUDENT([Student Receives Guidance])
```

---

## 2. Feature Flowcharts

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
    F -->|Yes ✅| H[Generate Unique Learner ID]
    H --> I[Hash Password & Save Profile]
    I --> J[Send Welcome Message]
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
    A([Student Enters Diagnostic]) --> B[Load 30–40 Questions\nGrouped by Domain]
    B --> C[Display Question + Timer]
    C --> D[Student Selects Answer]
    D --> E{More Questions?}
    E -->|Yes| C
    E -->|No| F[Student Submits Assessment]
    F --> G[Score Responses Per Domain]
    G --> H{Compare Score vs.\nMastery Threshold}
    H -->|Below Threshold| I[Tag Domain: WEAK GAP]
    H -->|Above Threshold| J[Tag Domain: PROFICIENT]
    I --> K[Add to Gap Report]
    J --> K
    K --> L[Map Gaps to ARAL Module Types]
    L --> M[Generate Personalized Learning Path]
    M --> N[Save to Database]
    N --> O[Show Results Summary to Student]
    O --> P[Redirect to Module Dashboard]
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
    G --> H{Score ≥ 75%?}
    H -->|Yes ✅| I[Mark Competency: MASTERED]
    H -->|No ❌| J{Attempt Count < 3?}
    J -->|Yes — Retry| B
    J -->|No — Max Reached| K[🚩 Flag for Teacher Intervention]
    I --> L[Log Score to Database]
    K --> L
    L --> M[Update Student Dashboard]
    L --> N[Update Teacher Dashboard]
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
    F --> G[Show Competency Mastery\nNot Yet / Developing / Mastered]
    F --> H[Show Module Cards\nComplete / In Progress / Locked]
    F --> I[Show Activity Score History]
    F --> J[Show Recommended Next Action]
    J --> K{Student Acts on Recommendation?}
    K -->|Yes| L[Navigate to Module or Activity]
    K -->|No| M([Stay on Dashboard])
```

---

### F6 — Teacher Intervention Dashboard

```mermaid
flowchart TD
    A([Teacher Logs In]) --> B[Load Class Roster\nLinked to Teacher Section]
    B --> C[Display Class Overview\nTotal · On Track · At-Risk · Advanced]
    C --> D{Teacher Action?}
    D -->|View Heatmap| E[Open Competency Heatmap\nClass × Domain Grid]
    D -->|Filter Students| F[Apply Status Filter\nAt-Risk / Developing / Advanced]
    D -->|View Individual| G[Open Student Drill-Down Report]
    E --> H[Identify Class-Wide Weak Domains]
    F --> I[Select Student to Review]
    G --> J[View: Diagnostic · Modules · Activities · Mastery]
    H & I & J --> K[Add Intervention Note]
    K --> L[Save Note + Timestamp to Database]
    L --> M[Note Visible to Admin]
    M --> N([Teacher Continues Monitoring])
```

---

## 3. System Sequence Diagram

```mermaid
sequenceDiagram
    actor S as 🎓 Student
    actor T as 👩‍🏫 Teacher
    participant FE as Next.js Frontend
    participant API as FastAPI Backend
    participant AI as Python AI Engine
    participant DB as Supabase (PostgreSQL)

    Note over S, DB: ── REGISTRATION & PROFILING ──
    S->>FE: Register + Fill Profile Form
    FE->>API: POST /auth/register
    API->>DB: Insert student profile → Generate Learner ID
    DB-->>API: Learner ID confirmed
    API-->>FE: 201 Created + JWT Token
    FE-->>S: Redirect to Diagnostic

    Note over S, DB: ── DIAGNOSTIC ASSESSMENT ──
    S->>FE: Start Diagnostic
    FE->>API: GET /assessment/questions
    API->>DB: Fetch question bank by domain
    DB-->>API: Questions[]
    API-->>FE: Render question set
    S->>FE: Submit all answers
    FE->>API: POST /assessment/submit {learner_id, answers[]}
    API->>AI: Score responses per domain
    AI-->>API: {domain_scores[], gap_report, module_path[]}
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
    FE->>API: PATCH /modules/{module_id}/complete
    API->>DB: Update completion status
    DB-->>API: Updated
    API-->>FE: Unlock activity

    Note over S, DB: ── ACTIVITY ──
    S->>FE: Submit Activity Answers
    FE->>API: POST /activities/{activity_id}/submit {answers[]}
    API->>AI: Evaluate score + check mastery threshold
    AI-->>API: {score, passed, mastery_status, attempt_count}
    API->>DB: Save score + mastery flag + attempt count
    DB-->>API: Saved
    API-->>FE: Score result + next step
    FE-->>S: Show feedback + updated dashboard

    Note over T, DB: ── TEACHER MONITORING ──
    T->>FE: Open Teacher Dashboard
    FE->>API: GET /teacher/class/{section_id}
    API->>DB: Aggregate all student records for section
    DB-->>API: Class performance data[]
    API-->>FE: Render class dashboard
    T->>FE: Add Intervention Note for student
    FE->>API: POST /interventions {student_id, note, teacher_id}
    API->>DB: Save intervention + timestamp
    DB-->>API: Saved
    API-->>FE: 201 Created
    FE-->>T: Note confirmed
```

---

## 4. Entity Relationship Diagram (ERD)

### ERD Diagram

```mermaid
erDiagram
    STUDENT {
        uuid        student_id PK
        string      full_name
        int         age
        string      grade_level
        string      section
        string      school_name
        string      username
        string      password_hash
        timestamp   created_at
        uuid        teacher_id FK
    }

    TEACHER {
        uuid        teacher_id PK
        string      full_name
        string      username
        string      password_hash
        string      section_handled
        timestamp   created_at
    }

    ASSESSMENT {
        uuid        assessment_id PK
        uuid        student_id FK
        timestamp   taken_at
        int         total_score
        string      status
    }

    ASSESSMENT_DOMAIN_SCORE {
        uuid        score_id PK
        uuid        assessment_id FK
        uuid        competency_id FK
        int         raw_score
        int         max_score
        float       percentage
        string      mastery_level
    }

    COMPETENCY {
        uuid        competency_id PK
        string      domain_name
        string      competency_name
        string      description
        string      grade_level
        string      aral_level
    }

    MODULE {
        uuid        module_id PK
        uuid        competency_id FK
        string      title
        string      aral_level
        text        objectives
        text        content
        text        worked_examples
        text        summary
        int         order_index
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
        string      activity_type
        int         total_questions
        int         mastery_threshold
    }

    ACTIVITY_QUESTION {
        uuid        question_id PK
        uuid        activity_id FK
        text        question_text
        string      question_type
        jsonb       options
        string      correct_answer
        text        explanation
    }

    ACTIVITY_ATTEMPT {
        uuid        attempt_id PK
        uuid        student_id FK
        uuid        activity_id FK
        int         attempt_number
        float       score_percentage
        boolean     passed
        string      mastery_status
        timestamp   submitted_at
    }

    INTERVENTION {
        uuid        intervention_id PK
        uuid        student_id FK
        uuid        teacher_id FK
        text        note
        timestamp   created_at
    }

    STUDENT         ||--o{ ASSESSMENT              : "takes"
    STUDENT         ||--o{ STUDENT_MODULE_PROGRESS : "tracks"
    STUDENT         ||--o{ ACTIVITY_ATTEMPT        : "submits"
    STUDENT         ||--o{ INTERVENTION            : "receives"
    TEACHER         ||--o{ STUDENT                 : "handles"
    TEACHER         ||--o{ INTERVENTION            : "creates"
    ASSESSMENT      ||--o{ ASSESSMENT_DOMAIN_SCORE : "has"
    COMPETENCY      ||--o{ ASSESSMENT_DOMAIN_SCORE : "scored in"
    COMPETENCY      ||--o{ MODULE                  : "covered by"
    MODULE          ||--o{ STUDENT_MODULE_PROGRESS : "tracked via"
    MODULE          ||--||  ACTIVITY               : "has one"
    ACTIVITY        ||--o{ ACTIVITY_QUESTION       : "contains"
    ACTIVITY        ||--o{ ACTIVITY_ATTEMPT        : "attempted in"
```

---

### Entity Descriptions

| Entity | Description |
|---|---|
| **STUDENT** | Core learner profile. Linked to a teacher via `teacher_id`. |
| **TEACHER** | Educator account. Manages a section of students. |
| **ASSESSMENT** | One diagnostic assessment per student. Records overall score and status. |
| **ASSESSMENT_DOMAIN_SCORE** | Per-domain breakdown of a student's diagnostic result. Links to competency. |
| **COMPETENCY** | A specific Grade 7 Math competency (e.g., "Adding Fractions"). Has a domain and ARAL level. |
| **MODULE** | A learning module tied to one competency. Has an ARAL level and ordered content sections. |
| **STUDENT_MODULE_PROGRESS** | Tracks completion percentage and status for each student-module pair. |
| **ACTIVITY** | One activity per module. Has a type (MCQ, fill-in) and mastery threshold. |
| **ACTIVITY_QUESTION** | Individual question in an activity. Stores options and correct answer as JSON. |
| **ACTIVITY_ATTEMPT** | One attempt record per student per activity. Stores score, pass/fail, mastery status. |
| **INTERVENTION** | Teacher's note for a specific student. Timestamped and auditable. |

---

### Relationships Summary

| Relationship | Type | Description |
|---|---|---|
| Student → Assessment | One-to-Many | A student takes one diagnostic but can have attempt history |
| Assessment → Domain Score | One-to-Many | Each assessment breaks down into multiple domain scores |
| Competency → Module | One-to-Many | A competency can have multiple ARAL modules |
| Module → Activity | One-to-One | Each module has exactly one associated activity |
| Activity → Questions | One-to-Many | An activity contains multiple questions |
| Student → Activity Attempt | One-to-Many | A student can attempt an activity up to 3 times |
| Teacher → Student | One-to-Many | A teacher handles an entire section |
| Teacher → Intervention | One-to-Many | A teacher can log multiple intervention notes |

---

*End of Diagrams Reference*

---
> 📌 **Document Owner:** MathSmart Development Team  
> 🔄 **Review Cycle:** Per sprint / major feature release  
> 📁 **Related Docs:** `PROJECT.md` · `IMPLEMENTATION_PLAN.md` · `SYSTEM_WORKFLOW.md`
