import { Stack } from 'expo-router';
export default function SettingsLayout() {
  return <Stack screenOptions={{ headerShown: false }}>{['profile', 'nutrition', 'training', 'preferences', 'notifications', 'account', 'integrations', 'data-privacy', 'about', 'support'].map(name => <Stack.Screen key={name} name={name} options={{ title: name === 'data-privacy' ? 'Data and Privacy' : name.charAt(0).toUpperCase() + name.slice(1) }} />)}</Stack>;
}
