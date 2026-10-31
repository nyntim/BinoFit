# 0028: Rest mode and workout Live Activity

Status: Accepted
Date: 2026-10-25

## Context

A countdown suits planned rest, while some workouts need a quiet elapsed rest. Workout time should remain visible with the app backgrounded.

## Decision

Keep Timer and Stopwatch as a device preference in the existing explicit Training save batch, with immediate switches in the session. Preserve the tick start and planned end across mode changes. Stopwatch never schedules a notification or expires. The global rest switch governs both modes.

Use SDK 58 `expo-widgets` for one local workout Live Activity. Absolute SwiftUI timer intervals advance without app-process polling. Countdown stale dates show Rest over while suspended. Register the runtime activity on the package's built-in target, with no home-screen widget entry, handwritten extension, push updates or App Intent actions. Native availability failures are harmless.

## Consequences

No database or sync migration is required. Legacy rest state restores as Timer. A new iOS development build is required for the activity; Android and Expo Go retain the in-app experience. Sign-out clears both the rest and in-memory workout so an activity cannot survive a wipe.
