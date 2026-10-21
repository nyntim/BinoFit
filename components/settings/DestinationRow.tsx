import { useState } from 'react';
import { Linking, View } from 'react-native';
import { router } from 'expo-router';
import { SettingsRow } from '@/components/settings/SettingsPage';
import { ThemedText } from '@/components/themed-text';
import { internalSettingsDestination, settingsDestination, type SettingsDestination } from '@/lib/settings-destinations';

export function DestinationRow({ label, destination }: { label: string; destination: SettingsDestination }) {
  const url = settingsDestination(destination);
  const [failed, setFailed] = useState(false);
  return <View>
    <SettingsRow label={label} onPress={() => {
      setFailed(false);
      if (url) void Linking.openURL(url).catch(() => setFailed(true));
      else router.push(internalSettingsDestination(destination));
    }} />
    {failed && <ThemedText>Could not open {label.toLowerCase()}. Try again.</ThemedText>}
  </View>;
}
