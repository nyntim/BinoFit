import { useState } from 'react';
import {
  Pressable,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  type LayoutChangeEvent,
} from 'react-native';
import Svg, { Path } from 'react-native-svg';
import { format, parseISO } from 'date-fns';
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

const CHART_HEIGHT = 160;
const EMPTY_BAR = 3;

type WorkoutMetric = 'sessions' | 'volume';

const METRICS: { id: WorkoutMetric; label: string }[] = [
  { id: 'sessions', label: 'Sessions' },
  { id: 'volume', label: 'Volume' },
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
  return `since ${format(parseISO(rangeStart), 'MMM d')}`;
}

function selectionLabel(b: TrainingBucket): string {
  if (b.unit === 'day') return b.isCurrent ? 'Today so far' : format(parseISO(b.key), 'EEE, MMM d');
  if (b.unit === 'week')
    return b.isCurrent ? 'This week so far' : `Week of ${format(parseISO(b.key), 'MMM d')}`;
  const month = format(parseISO(b.key), 'MMMM');
  return b.isCurrent ? `${month} (so far)` : month;
}

function barLabel(b: TrainingBucket): string {
  if (b.unit === 'day') return b.isCurrent ? 'Today' : format(parseISO(b.key), 'EEE');
  return format(parseISO(b.key), 'MMM');
}

