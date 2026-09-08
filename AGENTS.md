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
- `AGENTS.md` and `CLAUDE.md` are frozen governance files. Agents may read them but must not edit, replace, rename, move, or delete either file during ordinary tasks.
- A change to `AGENTS.md` or `CLAUDE.md` is allowed only when the user explicitly authorizes that exact governance change and a human maintainer applies the `agent-rules-change-approved` label to its pull request. Agents must not apply or bypass that approval label themselves.
- If a framework, generator, installer, or development command attempts to modify a frozen governance file, preserve the existing file and report the attempted change to the user unless the exact change has received the required authorization.
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

## Human live-acceptance gate

- Every implementation task requires explicit live acceptance by the user after implementation and automated verification, but before CodeRabbit review or merge automation begins.
- When the implementation is ready, run the relevant automated checks. Tell the user to run the appropriate development command (normally `npm run dev`) when the application is not already running; otherwise provide the exact local URL for the running application. Give the user a concise checklist and explicitly ask them to open the application and perform live acceptance testing.
- Ask the user to respond with `LIVE ACCEPTANCE: PASS` or `LIVE ACCEPTANCE: FAIL` followed by the problems found, then stop completely and wait. Automated tests, screenshots, agent judgment, silence, or an unrelated user response never count as acceptance.
- Before `LIVE ACCEPTANCE: PASS`, do not open the pull request, request or begin CodeRabbit review, enable auto-merge, or merge the task. If a pull request already exists, keep it from merging and do not continue its review loop until acceptance passes.
- On `LIVE ACCEPTANCE: FAIL`, fix the reported issues on the same task branch, rerun the relevant checks, present the updated runnable result, and request live acceptance again.
- Only `LIVE ACCEPTANCE: PASS` authorizes the agent to push the accepted task state, open or update the pull request, begin the scoped CodeRabbit review loop, and enable auto-merge when all other requirements are satisfied.
- If a CodeRabbit fix materially changes user-visible behavior or an accepted workflow, prevent auto-merge and repeat live acceptance for that change before merge. Non-behavioral review fixes still require all automated checks to rerun.

## Pull request and CodeRabbit gate

- Every code change reaches `main` through a pull request. After live acceptance passes and the pull request is ready for review, enable GitHub squash auto-merge.
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

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
