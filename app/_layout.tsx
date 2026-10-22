import { DarkTheme, DefaultTheme, Stack, ThemeProvider, router, usePathname } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import 'react-native-reanimated';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { useEffect, useRef } from 'react';
import { Appearance, AppState, type AppStateStatus } from 'react-native';

import { useColorScheme } from '@/hooks/use-color-scheme';
import { useThemeColor } from '@/hooks/use-theme-color';
import { usePreferences } from '@/hooks/usePreferences';
import { DateProvider } from '@/context/DateContext';
import { syncToSupabase } from '@/lib/sync';
import { loadPreferences } from '@/lib/app-preferences';
import { homeRouteFor } from '@/lib/tracking-mode';
import { initAuth } from '@/lib/auth';
import { supabase } from '@/lib/supabase';
import { isSyncConfigured } from '@/lib/sync-status';
import { useSyncAutoRetry } from '@/hooks/useSyncAutoRetry';
import { useStaleSessionPrompt } from '@/hooks/useStaleSessionPrompt';
import { configureNotificationHandler, restoreMealReminders } from '@/lib/reminders';
import { getActiveWorkoutState, refreshActiveWorkout } from '@/lib/workouts/active-workout-store';
import { purgeStaleDrafts } from '@/lib/workouts/drafts';
import { restoreRestTimer } from '@/lib/workouts/rest-timer-store';

configureNotificationHandler();

export const unstable_settings = {
  anchor: 'index',
};

export default function RootLayout() {
  const colorScheme = useColorScheme();
  const { appearance } = usePreferences();
  const background = useThemeColor({}, 'background');
  const card = useThemeColor({}, 'cardBackground');
  const text = useThemeColor({}, 'text');
  const primary = useThemeColor({}, 'tint');
  const border = useThemeColor({}, 'separator');
  const baseTheme = colorScheme === 'dark' ? DarkTheme : DefaultTheme;
  const navigationTheme = { ...baseTheme, colors: { ...baseTheme.colors, background, card, text, primary, border } };
  useEffect(() => { Appearance.setColorScheme(appearance === 'system' ? 'unspecified' : appearance); }, [appearance]);
  const appState = useRef<AppStateStatus>(AppState.currentState);

  useSyncAutoRetry();
  useStaleSessionPrompt();

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
    // Workouts: drop abandoned drafts, then read the active session (never throws).
    purgeStaleDrafts(new Date())
      .catch(() => undefined)
      .then(() => refreshActiveWorkout())
      .then(() => restoreRestTimer(getActiveWorkoutState().workout?.id ?? null));
    // Establishes the session first; initAuth triggers the first sync once there is a user id.
    initAuth().then((result) => {
      // A signed-in session survived a reinstall and its data came back. Onboarding is already
      // marked complete; only leave the screen if the user has not started interacting with it
      // (still on the welcome screen or the loading route), otherwise it applies next launch.
      const route = pathnameRef.current;
      if (result.restored && (route === '/' || route === '/onboarding')) {
        router.replace(homeRouteFor());
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
      <ThemeProvider value={navigationTheme}>
        <Stack>
          <Stack.Screen name="index" options={{ headerShown: false }} />
          <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
          <Stack.Screen name="settings" options={{ headerShown: false }} />
          <Stack.Screen name="onboarding" options={{ headerShown: false }} />
          <Stack.Screen name="account" options={{ presentation: 'modal', headerShown: false }} />
          <Stack.Screen name="food-search" options={{ presentation: 'modal', headerShown: false }} />
          <Stack.Screen name="serving-picker" options={{ presentation: 'modal', headerShown: false }} />
          <Stack.Screen name="food-batch-review" options={{ presentation: 'modal', headerShown: false }} />
          <Stack.Screen name="barcode-scanner" options={{ presentation: 'fullScreenModal', headerShown: false }} />
          <Stack.Screen name="day-detail" options={{ headerShown: false }} />
          <Stack.Screen name="custom-food" options={{ presentation: 'modal', headerShown: false }} />
          <Stack.Screen
            name="workout/exercises"
            options={({ route }) => ({
              presentation: (route.params as { pick?: string } | undefined)?.pick ? 'modal' : 'card',
              headerShown: false,
            })}
          />
          <Stack.Screen name="workout/new-exercise" options={{ presentation: 'modal', headerShown: false }} />
          {/* Screen files arrive in later chunks (session: C9, history: C8); registered up front. */}
          <Stack.Screen
            name="workout/session"
            options={{ presentation: 'fullScreenModal', animation: 'slide_from_bottom', headerShown: false }}
          />
          <Stack.Screen name="spotify-auth" options={{ headerShown: false, animation: 'none' }} />
          <Stack.Screen name="workout/log" options={{ presentation: 'modal', headerShown: false }} />
          <Stack.Screen name="workout/[id]" options={{ presentation: 'card', headerShown: false }} />
          <Stack.Screen name="workout/history" options={{ presentation: 'card', headerShown: false }} />
          <Stack.Screen name="workout/routine" options={{ presentation: 'card', headerShown: false }} />
        </Stack>
        <StatusBar style={colorScheme === 'dark' ? 'light' : 'dark'} />
      </ThemeProvider>
    </DateProvider>
    </GestureHandlerRootView>
  );
}
