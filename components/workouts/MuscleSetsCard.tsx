import { Pressable, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { ThemedText } from '@/components/themed-text';
import { Card } from '@/components/ui/Card';
import { ProgressBar } from '@/components/ui/ProgressBar';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { useThemeColor } from '@/hooks/use-theme-color';
import { formatMuscleSetCount, pairRows } from '@/lib/workouts/summary';

import type { VolumeTargetProgress } from '@/lib/workouts/targets';

type Props = { rows: VolumeTargetProgress[]; onEditTargets: () => void };

function Cell({ row, maxSets }: { row: VolumeTargetProgress; maxSets: number }) {
  const text = useThemeColor({}, 'text');
  const muted = useThemeColor({}, 'icon');
  const tint = useThemeColor({}, 'tint');
  const count = formatMuscleSetCount(row.sets);
  const reached = row.target !== null && row.status !== 'under';
  const status = row.status === 'under' ? 'Under target' : row.status === 'met' ? 'Met' : 'Over target';
  return (
    <View
      style={styles.cell}
      accessible
      accessibilityLabel={row.target === null ? `${row.region}, ${count} sets` : `${row.region}, ${count} of ${row.target} sets, ${status}`}
    >
      <View style={styles.cellHeader}>
        <ThemedText type="label" style={styles.region}>{row.region}</ThemedText>
        <View style={styles.value}>
          {reached ? <IconSymbol name="checkmark" size={12} color={tint} /> : null}
          <Text style={[styles.count, { color: text }]}>{count}</Text>
          {row.target !== null ? <Text style={[styles.target, { color: muted }]}>{`/${row.target}`}</Text> : null}
        </View>
      </View>
      <ProgressBar value={row.sets} max={row.target ?? maxSets} height={6} />
    </View>
  );
}

export function MuscleSetsCard({ rows, onEditTargets }: Props) {
  const tint = useThemeColor({}, 'tint');
  const { fontScale } = useWindowDimensions();

  if (rows.length === 0) return null;

  const maxSets = Math.max(...rows.map((r) => r.sets), 1);

  return (
    <Card style={styles.card}>
      <View style={styles.header}>
        <ThemedText type="title" accessibilityRole="header">Sets this week</ThemedText>
        <Pressable accessibilityRole="button" accessibilityLabel="Edit weekly volume targets" onPress={onEditTargets} style={styles.edit}>
          <Text style={[styles.editLabel, { color: tint }]}>Targets</Text>
        </Pressable>
      </View>
      <View style={styles.rows}>
        {(fontScale > 1.3 ? rows.map(row => [row, null] as [VolumeTargetProgress, null]) : pairRows(rows)).map(([left, right]) => (
          <View key={left.region} style={styles.line}>
            <Cell row={left} maxSets={maxSets} />
            {right ? <Cell row={right} maxSets={maxSets} /> : fontScale > 1.3 ? null : <View style={styles.cell} />}
          </View>
        ))}
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  card: { gap: 12 },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 8 },
  edit: { minHeight: 44, justifyContent: 'center' },
  editLabel: { fontSize: 13, fontWeight: '600' },
  rows: { gap: 12 },
  line: { flexDirection: 'row', gap: 16 },
  cell: { flex: 1, minWidth: 0, gap: 6 },
  cellHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', gap: 8 },
  region: { flexShrink: 1 },
  value: { flexDirection: 'row', alignItems: 'center', gap: 3, flexShrink: 0 },
  count: { fontSize: 13, fontWeight: '700', fontVariant: ['tabular-nums'] },
  target: { fontSize: 13, fontVariant: ['tabular-nums'] },
});
