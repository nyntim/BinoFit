# Progress mockups

**Status: historical.** The Progress tab was built from these screens in October 2026. They show the direction at that time, not a spec; see `docs/design/README.md`. Live canvas: https://claude.ai/artifact/M6TNTn7araRhoTzmx6ERQG

`Main.dc.html` holds the screen and its logic (range bucketing, averages, weight chart math) in its script; the range and dark frames import it with `range` and `dark` props. Colors are hex values in its `LIGHT` / `DARK` maps (inline in the other files) and map to `constants/theme.ts`:

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
| `onTint` | `background` (text on a tint fill) |
| `bar` | resting chart bar: `icon` at 55% opacity over `cardBackground` |
| protein / carbs / fat hex | `MacroColors` |

| File | Screen |
|---|---|
| `Main.dc.html` | Progress 7D, light (interactive) |
| `Light30` / `Light90` / `LightAll` | 30D daily, 90D weekly and All monthly bars |
| `Dark` / `Dark30` / `Dark90` / `DarkAll` | The same four ranges in dark |
| `Sparse.dc.html` | A range with almost no data |
| `FirstRun.dc.html` | Nothing ever logged |
| `WeightSheet.dc.html` | Log weight, Apple Health notice |
| `WeightEdit.dc.html` | Edit or delete an entry |
| `SettingsUnits.dc.html` | Units and Personal Stats (the "Read weight" row was replaced by one Apple Health sync button, #80) |
