# Redesign foundations

Everything the screen guides assume. Build this first: tokens, type, primitives. Every screen in the other guides is mostly a recombination of what is defined here.

Direction: "lifted paper, precise ink, a little ember" ([ADR 0017](../../decisions/0017-lifted-paper-direction.md)). Source of truth for the look is `boards/bf.css` (the shared stylesheet every new board uses) plus the boards themselves.

## 1. Color tokens (`constants/theme.ts`)

Change existing values and add the new keys below in `Colors.light` and `Colors.dark`. Every new key needs both themes. Keep reading colors through `useThemeColor`; add each new key to `hooks/useThemeColors.ts` as well.

| Key | Light | Dark | Status | Use |
|---|---|---|---|---|
| `background` | `#F4F0E8` | `#0E0E10` | changed (light was `#F8F5EF`) | Page |
| `cardBackground` | `#FBF9F5` | `#1A1A1D` | changed (light was `#EEEAE2`) | Cards, lists, sheets. In light mode cards are now lighter than the page |
| `cardSecondary` | `#EDE8DE` | `#242428` | changed (light) | Nested surfaces: search fields, segmented tracks, chips at rest, nested panels |
| `raised` | `#FBF9F5` | `#3A3A40` | new | Selected segment, stepper buttons |
| `text` | `#1A1A22` | `#EDEDF0` | same | Primary text |
| `icon` | `#5E5E6E` | `#9A9AA3` | changed | Secondary text, captions, resting icons |
| `separator` | `#E2DDD2` | `rgba(237,237,240,0.10)` | changed (light) | Row dividers |
| `fieldBorder` | `#D9D3C7` | `rgba(237,237,240,0.28)` | changed (light) | Input and secondary button borders |
| `track` | `#E4DFD4` | `rgba(237,237,240,0.14)` | changed (light) | Ring and bar tracks |
| `chartBar` | `#A9A4A0` | `#5A5A62` | new | Resting chart bars |
| `tint` | `#3D4B7A` | `#8FA3D6` | same | Primary actions, selection, focus |
| `tintSoft` | `#E3E6F0` | `rgba(143,163,214,0.16)` | new | Soft buttons, selected rows, active tab pill, icon tiles |
| `onTint` | `#FBF9F5` | `#0E0E10` | new | Text and icons on a `tint` fill (replaces using `background` for this) |
| `ember` | `#C2410C` | `#FF8A3D` | new (replaces `streak`) | Acknowledgement only: streaks, records, celebrations |
| `emberSoft` | `#FBE6D9` | `rgba(255,138,61,0.14)` | new | Background behind ember content |
| `danger` | `#B3261E` | `#FF8A80` | changed (no longer equals protein red) | Errors, destructive actions |
| `dangerSoft` | `#F8E1DE` | `rgba(255,138,128,0.14)` | new | Destructive button background |
| `success` | `#1E7A45` | `#52D68A` | changed (light now passes text contrast) | Confirmation, "allowed", synced dot |
| `successSoft` | `#DDEFE4` | `rgba(82,214,138,0.14)` | new | Background behind success icons |
| `overlay` | `rgba(26,26,34,0.42)` | `rgba(0,0,0,0.55)` | changed | Scrim behind sheets and dialogs |
| `sheetBackground` | `#FBF9F5` | `#1F1F23` | new | Bottom sheets |
| `navSurface` | `rgba(251,249,245,0.74)` | `rgba(36,36,40,0.74)` | changed | Fallback tab bar material |
| `navBorder` | `rgba(26,26,34,0.08)` | `rgba(237,237,240,0.12)` | changed | Fallback tab bar border |

- `MacroColors` (protein `#E74C3C`, carbs `#F39C12`, fat `#3498DB`) and `TargetTints` are unchanged.
- Migrate `streak` callers (`components/StreakBadge.tsx`) to `ember`, then delete `streak`.
- `navActive` / `navActivePressed`: set to `tintSoft` values so the fallback tab pill matches the boards.
- Contrast was checked for: `icon` on `background`, `cardBackground` and `cardSecondary`; `tint` on `tintSoft`; `ember` on `emberSoft`; `danger` and `success` on `cardBackground`. All pass WCAG AA in both themes. Re-check any new pairing.

**Accent (open).** Boards have an Accent setting: Indigo (default, current), Plum (`#6A4C7D` / `#C3A6D6`, soft `#ECE4F0`), Pine (`#2F5D50` / `#8CC7B3`, soft `#E0EBE6`). Ship Indigo unless the owner picks another. Do not build a user-facing accent picker; it was a design lever only.

## 2. Elevation

Cards get a soft shadow in light mode and none in dark mode (depth there comes from the lighter surface).

