# Frontend Module Boundaries

This directory contains MathSmart's independently owned vertical feature modules. Next.js files under `src/app/` stay thin and compose exports from these modules.

## Ownership map

- `auth/` owns authentication and session-facing UI behavior.
- `student/` owns learner-only workflows.
- `teacher-admin/` owns the combined Teacher/Administrator workspace for the `teacher_admin` role.
- `shared/` contains code genuinely reused by at least two feature modules.

## Feature contract

A feature may add `components/`, `hooks/`, `services/`, `schemas/`, `utils/`, and `__tests__/` as needed. Do not create unused subdirectories. Export the supported public surface from `index.js`; do not deep-import another module's private files.

Keep shadcn/Radix primitives in `src/components/ui/` and infrastructure clients or framework helpers in `src/lib/`. Changes to shared contracts, navigation, or primitives need cross-module review.
