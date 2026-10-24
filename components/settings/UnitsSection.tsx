import { View } from 'react-native';
import { Card } from '@/components/ui/Card';
import { SegmentedControl } from '@/components/ui/SegmentedControl';
import { ThemedText } from '@/components/themed-text';
import { usePreferences } from '@/hooks/usePreferences';
import { setWeightUnit } from '@/lib/app-preferences';
import type { WeightUnit } from '@/lib/types';

const UNITS: { value: WeightUnit; label: string }[] = [
  { value: 'kg', label: 'Metric' },
  { value: 'lb', label: 'Imperial' },
];

/** "Units" label and card; the caller places it in a page's content stack. */
export function UnitsSection() {
  const { weightUnit } = usePreferences();

  return (
    <View style={{ gap: 8 }}>
      <ThemedText type="section" accessibilityRole="header">Units</ThemedText>
      <Card style={{ gap: 12 }}>
        <SegmentedControl
          value={weightUnit}
          options={UNITS}
          onChange={(unit) => { void setWeightUnit(unit).catch(() => undefined); }}
          accessibilityLabel="Units"
        />
        <ThemedText type="caption">Imperial shows lb, mi, ft and in. Metric shows kg, km and cm. Your data is the same either way.</ThemedText>
      </Card>
    </View>
  );
}
