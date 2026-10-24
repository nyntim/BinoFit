import { View, Text, StyleSheet } from 'react-native';
import Svg, { Circle } from 'react-native-svg';
import { Fonts } from '@/constants/theme';

type Props = {
  consumed: number;
  goal: number;
  size?: number;
  ringColor: string;
  trackColor: string;
  textColor: string;
  subTextColor: string;
  strokeWidth?: number;
  /** Replaces the default "of {goal} cal" line under the number (the meal summary passes "cal"). */
  caption?: string;
  /** Replaces the default "X of Y calories" summary. */
  accessibilityLabel?: string;
};

export function CalorieRing({
  consumed,
  goal,
  size = 164,
  ringColor,
  trackColor,
  textColor,
  subTextColor,
  strokeWidth = 14,
  caption,
  accessibilityLabel,
}: Props) {
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const progress = Math.min(consumed / Math.max(goal, 1), 1);
  const strokeDashoffset = circumference * (1 - progress);
  const shown = Math.round(consumed);

  return (
    <View
      style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}
      accessible
      accessibilityRole="image"
      accessibilityLabel={accessibilityLabel ?? `${shown.toLocaleString()} of ${goal.toLocaleString()} calories`}
    >
      <Svg width={size} height={size} style={StyleSheet.absoluteFill}>
        <Circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          stroke={trackColor}
          strokeWidth={strokeWidth}
          fill="none"
        />
        <Circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          stroke={ringColor}
          strokeWidth={strokeWidth}
          fill="none"
          strokeDasharray={circumference}
          strokeDashoffset={strokeDashoffset}
          strokeLinecap="round"
          rotation="-90"
          origin={`${size / 2}, ${size / 2}`}
        />
      </Svg>
      <View style={styles.center}>
        <Text style={[styles.consumed, { color: textColor }]} numberOfLines={1} adjustsFontSizeToFit>{shown.toLocaleString()}</Text>
        <Text style={[styles.label, { color: subTextColor }]} numberOfLines={1}>{caption ?? `of ${goal.toLocaleString()} cal`}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  center: { alignItems: 'center', paddingHorizontal: 18 },
  consumed: { fontFamily: Fonts.rounded, fontSize: 30, fontWeight: '800', lineHeight: 34, letterSpacing: -1, fontVariant: ['tabular-nums'] },
  label: { fontSize: 12, marginTop: 1, fontVariant: ['tabular-nums'] },
});