- Light card shadow: `0 1px 2px rgba(26,26,34,0.05), 0 6px 20px rgba(26,26,34,0.06)`. React Native 0.81 with the New Architecture supports the `boxShadow` style string; use it directly.
- Add a `Shadows` export in `constants/theme.ts`: `{ light: { card: '<value above>' }, dark: { card: 'none' } }` and read it with `useShadow('card')` (`hooks/useShadow.ts`; `Card` and `ListGroup` already do) so screens never hardcode it.
- Floating elements (selection bar, sticky footers, dialogs): `0 10px 30px rgba(14,14,16,0.25)`.
- Liquid Glass remains bottom-navigation only ([ADR 0014](../../decisions/0014-material-on-bottom-navigation-only.md)). Sheets, banners and footers are solid.

## 3. Typography

Hero numbers and large titles move to the rounded system face. Body text stays SF Pro / Roboto.

- iOS: `fontFamily: Fonts.rounded` (`'ui-rounded'`, already in `constants/theme.ts`). Android has no rounded system face; it falls back to the default. Bundling a rounded font for Android is an open choice, not required.
- All numbers that change or align use `fontVariant: ['tabular-nums']`.
- Extend `ThemedText` (`components/themed-text.tsx`) with these `type` values rather than creating a second text component. Keep existing types working.

| `type` | Size / weight / face | Use |
|---|---|---|
| `largeTitle` | 34 / 800 / rounded, letterSpacing -0.5 | Screen titles ("Today", "Training", "Settings") |
| `heading` | 30 / 800 / rounded | Onboarding and sheet headlines ("Welcome back") |
| `hero` | 40 to 64 / 800 / rounded, tabular | The one big number (ring center, weight sheet value) |
| `stat` | 20 to 26 / 800 / rounded, tabular | Card stats (Left, volume, averages) |
| `title` | 17 / 600 | Card titles, row titles |
| `body` | 15 / 400, lineHeight 1.45 | Body text, food names |
| `label` | 13 / 500 | Metadata, gram values, field labels |
| `caption` | 12 / 400 / `icon` color | Sub-labels, units, timestamps |
| `section` | 13 / 600 / `icon` color | Section labels above lists |

Respect Dynamic Type: never set `allowFontScaling={false}` on these. The Largest-text board on the Direction page shows the expected reflow (ring becomes a bar, macros stack).

## 4. Spacing and shape

Add to `DESIGN.md` baseline when implementing.

- Screen gutter 16. Gap between cards 14 (12 on settings lists). Card padding 18 vertical / 20 horizontal; compact cards 14 / 16.
- Radius: card 22, list group 18, nested panel 14, button 14 (large 16), field 12, chip and pill 999, sheet top 28, tag 7, icon tile 9 (32 px tile) or 12 to 16 (40 to 52 px tiles).
- Top padding: tab screens start content at the safe area plus about 8. Push screens put the back row in the first 44 pt.

## 5. Primitives to build (`components/ui/`)

Build these once, with tests for states, then use them everywhere. The class names in `boards/bf.css` map one to one.

| Primitive | bf.css | Props and states | Replaces or updates |
|---|---|---|---|
| `Card` | `.card`, `.pad`, `.pad-s` | `padding: 'default' \| 'compact' \| 'none'`, `tone: 'default' \| 'tint' \| 'ember' \| 'ink'` | Ad hoc card `View`s in every screen |
| `ListGroup` + `ListRow` | `.list`, `.row`, `.row.tap` | Row: `title`, `subtitle`, `leading` (icon tile), `trailing` (text, switch, button, chevron), `onPress`, min height 52 | `components/settings/SettingsRow.tsx`, `DestinationRow.tsx` |
| `IconTile` | `.ico` | `icon`, `tone: tint \| ember \| success \| neutral \| danger`, size 32 / 40 / 52 | Inline icon backgrounds |
| `Button` | `.btn-*` | `variant: primary \| secondary \| soft \| ghost \| danger \| ink`, `size: sm \| md \| lg`, `icon`, `disabled`, `loading`; min height 44 (sm keeps a 44 hit area) | Inline `TouchableOpacity` buttons |
| `Chip` | `.chip`, `.chip.on`, `.ember-chip` | `selected`, `tone`, `size: sm \| md`, role radio or checkbox | `components/workouts/ChipToggle.tsx` (restyle or wrap) |
| `Tag` | `.tag` | `tone: neutral \| tint \| ember` | Source tags, status tags, record tags |
| `SegmentedControl` | `.seg` | `options`, `value`, `onChange`, accessible as radiogroup | `components/settings/PillSwitch.tsx`, `components/progress/RangeChips.tsx` |
| `Stepper` | `.stepper` | `value`, `onIncrement`, `onDecrement`, labels for both buttons | New (serving amount, default sets, batch review) |
| `TextField` | `.field`, `.focus`, `.error`, `.big`, `.mini` | `label`, `error`, `size: md \| big \| mini`, `suffix` (unit), keyboard type | Inline `TextInput`s in forms |
| `SearchField` | `.search` | `value`, `onChangeText`, clear button, focused state | Food search and exercise search inputs |
| `ProgressBar` | `.bar` | `value`, `max`, `color`, optional `preview` segment (pale add-on), height 6 / 8 / 12 | `components/macro-bar.tsx` (keep its API, restyle) |
| `SheetHeader` | sheet top row | Cancel / title / action, grabber | Headers in `MealSettingsSheet`, `WeightEntrySheet`, `SetTypeSheet`, water modals |
| `StickyFooter` | bottom bars | Error text on the left, primary action on the right, safe-area padding | `components/dashboard/EditModeBar.tsx`, settings save rows |
| `EmptyState` | empty boards | Image (the dinosaur, `assets/images/icon.png`), title, body, actions | Empty and first-run states |
| `CelebrationBanner` | ember banner | Icon, title, body; static when Reduce Motion is on | New (finished workout, onboarding done) |

