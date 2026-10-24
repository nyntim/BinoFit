import { Colors } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';

/** The full palette for the current scheme, for components that take a `colors` prop (e.g. TimePickerSheet). */
export function useThemeColors(): typeof Colors.light {
  return Colors[useColorScheme() ?? 'light'];
}
