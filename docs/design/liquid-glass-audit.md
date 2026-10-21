# Bottom navigation material

The expanded #96 Liquid Glass treatment was withdrawn at the user's request on 2026-10-21. Material is limited to the main bottom navigation. The shared `ControlSurface` components and all added glass wrappers on app controls are removed.

## Current scope

- iOS 26+ retains the four native, system-sized tabs: Nutrition, Training, Progress and More. Their geometry, selection, material, animation and insets remain system-owned.
- The existing native workout bottom accessory predates #96 and retains its system-owned presentation and tap-to-reopen behavior. No added material wraps its content.
- The fallback four-tab shell retains its existing material. `TabBarSurface.ios.tsx` owns both availability checks, opaque initial state, live Reduce Transparency handling, rejected-query fallback and older-iOS blur. The default/Android tab shell retains its existing theme surface.
- Headers, action groups, sheet controls, calendar navigation, keyboard Done bars and rest controls return to plain or solid theme surfaces. The fallback workout banner is solid. There is no shared glass helper for control surfaces.
- Food validation, virtualized search, nutrient infrastructure, meal summaries, accessible targets and responsive text layouts remain in place.

## Live text sizing

The separate React Native 0.86.3 live text-measurement workaround remains in `patches/react-native+0.86.3.patch`. It addresses [RN #57512](https://github.com/react/react-native/issues/57512), where later React commits restore stale text boxes after a system text-size change. It is not a glass effect and changes no native code, dependencies, screen identity or form state.

Before this material removal, the patched Release app passed default to enlarged text and back, two smaller text sizes, subsequent modal/input commits, and background/foreground with a partial goal draft on iPhone 17 Pro / iOS 26.4. The draft `2.` retained focus and accepted two further edits as `2.34`; the original goal of 2000 was restored. Remove this patch once the Expo-supported native runtime includes [RN #57246](https://github.com/react/react-native/pull/57246), then repeat these checks.

## Verification

The material removal passed lint with zero errors and 14 existing warnings, TypeScript, all 98 suites / 1,419 tests, and a combined review with no blocking findings. Native tab and fallback material tests cover the retained navigation; flow tests cover rest actions, pending Finish, minimize and options dismissal. These checks cannot establish physical contrast or native compositing. No simulator validation of the removal was performed; Simulator was quit at the user's request.

Physical Expo Go, VoiceOver, older-iOS and Android runtime verification remain outstanding. The previous simulator automation did not reliably scroll or drag, so it does not establish long-list performance or scroll restoration. Nested, capped and selectable text were reviewed in source, not exhaustively verified on devices.
