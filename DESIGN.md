---
name: BinoFit
description: Calm, capable and warm tracking for nutrition and training, with numbers you can trust
colors:
  warm-paper: "#F8F5EF"
  card-surface: "#EEEAE2"
  card-subtle: "#E4E0D6"
  ink-primary: "#1A1A22"
  ink-secondary: "#606070"
  slate-indigo: "#3D4B7A"
  separator: "#D6D2C8"
  protein-signal: "#E74C3C"
  carb-signal: "#F39C12"
  fat-signal: "#3498DB"
  success: "#27AE60"
  danger: "#E74C3C"
  streak: "#D44F08"
typography:
  display:
    fontFamily: "System, -apple-system, SF Pro Display, sans-serif"
    fontSize: "34px"
    fontWeight: 700
    lineHeight: 1.1
    letterSpacing: "-0.5px"
  headline:
    fontFamily: "System, -apple-system, SF Pro Display, sans-serif"
    fontSize: "22px"
    fontWeight: 600
    lineHeight: 1.2
  title:
    fontFamily: "System, -apple-system, SF Pro Text, sans-serif"
    fontSize: "17px"
    fontWeight: 600
    lineHeight: 1.3
  body:
    fontFamily: "System, -apple-system, SF Pro Text, sans-serif"
    fontSize: "15px"
    fontWeight: 400
    lineHeight: 1.5
  label:
    fontFamily: "System, -apple-system, SF Pro Text, sans-serif"
    fontSize: "13px"
    fontWeight: 500
    lineHeight: 1.4
  caption:
    fontFamily: "System, -apple-system, SF Pro Text, sans-serif"
    fontSize: "12px"
    fontWeight: 400
    lineHeight: 1.4
rounded:
  sharp: "4px"
  sm: "8px"
  md: "12px"
  lg: "18px"
  pill: "20px"
spacing:
  xs: "4px"
  sm: "8px"
  md: "16px"
  lg: "20px"
  xl: "24px"
  xxl: "40px"
---

# Design: BinoFit

How BinoFit looks and behaves. Read `PRODUCT.md` first: it sets who the app is for and how it should feel.

## How to use this document

Design guidance has four layers ([ADR 0016](docs/decisions/0016-design-doc-layers.md)), highest first:

1. **Principles:** `PRODUCT.md`.
2. **Invariants:** the short list below. Changing one needs an ADR in `docs/decisions/`.
3. **Baseline:** the rest of this file and `constants/theme.ts`. It describes the system as it is today. Improve on it freely; when you do, update this file and the theme in the same change.
4. **References:** mockups in `docs/design/`, screenshots and competitor captures. Inspiration and history, not specs.

When layers disagree, the higher one wins. Shipped behavior in `docs/architecture/` wins over any mockup.

## Direction

The current look is warm paper and precise ink: off-white surfaces, near-black text, one slate indigo accent, flat tonal layers. It reads as trustworthy and calm. It can also read as austere, and it was designed for a nutrition-only app that refused to celebrate anything.

The direction now is to keep the trust and add warmth and life. Open territory, explicitly invited:

- **Color:** more than one accent, for example a distinct accent per area (Nutrition, Training, Progress), richer chart palettes, tinted surfaces.
- **Depth:** shadows, elevation or layered sheets where they clarify what sits on top. Tonal layering is the default, not a ban.
- **Type:** expressive display numerals, rounded or custom faces, as long as figures stay tabular where they line up and everything scales with Dynamic Type.
- **Motion and haptics:** transitions that explain where things came from, feedback that confirms a logged food or ticked set, and brief celebrations for a finished workout or a record.
- **Illustration and empty states:** character is welcome, especially where there is no data yet.
- **Data visualization:** new chart forms, annotations and highlights.
- **Light theme:** warm paper is the baseline, not a requirement.

## Invariants

