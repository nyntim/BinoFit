# 0014. Liquid Glass only on the bottom navigation

- **Status:** Accepted
- **Date:** 2026-10-21
- **Links:** #93, #96, `docs/architecture/navigation.md`, `components/navigation/TabBarSurface.ios.tsx`

## Context
#93 added a glass-style floating tab bar. #96 then extended Liquid Glass to headers, action groups, sheet controls, calendar navigation, keyboard bars and rest controls through shared `ControlSurface` wrappers. In use, the extra material competed with content, hurt legibility over busy screens and added accessibility edge cases (Reduce Transparency, contrast in forced themes, decorative layers catching touches).

## Decision
The expanded #96 treatment was withdrawn on 2026-10-21. Material is limited to the main bottom navigation:
- iOS 26+ uses the native tab bar; its geometry, selection, material, animation and insets are system-owned. The active workout uses the native bottom accessory.
- Older iOS uses a fallback floating shell with regular glass when available, blur otherwise, and opaque theme neutrals when Reduce Transparency is on or unknown. Android uses a theme surface.
- Everything else (headers, buttons, sheets, rest controls, keyboard accessories, cards, charts) uses plain or solid theme surfaces. There is no shared glass wrapper.

## Alternatives considered
- Glass across all controls (#96): more cohesive with iOS 26 system apps, but noisier and harder to make accessible.
- No material at all: loses the platform feel of the native tab bar.

## Consequences
- New designs should not depend on translucent controls. Depth elsewhere comes from color, shadow or layout (see `DESIGN.md`).
- Unrelated to glass, a React Native 0.86.3 text-measurement workaround stays in `patches/react-native+0.86.3.patch` ([RN #57512](https://github.com/facebook/react-native/issues/57512): stale text boxes after a system text-size change). Remove it once the Expo-supported runtime includes [RN #57246](https://github.com/facebook/react-native/pull/57246), then recheck text-size changes with a partly typed form.
- Not yet verified on devices: physical Expo Go, VoiceOver, older iOS and Android runtime behavior of the retained navigation.
