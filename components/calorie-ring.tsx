import { View, Text, StyleSheet } from 'react-native';
import Svg, { Circle } from 'react-native-svg';

type Props = {
  consumed: number;
  goal: number;
  size?: number;
  ringColor: string;
  trackColor: string;
  textColor: string;
  subTextColor: string;
};

export function CalorieRing({
  consumed,
  goal,
  size = 164,
  ringColor,
  trackColor,
  textColor,
  subTextColor,
}: Props) {
  const strokeWidth = 14;
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const progress = Math.min(consumed / Math.max(goal, 1), 1);
  const strokeDashoffset = circumference * (1 - progress);

  return (
    <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
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
        <Text style={[styles.consumed, { color: textColor }]}>{Math.round(consumed)}</Text>
        <Text style={[styles.label, { color: subTextColor }]}>of {goal}</Text>
        <Text style={[styles.unit, { color: subTextColor }]}>kcal</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  center: { alignItems: 'center' },
  consumed: { fontSize: 34, fontWeight: '700', lineHeight: 38 },
  label: { fontSize: 13, marginTop: 2 },
  unit: { fontSize: 12 },
});
