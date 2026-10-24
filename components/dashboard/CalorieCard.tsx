import { StyleSheet, View, useWindowDimensions } from 'react-native';
import { CalorieRing } from '@/components/calorie-ring';
import { CalorieStat } from '@/components/dashboard/CalorieStat';
import { ThemedText } from '@/components/themed-text';
import { Card } from '@/components/ui/Card';
import { ProgressBar } from '@/components/ui/ProgressBar';
import { useThemeColor } from '@/hooks/use-theme-color';
import { calorieDelta } from '@/lib/meal-nutrition-summary';

/** At this font scale the ring is too small for its number, so the card reflows to a bar. */
const REFLOW_FONT_SCALE = 1.6;

type Props = {
  /** Rounded calories eaten. */
  eaten: number;
  goal: number;
  /** Rounded calories in planned meals. */
  planned: number;
};

/** Calories left (or over), the goal and the planned total. Over goal is neutral: color never judges. */
export function CalorieCard({ eaten, goal, planned }: Props) {
  const { fontScale } = useWindowDimensions();
  const tint = useThemeColor({}, 'tint');
  const track = useThemeColor({}, 'track');
  const text = useThemeColor({}, 'text');
  const icon = useThemeColor({}, 'icon');
  const separator = useThemeColor({}, 'separator');
  const delta = calorieDelta(eaten, goal) ?? { kind: 'left' as const, value: Math.max(0, goal - eaten) };
  const deltaLabel = delta.kind === 'over' ? 'Over' : 'Left';

  const secondary = (
    <View style={styles.secondary}>
      <CalorieStat label="Goal" value={goal} />
      <CalorieStat label="Planned" value={planned} />
    </View>
  );

  if (fontScale >= REFLOW_FONT_SCALE) {
    const tail = delta.kind === 'over' ? `over by ${delta.value.toLocaleString()}` : `${delta.value.toLocaleString()} left`;
    return (
      <Card>
        <View
          accessible
          accessibilityRole="image"
          accessibilityLabel={`${eaten.toLocaleString()} of ${goal.toLocaleString()} calories eaten, ${tail}`}
          style={styles.bar}
        >
          <ThemedText type="hero">{eaten.toLocaleString()}</ThemedText>
          <ThemedText type="caption">{`of ${goal.toLocaleString()} cal · ${tail}`}</ThemedText>
          <ProgressBar value={eaten} max={goal} height={12} />
        </View>
        <View style={[styles.stackedSecondary, { borderTopColor: separator }]}>{secondary}</View>
      </Card>
    );
  }

  return (
    <Card>
      <View style={styles.ringRow}>
        <CalorieRing
          size={136}
          strokeWidth={13}
          consumed={eaten}
          goal={goal}
          ringColor={tint}
          trackColor={track}
          textColor={text}
          subTextColor={icon}
        />
        <View style={styles.summary}>
          <CalorieStat label={deltaLabel} value={delta.value} size="large" />
          <View style={[styles.separator, { backgroundColor: separator }]} />
          {secondary}
        </View>
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  ringRow: { flexDirection: 'row', alignItems: 'center', gap: 20 },
  summary: { flex: 1, minWidth: 0, gap: 10 },
  separator: { height: StyleSheet.hairlineWidth },
  secondary: { flexDirection: 'row', flexWrap: 'wrap', gap: 20 },
  bar: { gap: 8 },
  stackedSecondary: { marginTop: 14, paddingTop: 12, borderTopWidth: StyleSheet.hairlineWidth },
});