1. **Accessible.** Everything in the Accessibility section below.
2. **Color never judges.** Intake over goal, a heavier weight or a missed day is shown neutrally. Danger red is for errors and destructive actions; success green is for confirmations and completion. Neither is a verdict on food or the body ([ADR 0015](docs/decisions/0015-calm-but-warm-voice.md)).
3. **Macros keep their identity.** Protein, carbs and fat each have one color used everywhere they appear, and those colors are not reused nearby for unrelated meaning. The exact hues can change.
4. **Theme through tokens.** Components read colors with `useThemeColor` from `constants/theme.ts`; no hardcoded hex. Every token has a light and a dark value.
5. **Numbers line up.** Values that sit in columns or change live (calories, grams, sets, timers) use tabular figures.
6. **Material only on the bottom navigation.** Liquid Glass and blur stay on the main tab bar ([ADR 0014](docs/decisions/0014-material-on-bottom-navigation-only.md)).
7. **Native foundations.** iOS 26+ uses the native tab bar and system navigation; Android follows Material conventions where they differ.

## Accessibility

- **Dynamic Type.** All text scales with the system setting. Layouts wrap or reflow instead of truncating key numbers. Check the largest accessibility size. Cap scaling only on tight chrome (the tab bar) and say why in code.
- **Screen readers.** Every interactive element has an accessible name and role. Icon buttons always have an `accessibilityLabel`. Charts and rings expose a text summary ("1,640 of 2,200 calories"). Decorative layers are hidden from assistive tech and never intercept touches.
- **Touch targets.** At least 44 pt on iOS and 48 dp on Android. A smaller visual is fine with an expanded hit area.
- **Contrast.** WCAG AA in both themes: 4.5:1 for body text, 3:1 for large text, icons, chart marks and control borders.
- **Not color alone.** State and meaning always have a label, icon or shape as well as a color (macro bars are labeled; errors have text).
- **Reduce Transparency.** Any material falls back to an opaque theme surface, and starts opaque until the setting is known.
- **Reduce Motion.** Movement becomes a fade or an instant change. No parallax or looping celebration.
- **Haptics** are optional reinforcement and follow system settings.

## Baseline

### Color

Light theme "Warm Paper", dark theme "Graphite". Source of truth: `constants/theme.ts`.

| Token | Light | Dark | Use |
|---|---|---|---|
| `background` | #F8F5EF | #0E0E10 | Page background; text on a tint fill |
| `cardBackground` | #EEEAE2 | #1A1A1D | Cards and sections |
| `cardSecondary` | #E4E0D6 | #242428 | Nested surfaces: inputs, unselected chips |
| `text` | #1A1A22 | #EDEDF0 | Primary text and values |
| `icon` | #606070 | #8E8E96 | Secondary text, metadata, icons at rest |
| `separator` | #D6D2C8 | 10% text | Row dividers |
| `fieldBorder` | #D6D2C8 | 28% text | Input borders at rest |
| `track` | #D6D2C8 | 14% text | Progress tracks |
| `tint` | #3D4B7A | #8FA3D6 | Primary actions, selection, focus, calorie ring |
| `success` | #27AE60 | #52D68A | Confirmation, completion |
| `danger` | #E74C3C | #FF6E6E | Errors, destructive actions |
| `streak` | #D44F08 | #FF8A3D | Streak flame |

Macro colors (`MacroColors`): protein #E74C3C, carbs #F39C12, fat #3498DB, the same in both themes. `TargetTints` are pale versions that preview what a food adds to a target bar. The `nav*` tokens belong to the fallback tab bar.

Current habits worth knowing: the tint is the only accent and stays fairly scarce; neutrals in light mode lean warm; pure black and pure white are avoided. Note that danger red currently shares its hex with protein, which the exploration should resolve.

### Typography

System fonts (SF Pro on iOS, Roboto on Android). Hierarchy comes from size and weight contrast.

| Style | Size / weight | Typical use |
|---|---|---|
| Display | 34 / 700 | The one hero number on a screen (calorie ring) |
| Headline | 22 / 600 | Key stats |
| Title | 17 / 600 | Card titles, section headers, screen titles |
| Body | 15 / 400 | Food names, descriptions, list content |
| Label | 13 / 500 | Dates, servings, gram values, metadata |
| Caption | 12 / 400 | Units, sub-labels, timestamps |

