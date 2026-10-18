import { useState } from 'react';
import { StyleSheet, Text, View, type LayoutChangeEvent } from 'react-native';
import Svg, { Circle, Line, Polyline } from 'react-native-svg';
import { differenceInCalendarDays, format, parseISO } from 'date-fns';
import { useThemeColor } from '@/hooks/use-theme-color';
import { formatWeight, formatWeightWithUnit, kgToLb } from '@/lib/units';
import { formatWeeklyRate, weightChartDomain, type TrendPoint } from '@/lib/weight-trend';
import type { WeightUnit } from '@/lib/types';

const PLOT_HEIGHT = 140;
const TOP_RULE_Y = 8;
const BOTTOM_RULE_Y = 132;
const USABLE_BAND = BOTTOM_RULE_Y - TOP_RULE_Y;

type Props = {
  points: TrendPoint[];
  rangeStart: string;
  rangeEnd: string;
  unit: WeightUnit;
  weeklyRateKg?: number | null;
};

function toDisplay(kg: number, unit: WeightUnit): number {
  return unit === 'kg' ? kg : kgToLb(kg);
}

export function WeightChart({ points, rangeStart, rangeEnd, unit, weeklyRateKg }: Props) {
  const icon = useThemeColor({}, 'icon');
  const tint = useThemeColor({}, 'tint');
  const cardBackground = useThemeColor({}, 'cardBackground');
  const separator = useThemeColor({}, 'separator');
  const cardSecondary = useThemeColor({}, 'cardSecondary');

  const [width, setWidth] = useState(0);

  if (points.length < 2) {
    return (
      <View style={[styles.emptyBox, { backgroundColor: cardSecondary }]}>
        <Text style={[styles.emptyText, { color: icon }]}>The chart starts at 2 entries.</Text>
      </View>
    );
  }

  const inRange = points.filter((p) => p.date >= rangeStart && p.date <= rangeEnd);

  if (inRange.length === 0) {
    return (
      <View style={[styles.emptyBox, { backgroundColor: cardSecondary }]}>
        <Text style={[styles.emptyText, { color: icon }]}>No weight in this range.</Text>
      </View>
    );
  }

  const startDate = parseISO(rangeStart);
  const endDate = parseISO(rangeEnd);
  const daysFromStartToEnd = differenceInCalendarDays(endDate, startDate);
  const inclusiveRangeLength = daysFromStartToEnd + 1;
  const dotDiameter = inclusiveRangeLength <= 30 ? 8 : 5;
  const dotRadius = dotDiameter / 2;

  const displayValues: number[] = [];
  for (const p of inRange) {
    displayValues.push(toDisplay(p.weight_kg, unit));
    displayValues.push(toDisplay(p.trend_kg, unit));
  }
  const domain = weightChartDomain(displayValues);
  const span = domain.max - domain.min;

  const xOf = (date: string): number => {
    const daysFromStart = differenceInCalendarDays(parseISO(date), startDate);
    return (daysFromStart / Math.max(1, daysFromStartToEnd)) * width;
  };

  const yOf = (val: number): number => {
    return TOP_RULE_Y + ((domain.max - val) / span) * USABLE_BAND;
  };

  const rawKgValues = inRange.map((p) => p.weight_kg);
  const highKg = Math.max(...rawKgValues);
  const lowKg = Math.min(...rawKgValues);

  const firstInRange = inRange[0];
  const lastInRange = inRange[inRange.length - 1];
  const ariaBase = `Weight from ${formatWeightWithUnit(firstInRange.weight_kg, unit)} to ${formatWeightWithUnit(lastInRange.weight_kg, unit)}, trend ${formatWeightWithUnit(lastInRange.trend_kg, unit)}`;
  const ariaRate =
    weeklyRateKg != null
      ? `, ${formatWeeklyRate(weeklyRateKg, unit).replace(' / week', ' per week')}`
      : '';
  const ariaLabel = `${ariaBase}${ariaRate}`;

  const polylinePoints =
    width > 0 && inRange.length >= 2
      ? inRange.map((p) => `${xOf(p.date)},${yOf(toDisplay(p.trend_kg, unit))}`).join(' ')
      : '';

  return (
    <View style={styles.container}>
      <View style={styles.legend}>
        <View style={styles.legendItem}>
          <View style={[styles.manualDot, { backgroundColor: icon }]} />
          <Text style={[styles.legendText, { color: icon }]}>Manual</Text>
        </View>
        <View style={styles.legendItem}>
          <View
            style={[
              styles.healthDot,
              { backgroundColor: cardBackground, borderColor: icon },
            ]}
          />
          <Text style={[styles.legendText, { color: icon }]}>Apple Health</Text>
        </View>
        <View style={styles.legendItem}>
          <View style={[styles.trendSwatch, { backgroundColor: tint }]} />
          <Text style={[styles.legendText, { color: icon }]}>Trend</Text>
        </View>
      </View>

      <View style={styles.plotBlock}>
        <View
          style={styles.plot}
          onLayout={(e: LayoutChangeEvent) => setWidth(e.nativeEvent.layout.width)}
          accessible
          accessibilityRole="image"
          accessibilityLabel={ariaLabel}
        >
          {width > 0 && (
            <Svg
              width={width}
              height={PLOT_HEIGHT}
              accessible={false}
              importantForAccessibility="no-hide-descendants"
              style={styles.svg}
            >
              <Line
                x1={0}
                y1={TOP_RULE_Y}
                x2={width}
                y2={TOP_RULE_Y}
                stroke={separator}
                strokeWidth={1}
              />
              <Line
                x1={0}
                y1={BOTTOM_RULE_Y}
                x2={width}
                y2={BOTTOM_RULE_Y}
                stroke={separator}
                strokeWidth={1}
              />
              {inRange.length >= 2 && (
                <Polyline
                  points={polylinePoints}
                  fill="none"
                  stroke={tint}
                  strokeWidth={2}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              )}
              {inRange.map((p) => (
                <Circle
                  key={p.date}
                  cx={xOf(p.date)}
                  cy={yOf(toDisplay(p.weight_kg, unit))}
                  r={dotRadius}
                  fill={p.source === 'healthkit' ? cardBackground : icon}
                  stroke={icon}
                  strokeWidth={1.5}
                />
              ))}
            </Svg>
          )}
        </View>

        <View style={styles.footer}>
          <Text style={[styles.footerText, { color: icon }]}>
            {format(startDate, 'MMM d')}
          </Text>
          <Text style={[styles.footerText, { color: icon }]}>
            {`High ${formatWeight(highKg, unit)} · Low ${formatWeight(lowKg, unit)}`}
          </Text>
          <Text style={[styles.footerText, { color: icon }]}>Today</Text>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginTop: 12,
    gap: 12,
  },
  emptyBox: {
    marginTop: 12,
    minHeight: 96,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 16,
  },
  emptyText: {
    fontSize: 13,
    lineHeight: 18,
    fontWeight: '500',
    textAlign: 'center',
  },
  legend: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 16,
  },
  legendItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  manualDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  healthDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    borderWidth: 1.5,
  },
  trendSwatch: {
    width: 16,
    height: 2,
    borderRadius: 1,
  },
  legendText: {
    fontSize: 12,
    lineHeight: 17,
  },
  plotBlock: {
    gap: 8,
  },
  plot: {
    height: PLOT_HEIGHT,
  },
  svg: {
    overflow: 'visible',
  },
  footer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  footerText: {
    fontSize: 12,
    lineHeight: 17,
    fontVariant: ['tabular-nums'],
  },
});
