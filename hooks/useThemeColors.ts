import type { Colors } from '@/constants/theme';
import { useThemeColor } from '@/hooks/use-theme-color';

/** The full palette for the current scheme, for components that take a `colors` prop (e.g. TimePickerSheet). */
export function useThemeColors(): typeof Colors.light {
  return {
    text: useThemeColor({}, 'text'),
    background: useThemeColor({}, 'background'),
    tint: useThemeColor({}, 'tint'),
    overlay: useThemeColor({}, 'overlay'),
    icon: useThemeColor({}, 'icon'),
    tabIconDefault: useThemeColor({}, 'tabIconDefault'),
    tabIconSelected: useThemeColor({}, 'tabIconSelected'),
    navSurface: useThemeColor({}, 'navSurface'),
    navOpaque: useThemeColor({}, 'navOpaque'),
    navBorder: useThemeColor({}, 'navBorder'),
    navActive: useThemeColor({}, 'navActive'),
    navActivePressed: useThemeColor({}, 'navActivePressed'),
    navShadow: useThemeColor({}, 'navShadow'),
    cardBackground: useThemeColor({}, 'cardBackground'),
    cardSecondary: useThemeColor({}, 'cardSecondary'),
    separator: useThemeColor({}, 'separator'),
    fieldBorder: useThemeColor({}, 'fieldBorder'),
    track: useThemeColor({}, 'track'),
    success: useThemeColor({}, 'success'),
    danger: useThemeColor({}, 'danger'),
    streak: useThemeColor({}, 'streak'),
  };
}
