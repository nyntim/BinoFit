import { DarkTheme, DefaultTheme, Stack, ThemeProvider, router, usePathname } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import 'react-native-reanimated';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { useEffect, useRef } from 'react';
import { AppState, type AppStateStatus } from 'react-native';

import { useColorScheme } from '@/hooks/use-color-scheme';
import { DateProvider } from '@/context/DateContext';
import { syncToSupabase } from '@/lib/sync';
import { getPreferences, loadPreferences } from '@/lib/app-preferences';
import { homeRouteFor } from '@/lib/tracking-mode';
import { initAuth } from '@/lib/auth';
import { supabase } from '@/lib/supabase';
import { isSyncConfigured } from '@/lib/sync-status';
import { useSyncAutoRetry } from '@/hooks/useSyncAutoRetry';
import { configureNotificationHandler, restoreMealReminders } from '@/lib/reminders';

configureNotificationHandler();

export const unstable_settings = {
  anchor: 'index',
};

export default function RootLayout() {
  const colorScheme = useColorScheme();
  const appState = useRef<AppStateStatus>(AppState.currentState);

  useSyncAutoRetry();

  const pathname = usePathname();
  const pathnameRef = useRef(pathname);
  useEffect(() => {
    pathnameRef.current = pathname;
  }, [pathname]);

  // Re-create meal reminders on launch and on foreground, in case the OS cleared them
  // or notification permission changed in system settings.
  useEffect(() => {
    restoreMealReminders();
    loadPreferences();
    // Establishes the session first; initAuth triggers the first sync once there is a user id.
    initAuth().then((result) => {
      // A signed-in session survived a reinstall and its data came back. Onboarding is already
      // marked complete; only leave the screen if the user has not started interacting with it
      // (still on the welcome screen or the loading route), otherwise it applies next launch.
      const route = pathnameRef.current;
      if (result.restored && (route === '/' || route === '/onboarding')) {
        loadPreferences().then(() => router.replace(homeRouteFor(getPreferences().trackingMode)));
      }
    });
  }, []);

  useEffect(() => {
    const subscription = AppState.addEventListener('change', (nextState) => {
      if (appState.current.match(/inactive|background/) && nextState === 'active') {
        if (isSyncConfigured()) supabase.auth.startAutoRefresh();
        syncToSupabase();
        restoreMealReminders();
      } else if (nextState !== 'active' && isSyncConfigured()) {
        supabase.auth.stopAutoRefresh();
      }
      appState.current = nextState;
    });
    return () => subscription.remove();
  }, []);

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
    <DateProvider>
      <ThemeProvider value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}>
        <Stack>
          <Stack.Screen name="index" options={{ headerShown: false }} />
          <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
          <Stack.Screen name="onboarding" options={{ headerShown: false }} />
          <Stack.Screen name="account" options={{ presentation: 'modal', headerShown: false }} />
          <Stack.Screen name="food-search" options={{ presentation: 'modal', headerShown: false }} />
          <Stack.Screen name="serving-picker" options={{ presentation: 'modal', headerShown: false }} />
          <Stack.Screen name="barcode-scanner" options={{ presentation: 'fullScreenModal', headerShown: false }} />
          <Stack.Screen name="day-detail" options={{ headerShown: false }} />
          <Stack.Screen name="custom-food" options={{ presentation: 'modal', headerShown: false }} />
        </Stack>
        <StatusBar style="auto" />
      </ThemeProvider>
    </DateProvider>
    </GestureHandlerRootView>
  );
}
