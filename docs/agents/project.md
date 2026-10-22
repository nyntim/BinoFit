# Project rules: BinoFit

Read by every `agent-team` role and lead through `agent-team context`, in every tool. The workflows (`build-feature`, `ship`, `bug-sweep`, `design-audit`, `test-backfill`) and the roles come from the global `agent-team` install; this file and the role files in this folder add the BinoFit rules on top. The ship lead follows [ship.md](ship.md).

## Commands

- lint: `npm run lint`
- typecheck: `npx tsc --noEmit`
- test: `npm test` (use `npm test -- --ci` for the lead's final check)
- Lead's final check, showing only the result: `(npm run lint && npx tsc --noEmit && npm test -- --ci) > .plans/<slug>.checks.log 2>&1 && echo PASS || tail -n 40 .plans/<slug>.checks.log`

## Docs to read first

- `CLAUDE.md`: rules for every change, overview, and the Where to look index of `docs/architecture/` area docs. Read only the area docs your task touches.
- `PRODUCT.md` and `DESIGN.md` for UI work; `PRD_v2.md` and `docs/phase-*.md` for planning.

## Lead rules

- Follow [Keeping the lead cheap](README.md#keeping-the-lead-cheap), including its escalation rule for conflicts that touch sync, schema, migrations or tombstones.
- **One commit per feature.** The pre-commit hook bumps the app version on every commit, so one commit means one bump. Branch names, commit messages and authorship follow `CLAUDE.md`.
- The planner's `Needs approval` rule is in [planner.md](planner.md).

## Default scopes for audits

- `bug-sweep`: `lib/`, `hooks/` and `context/`.
- `design-audit`: all of `app/` and `components/`; group findings by screen. Fixes go through `build-feature` or a direct edit, whichever the user prefers.
- `test-backfill`: the pure logic in `lib/` (totals, serving conversions, dates), then `hooks/useStreak.ts`.
