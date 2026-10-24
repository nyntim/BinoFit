# Decisions

Architecture decision records (ADRs) for BinoFit. Each file records one decision: the context, what was chosen, what else was considered and what it costs. They explain why the app is the way it is. They are not build guides; the code and `docs/architecture/` describe how things work today.

These replace the old phase plans (`docs/phase-1` to `phase-5`). Their build orders, test lists and schema listings were dropped because the code, tests and architecture docs now hold that detail. Git history keeps the originals.

## Writing one

- Copy the template below into `NNNN-short-title.md` with the next free number.
- Keep it short. A decision that needs a page of explanation is usually two decisions.
- Never rewrite an accepted decision to mean something else. Mark it **Superseded by NNNN** and write a new one. Small factual updates are fine under an **Amended** note.
- Statuses: **Proposed**, **Accepted**, **Superseded by NNNN**, **Retired** (no longer applies, nothing replaced it).

```markdown
# NNNN. Title

- **Status:** Proposed | Accepted | Superseded by NNNN | Retired
- **Date:** yyyy-mm-dd
- **Links:** issues, docs, screens

## Context
## Decision
## Alternatives considered
## Consequences
```

## Index

| # | Decision | Status |
|---|---|---|
| [0001](0001-local-first-storage.md) | Local-first storage with cloud backup | Accepted, amended |
| [0002](0002-user-defined-meals.md) | Meals are user-defined | Accepted |
| [0003](0003-metric-storage-units.md) | Store metric, display in the user's unit | Accepted |
| [0004](0004-tombstone-deletes.md) | Synced deletes are tombstones | Accepted |
| [0005](0005-training-in-one-app.md) | Training is a module of the same app | Accepted |
| [0006](0006-one-workout-editor.md) | One editor for live and past workouts | Accepted |
| [0007](0007-exercise-library-and-builder.md) | Small built-in library, guided exercise builder | Accepted |
| [0008](0008-training-volume-rules.md) | How training volume is counted | Accepted |
| [0009](0009-weight-log.md) | The latest weight entry is canonical | Accepted |
| [0010](0010-tracking-mode.md) | Choose what to track at onboarding | Superseded by 0011 |
| [0011](0011-four-tabs-always.md) | Four tabs, always shown | Accepted |
| [0012](0012-progress-charts.md) | Hand-rolled charts with fixed ranges | Accepted |
| [0013](0013-progress-counting-rules.md) | What Progress counts | Accepted |
| [0014](0014-material-on-bottom-navigation-only.md) | Liquid Glass only on the bottom navigation | Accepted |
| [0015](0015-calm-but-warm-voice.md) | Calm but warm voice | Accepted |
| [0016](0016-design-doc-layers.md) | Design docs: principles, invariants, baseline, references | Accepted |
| [0017](0017-lifted-paper-direction.md) | Lifted paper, precise ink, a little ember | Accepted |
