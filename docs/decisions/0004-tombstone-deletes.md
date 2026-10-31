# 0004. Synced deletes are tombstones

- **Status:** Accepted
- **Date:** 2026-10-17

## Context
Deletes used to call Supabase directly. A delete made offline, or one that raced a push, could be undone by the next restore, bringing deleted food back.

## Decision
Deleting a synced row sets `deleted_at` (and `updated_at`, clearing `synced_at`). The tombstone syncs like any edit and is purged locally after a successful push. Restore applies remote tombstones by last-write-wins. Rows that never sync (active or draft workouts) are hard-deleted. `markRowsSynced` only marks rows unchanged since the push, so an edit made during a push is not lost.

## Alternatives considered
- Direct remote deletes: simpler, but lose deletes made offline.
- A separate deletions table: works, but every table then needs a join to stay correct.

## Consequences
- Every read of a tombstoned table filters `deleted_at IS NULL`. A missed filter resurrects deleted data, so new queries need a test.
- New synced tables are allow-listed in `lib/tombstones.ts`.