Native controls stay native: use React Native `Switch` with `trackColor={{ true: tint }}`; keep the platform date and time pickers (`components/time-picker-sheet`).

## 6. Shared patterns

- **Tab screens:** large title row (title left, actions right, 44 pt buttons), content cards, bottom padding that clears the tab bar and live session accessory (existing measured clearance in `FloatingTabBar`).
- **Push screens:** back button with the previous screen's name, large title below, optional trailing action (Save, More options).
- **Modals** (`presentation: 'modal'`): the boards draw the system page sheet (dimmed page behind, rounded top). Header row: Cancel left, title center, action right.
- **Bottom sheets:** grabber, `SheetHeader`, solid `sheetBackground`, scrim `overlay`.
- **Full-screen modals** (session, scanner): pad with `useSafeAreaInsets()` (CLAUDE.md rule).
- **Sticky footers:** forms with explicit save put the action in a `StickyFooter`; validation errors show inline under the field and as a count in the footer ("Fix 1 field to save").
- **Celebration moments:** brief, skippable, never block the next tap. Haptic `notificationAsync(Success)` is fine where the app already uses haptics. With Reduce Motion, show the static banner only.

## 7. Bottom navigation

Keep the current system ([ADR 0014](../../decisions/0014-material-on-bottom-navigation-only.md), `docs/architecture/navigation.md`). The `CmpTabBar` board shows the fallback shell and the live workout accessory only to match colors.

- iOS 26+: native tabs, no styling beyond tint. Keep accessible names Nutrition, Training, Progress, Settings and the existing SF Symbols (`gearshape` for Settings; the board's dots icon is not a change request).
- Fallback (`components/navigation/FloatingTabBar.tsx`, `TabBarSurface*.tsx`): 64 px floating shell, radius 32, active item uses `tintSoft` pill and `tint` icon, accessory pill above it (54 px, radius 27) with name, elapsed and rest.

## 8. Accessibility checklist (every screen)

- Every icon-only button has `accessibilityLabel` (the boards include them; copy their wording).
- Targets at least 44 pt; smaller visuals get `hitSlop`.
- Rings and charts expose a text summary (`accessibilityLabel` on the wrapper, as on the boards).
- Selected states use `accessibilityState={{ selected }}` or `checked`; segmented controls use radio roles.
- Errors: `accessibilityLiveRegion="polite"` (Android) / announce on iOS, and the field gets the error in its hint.
- Dynamic Type at the largest size: text wraps, numbers never truncate.
- Reduce Motion and Reduce Transparency respected (`AccessibilityInfo`).
- Both themes checked on device or simulator.

## 9. Implementation order

1. **Tokens and type** (one PR): `constants/theme.ts`, `Shadows`, `ThemedText` types, `hooks/useThemeColors.ts`, `StreakBadge` to `ember`. Update `DESIGN.md` baseline tables and `docs/design/tokens.json` in the same PR. The app will already look closer to the boards after this.
2. **Primitives** (one PR): section 5, with unit tests for states. Swap `SettingsRow`, `PillSwitch`, `RangeChips`, `MacroBar` internals.
3. **Screens**, one area per PR, in this order: Nutrition dashboard and logging, Training, Progress, Settings, Onboarding. Each guide lists its boards in build order.
4. **New behavior** items flagged "New" in the guides: only after the owner confirms them (see the README's decisions list).

## 10. Verification per PR

- `npm run lint`, `npx tsc --noEmit`, `npm test`. Existing tests find elements by text and accessibility label (for example `components/__tests__/FoodSearchScreen.test.tsx`); keep labels and copy stable or update the tests in the same PR.
- Run the app (`npm run ios`) in light and dark, default and largest text size, and compare against the board.
- Run the design reviewer role (`docs/agents/design-reviewer.md`) on the diff.
