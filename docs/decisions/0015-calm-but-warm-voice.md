# 0015. Calm but warm voice

- **Status:** Accepted
- **Date:** 2026-10-23
- **Links:** #98, `PRODUCT.md`, `DESIGN.md`

## Context
The docs disagreed. `PRD_v2.md` asked for a "motivating and rewarding" dashboard. `PRODUCT.md` ("Sharp. Precise. Quiet.") and the old `DESIGN.md` banned celebration, streak emphasis and red or green, and the Progress plan ruled that the neutral docs win. Meanwhile the app shipped a streak flame, a success green and red input errors as exceptions to those bans. Training made the gap wider: finishing a workout or setting a record is a moment people want acknowledged.

## Decision
BinoFit is **calm, capable and warm**.
- **Kept:** the app never judges food, intake or the body. No red for "over goal", no "bad" foods, no shaming missed days, no weight-loss-program framing, no notification pressure.
- **Changed:** the app may acknowledge effort and progress: a finished workout, a new record, a consistent week, a streak. It can have personality, small moments of delight and motion that rewards an action.
- **Color:** red and green describe system state (an error, a destructive action, a confirmation), never a verdict on what someone ate or weighed.

## Alternatives considered
- Strictly neutral (previous stance): trustworthy, but cold, and it fought the training side of the product.
- Motivational coaching (PRD_v2 reading): engaging for some, but slides into the nudging and moralizing that the anti-references warn about.

## Consequences
- The neutral-tone rule in the old Progress plan and the "no celebration" rules in `DESIGN.md` are retired.
- Celebrations stay brief, skippable and quiet by default; they respect Reduce Motion and never block the next action.
- Open: which moments get acknowledged, and how loudly (tracked in `DESIGN.md` open questions).
