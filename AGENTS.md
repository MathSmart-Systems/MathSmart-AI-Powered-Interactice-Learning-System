# MathSmart Agent Instructions

These repository rules apply to Codex, OpenCode, Claude Code through `CLAUDE.md`, and any other coding agent working in this project.

## Product invariants

- The MVP curriculum target is DepEd Grade 6 Mathematics.
- The only production roles are `student` and `teacher_admin`. Teacher and Administrator are one combined role and workspace.
- Groq is the production generative-AI provider. Its API credential and selected model are server-side values in `.env`.
- Never read, print, copy, log, document, commit, or expose `.env` values. Use `.env.example` for non-secret variable names.
- Deterministic grading, mastery calculation, and progression rules must work without Groq. Groq output is advisory and must fail gracefully.

## Workspace and reference boundaries

- This repository is the working MathSmart application.
- `../ui-ux-workflow-reference/` is a reference, not production code. Read `../ui-ux-workflow-reference/guide.md` before using it.
- Inspect only reference files relevant to the assigned screen or workflow. Do not scan or copy the entire reference application.
- Preserve the required workflow while improving accessibility, responsiveness, clarity, consistency, and usability.
- Do not replace the Next.js application with the reference Vite application or copy its mock data, client-only state, demo role switcher, secrets, or provider setup.

## Architecture and module ownership

- Keep Next.js route and layout files in `src/app/` thin. Feature UI and behavior belong in `src/modules/`.
- Student frontend features belong in `src/modules/student/<feature>/`.
- Combined Teacher/Administrator frontend features belong in `src/modules/teacher-admin/<feature>/`.
- Feature-specific components, hooks, services, schemas, utilities, and unit tests stay inside the owning feature.
- Put code in `src/modules/shared/` only when at least two feature modules genuinely reuse it.
- Keep shadcn/Radix primitives in `src/components/ui/` and infrastructure clients/framework helpers in `src/lib/`.
- Expose a module's supported surface through its `index.js` or a documented service contract. Do not deep-import another module's private files.
- Backend code belongs in `backend/modules/<feature>/`; keep its router, schemas, service, repository, and tests in that module when implemented.
- Cross-module integration tests belong in `tests/integration/`; end-to-end flows belong in `tests/e2e/student/` or `tests/e2e/teacher-admin/`.
- Stay within the module assigned by the user. Declare and coordinate any required edit to another module, shared code, navigation, API contracts, configuration, or infrastructure.

## File and change discipline

- Do not create new Markdown files unless the user explicitly requests one. `AGENTS.md` and the Claude adapter `CLAUDE.md` are the initial policy exceptions.
- Edit existing Markdown only when the request explicitly includes documentation or when an approved change would otherwise leave documented commands or architecture false.
- The entire `docs/` directory is frozen and read-only. Agents may consult it but must not create, edit, rename, move, or delete anything inside it.
- A `docs/` change is allowed only when the user explicitly authorizes that specific documentation change and a human maintainer applies the `docs-change-approved` label to its pull request. Agents must not apply or bypass that approval label themselves.
- If implementation work conflicts with frozen documentation, stop the conflicting change or report the mismatch to the user; do not silently rewrite the documentation.
- Check `git status` before editing. Preserve unrelated tracked and untracked changes and never stage them with the task.
- Do not perform unrelated cleanup, dependency upgrades, broad formatting, or refactors.
- Do not delete, overwrite, move, or rename another contributor's work unless the task explicitly requires it and the exact affected files were inspected first.
- Do not use destructive Git commands such as `git reset --hard` or discard another contributor's changes.

## Task branch workflow

- A branch belongs to one task, not permanently to one agent. Use `agent/<task-id>-<module>-<description>` when an issue ID exists, otherwise `agent/<module>-<description>`.
- Never implement a task directly on `main` and never push directly to `main`.
- For a new task, start from the latest safe `origin/main`, create the task branch before editing, and open a pull request targeting `main`.
- If the same task has an open, unmerged branch or pull request, return to that branch and continue there.
- Only one agent may actively edit a task branch at a time. A handoff may continue on the same branch after confirming the previous agent is no longer working on it.
- Never reuse a merged branch. Start follow-up work from the latest `origin/main` on a new task branch.
- For a closed or abandoned unmerged pull request, inspect its state first. Reopen it when still valid; otherwise create a new branch with a `-v2` suffix.
- Commit only files in the assigned task scope, use Conventional Commits, and push only the task branch.

## Pull request and CodeRabbit gate

- Every code change reaches `main` through a pull request. Enable GitHub squash auto-merge for the pull request after it is ready for review.
- The pull request scope must match the assigned task. Do not mix unrelated fixes into a CodeRabbit review loop.
- Required CI lint/build/tests must pass, the required CodeRabbit check must succeed, and all actionable CodeRabbit conversations must be resolved before merge.
- Address only actionable CodeRabbit findings caused by the pull request. Validate each proposed fix against project requirements before applying it.
- Use at most three CodeRabbit review/fix rounds for one pull request. If required checks still fail or actionable findings remain after the third round, stop, leave auto-merge blocked, and report the remaining items to the user.
- Never bypass, dismiss, spoof, or weaken CI, CodeRabbit, branch protection, or review requirements to obtain a merge.
- Once all required checks pass, GitHub may automatically squash-merge the pull request into `main` and delete the task branch.
- If CodeRabbit, GitHub authentication, repository permissions, branch protection, or auto-merge is unavailable, report the exact blocker. Do not merge manually around it.

## Verification

- Run the smallest relevant checks while developing, then run `npm run lint` and `npm run build` for frontend or structural changes.
- Run module tests when they exist and add appropriate tests for changed behavior.
- Verify authorization, loading, empty, error, keyboard, and responsive states when relevant to a UI workflow.
- Report commands run, results, remaining risks, and any checks that could not run.

Instruction files guide agent behavior but are not the enforcement boundary. GitHub rulesets, required status checks, CI, permissions, and tests must enforce protected-branch requirements.
