import { router } from 'expo-router';
import { Text } from 'react-native';
import { SettingsPage, SettingsRow } from '@/components/settings/SettingsPage';
import { TrainingSection } from '@/components/settings/TrainingSection';
import { usePreferences } from '@/hooks/usePreferences';
import { useThemeColor } from '@/hooks/use-theme-color';
export default function TrainingSettings() {
  const muted = useThemeColor({}, 'icon');
  const danger = useThemeColor({}, 'danger');
  const { error } = usePreferences();
  return <SettingsPage title="Training"><TrainingSection /><SettingsRow label="Weekly volume targets" description="Optional working sets per muscle region." onPress={() => router.push('/settings/weekly-volume-targets')} /><Text style={{ color: muted, lineHeight: 20 }}>Set rest per exercise in its options. Choose No rest to skip it.</Text><SettingsRow label="Units" description="Change weight and distance display in Preferences." onPress={() => router.push('/settings/preferences')} />{error ? <Text accessibilityRole="alert" style={{ color: danger }}>{error}</Text> : null}</SettingsPage>;
}
