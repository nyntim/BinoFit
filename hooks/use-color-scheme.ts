import { useColorScheme as useRNColorScheme } from 'react-native';

// React Native 0.86 can report 'unspecified'; treat it like no preference
export function useColorScheme() {
  const colorScheme = useRNColorScheme();
  return colorScheme === 'unspecified' ? null : colorScheme;
}
