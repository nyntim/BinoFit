import { StyleSheet, Text, View } from 'react-native';
import { PillSwitch } from '@/components/settings/PillSwitch';
import { useThemeColor } from '@/hooks/use-theme-color';
import { usePreferences } from '@/hooks/usePreferences';
import { setWeightUnit } from '@/lib/app-preferences';
import type { WeightUnit } from '@/lib/types';

const UNITS: { value: WeightUnit; label: string }[] = [
  { value: 'kg', label: 'Metric' },
  { value: 'lb', label: 'Imperial' },
];

export function UnitsSection() {
  const { weightUnit } = usePreferences();
  const text = useThemeColor({}, 'text');
  const muted = useThemeColor({}, 'icon');
  const card = useThemeColor({}, 'cardBackground');

  return (
    <View style={styles.section}>
      <View style={[styles.row, { backgroundColor: card }]}>
        <View style={styles.info}>
          <Text style={[styles.label, { color: text }]}>Units</Text>
          <Text style={[styles.subtitle, { color: muted }]}>
            Metric: kg, km, cm. Imperial: lb, mi, ft and in.
          </Text>
        </View>
        <PillSwitch
          value={weightUnit}
          options={UNITS}
          onChange={(unit) => {
            void setWeightUnit(unit).catch(() => undefined);
          }}
          accessibilityLabel="Units"
        />
      </View>

    </View>
  );
}

const styles = StyleSheet.create({
  section: { marginBottom: 28 },
  row: { gap: 12, alignItems: 'flex-start', padding: 16, borderRadius: 12, marginTop: 8 },
  info: { flex: 1, marginRight: 16 },
  label: { fontSize: 16, fontWeight: '500' },
  subtitle: { fontSize: 12, marginTop: 4, lineHeight: 16 },
});
