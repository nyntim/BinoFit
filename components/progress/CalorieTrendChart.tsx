import { useState } from 'react';
import { Pressable, StyleSheet, Text, TouchableOpacity, View, type LayoutChangeEvent } from 'react-native';
import Svg, { Line, Path } from 'react-native-svg';
import { format, parseISO } from 'date-fns';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { useThemeColor } from '@/hooks/use-theme-color';
import { chartScale, type Bucket, type BucketUnit, type ProgressRange, type ProgressSummary } from '@/lib/progress';

const CHART_HEIGHT = 160;
const EMPTY_BAR = 3;

type Props = {
  range: ProgressRange;
  unit: BucketUnit;
  buckets: Bucket[];
  summary: ProgressSummary;
  /** Current calorie goal, null when none is set. */
  calorieGoal: number | null;
  /** First date of the range, for the "since Mar 3" caption. */
  rangeStart: string;
  onOpenDay: (date: string) => void;
};

function fmt(n: number): string {
  return Math.round(n).toLocaleString('en-US');
}

function rangePhrase(range: ProgressRange, rangeStart: string): string {
  if (range === '7d') return 'the last 7 days';
  if (range === '30d') return 'the last 30 days';
  if (range === '90d') return 'the last 90 days';
  return `since ${format(parseISO(rangeStart), 'MMM d')}`;
}

function selectionLabel(b: Bucket): string {
  if (b.unit === 'day') return b.isCurrent ? 'Today so far' : format(parseISO(b.key), 'EEE, MMM d');
  if (b.unit === 'week') return b.isCurrent ? 'This week so far' : `Week of ${format(parseISO(b.key), 'MMM d')}`;
  const month = format(parseISO(b.key), 'MMMM');
  return b.isCurrent ? `${month} (so far)` : month;
}

function barAria(b: Bucket): string {
  if (b.unit === 'day') {
    const name = b.isCurrent ? 'Today' : format(parseISO(b.key), 'EEE MMM d');
    return `${name}, ${b.hasData ? `${fmt(b.calories)} cal` : 'nothing logged'}`;
  }
  return `${selectionLabel(b)}, ${b.hasData ? `${fmt(b.calories)} cal average per logged day` : 'nothing logged'}`;
}

