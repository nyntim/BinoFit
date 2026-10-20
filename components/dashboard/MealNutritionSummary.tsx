import { ControlSurface } from '@/components/navigation/ControlSurface';
import { Modal, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { format, parseISO } from 'date-fns';
import { MacroBar } from '@/components/macro-bar';
import { MacroColors } from '@/constants/theme';
import { useThemeColor } from '@/hooks/use-theme-color';
import { hasAnyTarget, type DayMeal } from '@/lib/meals';
import { formatNutritionAmount as amount, macroEnergyShares, mealNutritionTotals, targetPercentage } from '@/lib/meal-nutrition-summary';
import { NUTRIENTS } from '@/lib/nutrients';
import { logTotals, slotNutrientTotals } from '@/lib/nutrition-totals';
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

export function MealNutritionSummary({ meal, logs, date, today, eaten, onClose, onDismiss }: Props) {
  const background = useThemeColor({}, 'background');
  const surface = useThemeColor({}, 'cardBackground');
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
  const percentage = (value: number, target: number | null | undefined) => {
    const result = targetPercentage(value, target);
    return result == null ? null : `${amount(result, 0)}% of target`;
  };
  const caption = (value: string) => <Text style={[styles.caption, { color: secondary }]}>{value}</Text>;
  const heading = (value: string) => <Text accessibilityRole="header" style={[styles.heading, { color: text }]}>{value}</Text>;
  const macroRows = [
    { id: 'protein', label: 'Protein', target: targets?.protein_target },
    { id: 'carbs', label: 'Carbs', target: targets?.carb_target },
    { id: 'fat', label: 'Fat', target: targets?.fat_target },
  ] as const;

  return (
    <Modal visible animationType="slide" onRequestClose={onClose} onDismiss={onDismiss}>
      <View accessibilityViewIsModal onAccessibilityEscape={onClose}
        style={[styles.root, { backgroundColor: background, paddingTop: insets.top, paddingBottom: insets.bottom }]}>
        <ControlSurface style={styles.header}>
          <Text accessibilityRole="header" style={[styles.heading, { color: text, flex: 1 }]}>Nutrition</Text>
          <TouchableOpacity accessibilityRole="button" accessibilityLabel="Close nutrition summary" onPress={onClose} style={styles.close}>
            <Text style={[styles.body, { color: tint }]}>Close</Text>
          </TouchableOpacity>
        </ControlSurface>
        <View style={styles.header}>
          <View style={styles.title}>
            {caption(format(parseISO(date), 'EEEE, MMM d, yyyy'))}
            {heading(meal.name)}
            {caption(!eaten && logs.length > 0 ? 'Planned · Not included in consumed totals' : eaten ? 'Eaten' : 'Planned')}
          </View>

        </View>
        <ScrollView contentContainerStyle={styles.content}>
          <View style={[styles.section, { backgroundColor: surface }]}>
            {heading('Calories and macros')}
            <Text style={[styles.calories, { color: text }]}>{amount(totals.calories, 0)}{targets?.calorie_target != null ? ` / ${targets.calorie_target}` : ''} cal</Text>
            {percentage(totals.calories, targets?.calorie_target) && caption(percentage(totals.calories, targets?.calorie_target)!)}
            {macroRows.map(({ id, label, target }) => (
              <View key={id} style={styles.macro}>
                <MacroBar label={label} consumed={totals[id]} goal={target != null && target > 0 ? target : undefined}
                  decimalPlaces={1} color={MacroColors[id]} textColor={text} subTextColor={secondary} trackColor={track} />
                {target === 0 && caption('Target: 0 g')}
                {percentage(totals[id], target) && caption(percentage(totals[id], target)!)}
              </View>
            ))}
            {date < today && hasAnyTarget(targets) && caption('Targets use current meal settings.')}
          </View>
          <View style={[styles.section, { backgroundColor: surface }]}>
            {heading('Share of macro energy')}
            {split ? macroRows.map(({ id, label }) => (
              <Text key={id} style={[styles.body, styles.number, { color: text }]}>{label}: {amount(split[id])}%</Text>
            )) : caption('No macro split yet')}
            {caption('Calculated from grams: protein and carbs 4 cal/g, fat 9 cal/g.')}
          </View>
          <View style={[styles.section, { backgroundColor: surface }]}>
            {heading('Nutrients')}
            {!NUTRIENTS.some(n => nutrients[n.id].knownCount > 0) ? caption('No nutrient data available for this meal.') : (
              (['extended_macros', 'minerals', 'vitamins'] as const).map(group => (
                <View key={group} style={styles.group}>
                  {heading({ extended_macros: 'Other nutrients', minerals: 'Minerals', vitamins: 'Vitamins' }[group])}
                  {NUTRIENTS.filter(n => n.group === group).map(n => {
                    const value = nutrients[n.id];
                    const known = value.knownCount > 0 && value.total != null;
                    return <View key={n.id} style={[styles.nutrient, { borderTopColor: separator }]}>
                      <View style={styles.row}>
                        <Text style={[styles.body, styles.title, { color: text }]}>{n.label}</Text>
                        <Text style={[styles.body, styles.number, { color: text }]}>{known ? `${amount(value.total!, 2)} ${n.unit === 'ug' ? 'µg' : n.unit}${value.missingCount > 0 ? ' · Partial' : ''}` : 'Not available'}</Text>
                      </View>
                      {known && value.missingCount > 0 && caption(`Data for ${value.knownCount} of ${value.knownCount + value.missingCount} items`)}
                    </View>;
                  })}
                </View>
              ))
            )}
          </View>
          <View style={[styles.section, { backgroundColor: surface }]}>
            {heading('Food contributions')}
            {logs.length === 0 ? caption('No food logged for this meal') : logs.map(log => {
              const values = logTotals(log);
              return <View key={log.id} style={[styles.nutrient, { borderTopColor: separator }]}>
                <Text style={[styles.body, { color: text }]}>{log.food_name}</Text>
                {log.food_brand && caption(log.food_brand)}
                {caption(`${log.serving_amount} × ${log.food_serving_units}`)}
                <Text style={[styles.body, styles.number, { color: text }]}>{amount(values.calories, 0)} cal · Protein {amount(values.protein)} g · Carbs {amount(values.carbs)} g · Fat {amount(values.fat)} g</Text>
              </View>;
            })}
          </View>
        </ScrollView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  header: { flexDirection: 'row', alignItems: 'flex-start', paddingHorizontal: 20, paddingVertical: 16, gap: 8 },
  title: { flex: 1 },
  close: { minWidth: 44, minHeight: 44, justifyContent: 'center', alignItems: 'center' },
  content: { paddingHorizontal: 20, paddingBottom: 24, gap: 16 },
  section: { padding: 20, borderRadius: 18, gap: 8 },
  heading: { fontSize: 17, fontWeight: '600' },
  calories: { fontSize: 22, fontWeight: '700', fontVariant: ['tabular-nums'] },
  macro: { marginTop: 8 },
  caption: { fontSize: 12, lineHeight: 17, fontVariant: ['tabular-nums'] },
  body: { fontSize: 15, lineHeight: 23 },
  number: { fontVariant: ['tabular-nums'] },
  group: { marginTop: 16, gap: 8 },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, justifyContent: 'space-between' },
  nutrient: { borderTopWidth: StyleSheet.hairlineWidth, paddingTop: 8, gap: 4 },
});
