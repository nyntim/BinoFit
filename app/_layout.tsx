import { DarkTheme, DefaultTheme, Stack, ThemeProvider } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import 'react-native-reanimated';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { useEffect, useRef } from 'react';
import { AppState, type AppStateStatus } from 'react-native';

import { useColorScheme } from '@/hooks/use-color-scheme';
import { DateProvider } from '@/context/DateContext';
import { syncToSupabase } from '@/lib/sync';
import { configureNotificationHandler, restoreMealReminders } from '@/lib/reminders';

configureNotificationHandler();

export const unstable_settings = {
  anchor: 'index',
};

export default function RootLayout() {
  const colorScheme = useColorScheme();
  const appState = useRef<AppStateStatus>(AppState.currentState);

  // Re-create meal reminders on launch and on foreground, in case the OS cleared them
  // or notification permission changed in system settings.
  useEffect(() => {
    restoreMealReminders();
  }, []);

  useEffect(() => {
    const subscription = AppState.addEventListener('change', (nextState) => {
      if (appState.current.match(/inactive|background/) && nextState === 'active') {
        syncToSupabase();
        restoreMealReminders();
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
          <Stack.Screen name="food-search" options={{ presentation: 'modal', headerShown: false }} />
          <Stack.Screen name="serving-picker" options={{ presentation: 'modal', headerShown: false }} />
          <Stack.Screen name="day-detail" options={{ headerShown: false }} />
          <Stack.Screen name="custom-food" options={{ presentation: 'modal', headerShown: false }} />
        </Stack>
        <StatusBar style="auto" />
      </ThemeProvider>
    </DateProvider>
    </GestureHandlerRootView>
  );
}
