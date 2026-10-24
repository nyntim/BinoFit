import { useState } from 'react';
import { Pressable, StyleSheet, View, type LayoutChangeEvent } from 'react-native';
import Svg, { Path } from 'react-native-svg';
import { format, parseISO } from 'date-fns';
import { ProgressCardHeader } from '@/components/progress/ProgressCardHeader';
import { ThemedText } from '@/components/themed-text';
import { Card } from '@/components/ui/Card';
import { SegmentedControl } from '@/components/ui/SegmentedControl';
import { useThemeColor } from '@/hooks/use-theme-color';
import { usePreferences } from '@/hooks/usePreferences';
import { chartScale, type BucketUnit, type ProgressRange } from '@/lib/progress';
import { kgToLb } from '@/lib/units';
import {
  formatSessionsPerWeek,
  sessionBarScale,
  type TrainingAverages,
  type TrainingBucket,
} from '@/lib/workouts/progress';
import { formatDurationShort, formatVolume } from '@/lib/workouts/summary';
import type { WeightUnit } from '@/lib/types';

const CHART_HEIGHT = 100;
const STUB_OPACITY = 0.35;
const EMPTY_BAR = 3;

type WorkoutMetric = 'sessions' | 'volume';

const METRICS: { value: WorkoutMetric; label: string }[] = [
  { value: 'sessions', label: 'Sessions' },
  { value: 'volume', label: 'Volume' },
];

type Props = {
  range: ProgressRange;
  unit: BucketUnit;
  buckets: TrainingBucket[];
  averages: TrainingAverages | null;
  /** First date of the training range, for the "since Mar 3" caption. */
  rangeStart: string;
};

function rangePhrase(range: ProgressRange, rangeStart: string): string {
  if (range === '7d') return 'the last 7 days';
  if (range === '30d') return 'the last 30 days';
  if (range === '90d') return 'the last 90 days';
  return `since ${format(parseISO(rangeStart), 'd MMM')}`;
}

function selectionLabel(b: TrainingBucket): string {
  if (b.unit === 'day') return b.isCurrent ? 'Today so far' : format(parseISO(b.key), 'EEE, d MMM');
  if (b.unit === 'week')
    return b.isCurrent ? 'This week so far' : `Week of ${format(parseISO(b.key), 'd MMM')}`;
  const month = format(parseISO(b.key), 'MMMM');
  return b.isCurrent ? `${month} (so far)` : month;
}

function barLabel(b: TrainingBucket): string {
  if (b.unit === 'day') return b.isCurrent ? 'Today' : format(parseISO(b.key), 'EEE');
  if (b.unit === 'week') return format(parseISO(b.key), 'd MMM');
  return format(parseISO(b.key), 'MMM');
}

function barAria(b: TrainingBucket, metric: WorkoutMetric, weightUnit: WeightUnit): string {
  const name =
    b.unit === 'day'
      ? b.isCurrent
        ? 'Today'
        : format(parseISO(b.key), 'EEE d MMM')
      : selectionLabel(b);
  if (!b.hasData) return `${name}, nothing trained`;
  if (metric === 'sessions') {
    return `${name}, ${b.sessions} ${b.sessions === 1 ? 'session' : 'sessions'}`;
  }
  if (b.volumeKg <= 0) return `${name}, no volume`;
  return `${name}, ${formatVolume(b.volumeKg, weightUnit)} ${weightUnit}`;
}

function footerValue(b: TrainingBucket, metric: WorkoutMetric, weightUnit: WeightUnit): string {
  if (!b.hasData) return 'No workouts';
  if (metric === 'sessions') {
    return `${b.sessions} ${b.sessions === 1 ? 'session' : 'sessions'}`;
  }
  if (b.volumeKg <= 0) return 'No volume';
  return `${formatVolume(b.volumeKg, weightUnit)} ${weightUnit}`;
}

