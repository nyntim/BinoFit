import { Stack } from 'expo-router';
export default function SettingsLayout() {
  return <Stack screenOptions={{ headerShown: false }}>{['profile', 'nutrition', 'training', 'preferences', 'notifications', 'account', 'integrations', 'data-privacy', 'about', 'support', 'privacy-policy', 'terms', 'report-problem', 'feedback'].map(name => <Stack.Screen key={name} name={name} options={{ title: ({ 'data-privacy': 'Data and Privacy', 'privacy-policy': 'Privacy Policy', terms: 'Terms of Service', 'report-problem': 'Report a problem', feedback: 'Send feedback' } as Record<string, string>)[name] ?? name.charAt(0).toUpperCase() + name.slice(1) }} />)}</Stack>;
}
