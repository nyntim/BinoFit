import { Pressable, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { useThemeColor } from '@/hooks/use-theme-color';
import { formatMuscleSetCount, pairRows } from '@/lib/workouts/summary';

import type { VolumeTargetProgress } from '@/lib/workouts/targets';

type Props = { rows: VolumeTargetProgress[]; onEditTargets: () => void };

function Cell({ row, maxSets, text, track, success }: { row: VolumeTargetProgress; maxSets: number; text: string; track: string; success: string }) {
  const count = formatMuscleSetCount(row.sets);
  const ratio = Math.min(Math.max(row.sets / (row.target ?? maxSets), 0), 1);
  return (
    <View style={styles.cell} accessible accessibilityLabel={row.target === null ? `${row.region}, ${count} sets` : `${row.region}, ${count} of ${row.target} sets, ${row.status === 'under' ? 'Under target' : row.status === 'met' ? 'Met' : 'Over target'}`}>
      <View style={styles.rowHeader}>
        <Text style={[styles.region, { color: text }]}>
          {row.region}
        </Text>
        <Text style={[styles.count, { color: text }]}>{row.target === null ? count : `${count} / ${row.target}`}</Text>
      </View>
      <View style={[styles.track, { backgroundColor: track }]}>
        <View testID={`volume-target-fill-${row.region}`} style={[styles.fill, { backgroundColor: row.status === 'met' ? success : text, width: `${ratio * 100}%` as `${number}%` }]} />
      </View>
      {row.target !== null ? <Text style={[styles.status, { color: text }]}>{row.status === 'under' ? 'Under target' : row.status === 'met' ? 'Met' : 'Over target'}</Text> : null}
    </View>
  );
}

export function MuscleSetsCard({ rows, onEditTargets }: Props) {
  const card = useThemeColor({}, 'cardBackground');
  const text = useThemeColor({}, 'text');
  const track = useThemeColor({}, 'track');
  const success = useThemeColor({}, 'success');
  const tint = useThemeColor({}, 'tint');
  const { fontScale } = useWindowDimensions();

  if (rows.length === 0) return null;

  const maxSets = Math.max(...rows.map((r) => r.sets), 1);

  return (
    <View style={[styles.card, { backgroundColor: card }]}>
      <View style={styles.rowHeader}><Text style={[styles.title, { color: text }]} accessibilityRole="header">
        Sets
      </Text><Pressable accessibilityRole="button" accessibilityLabel="Edit weekly volume targets" onPress={onEditTargets} style={styles.edit}><Text style={{ color: tint }}>Edit targets</Text></Pressable></View>
      <View style={styles.rows}>
        {(fontScale > 1.3 ? rows.map(row => [row, null] as [VolumeTargetProgress, null]) : pairRows(rows)).map(([left, right]) => (
          <View key={left.region} style={styles.line}>
            <Cell row={left} maxSets={maxSets} text={text} track={track} success={success} />
            {right ? <Cell row={right} maxSets={maxSets} text={text} track={track} success={success} /> : fontScale > 1.3 ? null : <View style={styles.cell} />}
          </View>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { borderRadius: 18, padding: 20, gap: 14 },
  status: { fontSize: 12 },
  edit: { minHeight: 44, justifyContent: 'center' },
  title: { fontSize: 17, fontWeight: '600' },
  rows: { gap: 12 },
  line: { flexDirection: 'row', gap: 16 },
  cell: { flex: 1, minWidth: 0, gap: 4 },
  rowHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', gap: 8 },
  region: { fontSize: 15, fontWeight: '400', flexShrink: 1 },
  count: { fontSize: 13, fontWeight: '700', fontVariant: ['tabular-nums'], flexShrink: 0 },
  track: { height: 8, borderRadius: 4, overflow: 'hidden' },
  fill: { height: 8, borderRadius: 4 },
});
