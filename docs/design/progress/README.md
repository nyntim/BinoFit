# Progress mockups

Approved screen mockups for the Progress tab (`docs/phase-5-progress.md`). Live canvas: https://claude.ai/artifact/M6TNTn7araRhoTzmx6ERQG

These are the visual reference for building, not code to copy. Each `.dc.html` file is one 390 px wide phone screen written as HTML with inline styles. Rebuild them in React Native with `ThemedText` / `ThemedView`, `useThemeColor` and the existing components. Never port the HTML or CSS directly.

## How to read them

- Layout, hierarchy, copy, spacing (px values map to DESIGN.md spacing tokens) and states are the spec.
- `Main.dc.html` holds the Progress screen and its logic (range bucketing, averages, weight chart math) in its script; the light and dark range frames import it with `range` and `dark` props.
- Colors are hex values in the `LIGHT` / `DARK` maps of `Main.dc.html` (inline in the other files) and map to `constants/theme.ts`:

| Mockup key | `Colors` key |
|---|---|
| `bg` | `background` |
| `card` | `cardBackground` |
| `card2` | `cardSecondary` |
| `text` | `text` |
| `icon` | `icon` |
| `sep` | `separator` |
| `field` | `fieldBorder` |
| `track` | `track` |
| `tint` | `tint` |
| `onTint` | `background` (text on a tint fill; never `#fff`) |
| `bar` | none: resting chart bar, `icon` at 55% opacity over `cardBackground` (#a09ea3 light, #5a5a60 dark) |
| protein / carbs / fat hex | `MacroColors` |

- Inline SVG icons stand in for `IconSymbol` (SF Symbols / Material Icons).
- Sample data (calories, weights, dates) is illustrative.
- `docs/design/tokens.json` is the BinoFit design system's token file.

## Screens and build chunks

| File | Screen | Chunk |
|---|---|---|
| `Main.dc.html` | Progress 7D, light (interactive: chips and bars work) | P1, P2 (weight card) |
| `Light30.dc.html` / `Light90.dc.html` / `LightAll.dc.html` | 30D daily bars, 90D weekly bars, All monthly bars | P1 |
| `Dark.dc.html` / `Dark30.dc.html` / `Dark90.dc.html` / `DarkAll.dc.html` | Same four ranges in dark | P1 |
| `Sparse.dc.html` | Range with almost no data: empty captions, weight chart waits for 2 entries | P1, P2 |
| `FirstRun.dc.html` | Nothing ever logged | P1 |
| `WeightSheet.dc.html` | Log weight (lb), Apple Health notice | P2, P3 |
| `WeightEdit.dc.html` | Edit or delete an entry, kg units | P2 |
| `SettingsUnits.dc.html` | Weight unit choice, Apple Health "Read weight" row, Personal Stats in lb | P2, P3 |

Where a mockup and the plan disagree, the plan wins on behavior and the mockup wins on layout and copy; flag the conflict in the PR.
