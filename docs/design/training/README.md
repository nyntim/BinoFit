# Training mockups

**Status: historical.** The Training module was built from these screens in October 2026. They show the direction at that time, not a spec; see `docs/design/README.md`. Live canvas: https://claude.ai/artifact/1rbbzgc9QQpVfqZCGbPj7u

Colors are CSS variables at the top of each file and map to `constants/theme.ts`:

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
| `--on-tint` | `background` (text on a tint fill) |
| `--protein` / `--carbs` / `--fat` | `MacroColors` |

| File | Screen | Route |
|---|---|---|
| `OnboardingMode.dc.html` | What to track (retired, see ADR 0010) | none |
| `Library.dc.html` | Exercise library and the no-results "Create" state | `/workout/exercises` |
| `Builder.dc.html` | Exercise builder, every step; its script holds the step rules | `/workout/new-exercise` |
| `BuilderReview.dc.html` | Builder review card | `/workout/new-exercise` |
| `LogPast.dc.html` | Log a past workout, including cardio pace | `/workout/log` |
| `WeeklyVolumeTargets.dc.html` | Target editor and Sets card states, light and dark | `/settings/weekly-volume-targets`, `/(tabs)/training` |
| `Main.dc.html` | Training tab | `/(tabs)/training` |
| `Session.dc.html` | Live session: set rows, Previous column, rest banner, setup notes | `/workout/session` |
| `SessionBar.dc.html` | Minimized session bar above the tab bar | `ActiveWorkoutBar` |
