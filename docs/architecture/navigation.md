# Navigation and routes

Expo Router v6 with file-based routing. Every route outside the tabs is registered on the root Stack in `app/_layout.tsx` (there is no nested workout layout).

## Routes (`app/`)

- `(tabs)/`: bottom tabs `index` (Nutrition dashboard), `training`, `progress`, `settings`. All four always show.
- `onboarding/`: `index` (welcome, account offered first), `account`, `goals`, `complete`. See [auth.md](auth.md) and [preferences.md](preferences.md).
- Nutrition: `food-search.tsx`, `food-batch-review.tsx` (multi-select review modal opened from food search), `serving-picker.tsx`, `custom-food.tsx`, `barcode-scanner.tsx`, `day-detail.tsx`. See [nutrition.md](nutrition.md).
- `settings/`: the Settings destinations (Profile, Nutrition, Training, Preferences, Notifications, Account, Integrations, Data and privacy, About, Support and their sub pages). See [preferences.md](preferences.md).
- `account.tsx`: account modal. `spotify-auth.tsx`: Spotify sign-in landing route.
- `workout/`: `exercises`, `new-exercise`, `log`, `[id]`, `history`, `session`, `routine`. See [training.md](training.md).

## Tab bar

`app/(tabs)/_layout.tsx` wraps `components/navigation/TabNavigator` in `DateProvider`.

- iOS 26 and later: `TabNavigator.ios.tsx` uses `NativeTabs` (`expo-router/unstable-native-tabs`) and shows the active workout as `NativeTabs.BottomAccessory` (`<ActiveWorkoutBar nativeAccessory />`).
- Android and iOS below 26: `JsTabNavigator` renders the custom `FloatingTabBar` (`BottomTabBarProps` from `expo-router/js-tabs`), which draws `ActiveWorkoutBar` as a solid pill above the 64 pt shell (active tab on a `tintSoft` pill) and hides while the keyboard is open.

## Liquid Glass

Liquid Glass is limited to the main bottom navigation. Keep native four-tab geometry and its existing system-owned workout accessory. The fallback `components/navigation/TabBarSurface.ios.tsx` owns its material, runtime availability and Reduce Transparency handling. Headers, buttons, sheets, rest controls and keyboard accessories use plain or solid theme surfaces. Do not add shared glass control wrappers. See `docs/decisions/0014-material-on-bottom-navigation-only.md` for the rationale and verification limits.

## Conventions

- Navigate with `router.push()` and `router.back()`.
- Every navigation to the app's home uses `homeRouteFor()` (see [preferences.md](preferences.md)).
- Day navigation: `@/context/DateContext` holds the selected date; `@/hooks/useSwipeDayNavigation` swipes between days.
