import { Modal, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { format, parseISO } from 'date-fns';
import { CalorieRing } from '@/components/calorie-ring';
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
type Palette = { text: string; secondary: string; track: string; tile: string };

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

function MacroTile({ label, color, grams, target, palette }: {
  label: string; color: string; grams: number; target: number | null | undefined; palette: Palette;
}) {
  const percent = targetPercentage(grams, target);
  const hasTarget = target != null && target > 0;
  const targetText = target == null ? null : target === 0 ? 'Target: 0 g' : `of ${amount(target)} g`;
  const spoken = `${label}, ${amount(grams, 1)} grams${hasTarget ? ` of ${amount(target!)} grams` : ''}${percent != null ? `, ${amount(percent, 0)}% of target` : ''}`;
  return (
    <View accessible accessibilityLabel={spoken} style={[styles.tile, { backgroundColor: palette.tile }]}>
      <View style={styles.tileLabel}>
        <View style={[styles.swatch, { backgroundColor: color }]} />
        <Text style={[styles.label, { color: palette.secondary }]}>{label}</Text>
      </View>
      <Text style={[styles.title, styles.number, { color: palette.text }]}>{`${amount(grams, 1)} g`}</Text>
      {targetText && <Text style={[styles.caption, { color: palette.secondary }]}>{targetText}</Text>}
      {hasTarget && (
        <View style={[styles.tileTrack, { backgroundColor: palette.track }]}>
          <View style={[styles.tileFill, { backgroundColor: color, width: `${Math.min(grams / target!, 1) * 100}%` }]} />
        </View>
      )}
      {percent != null && <Text style={[styles.caption, { color: palette.secondary }]}>{`${amount(percent, 0)}% of target`}</Text>}
    </View>
  );
}

function EnergyBar({ shares, palette }: { shares: Record<MacroId, number> | null; palette: Palette }) {
  if (!shares) {
    return (
      <View style={styles.energy}>
        <View style={[styles.bar, { backgroundColor: palette.track }]} />
        <Text style={[styles.caption, { color: palette.secondary }]}>No macro split yet</Text>
      </View>
    );
  }
  return (
    <View style={styles.energy}>
      <View style={[styles.bar, { backgroundColor: palette.track }]}>
        {MACROS.filter(({ id }) => shares[id] > 0).map(({ id }) => (
          <View key={id} style={{ flex: shares[id], backgroundColor: MacroColors[id] }} />
        ))}
      </View>
      <View style={styles.legend}>
        {MACROS.map(({ id, label }) => (
          <View key={id} style={styles.legendItem}>
            <View style={[styles.swatch, { backgroundColor: MacroColors[id] }]} />
            <Text style={[styles.caption, { color: palette.secondary }]}>{label}</Text>
            <Text style={[styles.caption, { color: palette.text }]}>{`${amount(shares[id], 0)}%`}</Text>
          </View>
        ))}
      </View>
    </View>
  );
}

export function MealNutritionSummary({ meal, logs, date, today, eaten, onClose, onDismiss }: Props) {
  const background = useThemeColor({}, 'background');
  const surface = useThemeColor({}, 'cardBackground');
  const tile = useThemeColor({}, 'cardSecondary');
  const text = useThemeColor({}, 'text');
  const secondary = useThemeColor({}, 'icon');
  const tint = useThemeColor({}, 'tint');
  const track = useThemeColor({}, 'track');
  const separator = useThemeColor({}, 'separator');
  const insets = useSafeAreaInsets();
  const palette: Palette = { text, secondary, track, tile };
  const totals = mealNutritionTotals(logs, meal.id);
  const nutrients = slotNutrientTotals(logs, meal.id);
  const split = macroEnergyShares(totals);
  const targets = meal.def;
  const calorieTarget = targets?.calorie_target;
  const hasRing = calorieTarget != null && calorieTarget > 0;
  const delta = calorieDelta(totals.calories, calorieTarget);
  const caloriePercent = targetPercentage(totals.calories, calorieTarget);
  const hasNutrients = NUTRIENTS.some((n) => nutrients[n.id].knownCount > 0);
  const planned = !eaten;

  return (
    <Modal visible animationType="slide" onRequestClose={onClose} onDismiss={onDismiss}>
      <View accessibilityViewIsModal onAccessibilityEscape={onClose}
        style={[styles.root, { backgroundColor: background, paddingTop: insets.top, paddingBottom: insets.bottom }]}>
        <View style={styles.header}>
          <TouchableOpacity accessibilityRole="button" accessibilityLabel="Close nutrition summary" onPress={onClose} style={styles.close}>
            <Text style={[styles.body, { color: tint }]}>Close</Text>
          </TouchableOpacity>
        </View>
        <ScrollView contentContainerStyle={styles.content}>
          <View style={styles.titleBlock}>
            <Text style={[styles.eyebrow, { color: secondary }]}>{`Nutrition · ${format(parseISO(date), 'EEEE, MMM d, yyyy')}`}</Text>
            <Text accessibilityRole="header" style={[styles.headline, { color: text }]}>{meal.name}</Text>
            <View style={[styles.tag, { backgroundColor: surface }]}>
              <Text style={[styles.label, { color: secondary }]}>{planned ? 'Planned' : 'Eaten'}</Text>
            </View>
            {planned && logs.length > 0 && <Text style={[styles.caption, { color: secondary }]}>Not included in consumed totals</Text>}
          </View>

          <View style={[styles.card, { backgroundColor: surface }]}>
            <View style={styles.energyHeader}>
              {hasRing ? (
                <>
                  <View testID="calorie-ring">
                    <CalorieRing consumed={totals.calories} goal={calorieTarget} size={136}
                      ringColor={tint} trackColor={track} textColor={text} subTextColor={secondary} />
                  </View>
                  <View style={styles.energyText}>
                    {caloriePercent != null && <Text style={[styles.title, styles.number, { color: text }]}>{`${amount(caloriePercent, 0)}% of target`}</Text>}
                    {delta && <Text style={[styles.caption, { color: secondary }]}>{`${amount(delta.value, 0)} cal ${delta.kind}`}</Text>}
                  </View>
                </>
              ) : (
                <View style={styles.energyText}>
                  <Text style={[styles.display, styles.number, { color: text }]}>{amount(totals.calories, 0)}</Text>
                  <Text style={[styles.caption, { color: secondary }]}>{calorieTarget === 0 ? '/ 0 cal' : 'cal'}</Text>
                </View>
              )}
            </View>
            <EnergyBar shares={split} palette={palette} />
          </View>

          <View style={[styles.card, { backgroundColor: surface }]}>
            <View style={styles.tiles}>
              {MACROS.map(({ id, label, targetKey }) => (
                <MacroTile key={id} label={label} color={MacroColors[id]} grams={totals[id]} target={targets?.[targetKey]} palette={palette} />
              ))}
            </View>
          </View>

          <View style={[styles.card, { backgroundColor: surface }]}>
            <Text accessibilityRole="header" style={[styles.title, { color: text }]}>Nutrients</Text>
            {!hasNutrients ? (
              <Text style={[styles.caption, { color: secondary }]}>No nutrient data available for this meal.</Text>
            ) : GROUPS.map(({ id, title }) => {
              const coverage = nutrientGroupCoverage(nutrients, id);
              return (
                <View key={id} style={styles.group}>
                  <View style={styles.groupHeader}>
                    <Text accessibilityRole="header" style={[styles.title, { color: text }]}>{title}</Text>
                    <Text style={[styles.caption, { color: secondary }]}>{`${coverage.known} of ${coverage.total} known`}</Text>
                  </View>
                  {NUTRIENTS.filter((n) => n.group === id).map((n) => {
                    const value = nutrients[n.id];
                    const known = value.knownCount > 0 && value.total != null;
                    const partial = known && value.missingCount > 0;
                    return (
                      <View key={n.id} style={[styles.nutrient, { borderTopColor: separator }]}>
                        <View style={styles.row}>
                          <Text style={[styles.body, styles.grow, { color: text }]}>{n.label}</Text>
                          {known ? (
                            <View style={styles.valueRow}>
                              <Text style={[styles.body, styles.value, styles.number, { color: text }]}>{`${amount(value.total!, 2)} ${n.unit === 'ug' ? 'µg' : n.unit}`}</Text>
                              {partial && (
                                <View style={[styles.tag, { backgroundColor: tile }]}>
                                  <Text style={[styles.label, { color: secondary }]}>Partial</Text>
                                </View>
                              )}
                            </View>
                          ) : (
                            <Text style={[styles.body, { color: secondary }]}>Not available</Text>
                          )}
                        </View>
                        {partial && <Text style={[styles.caption, { color: secondary }]}>{`Data for ${value.knownCount} of ${value.knownCount + value.missingCount} items`}</Text>}
                      </View>
                    );
                  })}
                </View>
              );
            })}
          </View>

          <View style={styles.footer}>
            <Text style={[styles.caption, { color: secondary }]}>Calculated from grams: protein and carbs 4 cal/g, fat 9 cal/g.</Text>
            {date < today && hasAnyTarget(targets) && <Text style={[styles.caption, { color: secondary }]}>Targets use current meal settings.</Text>}
          </View>
        </ScrollView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  header: { flexDirection: 'row', justifyContent: 'flex-end', paddingHorizontal: 20, paddingVertical: 8 },
  close: { minWidth: 44, minHeight: 44, justifyContent: 'center', alignItems: 'center' },
  content: { paddingHorizontal: 20, paddingBottom: 24, gap: 16 },
  titleBlock: { gap: 6, alignItems: 'flex-start' },
  eyebrow: { fontSize: 12, fontWeight: '600', letterSpacing: 0.5, textTransform: 'uppercase' },
  headline: { fontSize: 22, fontWeight: '700' },
  tag: { borderRadius: 4, paddingHorizontal: 6, paddingVertical: 2 },
  card: { padding: 20, borderRadius: 18, gap: 16 },
  energyHeader: { flexDirection: 'row', alignItems: 'center', gap: 20, flexWrap: 'wrap' },
  energyText: { flex: 1, minWidth: 96, gap: 2 },
  display: { fontSize: 34, fontWeight: '700' },
  energy: { gap: 8 },
  bar: { height: 10, borderRadius: 4, overflow: 'hidden', flexDirection: 'row' },
  legend: { flexDirection: 'row', flexWrap: 'wrap', columnGap: 16, rowGap: 4 },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  swatch: { width: 8, height: 8, borderRadius: 2 },
  tiles: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  tile: { flexGrow: 1, flexBasis: 96, borderRadius: 12, padding: 12, gap: 4 },
  tileLabel: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  tileTrack: { height: 4, borderRadius: 2, overflow: 'hidden', marginTop: 2 },
  tileFill: { height: 4, borderRadius: 2 },
  group: { gap: 8 },
  groupHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', gap: 8, marginTop: 8 },
  nutrient: { borderTopWidth: StyleSheet.hairlineWidth, paddingTop: 8, gap: 4 },
  row: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  valueRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  value: { fontWeight: '600' },
  grow: { flexShrink: 1 },
  footer: { gap: 4 },
  title: { fontSize: 17, fontWeight: '700' },
  label: { fontSize: 13, fontWeight: '500' },
  caption: { fontSize: 12, lineHeight: 17, fontVariant: ['tabular-nums'] },
  body: { fontSize: 15, lineHeight: 23 },
  number: { fontVariant: ['tabular-nums'] },
});
