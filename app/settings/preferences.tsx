import { Text, View } from 'react-native';
import { SettingsPage, SettingsRow } from '@/components/settings/SettingsPage';
import { UnitsSection } from '@/components/settings/UnitsSection';
import { usePreferences } from '@/hooks/usePreferences';
import { useThemeColor } from '@/hooks/use-theme-color';
import { reloadPreferences, setAppearance } from '@/lib/app-preferences';
export default function PreferencesScreen() {
  const { appearance, error } = usePreferences();
  const text = useThemeColor({}, 'text');
  const danger = useThemeColor({}, 'danger');
  return <SettingsPage title="Preferences"><Text accessibilityRole="header" style={{ color: text, fontSize: 17, fontWeight: '600' }}>Appearance</Text><View accessibilityRole="radiogroup" accessibilityLabel="Appearance" style={{ gap: 8 }}>{(['system', 'light', 'dark'] as const).map(value => <SettingsRow key={value} accessibilityRole="radio" selected={appearance === value} onPress={() => { void setAppearance(value).catch(() => undefined); }} label={value.charAt(0).toUpperCase() + value.slice(1)} value={appearance === value ? 'Selected' : undefined} />)}</View><UnitsSection />{error ? <><Text accessibilityRole="alert" style={{ color: danger }}>{error}</Text><SettingsRow label="Reload preferences" onPress={() => { void reloadPreferences(); }} /></> : null}</SettingsPage>;
}