function barAria(b: TrainingBucket, metric: WorkoutMetric, weightUnit: WeightUnit): string {
  const name =
    b.unit === 'day'
      ? b.isCurrent
        ? 'Today'
        : format(parseISO(b.key), 'EEE MMM d')
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
  const card = useThemeColor({}, 'cardBackground');
  const text = useThemeColor({}, 'text');
  const icon = useThemeColor({}, 'icon');
  const tint = useThemeColor({}, 'tint');
  const track = useThemeColor({}, 'track');
  const separator = useThemeColor({}, 'separator');
  const secondary = useThemeColor({}, 'cardSecondary');
  const background = useThemeColor({}, 'background');
  const { weightUnit } = usePreferences();

  const [width, setWidth] = useState(0);
  const [metric, setMetric] = useState<WorkoutMetric>('sessions');
  const [selectedKey, setSelectedKey] = useState<string | null>(null);

  const n = buckets.length;
  const gap = n <= 8 ? 10 : n <= 14 ? 6 : 3;
  const radius = n > 14 ? 2 : 4;

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

  const perBarLabels = n <= 8 && (range === '7d' || unit === 'month');
  const lastTick = unit === 'day' ? 'Today' : unit === 'week' ? 'This week' : 'This month';
  const ticks =
    n > 0
      ? [
          format(parseISO(rangeStart), 'MMM d'),
          format(parseISO(buckets[Math.floor((n - 1) / 2)].start), 'MMM d'),
          lastTick,
        ]
      : [];

  return (
    <View style={[styles.card, { backgroundColor: card }]}>
      <View style={styles.headTop}>
        <Text style={[styles.title, { color: text }]} accessibilityRole="header">
          Workouts
        </Text>
        <View
          style={styles.toggleRow}
          accessibilityRole="radiogroup"
          accessibilityLabel="Workout metric"
        >
          {METRICS.map((m) => {
            const active = m.id === metric;
            return (
              <TouchableOpacity
                key={m.id}
                style={[styles.toggleChip, { backgroundColor: active ? tint : secondary }]}
                onPress={() => setMetric(m.id)}
                hitSlop={{ top: 6, bottom: 6, left: 4, right: 4 }}
                accessibilityRole="radio"
                accessibilityState={{ selected: active, checked: active }}
                accessibilityLabel={m.label}
              >
                <Text style={[styles.toggleLabel, { color: active ? background : text }]}>
                  {m.label}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>
      </View>

      <View style={styles.head}>
        {hasWorkouts ? (
          <>
            <View style={styles.avgRow}>
              <Text style={[styles.avg, { color: text }]}>
                {formatSessionsPerWeek(averages.sessionsPerWeek)}
              </Text>
              <Text style={[styles.small, { color: icon }]}>per week</Text>
            </View>
            <Text style={[styles.subAvg, { color: text }]}>
              {`${formatDurationShort(averages.averageDurationSeconds)} average`}
            </Text>
            <Text style={[styles.caption, { color: icon }]}>
              {`${averages.sessions} ${averages.sessions === 1 ? 'session' : 'sessions'} ${
                range === 'all' ? phrase : `in ${phrase}`
              }`}
            </Text>
          </>
        ) : (
          <>
            <Text style={[styles.avg, { color: icon }]}>No workouts yet</Text>
            <Text style={[styles.caption, { color: icon }]}>
              {`No workouts ${range === 'all' ? phrase : `in ${phrase}`}.`}
            </Text>
          </>
        )}
      </View>

      <View style={styles.chartBlock}>
        <View
          style={styles.chart}
          onLayout={(e: LayoutChangeEvent) => setWidth(e.nativeEvent.layout.width)}
        >
          {width > 0 && n > 0 && (
            <Svg
              width={width}
              height={CHART_HEIGHT}
              accessible={false}
              importantForAccessibility="no-hide-descendants"
            >
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
                      fill={isSelected ? tint : track}
                    />
                  );
                }
                return (
                  <Path
                    key={b.key}
                    d={barPath(x, barWidth, h, radius)}
                    fill={isSelected ? tint : icon}
                    fillOpacity={isSelected ? 1 : 0.55}
                  />
                );
              })}
            </Svg>
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
              <Text
                key={b.key}
                numberOfLines={1}
                style={[styles.axisLabel, { color: i === selectedIndex ? text : icon }]}
              >
                {barLabel(b)}
              </Text>
            ))}
          </View>
        ) : (
          <View style={styles.tickRow}>
            {ticks.map((t, i) => (
              <Text key={i} style={[styles.axisTick, { color: icon }]}>
                {t}
              </Text>
            ))}
          </View>
        )}
      </View>

      {showFooter && (
        <View style={[styles.footer, { borderTopColor: separator }]}>
          <View style={styles.footerText}>
            <Text style={[styles.footerLabel, { color: icon }]}>{selectionLabel(selected)}</Text>
            <Text style={[styles.footerValue, { color: text }]}>
              {footerValue(selected, metric, weightUnit)}
            </Text>
          </View>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { borderRadius: 18, padding: 20, gap: 16 },
  headTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  title: { fontSize: 17, fontWeight: '600', lineHeight: 22 },
  toggleRow: { flexDirection: 'row', gap: 6 },
  toggleChip: {
    minHeight: 34,
    paddingHorizontal: 12,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
  },
  toggleLabel: { fontSize: 13, fontWeight: '500' },
  head: { gap: 4 },
  avgRow: { flexDirection: 'row', alignItems: 'baseline', gap: 6 },
  avg: { fontSize: 22, fontWeight: '700', lineHeight: 26, fontVariant: ['tabular-nums'] },
  subAvg: { fontSize: 13, fontWeight: '500', lineHeight: 18, fontVariant: ['tabular-nums'] },
  small: { fontSize: 12 },
  caption: { fontSize: 12, lineHeight: 17 },
  chartBlock: { gap: 8 },
  chart: { height: CHART_HEIGHT },
  touchRow: { position: 'absolute', top: 0, bottom: 0, left: 0, right: 0, flexDirection: 'row' },
  touchColumn: { flex: 1 },
  labelRow: { flexDirection: 'row' },
  axisLabel: { flex: 1, textAlign: 'center', fontSize: 12 },
  tickRow: { flexDirection: 'row', justifyContent: 'space-between' },
  axisTick: { fontSize: 12 },
  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    paddingTop: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  footerText: { gap: 2, flexShrink: 1 },
  footerLabel: { fontSize: 13, fontWeight: '500' },
  footerValue: { fontSize: 17, fontWeight: '600', fontVariant: ['tabular-nums'] },
});
