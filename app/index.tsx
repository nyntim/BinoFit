import { useEffect } from 'react';
import { View, ActivityIndicator } from 'react-native';
import { router } from 'expo-router';
import { loadPreferences } from '@/lib/app-preferences';
import { getOnboardingComplete } from '@/lib/storage';
import { homeRouteFor } from '@/lib/tracking-mode';
import { Colors } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';

export default function RootIndex() {
  const colorScheme = useColorScheme();
  const colors = Colors[colorScheme ?? 'light'];

  useEffect(() => {
    Promise.all([getOnboardingComplete(), loadPreferences()]).then(([done]) => {
      if (done) {
        router.replace(homeRouteFor());
      } else {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        router.replace('/onboarding' as any);
      }
    });
  }, []);

  return (
    <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: colors.background }}>
      <ActivityIndicator color={colors.tint} />
    </View>
  );
}
