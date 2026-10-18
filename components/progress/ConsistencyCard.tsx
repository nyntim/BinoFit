import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { parseISO } from 'date-fns';
import { MonthCalendar } from '@/components/month-calendar';
import { useThemeColor } from '@/hooks/use-theme-color';
import type { ProgressSummary } from '@/lib/progress';
import type { Streaks } from '@/lib/streak';

type Props = {
  summary: ProgressSummary;
  streaks: Streaks;
  loggedDates: string[];
  trainedDates?: string[];
  today: string;
  onDayPress: (date: string) => void;
};

function days(n: number): string {
  return `${n} ${n === 1 ? 'day' : 'days'}`;
}

export function ConsistencyCard({
  summary,
  streaks,
  loggedDates,
  trainedDates = [],
  today,
  onDayPress,
}: Props) {
  const card = useThemeColor({}, 'cardBackground');
  const text = useThemeColor({}, 'text');
  const icon = useThemeColor({}, 'icon');
  const tint = useThemeColor({}, 'tint');
  const separator = useThemeColor({}, 'separator');
  const [month, setMonth] = useState<Date | null>(null);

  const stats = [
    { value: `${summary.loggedDays} of ${summary.totalDays}`, label: 'Days logged' },
    { value: days(streaks.currentStreak), label: 'Current streak' },
    { value: days(streaks.longestStreak), label: 'Longest streak' },
  ];

  return (
    <View style={[styles.card, { backgroundColor: card }]}>
      <Text style={[styles.title, { color: text }]} accessibilityRole="header">
        Consistency
      </Text>
      <View style={styles.stats}>
        {stats.map((s) => (
          <View key={s.label} style={styles.stat}>
            <Text style={[styles.statValue, { color: text }]}>{s.value}</Text>
            <Text style={[styles.statLabel, { color: icon }]}>{s.label}</Text>
          </View>
        ))}
      </View>
      <View style={[styles.calendar, { borderTopColor: separator }]}>
        <MonthCalendar
          currentMonth={month ?? parseISO(today)}
          markedDates={loggedDates}
          trainedDates={trainedDates}
          today={today}
          weekStartsOn={1}
          onDayPress={onDayPress}
          onMonthChange={setMonth}
        />
        <View style={styles.legend}>
          <View style={styles.legendItem}>
            <View
              style={[styles.legendDot, { backgroundColor: tint }]}
              accessible={false}
              importantForAccessibility="no"
            />
            <Text style={[styles.legendText, { color: icon }]}>Logged</Text>
          </View>
          <View style={styles.legendItem}>
            <View
              style={[styles.legendDot, { backgroundColor: text }]}
              accessible={false}
              importantForAccessibility="no"
            />
            <Text style={[styles.legendText, { color: icon }]}>Trained</Text>
          </View>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { borderRadius: 18, padding: 20, gap: 16 },
  title: { fontSize: 17, fontWeight: '600', lineHeight: 22 },
  stats: { flexDirection: 'row', gap: 8 },
  stat: { flex: 1, gap: 2 },
  statValue: { fontSize: 17, fontWeight: '600', fontVariant: ['tabular-nums'] },
  statLabel: { fontSize: 12 },
  calendar: { paddingTop: 12, borderTopWidth: StyleSheet.hairlineWidth },
  legend: { flexDirection: 'row', alignItems: 'center', gap: 16, marginTop: 8 },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  legendDot: { width: 4, height: 4, borderRadius: 2 },
  legendText: { fontSize: 12, lineHeight: 17 },
});
