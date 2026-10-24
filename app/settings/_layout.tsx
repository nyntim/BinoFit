import { Stack } from 'expo-router';
import { SETTINGS_SCREEN_TITLES } from '@/lib/settings-screens';

export default function SettingsLayout() {
  return <Stack screenOptions={{ headerShown: false }}>{Object.entries(SETTINGS_SCREEN_TITLES).map(([name, title]) => <Stack.Screen key={name} name={name} options={{ title }} />)}</Stack>;
}
