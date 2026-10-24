---
name: BinoFit
description: Calm, capable and warm tracking for nutrition and training, with numbers you can trust
colors:
  page: "#F4F0E8"
  card-surface: "#FBF9F5"
  card-subtle: "#EDE8DE"
  ink-primary: "#1A1A22"
  ink-secondary: "#5E5E6E"
  slate-indigo: "#3D4B7A"
  tint-soft: "#E3E6F0"
  separator: "#E2DDD2"
  protein-signal: "#E74C3C"
  carb-signal: "#F39C12"
  fat-signal: "#3498DB"
  success: "#1E7A45"
  danger: "#B3261E"
  ember: "#C2410C"
  ember-soft: "#FBE6D9"
typography:
  largeTitle:
    fontFamily: "ui-rounded, SF Pro Rounded, system-ui, sans-serif"
    fontSize: "34px"
    fontWeight: 800
    lineHeight: 1.1
    letterSpacing: "-0.5px"
  heading:
    fontFamily: "ui-rounded, SF Pro Rounded, system-ui, sans-serif"
    fontSize: "30px"
    fontWeight: 800
    lineHeight: 1.15
  hero:
    fontFamily: "ui-rounded, SF Pro Rounded, system-ui, sans-serif"
    fontSize: "48px"
    fontWeight: 800
    lineHeight: 1.08
  stat:
    fontFamily: "ui-rounded, SF Pro Rounded, system-ui, sans-serif"
    fontSize: "22px"
    fontWeight: 800
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
    lineHeight: 1.45
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
  tag: "7px"
  tile: "9px"
  field: "12px"
  button: "14px"
  nested: "14px"
  list: "18px"
  card: "22px"
  sheet: "28px"
  pill: "999px"
spacing:
  xs: "4px"
  sm: "8px"
  gap: "14px"
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

The look is "lifted paper, precise ink, a little ember" ([ADR 0017](docs/decisions/0017-lifted-paper-direction.md)): a warm page with lighter cards that carry a soft shadow in light mode, near-black ink, one slate indigo accent, rounded hero numbers, and an ember accent reserved for acknowledging effort. It replaced a flatter warm paper look that read as austere and refused to celebrate anything. The build directions per screen are in `docs/design/redesign/`.

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

Light theme "Lifted Paper", dark theme "Graphite". Source of truth: `constants/theme.ts`.

| Token | Light | Dark | Use |
|---|---|---|---|
| `background` | #F4F0E8 | #0E0E10 | Page |
| `cardBackground` | #FBF9F5 | #1A1A1D | Cards, lists, sheets. In light mode cards are lighter than the page |
| `cardSecondary` | #EDE8DE | #242428 | Nested surfaces: search fields, segmented tracks, chips at rest, nested panels |
| `raised` | #FBF9F5 | #3A3A40 | Selected segment, stepper buttons |
| `sheetBackground` | #FBF9F5 | #1F1F23 | Bottom sheets |
| `text` | #1A1A22 | #EDEDF0 | Primary text and values |
| `icon` | #5E5E6E | #9A9AA3 | Secondary text, captions, icons at rest |
| `separator` | #E2DDD2 | 10% text | Row dividers |
| `fieldBorder` | #D9D3C7 | 28% text | Input and secondary button borders, grabbers |
| `track` | #E4DFD4 | 14% text | Ring and bar tracks |
| `chartBar` | #A9A4A0 | #5A5A62 | Resting chart bars |
| `tint` | #3D4B7A | #8FA3D6 | Primary actions, selection, focus, calorie ring |
| `tintSoft` | #E3E6F0 | 16% tint | Soft buttons, selected rows, active tab pill, icon tiles |
| `onTint` | #FBF9F5 | #0E0E10 | Text and icons on a `tint` fill |
| `ember` | #C2410C | #FF8A3D | Acknowledgement only: streaks, records, celebrations |
| `emberSoft` | #FBE6D9 | 14% ember | Background behind ember content |
| `success` | #1E7A45 | #52D68A | Confirmation, "allowed", synced dot |
| `successSoft` | #DDEFE4 | 14% success | Background behind success icons |
| `danger` | #B3261E | #FF8A80 | Errors, destructive actions |
| `dangerSoft` | #F8E1DE | 14% danger | Destructive button background |
| `overlay` | 42% ink | 55% black | Scrim behind sheets and dialogs |

