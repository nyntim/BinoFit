# 0006. One editor for live and past workouts

- **Status:** Accepted
- **Date:** 2026-10-17
- **Links:** `docs/architecture/training.md`, `docs/design/training/Session.dc.html`, `LogPast.dc.html`

## Context
People log workouts in two ways: live at the gym, or afterward from memory. Two separate editors would drift apart. A live session also has to survive the app being backgrounded or killed mid-set.

## Decision
- Live sessions and log-afterward share one editor. Past workouts are editable in place (write-through, no Cancel).
- SQLite is the source of truth. Every action writes through, serialized per editor; numeric cells commit on blur with a short debounce.
- A live session is a full-screen layer that minimizes to a bar above the tab bar. Starting prefills each exercise with the previous session's sets, unticked.
- The rest timer stores an absolute `endsAt`, so backgrounding does not drift it, and schedules a notification. Default rest is the last rest used for that exercise, else the exercise default, else 90 s.
- A session left open over 6 hours prompts on return; Finish ends at the last ticked set.
- Log afterward creates a draft; drafts older than 7 days are purged.
- Active and draft workouts stay on the device; only finished ones sync.

## Alternatives considered
- In-memory session saved on Finish: simpler, loses work on a crash.
- Separate quick-log form for past workouts: faster for one exercise, but a second set of rules to keep in step.

## Consequences
- The session UI has to work one-handed, mid-set and at large text sizes; it is the screen where speed matters most after food logging.
- Android may deliver rest notifications late under Doze; the in-app timer stays correct.
