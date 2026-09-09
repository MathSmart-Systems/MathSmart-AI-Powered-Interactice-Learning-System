## Task and scope

<!-- State the assigned task and the module(s) this pull request owns. -->

Issue: <!-- Closes #123, or N/A -->

Owned paths:

- `src/modules/...`

Out-of-module changes and coordination:

- None

## What changed

<!-- Summarize only the changes required for this task. -->

## Evidence

<!-- Add screenshots for UI work and concise test output or reproduction steps. -->

## Verification

- [ ] Relevant module tests pass.
- [ ] `npm run lint` passes.
- [ ] `npm run build` passes.
- [ ] Loading, empty, error, keyboard, and responsive states were checked when relevant.

## Agent workflow gate

- [ ] This pull request targets `main` from `agent/<task-id>-<module>-<description>` or `agent/<module>-<description>`.
- [ ] The branch is dedicated to this task and has only one active agent.
- [ ] No unrelated files, generated artifacts, secrets, or `.env` values are included.
- [ ] Commits follow Conventional Commits.
- [ ] Required CI checks pass.
- [ ] CodeRabbit reviewed the latest commit and all actionable conversations are resolved.
- [ ] CodeRabbit review/fix rounds used: `0 / 3`.
- [ ] Squash auto-merge is enabled; the branch will be deleted after merge.