function chartSummary(
  buckets: TrainingBucket[],
  unit: BucketUnit,
  metric: WorkoutMetric,
  weightUnit: WeightUnit
): string {
  const per = unit === 'day' ? 'day' : unit === 'week' ? 'week' : 'month';
  const values = buckets.map((b) => {
    if (metric === 'sessions') return String(b.sessions);
    return b.volumeKg > 0 ? formatVolume(b.volumeKg, weightUnit) : '0';
  });
  const last = buckets[buckets.length - 1];
  const noun = metric === 'sessions' ? `Sessions per ${per}` : `Volume per ${per}, ${weightUnit}`;
  if (values.length === 0) return noun;
  const tail = last?.isCurrent ? `${values[values.length - 1]} so far` : values[values.length - 1];
  if (values.length === 1) return `${noun}: ${tail}`;
  return `${noun}: ${values.slice(0, -1).join(', ')}, and ${tail}`;
}

function barPath(x: number, width: number, height: number, radius: number): string {
  const r = Math.min(radius, width / 2, height);
  const top = CHART_HEIGHT - height;
  return [
    `M ${x} ${CHART_HEIGHT}`,
    `L ${x} ${top + r}`,
    `Q ${x} ${top} ${x + r} ${top}`,
    `L ${x + width - r} ${top}`,
    `Q ${x + width} ${top} ${x + width} ${top + r}`,
    `L ${x + width} ${CHART_HEIGHT}`,
    'Z',
  ].join(' ');
}

