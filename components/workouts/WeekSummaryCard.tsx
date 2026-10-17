import { StyleSheet, Text, View } from 'react-native';
import { useThemeColor } from '@/hooks/use-theme-color';
import { formatDurationShort, formatVolume } from '@/lib/workouts/summary';
import type { WeekSummary, WeightUnit } from '@/lib/types';

type Props = { week: WeekSummary; weekLabel: string; unit: WeightUnit };

export function WeekSummaryCard({ week, weekLabel, unit }: Props) {
  const card = useThemeColor({}, 'cardBackground');
  const text = useThemeColor({}, 'text');
  const muted = useThemeColor({}, 'icon');

  const stats = [
    { value: String(week.sessions), label: week.sessions === 1 ? 'session' : 'sessions' },
    { value: formatVolume(week.volumeKg, unit), label: `${unit} volume` },
    { value: formatDurationShort(week.durationSeconds), label: 'time' },
  ];

  return (
    <View style={[styles.card, { backgroundColor: card }]}>
      <View style={styles.header}>
        <Text style={[styles.title, { color: text }]} accessibilityRole="header">
          This week
        </Text>
        <Text style={[styles.range, { color: muted }]}>{weekLabel}</Text>
      </View>
      <View style={styles.grid}>
        {stats.map((s) => (
          <View key={s.label} style={styles.stat} accessible accessibilityLabel={`${s.value} ${s.label}`}>
            <Text style={[styles.value, { color: text }]} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7}>
              {s.value}
            </Text>
            <Text style={[styles.label, { color: muted }]}>{s.label}</Text>
          </View>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { borderRadius: 18, padding: 20, gap: 14 },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline' },
  title: { fontSize: 17, fontWeight: '600' },
  range: { fontSize: 13, fontWeight: '500', fontVariant: ['tabular-nums'] },
  grid: { flexDirection: 'row', gap: 8 },
  stat: { flex: 1, gap: 2, minWidth: 0 },
  value: { fontSize: 22, fontWeight: '700', fontVariant: ['tabular-nums'] },
  label: { fontSize: 12 },
});