### Spacing and shape

- Spacing scale: 4, 8, 16, 20, 24, 40. Cards usually pad 20 (16 for supporting cards) with about 14 between cards.
- Radius scale: 4 (bars), 8 (inputs), 12, 18 (cards, primary buttons), 20 (chips).
- Prefer the scales. If a design needs a new step, add it to the scale rather than using a one-off value.

### Surfaces and depth

Content surfaces are flat and separated by tone: page, card, nested surface. No shadows on content today. The fallback tab bar is the one floating element (material, fine border, soft shadow). Overlays use the `overlay` scrim.

### Icons

`IconSymbol` maps SF Symbols on iOS to Material Icons elsewhere. Icons at rest use `icon`; active or selected icons use `tint`. Keep one weight per context.

### Motion

Minimal today: presses dim to about 85% opacity with no scale; screens use native transitions. Motion should explain (where something came from), confirm (food logged, set ticked) or celebrate (workout finished, new record). Keep feedback short, around 200 to 300 ms, and follow Reduce Motion.

### Components

Defaults as built. Reuse them before making new ones, and change them when a better version is found.

- **Buttons:** primary is a tint fill with `background`-colored text, 18 radius. Secondary is tint text with an outline or none. Destructive uses `danger`.
- **Cards:** `cardBackground`, 18 radius, no border or shadow.
- **Inputs:** `cardSecondary` fill or `fieldBorder` outline, 8 radius; focus shows a tint border.
- **Chips:** `cardSecondary` at rest, tint fill when selected, pill radius.
- **Macro bar:** 8 high, 4 radius, `track` behind the macro color, label left and grams right.
- **Calorie ring:** single tint stroke on `track`, Display number in the middle.
- **List rows:** separated by a 1 px `separator`; swipe actions for edit and delete.
- **Sheets and modals:** native presentation; `fullScreenModal` screens pad with safe-area insets (see `CLAUDE.md`).
- **Bottom navigation:** native on iOS 26+; floating fallback shell elsewhere ([ADR 0014](docs/decisions/0014-material-on-bottom-navigation-only.md)). The live workout shows as the native accessory or a bar above the tabs.

### Interaction states

| State | Baseline treatment |
|---|---|
| Pressed | Dim to about 85% opacity |
| Focused | Tint border on inputs; visible focus on every control |
| Selected | Tint fill (chips) or tint icon (tabs) |
| Disabled | About 50% opacity, shape unchanged |
| Error | `danger` border plus a message in words |
| Loading | Activity indicator or placeholder in place of the content |
| Empty | A short sentence and the next useful action |
| Success | Brief confirmation; optional haptic |

## Voice and copy

Plain, direct and friendly. Sentence case. Numbers carry units. Say what happened and what to do next.

- Good: "Workout saved. 2 new records." "No meals logged yet. Add your first food." "Over by 120 cal."
- Avoid: "Great job staying under!" (judges intake), "Don't break your streak!" (pressure), "Oops! Something went wrong :(" (vague).

## Open questions

Tracked in #98. [ADR 0017](docs/decisions/0017-lifted-paper-direction.md) answers 2, 5, 6 and 7 and part of 3; the baseline above changes when it is implemented (`docs/design/redesign/`).

1. **Accent strategy:** one tint, or an accent per area?
2. **Danger vs protein:** they share #E74C3C. Which one moves?
3. **Celebration:** which moments are acknowledged (finished workout, record, steady week, streak), and how much motion and haptics?
4. **Streak prominence:** keep a small flame badge, or give consistency more presence?
5. **Depth:** introduce elevation or shadow for sheets, the session bar or hero cards?
6. **Type:** a distinct numeral face for hero numbers?
7. **Light theme:** keep warm paper, or move to a cleaner neutral?
8. **Density:** how much of the nutrient and set data shows by default versus on demand?
