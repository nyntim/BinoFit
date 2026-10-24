import { Pressable, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { SettingsPage } from '@/components/settings/SettingsPage';
import { UnitsSection } from '@/components/settings/UnitsSection';
import { ThemedText } from '@/components/themed-text';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { Colors } from '@/constants/theme';
import { usePreferences } from '@/hooks/usePreferences';
import { useThemeColor } from '@/hooks/use-theme-color';
import { reloadPreferences, setAppearance } from '@/lib/app-preferences';

type Appearance = 'system' | 'light' | 'dark';
const OPTIONS: { value: Appearance; label: string }[] = [{ value: 'system', label: 'System' }, { value: 'light', label: 'Light' }, { value: 'dark', label: 'Dark' }];

// A preview has to show the other theme, so it reads the light and dark palettes directly rather than the active one
function PreviewHalf({ palette }: { palette: typeof Colors.light }) {
  return (
    <View style={[styles.half, { backgroundColor: palette.background }]}>
      <View style={[styles.bar, { backgroundColor: palette.text }]} />
      <View style={[styles.block, { backgroundColor: palette.cardBackground }]} />
      <View style={[styles.block, { backgroundColor: palette.cardSecondary }]} />
    </View>
  );
}

function AppearanceTile({ value, label, selected, onPress }: { value: Appearance; label: string; selected: boolean; onPress: () => void }) {
  const tint = useThemeColor({}, 'tint');
  const border = useThemeColor({}, 'fieldBorder');
  return (
    <Pressable
      accessibilityRole="radio"
      accessibilityLabel={label}
      accessibilityState={{ selected, checked: selected }}
      onPress={onPress}
      style={({ pressed }) => [styles.tile, pressed && styles.pressed]}
    >
      <View style={[styles.preview, { borderColor: selected ? tint : border, borderWidth: selected ? 2.5 : 1 }]}>
        {value === 'system' ? <View style={styles.split}><PreviewHalf palette={Colors.light} /><PreviewHalf palette={Colors.dark} /></View> : <PreviewHalf palette={Colors[value]} />}
      </View>
      <View style={styles.caption}>
        {selected ? <IconSymbol name="checkmark.circle.fill" size={20} color={tint} /> : <View style={[styles.ring, { borderColor: border }]} />}
        <ThemedText type="label">{label}</ThemedText>
      </View>
    </Pressable>
  );
}

export default function PreferencesScreen() {
  const { appearance, error } = usePreferences();
  const { fontScale } = useWindowDimensions();
  const danger = useThemeColor({}, 'danger');
  return <SettingsPage title="Preferences">
    <View style={styles.section}>
      <ThemedText type="section" accessibilityRole="header">Appearance</ThemedText>
      <Card accessibilityRole="radiogroup" accessibilityLabel="Appearance">
        <View style={[styles.tiles, fontScale > 1.5 && styles.tilesStacked]}>
          {OPTIONS.map(option => <AppearanceTile key={option.value} {...option} selected={appearance === option.value} onPress={() => { void setAppearance(option.value).catch(() => undefined); }} />)}
        </View>
      </Card>
    </View>
    <UnitsSection />
    {error ? <><Text accessibilityRole="alert" style={{ color: danger }}>{error}</Text><Button variant="soft" label="Reload preferences" onPress={() => { void reloadPreferences(); }} /></> : null}
  </SettingsPage>;
}

const styles = StyleSheet.create({
  section: { gap: 8 },
  tiles: { flexDirection: 'row', gap: 12 },
  tilesStacked: { flexDirection: 'column' },
  tile: { flex: 1, gap: 8 },
  pressed: { opacity: 0.85 },
  preview: { height: 118, borderRadius: 16, overflow: 'hidden' },
  split: { flex: 1, flexDirection: 'row' },
  half: { flex: 1, padding: 10, gap: 6 },
  bar: { height: 8, width: '60%', borderRadius: 4 },
  block: { flex: 1, borderRadius: 8 },
  caption: { flexDirection: 'row', alignItems: 'center', gap: 6, minHeight: 28 },
  ring: { width: 20, height: 20, borderRadius: 10, borderWidth: 1.5 },
});