Macro colors (`MacroColors`): protein #E74C3C, carbs #F39C12, fat #3498DB, the same in both themes. `TargetTints` are pale versions that preview what a food adds to a target bar. The `nav*` tokens belong to the fallback tab bar (`navActive` matches `tintSoft`).

Habits worth knowing: the tint is the main accent and stays fairly scarce; ember appears only where effort is acknowledged, never as a warning; danger no longer shares its hex with protein. Neutrals in light mode lean warm; pure black and pure white are avoided. Contrast was checked for `icon` on every surface, `tint` on `tintSoft`, `ember` on `emberSoft`, and `danger` and `success` on `cardBackground` (WCAG AA in both themes). Re-check any new pairing.

### Typography

`ThemedText` (`components/themed-text.tsx`) carries the scale as `type` values. Large titles and numbers use the rounded system face (`Fonts.rounded`, `ui-rounded` on iOS; Android falls back to the default face). Body text stays SF Pro / Roboto. Numbers that change or align use tabular figures.

| `type` | Size / weight / face | Use |
|---|---|---|
| `largeTitle` | 34 / 800 / rounded, -0.5 tracking | Screen titles |
| `heading` | 30 / 800 / rounded | Onboarding and sheet headlines |
| `hero` | 40 to 64 / 800 / rounded, tabular (48 default) | The one big number on a screen |
| `stat` | 20 to 26 / 800 / rounded, tabular (22 default) | Card stats |
| `title` | 17 / 600 | Card titles, row titles |
| `body` | 15 / 400, 1.45 line height | Body text, food names |
| `label` | 13 / 500 | Metadata, gram values, field labels |
| `caption` | 12 / 400 / `icon` | Sub-labels, units, timestamps |
| `section` | 13 / 600 / `icon` | Section labels above lists |

The older `default`, `defaultSemiBold`, `subtitle` and `link` types still work. Never set `allowFontScaling={false}` on these styles.

### Spacing and shape

- Screen gutter 16. Gap between cards 14 (12 on settings lists). Card padding 18 vertical / 20 horizontal; compact cards 14 / 16. Spacing steps: 4, 8, 14, 16, 20, 24, 40.
- Radius: card 22, list group 18, nested panel 14, button 14 (large 16, small 11), field 12, segment 10, chip and pill 999, sheet top 28, tag 7, icon tile 9 (32 px) or 12 to 16 (40 to 52 px).
- Tab screens start content at the safe area plus about 8. Push screens put the back row in the first 44 pt.
- Prefer the scales. If a design needs a new step, add it to the scale rather than using a one-off value.

### Surfaces and depth

Cards and list groups are lighter than the page and carry a soft shadow in light mode (`Shadows.light.card`); dark mode has no card shadow and gets depth from the lighter surface. Floating bars, sticky footers and dialogs use `Shadows.*.floating`. Read shadows with `useShadow()` (`hooks/useShadow.ts`), never as inline values. Overlays use the `overlay` scrim. Material stays on the bottom navigation only; sheets, banners and footers are solid.

### Icons

`IconSymbol` maps SF Symbols on iOS to Material Icons elsewhere. Icons at rest use `icon`; active or selected icons use `tint`. Icons on a soft fill sit in an `IconTile`. Keep one weight per context.

### Motion

Presses dim to about 85% opacity with no scale; screens use native transitions. Motion should explain (where something came from), confirm (food logged, set ticked) or celebrate (workout finished, new record). Keep feedback short, around 200 to 300 ms, and follow Reduce Motion (`hooks/useReduceMotion.ts`): the `CelebrationBanner` fades in and is static when Reduce Motion is on.

### Components

Shared primitives live in `components/ui/` and map one to one to the classes in `docs/design/redesign/boards/bf.css`. Reuse them before making new ones, and change them when a better version is found.

