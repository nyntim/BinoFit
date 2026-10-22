import { StyleSheet, Text, View } from 'react-native';
import { useThemeColor } from '@/hooks/use-theme-color';
import { formatMuscleSetCount, pairRows, type MuscleSetTotal } from '@/lib/workouts/summary';

type Props = { rows: MuscleSetTotal[] };

function Cell({ row, maxSets, text, track }: { row: MuscleSetTotal; maxSets: number; text: string; track: string }) {
  const count = formatMuscleSetCount(row.sets);
  const ratio = Math.min(Math.max(row.sets / maxSets, 0), 1);
  return (
    <View style={styles.cell} accessible accessibilityLabel={`${row.region}, ${count} sets`}>
      <View style={styles.rowHeader}>
        <Text style={[styles.region, { color: text }]} numberOfLines={1}>
          {row.region}
        </Text>
        <Text style={[styles.count, { color: text }]}>{count}</Text>
      </View>
      <View style={[styles.track, { backgroundColor: track }]}>
        <View style={[styles.fill, { backgroundColor: text, width: `${ratio * 100}%` as `${number}%` }]} />
      </View>
    </View>
  );
}

export function MuscleSetsCard({ rows }: Props) {
  const card = useThemeColor({}, 'cardBackground');
  const text = useThemeColor({}, 'text');
  const track = useThemeColor({}, 'track');

  if (rows.length === 0) return null;

  const maxSets = Math.max(...rows.map((r) => r.sets), 1);

  return (
    <View style={[styles.card, { backgroundColor: card }]}>
      <Text style={[styles.title, { color: text }]} accessibilityRole="header">
        Sets
      </Text>
      <View style={styles.rows}>
        {pairRows(rows).map(([left, right]) => (
          <View key={left.region} style={styles.line}>
            <Cell row={left} maxSets={maxSets} text={text} track={track} />
            {right ? <Cell row={right} maxSets={maxSets} text={text} track={track} /> : <View style={styles.cell} />}
          </View>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { borderRadius: 18, padding: 20, gap: 14 },
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
