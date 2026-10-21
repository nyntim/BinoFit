import { useState } from 'react';
import { Linking, View } from 'react-native';
import { SettingsRow } from '@/components/settings/SettingsPage';
import { ThemedText } from '@/components/themed-text';
import { settingsDestination, type SettingsDestination } from '@/lib/settings-destinations';

export function DestinationRow({ label, destination }: { label: string; destination: SettingsDestination }) {
  const url = settingsDestination(destination);
  const [failed, setFailed] = useState(false);
  return <View>
    <SettingsRow label={label} value={url ? undefined : 'Unavailable'} description={url ? undefined : 'A destination has not been configured for this release.'} disabled={!url} onPress={url ? () => { setFailed(false); void Linking.openURL(url).catch(() => setFailed(true)); } : undefined} />
    {failed && <ThemedText>Could not open {label.toLowerCase()}. Try again.</ThemedText>}
  </View>;
}
