# 0029. Heart rate from Apple Health

- **Status:** Accepted
- **Date:** 2026-10-25

## Context

People training with an Apple Watch can see heart rate in Apple Health. BinoFit can use those samples without adding another measurement workflow.

## Decision

On iOS, read Apple Health heart rate for a fresh live figure and capture the workout window's rounded average and maximum at normal or autofill Finish, past-workout Save, and an accepted finished edit that changes the start or duration. Store and sync only those two nullable integers. Read resting heart rate for a Progress trend without storing the series. Request only heart-rate read permissions from the new UI, separately from existing nutrition permissions. Android and web show no heart-rate UI or native reads, preserving synced values during edits.

## Alternatives considered

Storing individual samples duplicates Health data without a product need. Health Connect and manual bpm input add separate workflows outside this iOS feature. Heart-rate zones, HRV and historical backfill are deferred.

## Consequences

Empty or denied reads hide the live/resting UI. Capture has a three-second limit and never prompts at Finish. Empty successful captures clear the pair; unavailable or unsupported reads preserve it. Read denial is indistinguishable from no samples. Samples arriving after completion are not backfilled. The bounded Supabase column migration must ship before the client.
