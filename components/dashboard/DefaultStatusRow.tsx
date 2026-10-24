import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { ThemedText } from '@/components/themed-text';
import { SegmentedControl } from '@/components/ui/SegmentedControl';
import { useThemeColor } from '@/hooks/use-theme-color';
import { setDefaultLogStatus } from '@/lib/app-preferences';
import type { LogStatus } from '@/lib/types';

type Props = { value: LogStatus };

/** "New food is" Eaten / Planned control with its explanation and save error. */
export function DefaultStatusRow({ value }: Props) {
  const danger = useThemeColor({}, 'danger');
  const [error, setError] = useState('');

  return (
    <View style={styles.wrap}>
      <View style={styles.row}>
        <ThemedText type="label" style={styles.label}>New food is</ThemedText>
        <SegmentedControl
          value={value}
          options={[{ value: 'eaten', label: 'Eaten' }, { value: 'planned', label: 'Planned' }]}
          onChange={(next) => {
            void setDefaultLogStatus(next).then(() => setError('')).catch(() => {
              setError('Couldn’t save the food default. Try again.');
            });
          }}
          accessibilityLabel="Default status for new food"
          style={styles.control}
        />
      </View>
      <ThemedText type="caption">Planned meals don’t count toward your daily totals until you mark them eaten.</ThemedText>
      {error ? <Text accessibilityRole="alert" style={{ color: danger }}>{error}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 6, paddingHorizontal: 4 },
  row: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: 10 },
  label: { fontWeight: '600' },
  control: { minWidth: 180, flexGrow: 1, maxWidth: 240 },
});
