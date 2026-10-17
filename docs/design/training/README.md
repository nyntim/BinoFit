# Training mockups

Approved screen mockups for the Training module (`docs/phase-4-training.md`). Live canvas: https://claude.ai/artifact/1rbbzgc9QQpVfqZCGbPj7u

These are the visual reference for building, not code to copy. Each `.dc.html` file is one 390 x 844 phone screen written as HTML with inline styles. Rebuild them in React Native with `ThemedText` / `ThemedView`, `useThemeColor` and the existing components. Never port the HTML or CSS directly.

## How to read them

- Layout, hierarchy, copy, spacing (px values map to DESIGN.md spacing tokens) and states are the spec.
- Colors are CSS variables at the top of each file and map to `constants/theme.ts`:

| Mockup variable | `Colors` key |
|---|---|
| `--background` | `background` |
| `--card` | `cardBackground` |
| `--card2` | `cardSecondary` |
| `--text` | `text` |
| `--icon` | `icon` |
| `--sep` | `separator` |
| `--field` | `fieldBorder` |
| `--track` | `track` |
| `--tint` | `tint` |
| `--on-tint` | `background` (text on a tint fill; never `#fff`) |
| `--protein` / `--carbs` / `--fat` | `MacroColors` |

- Inline SVG icons stand in for `IconSymbol` (SF Symbols / Material Icons).
- Sample data (weights, dates, "Hammer Strength") is illustrative.
- `docs/design/tokens.json` is the BinoFit design system's token file (same values as `constants/theme.ts` and DESIGN.md).

## Screens and build chunks

| File | Screen | Route | Chunk |
|---|---|---|---|
| `OnboardingMode.dc.html` | What to track | `/onboarding/mode` | C3 |
| `Library.dc.html` | Exercise library (and no-results "Create" state in its script) | `/workout/exercises` | C6 |
| `Builder.dc.html` | Exercise builder, every step; the script holds the step rules (which steps show per equipment, validation, Skip vs Next, name suggestions) | `/workout/new-exercise` | C6 |
| `BuilderReview.dc.html` | Builder review card | `/workout/new-exercise` (last step) | C6 |
| `LogPast.dc.html` | Log past workout, including cardio pace | `/workout/log` | C7 |
| `Main.dc.html` | Training tab | `/(tabs)/training` | C8 |
| `Session.dc.html` | Live session: set rows, Previous column, rest banner, setup notes, per side | `/workout/session` | C9, C10 |
| `SessionBar.dc.html` | Minimized session bar above the tab bar | `ActiveWorkoutBar` | C9 |

Where a mockup and the plan disagree, the plan wins on behavior and the mockup wins on layout and copy; flag the conflict in the PR.
