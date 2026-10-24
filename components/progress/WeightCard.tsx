import { useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';
import { isToday, parseISO } from 'date-fns';
import { ProgressCardHeader } from '@/components/progress/ProgressCardHeader';
import { WeightChart } from '@/components/progress/WeightChart';
import { WeightEntrySheet } from '@/components/progress/WeightEntrySheet';
import { ThemedText } from '@/components/themed-text';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Chip } from '@/components/ui/Chip';
import { useThemeColor } from '@/hooks/use-theme-color';
import { usePreferences } from '@/hooks/usePreferences';
import { useWeightEntries } from '@/hooks/useWeightEntries';
import type { ProgressRange } from '@/lib/progress';
import { formatWeight, formatWeightWithUnit } from '@/lib/units';
import { formatWeightChange } from '@/lib/weight';
import {
  formatWeeklyRate,
  trendChange,
  trendWeights,
  weeklyRate,
  weightRangeBounds,
} from '@/lib/weight-trend';
import { formatShortDate } from '@/lib/workouts/format';
import type { WeightEntry } from '@/lib/types';

const RECENT_DAYS = 5;

type Props = {
  range: ProgressRange;
  today: string;
};

function dayLabel(date: string): string {
  return isToday(parseISO(date)) ? 'Today' : formatShortDate(date);
}

function sourceLabel(entry: WeightEntry): string {
  return entry.source === 'healthkit' ? 'Apple Health' : 'Logged';
}

/** Trend value, range change, trend chart and the last few weigh-ins. */
export function WeightCard({ range, today }: Props) {
  const icon = useThemeColor({}, 'icon');
  const separator = useThemeColor({}, 'separator');
  const { weightUnit: unit } = usePreferences();
  const { days, status, reload } = useWeightEntries();

  const [sheet, setSheet] = useState<{
    open: boolean;
    entry: WeightEntry | null;
  }>({
    open: false,
    entry: null,
  });
  const openNew = () => setSheet({ open: true, entry: null });
  const openEdit = (entry: WeightEntry) => setSheet({ open: true, entry });
  const closeSheet = () => setSheet((s) => ({ ...s, open: false }));

  const latest = days[0] ?? null;

  const trend = trendWeights(days);
  const trendUpToToday = trend.filter((p) => p.date <= today);
  const latestTrend = trendUpToToday[trendUpToToday.length - 1] ?? null;
  const rateKg = weeklyRate(trend, today);
  const earliestWeighIn = trend[0]?.date ?? null;
  const bounds = weightRangeBounds(range, today, earliestWeighIn);
  const change = trendChange(trend, bounds.start, bounds.end);
  const recentDays = days.slice(0, RECENT_DAYS);

  const trendKg = latestTrend?.trend_kg ?? latest?.weight_kg ?? null;
  const changeText = change
    ? `${formatWeightChange(change.changeKg, 0, unit)} in ${change.days} ${change.days === 1 ? 'day' : 'days'}`
    : null;

  const changeLabel = change
    ? `${Number(formatWeight(Math.abs(change.changeKg), unit)) === 0 ? '' : change.changeKg < 0 ? 'minus ' : 'plus '}${formatWeight(Math.abs(change.changeKg), unit)} ${unit} in ${change.days} ${change.days === 1 ? 'day' : 'days'}`
    : undefined;

  const logButton = (
    <Button variant="soft" label="Log weight" fullWidth onPress={openNew} />
  );

  return (
    <Card style={styles.card}>
      <ProgressCardHeader
        label="Weight trend"
        value={
          status === 'ready' && trendKg !== null ? (
            <ThemedText type="stat" style={styles.value}>
              {formatWeight(trendKg, unit)}
              <ThemedText type="body" style={{ color: icon }}>{` ${unit}`}</ThemedText>
            </ThemedText>
          ) : undefined
        }
        valueAccessibilityLabel={
          status === 'ready' && trendKg !== null
            ? `Weight trend ${formatWeightWithUnit(trendKg, unit)}`
            : undefined
        }
        caption={status === 'ready' && rateKg !== null ? formatWeeklyRate(rateKg, unit) : undefined}
        trailing={
          status === 'ready' && changeText ? (
            <Chip
              size="sm"
              label={changeText}
              accessibilityLabel={changeLabel}
            />
          ) : undefined
        }
      />

      {status === 'loading' && <ActivityIndicator color={icon} style={styles.loading} />}

      {status === 'error' && (
        <View style={styles.message}>
          <ThemedText type="body">Couldn&apos;t load weight.</ThemedText>
          <Button variant="ghost" size="sm" label="Retry" onPress={reload} />
        </View>
      )}

      {status === 'ready' && !latest && (
        <View style={styles.message}>
          <ThemedText type="body">No weight logged yet.</ThemedText>
          <ThemedText type="caption">Weight you log appears here.</ThemedText>
          {logButton}
        </View>
      )}

      {status === 'ready' && latest && (
        <>
          <WeightChart
            points={trend}
            rangeStart={bounds.start}
            rangeEnd={bounds.end}
            unit={unit}
            weeklyRateKg={rateKg}
          />

          {logButton}

          <View>
            {recentDays.map((entry, i) => (
              <Pressable
                key={entry.id}
                style={({ pressed }) => [
                  styles.row,
                  i > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: separator },
                  pressed && styles.pressed,
                ]}
                onPress={() => openEdit(entry)}
                accessibilityRole="button"
                accessibilityLabel={`${dayLabel(entry.date)}, ${formatWeightWithUnit(entry.weight_kg, unit)}, ${sourceLabel(entry)}. Edit`}
              >
                <View style={styles.rowMain}>
                  <ThemedText type="body" style={styles.rowDate}>
                    {dayLabel(entry.date)}
                  </ThemedText>
                  <ThemedText type="caption">{sourceLabel(entry)}</ThemedText>
                </View>
                <View style={styles.rowValue}>
                  <ThemedText type="stat" style={styles.rowNumber}>
                    {formatWeight(entry.weight_kg, unit)}
                  </ThemedText>
                  <ThemedText type="caption">{unit}</ThemedText>
                </View>
              </Pressable>
            ))}
          </View>
        </>
      )}

      <WeightEntrySheet
        visible={sheet.open}
        entry={sheet.entry}
        onClose={closeSheet}
        onChanged={reload}
      />
    </Card>
  );
}

const styles = StyleSheet.create({
  card: { gap: 14 },
  value: { fontSize: 30, lineHeight: 34 },
  loading: { paddingVertical: 24 },
  message: { gap: 8 },
  row: {
    minHeight: 58,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    paddingVertical: 8,
  },
  pressed: { opacity: 0.85 },
  rowMain: { flexShrink: 1 },
  rowDate: { fontWeight: '600' },
  rowValue: { flexDirection: 'row', alignItems: 'baseline', gap: 4, flexShrink: 0 },
  rowNumber: { fontSize: 18, lineHeight: 22 },
});
