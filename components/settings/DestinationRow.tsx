import { useState } from 'react';
import { Linking, Text, View } from 'react-native';
import { router } from 'expo-router';
import { SettingsRow } from '@/components/settings/SettingsPage';
import { useThemeColor } from '@/hooks/use-theme-color';
import { internalSettingsDestination, settingsDestination, type SettingsDestination } from '@/lib/settings-destinations';

export function DestinationRow({ label, destination }: { label: string; destination: SettingsDestination }) {
  const url = settingsDestination(destination);
  const [failed, setFailed] = useState(false);
  const danger = useThemeColor({}, 'danger');
  return <View style={{ gap: 6 }}>
    <SettingsRow label={label} onPress={() => {
      setFailed(false);
      if (url) void Linking.openURL(url).catch(() => setFailed(true));
      else router.push(internalSettingsDestination(destination));
    }} />
    {failed && <Text accessibilityLiveRegion="polite" style={{ color: danger, fontSize: 13, paddingHorizontal: 4 }}>Could not open {label.toLowerCase()}. Try again.</Text>}
  </View>;
}
