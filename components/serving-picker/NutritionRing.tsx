import { StyleSheet, Text, View } from 'react-native';
import Svg, { Circle } from 'react-native-svg';
import { MacroColors } from '@/constants/theme';
import type { Colors } from '@/constants/theme';

export function NutritionRing({
  cal, protein, carbs, fat, colors,
}: {
  cal: number;
  protein: number;
  carbs: number;
  fat: number;
  colors: Pick<typeof Colors.light, 'icon' | 'separator' | 'text'>;
}) {
  const size = 80;
  const sw = 8;
  const r = (size - sw) / 2;
  const circ = 2 * Math.PI * r;

  const protCal = protein * 4;
  const carbCal = carbs * 4;
  const fatCal = fat * 9;
  const total = Math.max(protCal + carbCal + fatCal, 1);

  const protFrac = protCal / total;
  const carbFrac = carbCal / total;
  const fatFrac = fatCal / total;

  const carbOff = protFrac * circ;
  const fatOff = (protFrac + carbFrac) * circ;

  const cx = size / 2;
  const cy = size / 2;

  const seg = (frac: number, offset: number, color: string) =>
    frac > 0 ? (
      <Circle
        cx={cx} cy={cy} r={r}
        stroke={color} strokeWidth={sw} fill="none"
        strokeDasharray={[frac * circ, circ - frac * circ]}
        strokeDashoffset={-offset}
        strokeLinecap="round"
        rotation="-90"
        origin={`${cx}, ${cy}`}
      />
    ) : null;

  return (
    <View
      style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}
      accessible
      accessibilityLabel={`${cal} calories`}
    >
      <Svg width={size} height={size} style={StyleSheet.absoluteFill}>
        <Circle cx={cx} cy={cy} r={r} stroke={colors.separator} strokeWidth={sw} fill="none" />
        {seg(fatFrac, fatOff, MacroColors.fat)}
        {seg(carbFrac, carbOff, MacroColors.carbs)}
        {seg(protFrac, 0, MacroColors.protein)}
      </Svg>
      <Text style={{ fontSize: 20, fontWeight: '700', color: colors.text, fontVariant: ['tabular-nums'] }}>
        {cal}
      </Text>
      <Text style={{ fontSize: 10, color: colors.icon }}>cal</Text>
    </View>
  );
}
