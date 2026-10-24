import { Modal, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { format, parseISO } from 'date-fns';
import { CalorieRing } from '@/components/calorie-ring';
import { ThemedText } from '@/components/themed-text';
import { Card } from '@/components/ui/Card';
import { ProgressBar } from '@/components/ui/ProgressBar';
import { SheetHeader } from '@/components/ui/SheetHeader';
import { Tag } from '@/components/ui/Tag';
import { MacroColors } from '@/constants/theme';
import { useThemeColor } from '@/hooks/use-theme-color';
import { hasAnyTarget, type DayMeal } from '@/lib/meals';
import {
  calorieDelta,
  formatNutritionAmount as amount,
  macroEnergyShares,
  mealNutritionTotals,
  nutrientGroupCoverage,
  targetPercentage,
} from '@/lib/meal-nutrition-summary';
import { NUTRIENTS } from '@/lib/nutrients';
import { slotNutrientTotals } from '@/lib/nutrition-totals';
import type { FoodLogWithFood } from '@/lib/types';

type Props = {
  meal: DayMeal;
  logs: FoodLogWithFood[];
  date: string;
  today: string;
  eaten: boolean;
  onClose: () => void;
  onDismiss?: () => void;
};

type MacroId = 'protein' | 'carbs' | 'fat';

const MACROS: { id: MacroId; label: string; targetKey: 'protein_target' | 'carb_target' | 'fat_target' }[] = [
  { id: 'protein', label: 'Protein', targetKey: 'protein_target' },
  { id: 'carbs', label: 'Carbs', targetKey: 'carb_target' },
  { id: 'fat', label: 'Fat', targetKey: 'fat_target' },
];
const GROUPS = [
  { id: 'extended_macros', title: 'Other nutrients' },
  { id: 'minerals', title: 'Minerals' },
  { id: 'vitamins', title: 'Vitamins' },
] as const;

function MacroTile({ label, color, grams, target }: {
  label: string; color: string; grams: number; target: number | null | undefined;
}) {
  const percent = targetPercentage(grams, target);
  const hasTarget = target != null && target > 0;
  const targetText = target == null ? null : target === 0 ? 'Target: 0 g' : `of ${amount(target)} g`;
  const spoken = `${label}, ${amount(grams, 1)} grams${hasTarget ? ` of ${amount(target!)} grams` : ''}${percent != null ? `, ${amount(percent, 0)}% of target` : ''}`;
  return (
    <Card padding="compact" accessible accessibilityLabel={spoken} style={styles.tile}>
      <View style={styles.tileLabel}>
        <View style={[styles.swatch, { backgroundColor: color }]} />
        <ThemedText type="caption">{label}</ThemedText>
      </View>
      <ThemedText type="stat" style={styles.tileValue}>{`${amount(grams, 1)} g`}</ThemedText>
      {hasTarget && <ProgressBar value={grams} max={target!} color={color} height={6} />}
      {targetText && <ThemedText type="caption">{targetText}</ThemedText>}
    </Card>
  );
}

function EnergyBar({ shares }: { shares: Record<MacroId, number> | null }) {
  const track = useThemeColor({}, 'track');
  if (!shares) {
    return (
      <View style={styles.energy}>
        <View style={[styles.bar, { backgroundColor: track }]} />
        <ThemedText type="caption">No macro split yet</ThemedText>
      </View>
    );
  }
  const spoken = `Energy from protein ${amount(shares.protein, 0)} percent, carbs ${amount(shares.carbs, 0)} percent, fat ${amount(shares.fat, 0)} percent`;
  return (
    <View style={styles.energy}>
      <View style={styles.bar} accessible accessibilityRole="image" accessibilityLabel={spoken}>
        {MACROS.filter(({ id }) => shares[id] > 0).map(({ id }) => (
          <View key={id} style={[styles.segment, { flex: shares[id], backgroundColor: MacroColors[id] }]} />
        ))}
      </View>
      <View style={styles.legend} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
        {MACROS.map(({ id, label }) => (
          <View key={id} style={styles.legendItem}>
            <View style={[styles.swatch, { backgroundColor: MacroColors[id] }]} />
            <ThemedText type="caption">{`${label} ${amount(shares[id], 0)}%`}</ThemedText>
          </View>
        ))}
      </View>
    </View>
  );
}

export function MealNutritionSummary({ meal, logs, date, today, eaten, onClose, onDismiss }: Props) {
  const background = useThemeColor({}, 'background');
  const text = useThemeColor({}, 'text');
  const secondary = useThemeColor({}, 'icon');
  const tint = useThemeColor({}, 'tint');
  const track = useThemeColor({}, 'track');
  const separator = useThemeColor({}, 'separator');
  const insets = useSafeAreaInsets();
  const totals = mealNutritionTotals(logs, meal.id);
  const nutrients = slotNutrientTotals(logs, meal.id);
  const split = macroEnergyShares(totals);
  const targets = meal.def;
  const calorieTarget = targets?.calorie_target;
  const hasRing = calorieTarget != null && calorieTarget > 0;
  const delta = calorieDelta(totals.calories, calorieTarget);
  const hasNutrients = NUTRIENTS.some((n) => nutrients[n.id].knownCount > 0);
  const planned = !eaten;
  const foodCount = `${logs.length} ${logs.length === 1 ? 'food' : 'foods'}`;

  return (
    <Modal visible animationType="slide" onRequestClose={onClose} onDismiss={onDismiss}>
      <View accessibilityViewIsModal onAccessibilityEscape={onClose}
        style={[styles.root, { backgroundColor: background, paddingTop: insets.top, paddingBottom: insets.bottom }]}>
        <SheetHeader title="Nutrition" action={{ label: 'Done', onPress: onClose, accessibilityLabel: 'Close nutrition summary' }} />
        <ScrollView contentContainerStyle={styles.content}>
          <View style={styles.titleBlock}>
            <View style={styles.titleRow}>
              <ThemedText type="heading" accessibilityRole="header" style={styles.headline}>{meal.name}</ThemedText>
              <Tag label={planned ? 'Planned' : 'Eaten'} tone={planned ? 'neutral' : 'tint'} />
            </View>
            <ThemedText type="label" style={{ color: secondary }}>{`${format(parseISO(date), 'EEE d MMM')} · ${foodCount}`}</ThemedText>
            {planned && logs.length > 0 && <ThemedText type="caption">Not included in consumed totals</ThemedText>}
          </View>

          <Card style={styles.card}>
            <View style={styles.energyHeader}>
              {hasRing ? (
                <>
                  <View testID="calorie-ring">
                    <CalorieRing consumed={totals.calories} goal={calorieTarget} size={104} strokeWidth={11} caption="cal"
                      accessibilityLabel={`${amount(totals.calories, 0)} of ${amount(calorieTarget, 0)} calories for this meal`}
                      ringColor={tint} trackColor={track} textColor={text} subTextColor={secondary} />
                  </View>
                  <View style={styles.energyText}>
                    <ThemedText type="caption">Meal target</ThemedText>
                    <ThemedText type="stat">{`${amount(calorieTarget, 0)} cal`}</ThemedText>
                    {delta && <ThemedText type="label" style={{ color: secondary }}>{delta.kind === 'over' ? `Over by ${amount(delta.value, 0)}` : `${amount(delta.value, 0)} left`}</ThemedText>}
                  </View>
                </>
              ) : (
                <View style={styles.energyText}>
                  <ThemedText type="hero">{amount(totals.calories, 0)}</ThemedText>
                  <ThemedText type="caption">{calorieTarget === 0 ? '/ 0 cal' : 'cal'}</ThemedText>
                </View>
              )}
            </View>
            <EnergyBar shares={split} />
          </Card>

          <View style={styles.tiles}>
            {MACROS.map(({ id, label, targetKey }) => (
              <MacroTile key={id} label={label} color={MacroColors[id]} grams={totals[id]} target={targets?.[targetKey]} />
            ))}
          </View>

          <Card padding="none">
            <View style={styles.nutrientsHeader}>
              <ThemedText type="title" accessibilityRole="header">Nutrients</ThemedText>
              <ThemedText type="caption">Per this meal</ThemedText>
            </View>
            {!hasNutrients ? (
              <ThemedText type="caption" style={styles.empty}>No nutrient data available for this meal.</ThemedText>
            ) : GROUPS.map(({ id, title }) => {
              const coverage = nutrientGroupCoverage(nutrients, id);
              return (
                <View key={id}>
                  <View style={[styles.groupHeader, { borderTopColor: separator }]}>
                    <ThemedText type="label" accessibilityRole="header" style={styles.groupTitle}>{title}</ThemedText>
                    {coverage.known === coverage.total
                      ? <Tag label="Complete" tone="tint" />
                      : coverage.known === 0
                        ? <Tag label="Unknown" />
                        : <Tag label={`${coverage.known} of ${coverage.total} known`} />}
                  </View>
                  {NUTRIENTS.filter((n) => n.group === id).map((n) => {
                    const value = nutrients[n.id];
                    const known = value.knownCount > 0 && value.total != null;
                    const partial = known && value.missingCount > 0;
                    return (
                      <View key={n.id} style={[styles.nutrient, { borderTopColor: separator }]}>
                        <View style={styles.row}>
                          <ThemedText type="body" style={[styles.grow, { color: secondary }]}>{n.label}</ThemedText>
                          {known ? (
                            <View style={styles.valueRow}>
                              <ThemedText type="body" style={styles.value}>{`${amount(value.total!, 2)} ${n.unit === 'ug' ? 'µg' : n.unit}`}</ThemedText>
                              {partial && <Tag label="Partial" />}
                            </View>
                          ) : (
                            <ThemedText type="body" style={{ color: secondary }}>Unknown</ThemedText>
                          )}
                        </View>
                        {partial && <ThemedText type="caption">{`Data for ${value.knownCount} of ${value.knownCount + value.missingCount} items`}</ThemedText>}
                      </View>
                    );
                  })}
                </View>
              );
            })}
          </Card>

          <View style={styles.footer}>
            <ThemedText type="caption">Calculated from grams: protein and carbs 4 cal/g, fat 9 cal/g.</ThemedText>
            {date < today && hasAnyTarget(targets) && <ThemedText type="caption">Targets use current meal settings.</ThemedText>}
          </View>
        </ScrollView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  content: { paddingHorizontal: 16, paddingBottom: 24, gap: 14 },
  titleBlock: { gap: 6 },
  titleRow: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 10 },
  headline: { flexShrink: 1 },
  card: { gap: 16 },
  energyHeader: { flexDirection: 'row', alignItems: 'center', gap: 20, flexWrap: 'wrap' },
  energyText: { flex: 1, minWidth: 96, gap: 2 },
  energy: { gap: 8 },
  bar: { height: 10, flexDirection: 'row', gap: 3 },
  segment: { borderRadius: 4 },
  legend: { flexDirection: 'row', flexWrap: 'wrap', columnGap: 16, rowGap: 4 },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  swatch: { width: 8, height: 8, borderRadius: 4 },
  tiles: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  tile: { flexGrow: 1, flexBasis: 96, gap: 6 },
  tileLabel: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  tileValue: { fontSize: 22 },
  nutrientsHeader: { paddingHorizontal: 20, paddingTop: 18, paddingBottom: 10, gap: 2 },
  empty: { paddingHorizontal: 20, paddingBottom: 18 },
  groupHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 8, paddingHorizontal: 20, paddingVertical: 10, borderTopWidth: StyleSheet.hairlineWidth },
  groupTitle: { fontWeight: '600', flexShrink: 1 },
  nutrient: { borderTopWidth: StyleSheet.hairlineWidth, paddingHorizontal: 20, paddingVertical: 10, gap: 4 },
  row: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  valueRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  value: { fontWeight: '600', fontVariant: ['tabular-nums'] },
  grow: { flexShrink: 1 },
  footer: { gap: 4 },
});
