# 0017. Lifted paper, precise ink, a little ember

- **Status:** Accepted
- **Date:** 2026-10-23
- **Links:** #98, `docs/design/redesign/README.md`, canvas https://claude.ai/artifact/3Qz6CX7Ct9budLf5dzHQSG

## Context
[ADR 0015](0015-calm-but-warm-voice.md) set a calm but warm voice and [ADR 0016](0016-design-doc-layers.md) opened the visual baseline to change. The design exploration for #98 produced boards for every screen. This record fixes the direction so implementation has one target.

## Decision
- **Surfaces:** a slightly deeper warm page (`#F4F0E8`) with lighter cards (`#FBF9F5`) carrying a soft shadow in light mode; dark mode stays Graphite with no shadows.
- **Type:** the rounded system face for large titles and hero numbers, tabular figures for all changing numbers; body text stays system sans.
- **Color:** slate indigo stays the tint. A new ember accent (`#C2410C` / `#FF8A3D`) is used only to acknowledge effort: streaks, records, celebrations. Danger moves to `#B3261E` / `#FF8A80` so it no longer matches protein red. Success darkens in light mode to pass contrast.
- **Character:** the dinosaur from the app icon appears in onboarding, empty states and About.
- **Celebration:** brief banners for a finished workout and finished onboarding; static under Reduce Motion.
- Material stays limited to the bottom navigation ([ADR 0014](0014-material-on-bottom-navigation-only.md)).

This answers `DESIGN.md` open questions 2 (danger vs protein), 3 (celebration, in part), 5 (depth), 6 (numeral face) and 7 (light theme). Accent strategy (question 1) stays open: Indigo by default, Plum and Pine explored.

## Alternatives considered
- Keep the flat Reference Book look: consistent, but austere and at odds with ADR 0015.
- Per-area accents (one color each for Nutrition, Training, Progress): more color, but competes with the macro colors.

## Consequences
- `constants/theme.ts`, `DESIGN.md` baseline and `docs/design/tokens.json` change in the first implementation PR (see `docs/design/redesign/foundations.md`).
- New UI primitives in `components/ui/` replace ad hoc cards, rows and buttons.
- The earlier training and progress mockups become fully historical.
