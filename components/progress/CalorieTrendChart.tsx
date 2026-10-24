import { useState } from 'react';
import { Pressable, StyleSheet, View, type LayoutChangeEvent } from 'react-native';
import Svg, { Line, Path, Polyline } from 'react-native-svg';
import { format, parseISO } from 'date-fns';
import { ProgressCardHeader } from '@/components/progress/ProgressCardHeader';
import { ThemedText } from '@/components/themed-text';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Chip } from '@/components/ui/Chip';
import { useThemeColor } from '@/hooks/use-theme-color';
import { usePreferences } from '@/hooks/usePreferences';
import {
  alignTrendToBuckets,
  formatWeeklyRate,
  trendSegments,
  weightDomain,
  weightY,
  type TrendPoint,
} from '@/lib/calorie-weight';
import { chartScale, type Bucket, type BucketUnit, type ProgressRange, type ProgressSummary } from '@/lib/progress';
import { formatWeight, formatWeightWithUnit } from '@/lib/units';
import type { WeightUnit } from '@/lib/types';

const CHART_HEIGHT = 160;
const EMPTY_BAR = 3;
const TODAY_OPACITY = 0.5;
const STUB_OPACITY = 0.35;
const GUTTER_WIDTH = 48;

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
  showWeight?: boolean;
  onToggleWeight?: (next: boolean) => void;
  trend?: TrendPoint[];
  weeklyRateKg?: number | null;
};

function fmt(n: number): string {
  return Math.round(n).toLocaleString('en-US');
}

function rangePhrase(range: ProgressRange, rangeStart: string): string {
  if (range === '7d') return 'the last 7 days';
  if (range === '30d') return 'the last 30 days';
  if (range === '90d') return 'the last 90 days';
  return `since ${format(parseISO(rangeStart), 'd MMM')}`;
}

function selectionLabel(b: Bucket): string {
  if (b.unit === 'day') return b.isCurrent ? 'Today so far' : format(parseISO(b.key), 'EEE, d MMM');
  if (b.unit === 'week') return b.isCurrent ? 'This week so far' : `Week of ${format(parseISO(b.key), 'd MMM')}`;
  const month = format(parseISO(b.key), 'MMMM');
  return b.isCurrent ? `${month} (so far)` : month;
}

function barAria(b: Bucket, weightKg: number | null, weightUnit: WeightUnit): string {
  const base =
    b.unit === 'day'
      ? `${b.isCurrent ? 'Today' : format(parseISO(b.key), 'EEE d MMM')}, ${
          b.hasData ? `${fmt(b.calories)} cal` : 'nothing logged'
        }`
      : `${selectionLabel(b)}, ${
          b.hasData ? `${fmt(b.calories)} cal average per logged day` : 'nothing logged'
        }`;
  if (weightKg == null) return base;
  return `${base}, ${formatWeightWithUnit(weightKg, weightUnit)}`;
}

function barLabel(b: Bucket): string {
  if (b.unit === 'day') return b.isCurrent ? 'Today' : format(parseISO(b.key), 'EEE');
  return format(parseISO(b.key), 'MMM');
}

