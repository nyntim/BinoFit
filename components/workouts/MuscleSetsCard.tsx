import { StyleSheet, Text, View } from 'react-native';
import { useThemeColor } from '@/hooks/use-theme-color';
import { formatMuscleSetCount, type MuscleSetTotal } from '@/lib/workouts/summary';

type Props = { rows: MuscleSetTotal[] };

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
        {rows.map((row) => {
          const count = formatMuscleSetCount(row.sets);
          const ratio = Math.min(Math.max(row.sets / maxSets, 0), 1);
          return (
            <View
              key={row.region}
              style={styles.row}
              accessible
              accessibilityLabel={`${row.region}, ${count} sets`}
            >
              <View style={styles.rowHeader}>
                <Text style={[styles.region, { color: text }]}>{row.region}</Text>
                <Text style={[styles.count, { color: text }]}>{count}</Text>
              </View>
              <View style={[styles.track, { backgroundColor: track }]}>
                <View
                  style={[
                    styles.fill,
                    { backgroundColor: text, width: `${ratio * 100}%` as `${number}%` },
                  ]}
                />
              </View>
            </View>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { borderRadius: 18, padding: 20, gap: 14 },
  title: { fontSize: 17, fontWeight: '600' },
  rows: { gap: 4 },
  row: { gap: 4 },
  rowHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline' },
  region: { fontSize: 15, fontWeight: '400' },
  count: { fontSize: 13, fontWeight: '700', fontVariant: ['tabular-nums'] },
  track: { height: 8, borderRadius: 4, overflow: 'hidden' },
  fill: { height: 8, borderRadius: 4 },
});