export function WorkoutsChart({ range, unit, buckets, averages, rangeStart }: Props) {
  const text = useThemeColor({}, 'text');
  const icon = useThemeColor({}, 'icon');
  const tint = useThemeColor({}, 'tint');
  const chartBar = useThemeColor({}, 'chartBar');
  const separator = useThemeColor({}, 'separator');
  const { weightUnit } = usePreferences();

  const [width, setWidth] = useState(0);
  const [metric, setMetric] = useState<WorkoutMetric>('sessions');
  const [selectedKey, setSelectedKey] = useState<string | null>(null);

  const n = buckets.length;
  const gap = n <= 8 ? 10 : n <= 14 ? 6 : 3;
  const radius = n <= 8 ? 8 : n > 14 ? 2 : 4;

  const displayValues =
    metric === 'sessions'
      ? buckets.map((b) => b.sessions)
      : buckets.map((b) => (weightUnit === 'kg' ? b.volumeKg : kgToLb(b.volumeKg)));

  const scale =
    metric === 'sessions' ? sessionBarScale(displayValues) : chartScale(displayValues, null);

  const defaultIndex = unit === 'day' ? Math.max(0, n - 2) : n - 1;
  const picked = selectedKey == null ? -1 : buckets.findIndex((b) => b.key === selectedKey);
  const selectedIndex = picked >= 0 ? picked : defaultIndex;
  const selected = buckets[selectedIndex];

  const hasWorkouts = averages != null && averages.sessions > 0;
  const showFooter = selected != null && (hasWorkouts || picked >= 0);
  const phrase = rangePhrase(range, rangeStart);
  const barWidth = n > 0 && width > 0 ? (width - gap * (n - 1)) / n : 0;

  const perBarLabels = n <= 8;
  const lastTick = unit === 'day' ? 'Today' : unit === 'week' ? 'This week' : 'This month';
  const ticks = n > 0 ? [format(parseISO(rangeStart), 'd MMM'), lastTick] : [];

  return (
    <Card style={styles.card}>
      <ProgressCardHeader
        label="Training"
        trailing={
          <SegmentedControl
            style={styles.segmented}
            options={METRICS}
            value={metric}
            onChange={setMetric}
            accessibilityLabel="Training metric"
          />
        }
      />

      {hasWorkouts ? (
        <View style={styles.head}>
          <View style={styles.stats}>
            <View style={styles.stat}>
              <ThemedText type="stat" style={styles.statValue}>
                {formatSessionsPerWeek(averages.sessionsPerWeek)}
              </ThemedText>
              <ThemedText type="caption">sessions a week</ThemedText>
            </View>
            <View style={styles.stat}>
              <ThemedText type="stat" style={styles.statValue}>
                {formatDurationShort(averages.averageDurationSeconds)}
              </ThemedText>
              <ThemedText type="caption">average session</ThemedText>
            </View>
          </View>
          <ThemedText type="caption">
            {`${averages.sessions} ${averages.sessions === 1 ? 'session' : 'sessions'} ${
              range === 'all' ? phrase : `in ${phrase}`
            }`}
          </ThemedText>
        </View>
      ) : (
        <View style={styles.head}>
          <ThemedText type="stat" style={{ color: icon }}>
            No workouts yet
          </ThemedText>
          <ThemedText type="caption">
            {`No workouts ${range === 'all' ? phrase : `in ${phrase}`}.`}
          </ThemedText>
        </View>
      )}

      <View style={styles.chartBlock}>
        <View
          style={styles.chart}
          onLayout={(e: LayoutChangeEvent) => setWidth(e.nativeEvent.layout.width)}
        >
          {n > 0 && (
            <View
              accessible
              accessibilityRole="image"
              accessibilityLabel={chartSummary(buckets, unit, metric, weightUnit)}
              pointerEvents="none"
            >
              {width > 0 && (
                <Svg width={width} height={CHART_HEIGHT} importantForAccessibility="no-hide-descendants">
                  {buckets.map((b, i) => {
                    const x = i * (barWidth + gap);
                    const val = displayValues[i] ?? 0;
                    const filled = metric === 'sessions' ? b.hasData : b.volumeKg > 0;
                    const h = filled ? Math.max(EMPTY_BAR, (val / scale) * CHART_HEIGHT) : EMPTY_BAR;
                    const isSelected = i === selectedIndex;
                    if (!filled) {
                      return (
                        <Path
                          key={b.key}
                          d={barPath(x, barWidth, h, 1)}
                          fill={isSelected ? tint : chartBar}
                          fillOpacity={isSelected ? 1 : STUB_OPACITY}
                        />
                      );
                    }
                    return (
                      <Path
                        key={b.key}
                        d={barPath(x, barWidth, h, radius)}
                        fill={isSelected ? tint : chartBar}
                      />
                    );
                  })}
                </Svg>
              )}
            </View>
          )}
          <View style={[styles.touchRow, { gap }]}>
            {buckets.map((b) => (
              <Pressable
                key={b.key}
                style={styles.touchColumn}
                onPress={() => setSelectedKey(b.key)}
                accessibilityRole="button"
                accessibilityLabel={barAria(b, metric, weightUnit)}
                accessibilityState={{ selected: b.key === selected?.key }}
              />
            ))}
          </View>
        </View>

        {perBarLabels ? (
          <View style={[styles.labelRow, { gap }]}>
            {buckets.map((b, i) => (
              <ThemedText
                key={b.key}
                type="caption"
                numberOfLines={1}
                style={[styles.axisLabel, { color: i === selectedIndex ? text : icon }]}
              >
                {barLabel(b)}
              </ThemedText>
            ))}
          </View>
        ) : (
          <View style={styles.tickRow}>
            {ticks.map((t, i) => (
              <ThemedText key={i} type="caption">
                {t}
              </ThemedText>
            ))}
          </View>
        )}
      </View>

      {showFooter && (
        <View style={[styles.footer, { borderTopColor: separator }]}>
          <View style={styles.footerText}>
            <ThemedText type="label" style={{ color: icon }}>
              {selectionLabel(selected)}
            </ThemedText>
            <ThemedText type="stat" style={styles.footerValue}>
              {footerValue(selected, metric, weightUnit)}
            </ThemedText>
          </View>
        </View>
      )}
    </Card>
  );
}

const styles = StyleSheet.create({
  card: { gap: 14 },
  segmented: { width: 168 },
  head: { gap: 8 },
  stats: { flexDirection: 'row', flexWrap: 'wrap', gap: 18 },
  stat: { gap: 0 },
  statValue: { fontSize: 26, lineHeight: 30 },
  chartBlock: { gap: 8 },
  chart: { height: CHART_HEIGHT },
  touchRow: { position: 'absolute', top: 0, bottom: 0, left: 0, right: 0, flexDirection: 'row' },
  touchColumn: { flex: 1 },
  labelRow: { flexDirection: 'row' },
  axisLabel: { flex: 1, textAlign: 'center' },
  tickRow: { flexDirection: 'row', justifyContent: 'space-between' },
  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    paddingTop: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  footerText: { gap: 2, flexShrink: 1 },
  footerValue: { fontSize: 18, lineHeight: 22 },
});
