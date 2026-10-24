import { useState } from 'react';
import { StyleSheet, View, type LayoutChangeEvent } from 'react-native';
import { parseISO } from 'date-fns';
import { MonthCalendar } from '@/components/month-calendar';
import { ProgressCardHeader } from '@/components/progress/ProgressCardHeader';
import { ThemedText } from '@/components/themed-text';
import { Card } from '@/components/ui/Card';
import { useThemeColor } from '@/hooks/use-theme-color';
import { consistencyDays, type ProgressSummary } from '@/lib/progress';
import { currentStreakDates, type Streaks } from '@/lib/streak';

type Props = {
  summary: ProgressSummary;
  streaks: Streaks;
  loggedDates: string[];
  trainedDates?: string[];
  today: string;
  /** First date of the selected range; the day grid starts here (at most 90 days back). */
  rangeStart: string;
  onDayPress: (date: string) => void;
};

const GRID_GAP = 5;
const MAX_COLUMNS = 10;
const MAX_DAYS = 90;

function days(n: number): string {
  return `${n} ${n === 1 ? 'day' : 'days'}`;
}

export function ConsistencyCard({
  summary,
  streaks,
  loggedDates,
  trainedDates = [],
  today,
  rangeStart,
  onDayPress,
}: Props) {
  const text = useThemeColor({}, 'text');
  const icon = useThemeColor({}, 'icon');
  const tint = useThemeColor({}, 'tint');
  const ember = useThemeColor({}, 'ember');
  const emberSoft = useThemeColor({}, 'emberSoft');
  const secondary = useThemeColor({}, 'cardSecondary');
  const separator = useThemeColor({}, 'separator');
  const [month, setMonth] = useState<Date | null>(null);
  const [gridWidth, setGridWidth] = useState(0);

  const { cells, capped } = consistencyDays({
    loggedDates,
    streakDates: currentStreakDates(loggedDates, today),
    today,
    rangeStart,
    maxDays: MAX_DAYS,
  });
  const columns = Math.min(MAX_COLUMNS, Math.max(1, cells.length));
  const cellSize = gridWidth > 0 ? (gridWidth - GRID_GAP * (columns - 1)) / columns : 0;
  const loggedCount = cells.filter((c) => c.logged).length;
  const streakCount = cells.filter((c) => c.streak).length;
  const gridLabel = `${loggedCount} of the last ${cells.length} days logged, current streak ${days(streakCount)}`;

  const tiles = [
    {
      key: 'current',
      label: 'Current',
      value: days(streaks.currentStreak),
      a11y: `Current streak, ${days(streaks.currentStreak)}`,
      fill: emberSoft,
      color: ember,
    },
    {
      key: 'longest',
      label: 'Longest',
      value: days(streaks.longestStreak),
      a11y: `Longest streak, ${days(streaks.longestStreak)}`,
      fill: secondary,
      color: text,
    },
    {
      key: 'logged',
      label: 'Logged',
      value: `${summary.loggedDays}/${summary.totalDays}`,
      a11y: `Logged ${summary.loggedDays} of ${summary.totalDays} days`,
      fill: secondary,
      color: text,
    },
  ];

  return (
    <Card style={styles.card}>
      <ProgressCardHeader label="Consistency" />
      <View style={styles.tiles}>
        {tiles.map((t) => (
          <View
            key={t.key}
            style={[styles.tile, { backgroundColor: t.fill }]}
            accessible
            accessibilityLabel={t.a11y}
          >
            <ThemedText type="caption" style={t.key === 'current' ? { color: t.color } : undefined}>
              {t.label}
            </ThemedText>
            <ThemedText type="stat" style={{ color: t.color, fontSize: 24, lineHeight: 28 }}>
              {t.value}
            </ThemedText>
          </View>
        ))}
      </View>

      <View style={styles.gridBlock}>
        <View
          style={styles.grid}
          onLayout={(e: LayoutChangeEvent) => setGridWidth(e.nativeEvent.layout.width)}
          accessible
          accessibilityRole="image"
          accessibilityLabel={gridLabel}
        >
          {cellSize > 0 &&
            cells.map((c) => (
              <View
                key={c.date}
                style={[
                  styles.cell,
                  {
                    width: cellSize,
                    height: cellSize,
                    backgroundColor: c.streak ? ember : c.logged ? tint : secondary,
                  },
                  c.streak && { borderWidth: 3, borderColor: emberSoft },
                  c.isToday && { borderWidth: 2, borderColor: text },
                ]}
              />
            ))}
        </View>
        {capped && <ThemedText type="caption">Showing the last 90 days</ThemedText>}
        <View style={styles.legend} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
          <View style={styles.legendItem}>
            <View style={[styles.swatch, { backgroundColor: tint }]} />
            <ThemedText type="caption">Logged</ThemedText>
          </View>
          <View style={styles.legendItem}>
            <View style={[styles.swatch, { backgroundColor: ember }]} />
            <ThemedText type="caption">Current streak</ThemedText>
          </View>
        </View>
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
            <ThemedText type="caption" style={{ color: icon }}>
              Logged
            </ThemedText>
          </View>
          <View style={styles.legendItem}>
            <View
              style={[styles.legendDot, { backgroundColor: text }]}
              accessible={false}
              importantForAccessibility="no"
            />
            <ThemedText type="caption" style={{ color: icon }}>
              Trained
            </ThemedText>
          </View>
        </View>
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  card: { gap: 14 },
  tiles: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  tile: { flexGrow: 1, minWidth: 96, borderRadius: 14, padding: 12, gap: 2 },
  gridBlock: { gap: 8 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: GRID_GAP },
  cell: { borderRadius: 6 },
  calendar: { paddingTop: 14, borderTopWidth: StyleSheet.hairlineWidth },
  legend: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 16, marginTop: 8 },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  swatch: { width: 10, height: 10, borderRadius: 3 },
  legendDot: { width: 4, height: 4, borderRadius: 2 },
});
