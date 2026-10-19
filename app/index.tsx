import { useEffect } from 'react';
import { View, ActivityIndicator } from 'react-native';
import { router } from 'expo-router';
import { useThemeColor } from '@/hooks/use-theme-color';
import { loadPreferences } from '@/lib/app-preferences';
import { getOnboardingComplete } from '@/lib/storage';
import { homeRouteFor } from '@/lib/tracking-mode';

export default function RootIndex() {
  const background = useThemeColor({}, 'background');
  const tint = useThemeColor({}, 'tint');
  const colors = { background, tint };

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
