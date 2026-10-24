import { StyleSheet, useWindowDimensions, View } from 'react-native';
import { ThemedText } from '@/components/themed-text';
import { Card } from '@/components/ui/Card';
import { useThemeColor } from '@/hooks/use-theme-color';
import { formatDurationShort, formatVolume, weekActivityLabel, type WeekDay } from '@/lib/workouts/summary';
import type { WeekSummary, WeightUnit } from '@/lib/types';

type Props = {
  week: WeekSummary;
  weekLabel: string;
  unit: WeightUnit;
  /** The seven days of the week for the activity strip; omit to hide it. */
  days?: WeekDay[];
};

/** This week's sessions, volume and time, with a Monday to Sunday strip of trained days. */
export function WeekSummaryCard({ week, weekLabel, unit, days }: Props) {
  const tint = useThemeColor({}, 'tint');
  const tintSoft = useThemeColor({}, 'tintSoft');
  const nested = useThemeColor({}, 'cardSecondary');
  const { fontScale } = useWindowDimensions();

  const stats = [
    { value: String(week.sessions), label: week.sessions === 1 ? 'session' : 'sessions' },
    { value: formatVolume(week.volumeKg, unit), label: `${unit} volume` },
    { value: formatDurationShort(week.durationSeconds), label: 'time' },
  ];
  // Numbers never truncate: the grid becomes one column at the largest text sizes
  const stacked = fontScale > 1.3;

  return (
    <Card style={styles.card}>
      <View style={styles.header}>
        <ThemedText type="title" accessibilityRole="header">This week</ThemedText>
        <ThemedText type="caption" style={styles.range}>{weekLabel}</ThemedText>
      </View>
      <View style={stacked ? styles.stackedGrid : styles.grid}>
        {stats.map((s) => (
          <View key={s.label} style={styles.stat} accessible accessibilityLabel={`${s.value} ${s.label}`}>
            <ThemedText type="stat" style={styles.value}>{s.value}</ThemedText>
            <ThemedText type="caption">{s.label}</ThemedText>
          </View>
        ))}
      </View>
      {days ? (
        <View style={styles.strip} accessible accessibilityRole="image" accessibilityLabel={weekActivityLabel(days)}>
          {days.map((d) => (
            <View key={d.date} style={styles.day} importantForAccessibility="no-hide-descendants" accessibilityElementsHidden>
              <View
                testID={`week-day-${d.state}`}
                style={[
                  styles.cell,
                  d.state === 'done' && { backgroundColor: tint },
                  d.state === 'running' && { backgroundColor: tintSoft, borderWidth: 2, borderColor: tint, borderStyle: 'dashed' },
                  d.state === 'rest' && { backgroundColor: nested },
                ]}
              />
              <ThemedText type="caption" style={d.today ? styles.todayLetter : undefined}>{d.letter}</ThemedText>
            </View>
          ))}
        </View>
      ) : null}
    </Card>
  );
}

const styles = StyleSheet.create({
  card: { gap: 14 },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', gap: 8 },
  range: { fontVariant: ['tabular-nums'], flexShrink: 1, textAlign: 'right' },
  grid: { flexDirection: 'row', gap: 8 },
  stackedGrid: { gap: 10 },
  stat: { flex: 1, gap: 2, minWidth: 0 },
  value: { fontSize: 26, lineHeight: 30 },
  strip: { flexDirection: 'row', gap: 6 },
  day: { flex: 1, alignItems: 'center', gap: 4 },
  cell: { width: '100%', maxWidth: 40, height: 30, borderRadius: 9 },
  todayLetter: { fontWeight: '700' },
});
