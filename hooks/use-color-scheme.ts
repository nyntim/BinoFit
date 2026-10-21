import { useColorScheme as useRNColorScheme } from 'react-native';
import { usePreferences } from '@/hooks/usePreferences';

// React Native 0.86 can report 'unspecified'; treat it like no preference
export function useColorScheme() {
  const colorScheme = useRNColorScheme();
  const { appearance } = usePreferences();
  if (appearance === 'light' || appearance === 'dark') return appearance;
  return colorScheme === 'unspecified' ? null : colorScheme;
}