| Primitive | Props and states |
|---|---|
| `Card` | `padding` default / compact / none; `tone` default / tint / ember / ink. Default tone carries the light card shadow |
| `ListGroup`, `ListRow` | Group: card surface, 18 radius, hairline separators. Row: `title`, `subtitle`, `leading`, `trailing` (text or node), `onPress`, `chevron`, `destructive`, min height 52 |
| `IconTile` | `icon`, `tone` tint / ember / success / neutral / danger, size 32 / 40 / 52; decorative |
| `Button` | `variant` primary / secondary / soft / ghost / danger / ink / inverse (on a tint surface), `size` sm / md / lg (lg is full width), `icon`, `disabled`, `loading` (busy); 44 pt target at every size |
| `Chip` | `selected`, `tone` default / soft / ink / ember (selected look), `size` sm / md, `role` radio / checkbox / button, `dot`, `surface` nested / card; static without `onPress` |
| `Tag` | `tone` neutral / tint / ember, optional icon |
| `SegmentedControl` | `options`, `value`, `onChange`; a named radiogroup, selected segment raised |
| `Stepper` | `value` or inline `children`, labelled minus and plus buttons, per-button disabled |
| `TextField` | `label`, `error` (danger border, inline message, hint, announced), `hint`, `size` md / big / mini, `suffix`, `trailing` control |
| `SearchField` | Nested fill, focus border, "Clear search" button |
| `ProgressBar` | `value`, `max`, `color`, `preview` segment, height 6 / 8 / 12; over max stays full in the same color |
| `SheetHeader` | Cancel / title (header) / action, optional grabber and subtitle |
| `StickyFooter` | Message left (errors announced in `danger`), action right, safe-area padding |
| `EmptyState` | Dinosaur, title (header), body, actions; card or plain |
| `CelebrationBanner` | Ember icon, title, body, optional Dismiss; announced; static with Reduce Motion |

Older components now built on them: `SettingsRow` (a single `ListRow` on a list surface), `PillSwitch` and `RangeChips` (`SegmentedControl`), `ChipToggle` (`Chip`), `MacroBar` (label and grams over a `ProgressBar` on `track`).

- **Calorie ring:** single tint stroke on a track, rounded `hero` number in the middle, a text summary for screen readers ("1,640 of 2,200 calories").
- **Native controls:** React Native `Switch` with `trackColor={{ true: tint }}`; platform date and time pickers.
- **Sheets and modals:** native presentation; bottom sheets use `SheetHeader` on `sheetBackground`; `fullScreenModal` screens pad with safe-area insets (see `CLAUDE.md`).
- **Bottom navigation:** native on iOS 26+; elsewhere a 64 pt floating shell (radius 32, `tintSoft` active pill, `tint` icon) with the live workout as a solid 54 pt pill above it ([ADR 0014](docs/decisions/0014-material-on-bottom-navigation-only.md)).

### Interaction states

| State | Baseline treatment |
|---|---|
| Pressed | Dim to about 85% opacity |
| Focused | 2 pt tint border on inputs and the search field; visible focus on every control |
| Selected | Tint fill (chips), raised segment, check on radio rows, tint icon on a `tintSoft` pill (tabs) |
| Disabled | About 50% opacity, shape unchanged |
| Error | 2 pt `danger` border plus a message in words, read in the field's hint and announced |
| Loading | Activity indicator in place of the label (`busy` state) or a placeholder in place of the content |
| Empty | `EmptyState`: a short sentence and the next useful action |
| Success | Brief confirmation; optional haptic. Celebrations use `CelebrationBanner` |

## Voice and copy

Plain, direct and friendly. Sentence case. Numbers carry units. Say what happened and what to do next.

- Good: "Workout saved. 2 new records." "No meals logged yet. Add your first food." "Over by 120 cal."
- Avoid: "Great job staying under!" (judges intake), "Don't break your streak!" (pressure), "Oops! Something went wrong :(" (vague).

## Open questions

Tracked in #98. [ADR 0017](docs/decisions/0017-lifted-paper-direction.md) answers 2, 5, 6 and 7 and part of 3; the baseline above reflects its foundations (tokens, type and primitives). Screens move to it per area (`docs/design/redesign/`).

1. **Accent strategy:** one tint, or an accent per area?
2. **Danger vs protein:** they share #E74C3C. Which one moves?
3. **Celebration:** which moments are acknowledged (finished workout, record, steady week, streak), and how much motion and haptics?
4. **Streak prominence:** keep a small flame badge, or give consistency more presence?
5. **Depth:** introduce elevation or shadow for sheets, the session bar or hero cards?
6. **Type:** a distinct numeral face for hero numbers?
7. **Light theme:** keep warm paper, or move to a cleaner neutral?
8. **Density:** how much of the nutrient and set data shows by default versus on demand?
