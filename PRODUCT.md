# Product

Who BinoFit is for, what it does and how it should feel. This is the top layer of the design docs ([ADR 0016](docs/decisions/0016-design-doc-layers.md)): it changes when the product changes, not when a screen does. Visual direction lives in `DESIGN.md`; past decisions in `docs/decisions/`.

## Users

Adults who want to understand and steer what they eat and how they train, without tracking becoming a chore.

- **The everyday tracker** logs between meetings and at the gym, estimates portions, and wants a clear picture in seconds.
- **The precise one** weighs food, counts macros, follows a program and wants every number to be right.

Both want speed, numbers they can trust and an app that never makes them feel bad.

## What it does

BinoFit is a local-first tracker for nutrition, training and progress in one app. It works offline, backs up quietly to the cloud and needs no account to start.

- **Nutrition:** log food by search, barcode or custom entry into user-defined meals, and see calories, macros and nutrients for the day.
- **Training:** run a workout live (previous sets, rest timer, minimized session bar) or log one afterward; routines, records and weekly volume.
- **Progress:** trends across both: calories, macros, consistency, weight, sessions and volume.

Jobs, in priority order:
1. Log a meal in under 15 seconds, in at most three taps plus a search, and trust the totals.
2. Get through a workout without fighting the phone: one hand, mid-set, sweaty.
3. See where things are heading over weeks, not just today.

## Personality: calm, capable, warm

- **Calm.** No pressure, no nagging, no noise. Opening the app feels like a breath, not a task list.
- **Capable.** Numbers are exact and tools feel like good instruments. Depth is there when you want it.
- **Warm.** A human product with some character. It can notice a finished workout, a new record or a steady week, and it can have small moments of delight. Think of a good training partner: glad when you show up, never preachy when you don't.

This replaces the earlier "Sharp. Precise. Quiet." stance ([ADR 0015](docs/decisions/0015-calm-but-warm-voice.md)).

## Lines we don't cross

These are the only firm rules here. Everything else is a direction.

- **Never judge food or the body.** No "good" or "bad" foods, no red for over goal, no shame for a missed day, no weight-loss-program framing.
- **Acknowledge, don't nag.** Celebrate effort when it happens; never guilt-trip, threaten a streak or push notifications for engagement.
- **No dark patterns.** No ads, forced upsells or deceptive prompts. Account prompts are soft and skippable.
- **Accessible to everyone.** See Accessibility in `DESIGN.md`.

## Design principles

Directions to lean toward, not rules to enforce.

1. **The number leads.** On each screen, the most useful figure should be the first thing you see.
2. **Fast paths first.** Measure logging flows in taps and seconds, and protect them from new features.
3. **Density with rhythm.** Show a lot when it helps, organized so it never feels crowded.
4. **Earn attention.** Decoration is welcome when it carries meaning or joy. Nothing shouts without a reason.
5. **Feel native.** Follow iOS and Android conventions so the app feels at home on each.
6. **Room to explore.** The visual system is meant to evolve. Try things; keep what works and record it.

## Inspiration

Things we admire, as starting points rather than templates. Add to this list freely.

- **Cronometer:** depth of nutrition data and clear hierarchy.
- **Linear:** crisp, fast, tool-grade polish.
- **Things:** calm warmth and considered detail.
- **Strong, Hevy:** workout logging ergonomics (see `docs/references/competitor/`).
- **Apple Fitness:** acknowledging effort with energy but without judgment.

What we steer away from:
- **Noom, WW:** coaching tone, behavioral nudges, food moralizing.
- **MyFitnessPal:** ad clutter, aggressive notifications, gamified pressure.
- **Generic health-app look:** soft teal, stock wellness imagery, motivational slogans.