function chartSummary(
  unit: BucketUnit,
  range: ProgressRange,
  rangeStart: string,
  avg: number | null,
  goal: number | null
): string {
  const noun = unit === 'day' ? 'Daily' : unit === 'week' ? 'Weekly' : 'Monthly';
  const base = `${noun} calories ${range === 'all' ? '' : 'for '}${rangePhrase(range, rangeStart)}`;
  if (avg == null) return `${base}, no average yet`;
  const against = goal != null ? ` against a ${fmt(goal)} goal` : '';
  return `${base}, average ${fmt(avg)}${against}`;
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

export function CalorieTrendChart({
  range,
  unit,
  buckets,
  summary,
  calorieGoal,
  rangeStart,
  onOpenDay,
  showWeight = false,
  onToggleWeight,
  trend = [],
  weeklyRateKg = null,
}: Props) {
  const cardBackground = useThemeColor({}, 'cardBackground');
  const text = useThemeColor({}, 'text');
  const icon = useThemeColor({}, 'icon');
  const tint = useThemeColor({}, 'tint');
  const chartBar = useThemeColor({}, 'chartBar');
  const separator = useThemeColor({}, 'separator');
  const { weightUnit } = usePreferences();

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

  const aligned = showWeight ? alignTrendToBuckets(trend, buckets) : [];
  const finiteAligned = aligned.filter((v): v is number => v !== null && Number.isFinite(v));
  const domain = showWeight ? weightDomain(finiteAligned) : null;
  const hasWeightLine = showWeight && domain !== null;
  const needsMoreWeightPoints = showWeight && domain === null;
  const segments = hasWeightLine ? trendSegments(aligned) : [];

  const defaultIndex = unit === 'day' ? Math.max(0, n - 2) : n - 1;
  const picked = selectedKey == null ? -1 : buckets.findIndex((b) => b.key === selectedKey);
  const selectedIndex = picked >= 0 ? picked : defaultIndex;
  const selected = buckets[selectedIndex];
  const selectedWeightKg =
    showWeight && selectedIndex >= 0 ? aligned[selectedIndex] ?? null : null;

  const hasAverage = summary.avg != null;
  const showFooter = selected != null && (hasAverage || picked >= 0);
  const showGoal = goal != null && hasAverage;
  const phrase = rangePhrase(range, rangeStart);
  const barWidth = n > 0 && width > 0 ? (width - gap * (n - 1)) / n : 0;
  const goalY = goal != null ? CHART_HEIGHT - (goal / scale) * CHART_HEIGHT : 0;

  const perBarLabels = n <= 8 && (range === '7d' || unit === 'month');
  const lastTick = unit === 'day' ? 'Today' : unit === 'week' ? 'This week' : 'This month';
  const ticks = n > 0 ? [format(parseISO(rangeStart), 'd MMM'), lastTick] : [];

  const select = (b: Bucket) => {
    setSelectedKey(b.key);
    if (b.unit === 'day') onOpenDay(b.key);
  };

  return (
    <Card style={styles.card}>
      <ProgressCardHeader
        label="Calories, daily average"
        value={
          hasAverage ? (
            <ThemedText type="hero" style={styles.avg}>
              {fmt(summary.avg!.calories)}
            </ThemedText>
          ) : (
            <ThemedText type="stat" style={{ color: icon }}>
              No average yet
            </ThemedText>
          )
        }
        valueAccessibilityLabel={
          hasAverage ? `${fmt(summary.avg!.calories)} calories a day on average` : undefined
        }
        trailing={
          <Chip
            size="sm"
            role="checkbox"
            label="+ Weight"
            selected={showWeight}
            onPress={() => onToggleWeight?.(!showWeight)}
            accessibilityLabel="Show weight trend"
          />
        }
      />

      {hasWeightLine && (
        <View style={styles.weightLegendBlock}>
          <View style={styles.legend}>
            <View style={[styles.weightSwatch, { backgroundColor: text }]} />
            <ThemedText type="caption">{`Weight, ${weightUnit}`}</ThemedText>
          </View>
          {weeklyRateKg != null && (
            <ThemedText type="caption" style={styles.tabular}>
              {formatWeeklyRate(weeklyRateKg, weightUnit)}
            </ThemedText>
          )}
        </View>
      )}

      {needsMoreWeightPoints && (
        <ThemedText type="caption">The weight line needs 2 trend points.</ThemedText>
      )}

      <View style={styles.plotRow}>
        {hasWeightLine && (
          <View style={styles.leftGutter}>
            <ThemedText type="caption" style={styles.tabular}>{fmt(scale)}</ThemedText>
            <ThemedText type="caption" style={styles.tabular}>0</ThemedText>
          </View>
        )}

        <View style={styles.chartBlock}>
          <View style={styles.chart} onLayout={(e: LayoutChangeEvent) => setWidth(e.nativeEvent.layout.width)}>
            {n > 0 && (
              <View
                accessible
                accessibilityRole="image"
                accessibilityLabel={chartSummary(unit, range, rangeStart, summary.avg?.calories ?? null, goal)}
                pointerEvents="none"
              >
                {width > 0 && (
                <Svg width={width} height={CHART_HEIGHT} importantForAccessibility="no-hide-descendants">
                  {buckets.map((b, i) => {
                    const x = i * (barWidth + gap);
                    const h = b.hasData ? Math.max(EMPTY_BAR, (b.calories / scale) * CHART_HEIGHT) : EMPTY_BAR;
                    const isSelected = i === selectedIndex;
                    if (!b.hasData) {
                      return (
                        <Path
                          key={b.key}
                          d={barPath(x, barWidth, h, 1)}
                          fill={isSelected ? tint : chartBar}
                          fillOpacity={isSelected ? 1 : STUB_OPACITY}
                        />
                      );
                    }
                    const isToday = b.unit === 'day' && b.isCurrent;
                    return (
                      <Path
                        key={b.key}
                        d={barPath(x, barWidth, h, radius)}
                        fill={isSelected ? tint : chartBar}
                        fillOpacity={isToday && !isSelected ? TODAY_OPACITY : 1}
                      />
                    );
                  })}
                  {goal != null && (
                    <Line
                      x1={0}
                      x2={width}
                      y1={goalY}
                      y2={goalY}
                      stroke={icon}
                      strokeOpacity={0.6}
                      strokeWidth={1.5}
                      strokeDasharray="4 4"
                    />
                  )}
                  {hasWeightLine &&
                    domain != null &&
                    segments
                      .filter((seg) => seg.length >= 2)
                      .map((seg) => {
                        const points = seg
                          .map(
                            (pt) =>
                              `${pt.index * (barWidth + gap) + barWidth / 2},${weightY(
                                pt.kg,
                                domain,
                                CHART_HEIGHT
                              )}`
                          )
                          .join(' ');
                        return (
                          <Polyline
                            key={seg[0].index}
                            points={points}
                            fill="none"
                            stroke={text}
                            strokeWidth={2}
                            strokeLinecap="round"
                            strokeLinejoin="round"
                          />
                        );
                      })}
                </Svg>
                )}
              </View>
            )}
            {showGoal && (
              <View
                style={[styles.goalLabel, { top: Math.max(0, goalY - 18), backgroundColor: cardBackground }]}
                pointerEvents="none"
                accessibilityElementsHidden
                importantForAccessibility="no-hide-descendants"
              >
                <ThemedText type="caption" style={styles.tabular}>{`Goal ${fmt(goal!)}`}</ThemedText>
              </View>
            )}
            <View style={[styles.touchRow, { gap }]}>
              {buckets.map((b, i) => (
                <Pressable
                  key={b.key}
                  style={styles.touchColumn}
                  onPress={() => select(b)}
                  accessibilityRole="button"
                  accessibilityLabel={barAria(b, showWeight ? aligned[i] ?? null : null, weightUnit)}
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

        {hasWeightLine && domain != null && (
          <View style={styles.rightGutter}>
            <ThemedText type="caption" style={[styles.tabular, styles.rightTick, { color: text }]}>
              {formatWeight(domain.max, weightUnit)}
            </ThemedText>
            <ThemedText type="caption" style={[styles.tabular, styles.rightTick, { color: text }]}>
              {formatWeight(domain.min, weightUnit)}
            </ThemedText>
          </View>
        )}
      </View>

      <ThemedText type="caption">
        {hasAverage
          ? `${summary.averagedDays} logged ${summary.averagedDays === 1 ? 'day' : 'days'} ${
              range === 'all' ? phrase : `in ${phrase}`
            }, today excluded`
          : `No meals logged ${range === 'all' ? phrase : `in ${phrase}`}, today excluded`}
      </ThemedText>

      {showFooter && (
        <View style={[styles.footer, { borderTopColor: separator }]}>
          <View style={styles.footerText}>
            <ThemedText type="label" style={{ color: icon }}>{selectionLabel(selected)}</ThemedText>
            <ThemedText type="stat" style={styles.footerValue}>
              {selected.hasData
                ? `${fmt(selected.calories)} cal${selected.unit === 'day' ? '' : ' avg'}`
                : 'Nothing logged'}
            </ThemedText>
            {selectedWeightKg != null && (
              <ThemedText type="body" style={styles.tabular}>
                {formatWeightWithUnit(selectedWeightKg, weightUnit)}
              </ThemedText>
            )}
          </View>
          {selected.unit === 'day' && (
            <Button
              variant="secondary"
              size="sm"
              label="View day"
              accessibilityLabel={`View day, ${selectionLabel(selected)}`}
              onPress={() => onOpenDay(selected.key)}
            />
          )}
        </View>
      )}
    </Card>
  );
}

const styles = StyleSheet.create({
  card: { gap: 14 },
  avg: { fontSize: 34, lineHeight: 40 },
  tabular: { fontVariant: ['tabular-nums'] },
  legend: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  weightLegendBlock: { gap: 4 },
  weightSwatch: { width: 18, height: 2, borderRadius: 1 },
  plotRow: { flexDirection: 'row', alignItems: 'flex-start' },
  leftGutter: {
    width: GUTTER_WIDTH,
    height: CHART_HEIGHT,
    justifyContent: 'space-between',
    paddingRight: 6,
  },
  rightGutter: {
    width: GUTTER_WIDTH,
    height: CHART_HEIGHT,
    justifyContent: 'space-between',
    alignItems: 'flex-end',
    paddingLeft: 6,
  },
  rightTick: { textAlign: 'right' },
  chartBlock: { flex: 1, gap: 8 },
  chart: { height: CHART_HEIGHT },
  goalLabel: { position: 'absolute', right: 0, paddingHorizontal: 4, borderRadius: 4 },
  touchRow: { position: 'absolute', top: 0, bottom: 0, left: 0, right: 0, flexDirection: 'row' },
  touchColumn: { flex: 1 },
  labelRow: { flexDirection: 'row' },
  axisLabel: { flex: 1, textAlign: 'center' },
  tickRow: { flexDirection: 'row', justifyContent: 'space-between' },
  footer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    paddingTop: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  footerText: { gap: 2, flexShrink: 1 },
  footerValue: { fontSize: 18, lineHeight: 22 },
});
