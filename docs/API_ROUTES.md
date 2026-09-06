# MathSmart: API Routes Reference
## FastAPI Backend — REST API Documentation

> **Version:** 1.0 | **Last Updated:** September 2026  
> **Base URL:** `https://api.mathsmart.app/v1`  
> **Auth:** Bearer JWT Token (via Supabase Auth)  
> **Format:** All requests and responses are `application/json`

---

## Table of Contents

1. [Authentication](#1-authentication)
2. [Student Profile](#2-student-profile)
3. [Diagnostic Assessment](#3-diagnostic-assessment)
4. [Competencies](#4-competencies)
5. [ARAL Modules](#5-aral-modules)
6. [Activities](#6-activities)
7. [Progress Dashboard](#7-progress-dashboard)
8. [Teacher Intervention Dashboard](#8-teacher-intervention-dashboard)
9. [Admin](#9-admin)
10. [HTTP Status Codes](#10-http-status-codes)
11. [Role Access Matrix](#11-role-access-matrix)

---

## 1. Authentication

### `POST /auth/register`
Register a new student account.

- **Auth Required:** ❌ None
- **Role:** Public

**Request Body:**
```json
{
  "full_name": "Juan Dela Cruz",
  "age": 12,
  "grade_level": "Grade 7",
  "section": "Sampaguita",
  "school_name": "Mabini Elementary School",
  "username": "juan.delacruz",
  "password": "SecurePass123!"
}
```

**Response `201 Created`:**
```json
{
  "student_id": "uuid-xxxx",
  "username": "juan.delacruz",
  "learner_id": "MSL-2026-00042",
  "token": "eyJhbGciOiJIUzI1..."
}
```

---

### `POST /auth/login`
Login for students, teachers, and admins.

- **Auth Required:** ❌ None
- **Role:** Public

**Request Body:**
```json
{
  "username": "juan.delacruz",
  "password": "SecurePass123!"
}
```

**Response `200 OK`:**
```json
{
  "token": "eyJhbGciOiJIUzI1...",
  "role": "student",
  "user_id": "uuid-xxxx",
  "full_name": "Juan Dela Cruz"
}
```

---

### `POST /auth/logout`
Invalidate the current session token.

- **Auth Required:** ✅ Bearer Token
- **Role:** Student · Teacher · Admin

**Response `200 OK`:**
```json
{
  "message": "Logged out successfully."
}
```

---

### `POST /auth/refresh`
Refresh an expiring JWT token.

- **Auth Required:** ✅ Bearer Token
- **Role:** Student · Teacher · Admin

**Response `200 OK`:**
```json
{
  "token": "eyJhbGciOiJIUzI1..."
}
```

---

## 2. Student Profile

### `GET /students/me`
Get the currently logged-in student's profile.

- **Auth Required:** ✅ Bearer Token
- **Role:** Student

**Response `200 OK`:**
```json
{
  "student_id": "uuid-xxxx",
  "learner_id": "MSL-2026-00042",
  "full_name": "Juan Dela Cruz",
  "age": 12,
  "grade_level": "Grade 7",
  "section": "Sampaguita",
  "school_name": "Mabini Elementary School",
  "created_at": "2026-09-06T08:00:00Z",
  "teacher_id": "uuid-teacher"
}
```

---

### `PATCH /students/me`
Update the logged-in student's profile.

- **Auth Required:** ✅ Bearer Token
- **Role:** Student

**Request Body (partial update allowed):**
```json
{
  "section": "Rosal",
  "school_name": "Rizal Elementary School"
}
```

**Response `200 OK`:**
```json
{
  "message": "Profile updated successfully.",
  "updated_fields": ["section", "school_name"]
}
```

---

### `GET /students/{student_id}`
Get a specific student's profile. Teachers can only access students in their section.

- **Auth Required:** ✅ Bearer Token
- **Role:** Teacher · Admin

**Response `200 OK`:**
```json
{
  "student_id": "uuid-xxxx",
  "learner_id": "MSL-2026-00042",
  "full_name": "Juan Dela Cruz",
  "grade_level": "Grade 7",
  "section": "Sampaguita",
  "school_name": "Mabini Elementary School"
}
```

---

### `GET /students`
Get all students in a teacher's section.

- **Auth Required:** ✅ Bearer Token
- **Role:** Teacher · Admin
- **Query Params:** `?section=Sampaguita` · `?status=at_risk` · `?page=1&limit=20`

**Response `200 OK`:**
```json
{
  "total": 35,
  "page": 1,
  "students": [
    {
      "student_id": "uuid-xxxx",
      "learner_id": "MSL-2026-00042",
      "full_name": "Juan Dela Cruz",
      "status": "on_track",
      "modules_completed": 3,
      "last_active": "2026-09-05T14:22:00Z"
    }
  ]
}
```

---

## 3. Diagnostic Assessment

### `GET /assessment/questions`
Fetch the diagnostic question set grouped by domain.

- **Auth Required:** ✅ Bearer Token
- **Role:** Student

**Response `200 OK`:**
```json
{
  "assessment_version": "v1.0",
  "total_questions": 40,
  "time_limit_minutes": 60,
  "domains": [
    {
      "domain": "Number Sense",
      "competency_id": "uuid-comp-1",
      "questions": [
        {
          "question_id": "uuid-q1",
          "question_text": "What is 3/4 + 1/2?",
          "question_type": "mcq",
          "options": ["5/4", "4/6", "1", "3/8"],
          "order_index": 1
        }
      ]
    }
  ]
}
```

---

### `POST /assessment/submit`
Submit completed diagnostic answers for scoring.

- **Auth Required:** ✅ Bearer Token
- **Role:** Student

**Request Body:**
```json
{
  "student_id": "uuid-xxxx",
  "time_taken_minutes": 45,
  "answers": [
    {
      "question_id": "uuid-q1",
      "selected_answer": "5/4"
    },
    {
      "question_id": "uuid-q2",
      "selected_answer": "x = 3"
    }
  ]
}
```

**Response `201 Created`:**
```json
{
  "assessment_id": "uuid-assess-1",
  "total_score": 28,
  "max_score": 40,
  "percentage": 70.0,
  "domain_scores": [
    {
      "domain": "Number Sense",
      "competency_id": "uuid-comp-1",
      "score": 6,
      "max_score": 10,
      "percentage": 60.0,
      "mastery_level": "developing",
      "gap_identified": true
    },
    {
      "domain": "Algebra",
      "competency_id": "uuid-comp-2",
      "score": 9,
      "max_score": 10,
      "percentage": 90.0,
      "mastery_level": "mastered",
      "gap_identified": false
    }
  ],
  "module_path": ["uuid-module-1", "uuid-module-3", "uuid-module-5"]
}
```

---

### `GET /assessment/result/{student_id}`
Get a student's most recent diagnostic result.

- **Auth Required:** ✅ Bearer Token
- **Role:** Student (own only) · Teacher · Admin

**Response `200 OK`:**
```json
{
  "assessment_id": "uuid-assess-1",
  "taken_at": "2026-09-06T09:00:00Z",
  "total_score": 28,
  "percentage": 70.0,
  "domain_scores": [ "..." ],
  "module_path": ["uuid-module-1", "uuid-module-3"]
}
```

---

### `GET /assessment/status/{student_id}`
Check whether a student has taken the diagnostic.

- **Auth Required:** ✅ Bearer Token
- **Role:** Student · Teacher · Admin

**Response `200 OK`:**
```json
{
  "diagnostic_taken": true,
  "taken_at": "2026-09-06T09:00:00Z",
  "assessment_id": "uuid-assess-1"
}
```

---

## 4. Competencies

### `GET /competencies`
List all Grade 7 Math competencies.

- **Auth Required:** ✅ Bearer Token
- **Role:** Student · Teacher · Admin
- **Query Params:** `?domain=Algebra` · `?aral_level=remediate`

**Response `200 OK`:**
```json
{
  "total": 25,
  "competencies": [
    {
      "competency_id": "uuid-comp-1",
      "domain_name": "Number Sense",
      "competency_name": "Adding and Subtracting Fractions",
      "description": "Perform addition and subtraction of similar and dissimilar fractions.",
      "grade_level": "Grade 7",
      "aral_level": "remediate"
    }
  ]
}
```

---

### `GET /competencies/{competency_id}`
Get details of a specific competency.

- **Auth Required:** ✅ Bearer Token
- **Role:** Student · Teacher · Admin

**Response `200 OK`:**
```json
{
  "competency_id": "uuid-comp-1",
  "domain_name": "Number Sense",
  "competency_name": "Adding and Subtracting Fractions",
  "description": "Perform addition and subtraction of similar and dissimilar fractions.",
  "grade_level": "Grade 7",
  "aral_level": "remediate",
  "modules": ["uuid-module-1", "uuid-module-2"]
}
```

---

## 5. ARAL Modules

### `GET /modules`
Get all modules unlocked for the logged-in student.

- **Auth Required:** ✅ Bearer Token
- **Role:** Student
- **Query Params:** `?status=unlocked` · `?domain=Algebra`

**Response `200 OK`:**
```json
{
  "total": 5,
  "modules": [
    {
      "module_id": "uuid-module-1",
      "title": "Understanding Fractions",
      "competency_id": "uuid-comp-1",
      "domain": "Number Sense",
      "aral_level": "remediate",
      "order_index": 1,
      "completion_percentage": 75.0,
      "is_complete": false,
      "activity_unlocked": false
    }
  ]
}
```

---

### `GET /modules/{module_id}`
Get the full content of a specific module.

- **Auth Required:** ✅ Bearer Token
- **Role:** Student · Teacher · Admin

**Response `200 OK`:**
```json
{
  "module_id": "uuid-module-1",
  "title": "Understanding Fractions",
  "aral_level": "remediate",
  "competency_id": "uuid-comp-1",
  "content": {
    "objectives": "Learners will be able to add and subtract fractions.",
    "explanation": "A fraction represents a part of a whole...",
    "worked_examples": "Example 1: 1/2 + 1/4 = 2/4 + 1/4 = 3/4...",
    "summary": "Key points: Always find the LCD before adding fractions."
  },
  "activity_id": "uuid-activity-1"
}
```

---

### `PATCH /modules/{module_id}/progress`
Update a student's section-level progress within a module.

- **Auth Required:** ✅ Bearer Token
- **Role:** Student

**Request Body:**
```json
{
  "section_completed": "worked_examples",
  "completion_percentage": 75.0
}
```

**Response `200 OK`:**
```json
{
  "module_id": "uuid-module-1",
  "completion_percentage": 75.0,
  "is_complete": false,
  "activity_unlocked": false
}
```

---

### `PATCH /modules/{module_id}/complete`
Mark a module as fully complete and unlock its activity.

- **Auth Required:** ✅ Bearer Token
- **Role:** Student

**Response `200 OK`:**
```json
{
  "module_id": "uuid-module-1",
  "is_complete": true,
  "activity_unlocked": true,
  "activity_id": "uuid-activity-1",
  "completed_at": "2026-09-06T10:30:00Z"
}
```

---

### `GET /modules/{module_id}/progress/{student_id}`
Get a student's progress on a specific module. (Teacher/Admin use)

- **Auth Required:** ✅ Bearer Token
- **Role:** Teacher · Admin

**Response `200 OK`:**
```json
{
  "module_id": "uuid-module-1",
  "student_id": "uuid-xxxx",
  "completion_percentage": 100.0,
  "is_complete": true,
  "started_at": "2026-09-06T09:30:00Z",
  "completed_at": "2026-09-06T10:30:00Z"
}
```

---

## 6. Activities

### `GET /activities/{activity_id}`
Get an activity with all its questions.

- **Auth Required:** ✅ Bearer Token
- **Role:** Student

**Response `200 OK`:**
```json
{
  "activity_id": "uuid-activity-1",
  "module_id": "uuid-module-1",
  "title": "Fractions Practice",
  "activity_type": "mcq",
  "total_questions": 10,
  "mastery_threshold": 75,
  "questions": [
    {
      "question_id": "uuid-q1",
      "question_text": "What is 1/2 + 1/4?",
      "question_type": "mcq",
      "options": ["2/6", "3/4", "1/2", "2/4"],
      "order_index": 1
    },
    {
      "question_id": "uuid-q2",
      "question_text": "Solve: 3/4 − ___ = 1/4",
      "question_type": "fill_in_the_blank",
      "options": null,
      "order_index": 2
    }
  ]
}
```

---

### `POST /activities/{activity_id}/submit`
Submit a completed activity attempt for scoring.

- **Auth Required:** ✅ Bearer Token
- **Role:** Student

**Request Body:**
```json
{
  "student_id": "uuid-xxxx",
  "answers": [
    {
      "question_id": "uuid-q1",
      "submitted_answer": "3/4"
    },
    {
      "question_id": "uuid-q2",
      "submitted_answer": "1/2"
    }
  ]
}
```

**Response `201 Created`:**
```json
{
  "attempt_id": "uuid-attempt-1",
  "activity_id": "uuid-activity-1",
  "attempt_number": 1,
  "score_percentage": 80.0,
  "passed": true,
  "mastery_status": "mastered",
  "correct_count": 8,
  "total_questions": 10,
  "feedback": [
    {
      "question_id": "uuid-q1",
      "is_correct": true,
      "correct_answer": "3/4",
      "explanation": "To add fractions, find the LCD first."
    },
    {
      "question_id": "uuid-q2",
      "is_correct": false,
      "correct_answer": "1/2",
      "explanation": "Subtract the numerators: 3/4 − 1/4 = 2/4 = 1/2"
    }
  ],
  "submitted_at": "2026-09-06T10:55:00Z"
}
```

---

### `GET /activities/{activity_id}/attempts/{student_id}`
Get all attempt history for a student on a specific activity.

- **Auth Required:** ✅ Bearer Token
- **Role:** Student (own only) · Teacher · Admin

**Response `200 OK`:**
```json
{
  "activity_id": "uuid-activity-1",
  "student_id": "uuid-xxxx",
  "total_attempts": 2,
  "max_attempts": 3,
  "attempts": [
    {
      "attempt_id": "uuid-attempt-1",
      "attempt_number": 1,
      "score_percentage": 60.0,
      "passed": false,
      "submitted_at": "2026-09-06T10:00:00Z"
    },
    {
      "attempt_id": "uuid-attempt-2",
      "attempt_number": 2,
      "score_percentage": 80.0,
      "passed": true,
      "submitted_at": "2026-09-06T10:55:00Z"
    }
  ]
}
```

---

## 7. Progress Dashboard

### `GET /progress/me`
Get the full progress summary for the logged-in student.

- **Auth Required:** ✅ Bearer Token
- **Role:** Student

**Response `200 OK`:**
```json
{
  "student_id": "uuid-xxxx",
  "overall_progress_percentage": 60.0,
  "diagnostic_summary": {
    "taken": true,
    "total_score": 28,
    "percentage": 70.0
  },
  "competency_mastery": [
    {
      "domain": "Number Sense",
      "mastery_level": "developing",
      "percentage": 60.0
    },
    {
      "domain": "Algebra",
      "mastery_level": "mastered",
      "percentage": 90.0
    }
  ],
  "modules": [
    {
      "module_id": "uuid-module-1",
      "title": "Understanding Fractions",
      "is_complete": true,
      "completion_percentage": 100.0
    },
    {
      "module_id": "uuid-module-3",
      "title": "Linear Equations",
      "is_complete": false,
      "completion_percentage": 40.0
    }
  ],
  "activity_history": [
    {
      "activity_id": "uuid-activity-1",
      "module_title": "Understanding Fractions",
      "best_score": 80.0,
      "attempts": 2,
      "passed": true
    }
  ],
  "recommended_next": {
    "type": "module",
    "id": "uuid-module-3",
    "title": "Linear Equations",
    "reason": "Module in progress"
  }
}
```

---

### `GET /progress/{student_id}`
Get a specific student's full progress. (Teacher/Admin)

- **Auth Required:** ✅ Bearer Token
- **Role:** Teacher · Admin

**Response `200 OK`:** *(same structure as `GET /progress/me`)*

---

## 8. Teacher Intervention Dashboard

### `GET /teacher/class`
Get class overview for the logged-in teacher's section.

- **Auth Required:** ✅ Bearer Token
- **Role:** Teacher

**Response `200 OK`:**
```json
{
  "section": "Sampaguita",
  "total_students": 35,
  "summary": {
    "on_track": 20,
    "developing": 10,
    "at_risk": 4,
    "advanced": 1
  },
  "students": [
    {
      "student_id": "uuid-xxxx",
      "learner_id": "MSL-2026-00042",
      "full_name": "Juan Dela Cruz",
      "status": "at_risk",
      "modules_completed": 1,
      "last_active": "2026-09-01T08:00:00Z",
      "failed_attempts": 3
    }
  ]
}
```

---

### `GET /teacher/class/heatmap`
Get class-wide competency mastery heatmap data.

- **Auth Required:** ✅ Bearer Token
- **Role:** Teacher · Admin

**Response `200 OK`:**
```json
{
  "section": "Sampaguita",
  "domains": ["Number Sense", "Algebra", "Geometry", "Measurement", "Statistics"],
  "heatmap": [
    {
      "student_id": "uuid-xxxx",
      "full_name": "Juan Dela Cruz",
      "scores": {
        "Number Sense": 60.0,
        "Algebra": 90.0,
        "Geometry": 45.0,
        "Measurement": 70.0,
        "Statistics": 55.0
      }
    }
  ]
}
```

---

### `GET /teacher/students/at-risk`
Get list of all at-risk students for the teacher's section.

- **Auth Required:** ✅ Bearer Token
- **Role:** Teacher · Admin

**Response `200 OK`:**
```json
{
  "total_at_risk": 4,
  "students": [
    {
      "student_id": "uuid-xxxx",
      "full_name": "Juan Dela Cruz",
      "failed_attempts": 3,
      "weak_domains": ["Number Sense", "Geometry"],
      "days_inactive": 5
    }
  ]
}
```

---

### `POST /interventions`
Create an intervention note for a student.

- **Auth Required:** ✅ Bearer Token
- **Role:** Teacher

**Request Body:**
```json
{
  "student_id": "uuid-xxxx",
  "note": "Juan needs one-on-one support in Fractions. Recommend pull-out session this week."
}
```

**Response `201 Created`:**
```json
{
  "intervention_id": "uuid-interv-1",
  "student_id": "uuid-xxxx",
  "teacher_id": "uuid-teacher",
  "note": "Juan needs one-on-one support in Fractions.",
  "created_at": "2026-09-06T14:00:00Z"
}
```

---

### `GET /interventions/{student_id}`
Get all intervention notes for a specific student.

- **Auth Required:** ✅ Bearer Token
- **Role:** Teacher · Admin

**Response `200 OK`:**
```json
{
  "student_id": "uuid-xxxx",
  "total": 2,
  "interventions": [
    {
      "intervention_id": "uuid-interv-1",
      "note": "Juan needs one-on-one support in Fractions.",
      "teacher_name": "Ma'am Santos",
      "created_at": "2026-09-06T14:00:00Z"
    }
  ]
}
```

---

### `DELETE /interventions/{intervention_id}`
Delete a specific intervention note.

- **Auth Required:** ✅ Bearer Token
- **Role:** Teacher (own notes only) · Admin

**Response `200 OK`:**
```json
{
  "message": "Intervention note deleted."
}
```

---

## 9. Admin

### `GET /admin/users`
Get all users in the system.

- **Auth Required:** ✅ Bearer Token
- **Role:** Admin
- **Query Params:** `?role=student` · `?role=teacher` · `?page=1&limit=50`

**Response `200 OK`:**
```json
{
  "total": 120,
  "users": [
    {
      "user_id": "uuid-xxxx",
      "full_name": "Juan Dela Cruz",
      "role": "student",
      "created_at": "2026-09-01T08:00:00Z"
    }
  ]
}
```

---

### `DELETE /admin/users/{user_id}`
Delete a user account.

- **Auth Required:** ✅ Bearer Token
- **Role:** Admin

**Response `200 OK`:**
```json
{
  "message": "User deleted successfully."
}
```

---

### `POST /admin/modules`
Create a new learning module.

- **Auth Required:** ✅ Bearer Token
- **Role:** Admin

**Request Body:**
```json
{
  "title": "Introduction to Integers",
  "competency_id": "uuid-comp-3",
  "aral_level": "assist",
  "order_index": 1,
  "content": {
    "objectives": "Understand what integers are.",
    "explanation": "Integers include all whole numbers and their negatives...",
    "worked_examples": "Example: -3, 0, 5 are all integers...",
    "summary": "Integers are numbers without fractions."
  }
}
```

**Response `201 Created`:**
```json
{
  "module_id": "uuid-module-new",
  "title": "Introduction to Integers",
  "aral_level": "assist",
  "created_at": "2026-09-06T15:00:00Z"
}
```

---

### `PATCH /admin/modules/{module_id}`
Update an existing module's content.

- **Auth Required:** ✅ Bearer Token
- **Role:** Admin

**Request Body (partial update allowed):**
```json
{
  "title": "Understanding Integers (Updated)",
  "content": {
    "summary": "Updated summary content here."
  }
}
```

**Response `200 OK`:**
```json
{
  "message": "Module updated successfully.",
  "module_id": "uuid-module-1"
}
```

---

### `DELETE /admin/modules/{module_id}`
Delete a module.

- **Auth Required:** ✅ Bearer Token
- **Role:** Admin

**Response `200 OK`:**
```json
{
  "message": "Module deleted successfully."
}
```

---

### `POST /admin/assessment/reset/{student_id}`
Reset a student's diagnostic assessment (requires admin approval).

- **Auth Required:** ✅ Bearer Token
- **Role:** Admin

**Response `200 OK`:**
```json
{
  "message": "Diagnostic assessment reset for student MSL-2026-00042.",
  "student_id": "uuid-xxxx"
}
```

---

## 10. HTTP Status Codes

| Code | Meaning | When Used |
|---|---|---|
| `200 OK` | Success | GET, PATCH, DELETE success |
| `201 Created` | Resource created | POST (register, submit, create) |
| `400 Bad Request` | Invalid input | Missing fields, validation errors |
| `401 Unauthorized` | No or invalid token | Missing/expired JWT |
| `403 Forbidden` | Access denied | Role doesn't have permission |
| `404 Not Found` | Resource missing | Module, student, activity not found |
| `409 Conflict` | Duplicate entry | Username already taken |
| `422 Unprocessable` | Schema mismatch | Wrong data types in request |
| `429 Too Many Requests` | Rate limited | Too many rapid submissions |
| `500 Internal Server Error` | Server failure | Unexpected backend error |

---

## 11. Role Access Matrix

| Endpoint Group | Student | Teacher | Admin |
|---|---|---|---|
| `POST /auth/register` | ✅ | ✅ | ✅ |
| `POST /auth/login` | ✅ | ✅ | ✅ |
| `GET /students/me` | ✅ | ❌ | ✅ |
| `GET /students/{id}` | ❌ | ✅ own section | ✅ |
| `GET /students` | ❌ | ✅ own section | ✅ |
| `GET /assessment/questions` | ✅ | ❌ | ✅ |
| `POST /assessment/submit` | ✅ | ❌ | ❌ |
| `GET /assessment/result/{id}` | ✅ own | ✅ | ✅ |
| `GET /competencies` | ✅ | ✅ | ✅ |
| `GET /modules` | ✅ | ✅ | ✅ |
| `PATCH /modules/{id}/complete` | ✅ | ❌ | ❌ |
| `GET /activities/{id}` | ✅ | ✅ | ✅ |
| `POST /activities/{id}/submit` | ✅ | ❌ | ❌ |
| `GET /progress/me` | ✅ | ❌ | ❌ |
| `GET /progress/{id}` | ❌ | ✅ own section | ✅ |
| `GET /teacher/class` | ❌ | ✅ | ✅ |
| `GET /teacher/class/heatmap` | ❌ | ✅ | ✅ |
| `GET /teacher/students/at-risk` | ❌ | ✅ | ✅ |
| `POST /interventions` | ❌ | ✅ | ✅ |
| `GET /interventions/{id}` | ❌ | ✅ | ✅ |
| `GET /admin/users` | ❌ | ❌ | ✅ |
| `POST /admin/modules` | ❌ | ❌ | ✅ |
| `POST /admin/assessment/reset/{id}` | ❌ | ❌ | ✅ |

---

*End of API Routes Reference*

---
> 📌 **Document Owner:** MathSmart Development Team  
> 🔄 **Review Cycle:** Per sprint  
> 📁 **Related Docs:** `PROJECT.md` · `DIAGRAMS.md` · `SYSTEM_WORKFLOW.md`
