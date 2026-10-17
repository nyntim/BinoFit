import { Tabs, usePathname, useRouter } from 'expo-router';
import React, { useEffect } from 'react';

import { HapticTab } from '@/components/haptic-tab';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { Colors } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { usePreferences } from '@/hooks/usePreferences';
import { DateProvider } from '@/context/DateContext';
import { homeRouteFor, isTabVisible } from '@/lib/tracking-mode';

export default function TabLayout() {
  const colorScheme = useColorScheme();
  const router = useRouter();
  const pathname = usePathname();
  const { trackingMode, loaded } = usePreferences();

  // A hidden Home tab can still be the focused route (e.g. mode switched in More, or deep link).
  useEffect(() => {
    if (!loaded) return;
    // Each redirect target is a visible tab, so this cannot loop.
    const onHiddenHome = !isTabVisible('index', trackingMode) && (pathname === '/' || pathname === '/(tabs)');
    const onHiddenTraining = !isTabVisible('training', trackingMode) && pathname === '/training';
    if (onHiddenHome || onHiddenTraining) {
      router.replace(homeRouteFor(trackingMode));
    }
  }, [loaded, trackingMode, pathname, router]);

  return (
    <DateProvider>
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: Colors[colorScheme ?? 'light'].tint,
        headerShown: false,
        tabBarButton: HapticTab,
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: 'Home',
          href: isTabVisible('index', trackingMode) ? undefined : null,
          tabBarIcon: ({ color }) => <IconSymbol size={28} name="house.fill" color={color} />,
        }}
      />
      <Tabs.Screen
        name="training"
        options={{
          title: 'Training',
          href: isTabVisible('training', trackingMode) ? undefined : null,
          tabBarIcon: ({ color }) => <IconSymbol size={28} name="dumbbell.fill" color={color} />,
        }}
      />
      <Tabs.Screen
        name="progress"
        options={{
          title: 'Progress',
          tabBarIcon: ({ color }) => <IconSymbol size={28} name="chart.bar.fill" color={color} />,
        }}
      />
      <Tabs.Screen
        name="settings"
        options={{
          title: 'More',
          tabBarIcon: ({ color }) => <IconSymbol size={28} name="ellipsis" color={color} />,
        }}
      />
    </Tabs>
    </DateProvider>
  );
}
