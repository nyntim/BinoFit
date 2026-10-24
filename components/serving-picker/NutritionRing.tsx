import { StyleSheet, View } from 'react-native';
import Svg, { Circle } from 'react-native-svg';
import { ThemedText } from '@/components/themed-text';
import { MacroColors } from '@/constants/theme';
import { useThemeColor } from '@/hooks/use-theme-color';
import { macroEnergyShares } from '@/lib/meal-nutrition-summary';

const SIZE = 96;
const STROKE = 10;

/** Calories with the protein / carbs / fat energy split drawn around them. */
export function NutritionRing({ cal, protein, carbs, fat }: { cal: number; protein: number; carbs: number; fat: number }) {
  const track = useThemeColor({}, 'track');
  const r = (SIZE - STROKE) / 2;
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
  const c = SIZE / 2;

  const seg = (frac: number, offset: number, color: string) =>
    frac > 0 ? (
      <Circle
        cx={c} cy={c} r={r}
        stroke={color} strokeWidth={STROKE} fill="none"
        strokeDasharray={[frac * circ, circ - frac * circ]}
        strokeDashoffset={-offset}
        strokeLinecap="round"
        rotation="-90"
        origin={`${c}, ${c}`}
      />
    ) : null;

  const shares = macroEnergyShares({ protein, carbs, fat });
  const label = shares
    ? `${cal} calories: protein ${Math.round(shares.protein)} percent, carbs ${Math.round(shares.carbs)} percent, fat ${Math.round(shares.fat)} percent`
    : `${cal} calories`;

  return (
    <View style={styles.ring} accessible accessibilityRole="image" accessibilityLabel={label}>
      <Svg width={SIZE} height={SIZE} style={StyleSheet.absoluteFill}>
        <Circle cx={c} cy={c} r={r} stroke={track} strokeWidth={STROKE} fill="none" />
        {seg(fatFrac, fatOff, MacroColors.fat)}
        {seg(carbFrac, carbOff, MacroColors.carbs)}
        {seg(protFrac, 0, MacroColors.protein)}
      </Svg>
      <ThemedText type="stat" style={styles.cal}>{cal}</ThemedText>
      <ThemedText type="caption">cal</ThemedText>
    </View>
  );
}

const styles = StyleSheet.create({
  ring: { width: SIZE, height: SIZE, alignItems: 'center', justifyContent: 'center' },
  cal: { fontSize: 22, lineHeight: 24 },
});