function barLabel(b: Bucket): string {
  if (b.unit === 'day') return b.isCurrent ? 'Today' : format(parseISO(b.key), 'EEE');
  return format(parseISO(b.key), 'MMM');
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

export function CalorieTrendChart({ range, unit, buckets, summary, calorieGoal, rangeStart, onOpenDay }: Props) {
  const card = useThemeColor({}, 'cardBackground');
  const text = useThemeColor({}, 'text');
  const icon = useThemeColor({}, 'icon');
  const tint = useThemeColor({}, 'tint');
  const track = useThemeColor({}, 'track');
  const separator = useThemeColor({}, 'separator');
  const fieldBorder = useThemeColor({}, 'fieldBorder');

  const [width, setWidth] = useState(0);
  const [selectedKey, setSelectedKey] = useState<string | null>(null);

  const n = buckets.length;
  const gap = n <= 8 ? 10 : n <= 14 ? 6 : 3;
  const radius = n > 14 ? 2 : 4;
  const goal = calorieGoal != null && calorieGoal > 0 ? calorieGoal : null;
  const scale = chartScale(
    buckets.map((b) => b.calories),
    goal
  );

  const defaultIndex = unit === 'day' ? Math.max(0, n - 2) : n - 1;
  const picked = selectedKey == null ? -1 : buckets.findIndex((b) => b.key === selectedKey);
  const selectedIndex = picked >= 0 ? picked : defaultIndex;
  const selected = buckets[selectedIndex];

  const hasAverage = summary.avg != null;
  const showFooter = selected != null && (hasAverage || picked >= 0);
  const showGoal = goal != null && hasAverage;
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

  const select = (b: Bucket) => {
    setSelectedKey(b.key);
    if (b.unit === 'day') onOpenDay(b.key);
  };

  return (
    <View style={[styles.card, { backgroundColor: card }]}>
      <View style={styles.head}>
        <Text style={[styles.title, { color: text }]} accessibilityRole="header">
          Calories
        </Text>
        {hasAverage ? (
          <>
            <View style={styles.avgRow}>
              <Text style={[styles.avg, { color: text }]}>{fmt(summary.avg!.calories)}</Text>
              <Text style={[styles.small, { color: icon }]}>cal avg per day</Text>
            </View>
            <Text style={[styles.caption, { color: icon }]}>
              {`${summary.averagedDays} logged ${summary.averagedDays === 1 ? 'day' : 'days'} ${
                range === 'all' ? phrase : `in ${phrase}`
              }, today excluded`}
            </Text>
          </>
        ) : (
          <>
            <Text style={[styles.avg, { color: icon }]}>No average yet</Text>
            <Text style={[styles.caption, { color: icon }]}>
              {`No meals logged ${range === 'all' ? phrase : `in ${phrase}`}, today excluded`}
            </Text>
          </>
        )}
      </View>

      {showGoal && (
        <View style={styles.legend}>
          <View style={[styles.legendLine, { borderTopColor: icon }]} />
          <Text style={[styles.small, { color: icon }]}>{`Goal ${fmt(goal!)} cal`}</Text>
        </View>
      )}

      <View style={styles.chartBlock}>
        <View style={styles.chart} onLayout={(e: LayoutChangeEvent) => setWidth(e.nativeEvent.layout.width)}>
          {width > 0 && n > 0 && (
            <Svg width={width} height={CHART_HEIGHT} accessible={false} importantForAccessibility="no-hide-descendants">
              {buckets.map((b, i) => {
                const x = i * (barWidth + gap);
                const h = b.hasData ? Math.max(EMPTY_BAR, (b.calories / scale) * CHART_HEIGHT) : EMPTY_BAR;
                const isSelected = i === selectedIndex;
                if (!b.hasData) {
                  return <Path key={b.key} d={barPath(x, barWidth, h, 1)} fill={isSelected ? tint : track} />;
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
              {goal != null && (
                <Line
                  x1={0}
                  x2={width}
                  y1={CHART_HEIGHT - (goal / scale) * CHART_HEIGHT}
                  y2={CHART_HEIGHT - (goal / scale) * CHART_HEIGHT}
                  stroke={icon}
                  strokeWidth={1.5}
                  strokeDasharray="4 4"
                />
              )}
            </Svg>
          )}
          <View style={[styles.touchRow, { gap }]}>
            {buckets.map((b) => (
              <Pressable
                key={b.key}
                style={styles.touchColumn}
                onPress={() => select(b)}
                accessibilityRole="button"
                accessibilityLabel={barAria(b)}
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
              {selected.hasData
                ? `${fmt(selected.calories)} cal${selected.unit === 'day' ? '' : ' avg'}`
                : 'Nothing logged'}
            </Text>
          </View>
          {selected.unit === 'day' && (
            <TouchableOpacity
              style={[styles.viewDay, { borderColor: fieldBorder }]}
              onPress={() => onOpenDay(selected.key)}
              accessibilityRole="button"
              accessibilityLabel={`View day, ${selectionLabel(selected)}`}
            >
              <Text style={[styles.viewDayText, { color: tint }]}>View day</Text>
              <MaterialIcons name="chevron-right" size={18} color={tint} />
            </TouchableOpacity>
          )}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { borderRadius: 18, padding: 20, gap: 16 },
  head: { gap: 4 },
  title: { fontSize: 17, fontWeight: '600', lineHeight: 22 },
  avgRow: { flexDirection: 'row', alignItems: 'baseline', gap: 6 },
  avg: { fontSize: 22, fontWeight: '700', lineHeight: 26, fontVariant: ['tabular-nums'] },
  small: { fontSize: 12 },
  caption: { fontSize: 12, lineHeight: 17 },
  legend: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  legendLine: { width: 18, borderTopWidth: 1.5, borderStyle: 'dashed' },
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
  viewDay: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    minHeight: 44,
    paddingLeft: 12,
    paddingRight: 8,
    borderWidth: 1,
    borderRadius: 12,
  },
  viewDayText: { fontSize: 15, fontWeight: '600' },
});
