import { useState, useEffect, type ReactNode } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  ScrollView,
  Modal,
  Pressable,
} from 'react-native';
import Svg, { Circle, Polyline } from 'react-native-svg';
import * as Haptics from 'expo-haptics';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Colors, MacroColors } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import {
  getFoodById,
  addFoodLog,
  updateFoodLog,
  getFoodLogsWithFoodByDate,
  cacheRemoteFood,
  hasAnyMicros,
} from '@/lib/database';
import { getFullBrandedFood } from '@/lib/food-service';
import { getUSDAFoodById } from '@/lib/foods-db';
import { getUserGoals } from '@/lib/storage';
import { writeNutritionLog } from '@/services/healthKitService';
import type { Food } from '@/lib/types';

// Food ids already refetched for micronutrients this app session
const refetchedFoodIds = new Set<string>();

const SLOT_LABELS:Record<string, string> = {
  breakfast: 'Breakfast',
  lunch: 'Lunch',
  dinner: 'Dinner',
  snack: 'Snacks',
};

type ServingUnit = 'default' | 'grams' | 'oz';

function parseBaseGrams(servingUnits: string): number | null {
  const gramMatch = servingUnits.match(/\(?(\d+(?:\.\d+)?)\s*g(?:rams?)?\)?/i);
  if (gramMatch) return parseFloat(gramMatch[1]);
  const ozMatch = servingUnits.match(/(\d+(?:\.\d+)?)\s*oz/i);
  if (ozMatch) return Math.round(parseFloat(ozMatch[1]) * 28.35 * 10) / 10;
  return null;
}

function formatTime(d: Date): string {
  let h = d.getHours();
  const m = d.getMinutes();
  const ampm = h >= 12 ? 'PM' : 'AM';
  h = h % 12 || 12;
  return `${h}:${String(m).padStart(2, '0')} ${ampm}`;
}

export default function ServingPickerScreen() {
  const { food_id, meal_slot, date, log_id, initial_amount } = useLocalSearchParams<{
    food_id: string;
    meal_slot: string;
    date: string;
    log_id?: string;
    initial_amount?: string;
  }>();
  const router = useRouter();
  const cs = useColorScheme();
  const colors = Colors[cs ?? 'light'];

  const [food, setFood] = useState<Food | null>(null);
  const [servingAmount, setServingAmount] = useState(initial_amount ?? '1');
  const [servingUnit, setServingUnit] = useState<ServingUnit>('default');
  const [per100g, setPer100g] = useState(false);
  const [loggedTime, setLoggedTime] = useState<Date>(new Date());
  const [showTimePicker, setShowTimePicker] = useState(false);
  const [showUnitPicker, setShowUnitPicker] = useState(false);
  const [showNumPad, setShowNumPad] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [dailyCalories, setDailyCalories] = useState(0);
  const [dailyProtein, setDailyProtein] = useState(0);
  const [dailyCarbsState, setDailyCarbsState] = useState(0);
  const [dailyFat, setDailyFat] = useState(0);
  const [calorieGoal, setCalorieGoal] = useState<number | null>(null);
  const [proteinGoal, setProteinGoal] = useState<number | null>(null);
  const [carbGoal, setCarbGoal] = useState<number | null>(null);
  const [fatGoal, setFatGoal] = useState<number | null>(null);
  const [expandedMacro, setExpandedMacro] = useState<null | 'protein' | 'carbs' | 'fat'>(null);
  const [expandNutrients, setExpandNutrients] = useState(true);

  const isEdit = Boolean(log_id);
  const slotLabel = SLOT_LABELS[meal_slot ?? ''] ?? 'Meal';

  useEffect(() => {
    if (!food_id) return;
    let cancelled = false;
    (async () => {
      const found = await getFoodById(food_id);
      if (cancelled) return;
      if (found) setFood(found);

      const needsMicros = !found || (!hasAnyMicros(found) && found.source !== 'custom');
      if (!needsMicros) return;
      // Refetch at most once per food per app session
      if (found && refetchedFoodIds.has(food_id)) return;
      refetchedFoodIds.add(food_id);

      // Foods cached before micronutrients were stored have none; reload the full row
      const isUSDA = !found || found.source?.startsWith('usda');
      const usda = isUSDA ? await getUSDAFoodById(food_id) : null;
      if (usda) await cacheRemoteFood(usda);
      // getFullBrandedFood caches the row itself
      const full = usda ?? (await getFullBrandedFood(food_id));
      if (cancelled) return;
      if (!found) setFood(full);
      else if (full && hasAnyMicros(full)) setFood(full);
    })();
    if (log_id && date) {
      getFoodLogsWithFoodByDate(date).then((logs) => {
        const entry = logs.find((l) => l.id === log_id);
        if (entry) setServingAmount(String(entry.serving_amount));
      });
    }
    return () => {
      cancelled = true;
    };
  }, [food_id, log_id, date]);

  useEffect(() => {
    if (!date) return;
    Promise.all([getFoodLogsWithFoodByDate(date), getUserGoals()]).then(([logs, goals]) => {
      const others = logs.filter((l) => l.id !== log_id);
      setDailyCalories(Math.round(others.reduce((s, l) => s + l.food_calories * l.serving_amount, 0)));
      setDailyProtein(Math.round(others.reduce((s, l) => s + l.food_protein * l.serving_amount, 0) * 10) / 10);
      setDailyCarbsState(Math.round(others.reduce((s, l) => s + l.food_carbs * l.serving_amount, 0) * 10) / 10);
      setDailyFat(Math.round(others.reduce((s, l) => s + l.food_fat * l.serving_amount, 0) * 10) / 10);
      if (goals) {
        setCalorieGoal(goals.calorie_goal);
        setProteinGoal(goals.protein_goal);
        setCarbGoal(goals.carb_goal);
        setFatGoal(goals.fat_goal);
      }
    });
  }, [date, log_id]);

  const baseGrams = food ? parseBaseGrams(food.serving_units) : null;
  const parsedAmount = parseFloat(servingAmount) || 0;

  let multiplier = parsedAmount;
  if (servingUnit === 'grams' && baseGrams) multiplier = parsedAmount / baseGrams;
  else if (servingUnit === 'oz' && baseGrams) multiplier = (parsedAmount * 28.35) / baseGrams;

  const nutriScale = per100g && baseGrams ? 100 / baseGrams : multiplier;

  const cal = food ? Math.round(food.calories * nutriScale) : 0;
  const pro = food ? Math.round(food.protein * nutriScale * 10) / 10 : 0;
  const carb = food ? Math.round(food.carbs * nutriScale * 10) / 10 : 0;
  const fat = food ? Math.round(food.fat * nutriScale * 10) / 10 : 0;
  const scaleMicro = (v: number | null | undefined, decimals = 1) =>
    v == null ? null : Math.round(v * nutriScale * 10 ** decimals) / 10 ** decimals;
  const fiber = scaleMicro(food?.fiber);
  const sugar = scaleMicro(food?.sugar);
  const sodium = scaleMicro(food?.sodium, 0);
  const satFat = scaleMicro(food?.saturated_fat);
  const transFat = scaleMicro(food?.trans_fat);
  const cholesterol = scaleMicro(food?.cholesterol, 0);
  const vitaminD = scaleMicro(food?.vitamin_d);
  const calcium = scaleMicro(food?.calcium, 0);
  const iron = scaleMicro(food?.iron);
  const potassium = scaleMicro(food?.potassium, 0);

  const handleUnitChange = (unit: ServingUnit) => {
    if (unit === servingUnit || !baseGrams) return;
    let amt = parsedAmount;
    if (servingUnit === 'default' && unit === 'grams') amt = parsedAmount * baseGrams;
    else if (servingUnit === 'default' && unit === 'oz') amt = (parsedAmount * baseGrams) / 28.35;
    else if (servingUnit === 'grams' && unit === 'default') amt = parsedAmount / baseGrams;
    else if (servingUnit === 'grams' && unit === 'oz') amt = parsedAmount / 28.35;
    else if (servingUnit === 'oz' && unit === 'default') amt = (parsedAmount * 28.35) / baseGrams;
    else if (servingUnit === 'oz' && unit === 'grams') amt = parsedAmount * 28.35;
    setServingUnit(unit);
    setServingAmount(String(Math.round(amt * 100) / 100));
  };

  const handleSave = async () => {
    if (!food || multiplier <= 0 || !meal_slot || !date) return;
    setSaving(true);
    setSaveError(null);
    try {
      const timeStr = `${String(loggedTime.getHours()).padStart(2, '0')}:${String(loggedTime.getMinutes()).padStart(2, '0')}`;
      const calSave = Math.round(food.calories * multiplier);
      const proSave = Math.round(food.protein * multiplier * 10) / 10;
      const carbSave = Math.round(food.carbs * multiplier * 10) / 10;
      const fatSave = Math.round(food.fat * multiplier * 10) / 10;

      if (isEdit && log_id) {
        await updateFoodLog(log_id, multiplier, food.serving_units, timeStr);
      } else {
        await addFoodLog({
          date,
          meal_slot: meal_slot as 'breakfast' | 'lunch' | 'dinner' | 'snack',
          food_id: food.id,
          serving_amount: multiplier,
          serving_unit: food.serving_units,
          logged_time: timeStr,
        });
      }

      writeNutritionLog(date, calSave, proSave, carbSave, fatSave);
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      router.back();
    } catch {
      setSaveError('Could not save. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  const unitLabel = per100g
    ? 'Per 100g'
    : servingUnit === 'default'
    ? food?.serving_units ?? 'Serving'
    : servingUnit === 'grams'
    ? 'Grams'
    : 'Ounces';

  if (!food) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
        <ActivityIndicator style={{ marginTop: 48 }} color={colors.tint} />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.headerBtn}>
          <Text style={[styles.headerBtnText, { color: colors.tint }]}>
            {isEdit ? 'Cancel' : 'Back'}
          </Text>
        </TouchableOpacity>
        <Text style={[styles.title, { color: colors.text }]}>
          {isEdit ? 'Edit Serving' : slotLabel}
        </Text>
        <View style={styles.headerBtn} />
      </View>

      <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.scroll}>
        {/* Food identity */}
        <View style={[styles.foodCard, { backgroundColor: colors.cardBackground }]}>
          <Text style={[styles.foodName, { color: colors.text }]} numberOfLines={2}>
            {food.name}
          </Text>
          {food.brand ? (
            <Text style={[styles.foodBrand, { color: colors.icon }]}>{food.brand}</Text>
          ) : (
            <Text style={[styles.foodBrand, { color: colors.icon }]}>
              {food.source === 'usda' || food.source?.startsWith('usda') ? 'USDA · Generic' : food.source ?? 'Generic'}
            </Text>
          )}
        </View>

        {/* Form group card */}
        <SectionHeading title="SERVING" colors={colors} />
        <View style={[styles.formCard, { backgroundColor: colors.cardBackground }]}>
          <FormRow
            label="Amount"
            value={servingAmount || '0'}
            accent={colors.tint}
            onPress={() => setShowNumPad(true)}
            divider
            bordered
            colors={colors}
          />
          <FormRow
            label="Serving Size"
            value={unitLabel}
            accent={colors.tint}
            onPress={() => setShowUnitPicker(true)}
            divider
            chevron
            colors={colors}
          />
          <FormRow
            label="Time"
            value={formatTime(loggedTime)}
            accent={colors.tint}
            onPress={() => setShowTimePicker(true)}
            colors={colors}
          />
        </View>

        {/* Ring + Macros */}
        <SectionHeading title="NUTRITION" colors={colors} />
        <View style={[styles.ringMacroCard, { backgroundColor: colors.cardBackground }, expandedMacro && styles.ringMacroCardOpen]}>
          <NutritionRing cal={cal} protein={pro} carbs={carb} fat={fat} colors={colors} />
          <View style={styles.ringMacroRight}>
            {([
              { key: 'carbs' as const, label: 'Carbs', value: carb, color: MacroColors.carbs },
              { key: 'fat' as const, label: 'Fat', value: fat, color: MacroColors.fat },
              { key: 'protein' as const, label: 'Protein', value: pro, color: MacroColors.protein },
            ]).map((m) => {
              const active = expandedMacro === m.key;
              return (
                <TouchableOpacity
                  key={m.label}
                  style={[styles.macroCol, { backgroundColor: active ? m.color + '18' : colors.cardSecondary, borderRadius: 10, padding: 6 }]}
                  onPress={() => setExpandedMacro((prev) => (prev === m.key ? null : m.key))}
                  activeOpacity={0.7}
                >
                  <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: m.color }} />
                  <Text style={[styles.macroGrams, { color: colors.text }]} numberOfLines={1} adjustsFontSizeToFit>{m.value}g</Text>
                  <Text style={[styles.macroColLabel, { color: colors.icon }]}>{m.label}</Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </View>

        {expandedMacro && (
          <MacroDetailPanel
            macro={expandedMacro}
            pro={pro}
            carb={carb}
            fat={fat}
            fiber={fiber}
            sugar={sugar}
            satFat={satFat}
            transFat={transFat}
            proteinGoal={proteinGoal}
            carbGoal={carbGoal}
            fatGoal={fatGoal}
            onClose={() => setExpandedMacro(null)}
            colors={colors}
          />
        )}

        {/* Targets (always open) */}
        {calorieGoal !== null && (
          <>
            <SectionHeading title="TARGETS" colors={colors} />
            <View style={[styles.expandCard, { backgroundColor: colors.cardBackground, padding: 16, gap: 12 }]}>
              <ProgressRow
                label="Energy"
                value={dailyCalories + cal}
                goal={calorieGoal}
                unit="kcal"
                color={colors.tint}
                colors={colors}
              />
              {proteinGoal !== null && (
                <ProgressRow
                  label="Protein"
                  value={Math.round((dailyProtein + pro) * 10) / 10}
                  goal={proteinGoal}
                  unit="g"
                  color={MacroColors.protein}
                  colors={colors}
                />
              )}
              {carbGoal !== null && (
                <ProgressRow
                  label="Carbs"
                  value={Math.round((dailyCarbsState + carb) * 10) / 10}
                  goal={carbGoal}
                  unit="g"
                  color={MacroColors.carbs}
                  colors={colors}
                />
              )}
              {fatGoal !== null && (
                <ProgressRow
                  label="Fat"
                  value={Math.round((dailyFat + fat) * 10) / 10}
                  goal={fatGoal}
                  unit="g"
                  color={MacroColors.fat}
                  colors={colors}
                />
              )}
            </View>
          </>
        )}

        {/* Complete Nutrient Summary */}
        <ExpandSection
          title="Complete Nutrient Summary"
          expanded={expandNutrients}
          onToggle={() => setExpandNutrients((v) => !v)}
          colors={colors}
        >
          <MicroExpandRow label="Fiber" value={fiber} unit="g" colors={colors} />
          <MicroExpandRow label="Sugar" value={sugar} unit="g" colors={colors} />
          <MicroExpandRow label="Saturated Fat" value={satFat} unit="g" colors={colors} />
          <MicroExpandRow label="Trans Fat" value={transFat} unit="g" colors={colors} />
          <MicroExpandRow label="Cholesterol" value={cholesterol} unit="mg" colors={colors} />
          <MicroExpandRow label="Sodium" value={sodium} unit="mg" colors={colors} />
          <MicroExpandRow label="Potassium" value={potassium} unit="mg" colors={colors} />
          <MicroExpandRow label="Calcium" value={calcium} unit="mg" colors={colors} />
          <MicroExpandRow label="Iron" value={iron} unit="mg" colors={colors} />
          <MicroExpandRow label="Vitamin D" value={vitaminD} unit="µg" colors={colors} />
        </ExpandSection>

        {/* Save removed from scroll — now pinned below */}
        {saveError ? (
          <Text style={[styles.saveErrorText, { color: colors.danger }]}>{saveError}</Text>
        ) : null}
      </ScrollView>

      {/* Save — pinned to bottom */}
      <View style={[styles.saveFooter, { backgroundColor: colors.background }]}>
        <TouchableOpacity
          style={[styles.saveBtn, { backgroundColor: colors.tint, opacity: multiplier > 0 ? 1 : 0.4 }]}
          onPress={handleSave}
          disabled={multiplier <= 0 || saving}
          activeOpacity={0.8}
        >
          {saving ? (
            <ActivityIndicator color={colors.background} />
          ) : (
            <Text style={[styles.saveBtnText, { color: colors.background }]}>
              {isEdit ? 'Save Changes' : `Add to ${slotLabel}`}
            </Text>
          )}
        </TouchableOpacity>
      </View>

      <UnitPickerModal
        visible={showUnitPicker}
        servingUnit={servingUnit}
        per100g={per100g}
        baseGrams={baseGrams}
        foodServingUnits={food.serving_units}
        onSelectUnit={(unit) => {
          setPer100g(false);
          handleUnitChange(unit);
          setShowUnitPicker(false);
        }}
        onTogglePer100g={() => {
          setPer100g((v) => !v);
          setShowUnitPicker(false);
        }}
        onClose={() => setShowUnitPicker(false)}
        colors={colors}
      />

      <TimePickerModal
        visible={showTimePicker}
        value={loggedTime}
        onChange={setLoggedTime}
        onClose={() => setShowTimePicker(false)}
        colors={colors}
      />

      <NumPadModal
        visible={showNumPad}
        value={servingAmount}
        onChange={(v) => { setServingAmount(v); setSaveError(null); }}
        onClose={() => setShowNumPad(false)}
        colors={colors}
      />
    </SafeAreaView>
  );
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function SectionHeading({ title, colors }: { title: string; colors: typeof Colors.light }) {
  return (
    <Text style={[styles.sectionHeading, { color: colors.icon }]}>{title}</Text>
  );
}

type MacroDetailRow = {
  key: string;
  label: string;
  value: number | null;
  goal: number | null;
  unit?: string;
  indent?: number;
};

function buildMacroRows(
  macro: 'protein' | 'carbs' | 'fat',
  pro: number,
  carb: number,
  fat: number,
  fiber: number | null,
  sugar: number | null,
  satFat: number | null,
  transFat: number | null,
  proteinGoal: number | null,
  carbGoal: number | null,
  fatGoal: number | null,
): MacroDetailRow[] {
  if (macro === 'protein') {
    return [
      { key: 'total', label: 'Protein (Total)', value: pro, goal: proteinGoal, indent: 0 },
      { key: 'cystine', label: 'Cystine', value: null, goal: null, indent: 1 },
      { key: 'histidine', label: 'Histidine', value: null, goal: null, indent: 1 },
      { key: 'isoleucine', label: 'Isoleucine', value: null, goal: null, indent: 1 },
      { key: 'leucine', label: 'Leucine', value: null, goal: null, indent: 1 },
      { key: 'lysine', label: 'Lysine', value: null, goal: null, indent: 1 },
      { key: 'methionine', label: 'Methionine', value: null, goal: null, indent: 1 },
      { key: 'phenylalanine', label: 'Phenylalanine', value: null, goal: null, indent: 1 },
      { key: 'threonine', label: 'Threonine', value: null, goal: null, indent: 1 },
      { key: 'tryptophan', label: 'Tryptophan', value: null, goal: null, indent: 1 },
      { key: 'tyrosine', label: 'Tyrosine', value: null, goal: null, indent: 1 },
      { key: 'valine', label: 'Valine', value: null, goal: null, indent: 1 },
    ];
  }
  if (macro === 'carbs') {
    const net = fiber != null ? Math.round((carb - fiber) * 10) / 10 : null;
    return [
      { key: 'total', label: 'Carbs (Total)', value: carb, goal: carbGoal, indent: 0 },
      { key: 'fiber', label: 'Fiber', value: fiber, goal: null, indent: 1 },
      { key: 'fiber_ins', label: 'Fiber (Insoluble)', value: null, goal: null, indent: 2 },
      { key: 'fiber_sol', label: 'Fiber (Soluble)', value: null, goal: null, indent: 2 },
      { key: 'net', label: 'Carbs (Net)', value: net, goal: null, indent: 0 },
      { key: 'starch', label: 'Starch', value: null, goal: null, indent: 0 },
      { key: 'sugar', label: 'Sugars', value: sugar, goal: null, indent: 0 },
      { key: 'added_sugars', label: 'Added Sugars', value: null, goal: null, indent: 0 },
    ];
  }
  return [
    { key: 'total', label: 'Fats (Total)', value: fat, goal: fatGoal, indent: 0 },
    { key: 'mono', label: 'Fat (Monounsaturated)', value: null, goal: null, indent: 1 },
    { key: 'poly', label: 'Fat (Polyunsaturated)', value: null, goal: null, indent: 1 },
    { key: 'o3', label: 'Omega-3', value: null, goal: null, indent: 1 },
    { key: 'o3_ala', label: 'Omega-3 (ALA)', value: null, goal: null, indent: 2 },
    { key: 'o3_dha', label: 'Omega-3 (DHA)', value: null, goal: null, indent: 2 },
    { key: 'o3_epa', label: 'Omega-3 (EPA)', value: null, goal: null, indent: 2 },
    { key: 'o6', label: 'Omega-6', value: null, goal: null, indent: 1 },
    { key: 'o6_aa', label: 'Omega-6 (AA)', value: null, goal: null, indent: 2 },
    { key: 'o6_la', label: 'Omega-6 (LA)', value: null, goal: null, indent: 2 },
    { key: 'sat', label: 'Fat (Saturated)', value: satFat, goal: null, indent: 1 },
    { key: 'trans', label: 'Fat (Trans)', value: transFat, goal: null, indent: 1 },
  ];
}

function MacroDetailPanel({
  macro, pro, carb, fat, fiber, sugar, satFat, transFat,
  proteinGoal, carbGoal, fatGoal, onClose, colors,
}: {
  macro: 'protein' | 'carbs' | 'fat';
  pro: number;
  carb: number;
  fat: number;
  fiber: number | null;
  sugar: number | null;
  satFat: number | null;
  transFat: number | null;
  proteinGoal: number | null;
  carbGoal: number | null;
  fatGoal: number | null;
  onClose: () => void;
  colors: typeof Colors.light;
}) {
  const rows = buildMacroRows(macro, pro, carb, fat, fiber, sugar, satFat, transFat, proteinGoal, carbGoal, fatGoal);
  const color = macro === 'protein' ? MacroColors.protein : macro === 'carbs' ? MacroColors.carbs : MacroColors.fat;
  const title = macro === 'protein' ? 'Protein' : macro === 'carbs' ? 'Carbs' : 'Fats';

  return (
    <View style={[styles.macroDetailCard, { backgroundColor: colors.cardBackground }]}>
      <View style={styles.macroDetailHeader}>
        <Text style={[styles.macroDetailTitle, { color: colors.text }]}>{title}</Text>
        <TouchableOpacity onPress={onClose} hitSlop={10}>
          <Text style={{ color: colors.icon, fontSize: 16 }}>✕</Text>
        </TouchableOpacity>
      </View>
      {rows.map((row) => (
        <DetailRow key={row.key} row={row} color={color} colors={colors} />
      ))}
    </View>
  );
}

function DetailRow({
  row, color, colors,
}: {
  row: MacroDetailRow;
  color: string;
  colors: typeof Colors.light;
}) {
  const hasValue = row.value != null;
  const indent = row.indent ?? 0;
  const pct = hasValue && row.goal
    ? Math.min((row.value as number) / Math.max(row.goal, 1), 1)
    : 0;
  const valueText = !hasValue
    ? 'No Data'
    : row.goal
    ? `${row.value} / ${row.goal} g`
    : `${row.value} g`;
  const pctText = hasValue && row.goal ? `${Math.round(pct * 100)}%` : '0%';

  return (
    <View style={[styles.detailRow, { paddingLeft: 16 + indent * 16 }]}>
      <View style={styles.detailRowTop}>
        <View style={{ flex: 1, flexDirection: 'row', alignItems: 'baseline', flexWrap: 'wrap' }}>
          <Text style={[styles.detailRowLabel, { color: colors.text, fontWeight: indent === 0 ? '700' : '600' }]}>
            {row.label}
          </Text>
          <Text style={[styles.detailRowValueInline, { color: hasValue ? colors.icon : colors.icon }]}>
            {'  '}{valueText}
          </Text>
        </View>
        <Text style={[styles.detailRowPct, { color: colors.icon }]}>{pctText}</Text>
      </View>
      {hasValue && row.goal ? (
        <View style={[styles.progressBar, { backgroundColor: colors.cardSecondary }]}>
          <View style={[styles.progressFill, { width: `${pct * 100}%` as any, backgroundColor: color }]} />
        </View>
      ) : null}
    </View>
  );
}

function FormRow({
  label, value, accent, onPress, divider, bordered, chevron, colors,
}: {
  label: string;
  value: string;
  accent: string;
  onPress?: () => void;
  divider?: boolean;
  bordered?: boolean;
  chevron?: boolean;
  colors: typeof Colors.light;
}) {
  const rowStyle = [
    styles.formRow,
    divider && { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.separator },
  ];
  const valueEl = bordered ? (
    <View style={[styles.formRowBorderedBox, { borderColor: colors.separator }]}>
      <Text style={[styles.formRowValueText, { color: accent }]}>{value}</Text>
    </View>
  ) : (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
      <Text style={[styles.formRowValueText, { color: accent }]}>{value}</Text>
      {chevron && <Text style={{ fontSize: 13, color: colors.icon }}>▾</Text>}
    </View>
  );
  const content = (
    <>
      <Text style={[styles.formRowLabel, { color: colors.text }]}>{label}</Text>
      {valueEl}
    </>
  );
  return onPress ? (
    <TouchableOpacity onPress={onPress} activeOpacity={0.7} style={rowStyle}>
      {content}
    </TouchableOpacity>
  ) : (
    <View style={rowStyle}>{content}</View>
  );
}

function NutritionRing({
  cal, protein, carbs, fat, colors,
}: {
  cal: number;
  protein: number;
  carbs: number;
  fat: number;
  colors: typeof Colors.light;
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
    <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
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

function ExpandSection({
  title, expanded, onToggle, colors, children,
}: {
  title: string;
  expanded: boolean;
  onToggle: () => void;
  colors: typeof Colors.light;
  children: ReactNode;
}) {
  return (
    <View style={[styles.expandCard, { backgroundColor: colors.cardBackground }]}>
      <TouchableOpacity
        style={styles.expandHeader}
        onPress={onToggle}
        activeOpacity={0.7}
        accessibilityRole="button"
        accessibilityState={{ expanded }}
        accessibilityLabel={title}
      >
        <Text style={[styles.expandTitle, { color: colors.text }]}>{title}</Text>
        <View style={{ transform: [{ rotate: expanded ? '180deg' : '0deg' }] }}>
          <Svg width={14} height={14} viewBox="0 0 24 24" fill="none">
            <Polyline
              points="6 9 12 15 18 9"
              stroke={colors.icon}
              strokeWidth={2.5}
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </Svg>
        </View>
      </TouchableOpacity>
      {expanded && (
        <View style={[styles.expandBody, { borderTopColor: colors.separator }]}>
          {children}
        </View>
      )}
    </View>
  );
}

function ProgressRow({
  label, value, goal, unit, color, colors,
}: {
  label: string;
  value: number;
  goal: number;
  unit: string;
  color: string;
  colors: typeof Colors.light;
}) {
  const pct = Math.min(value / Math.max(goal, 1), 1);
  return (
    <View style={styles.progressBlock}>
      <Text style={[styles.progressInline, { color: colors.text }]}>
        <Text style={{ fontWeight: '600' }}>{label}</Text>
        {`  ${value} / ${goal} ${unit}`}
      </Text>
      <View style={[styles.progressBar, { backgroundColor: colors.cardSecondary }]}>
        <View style={[styles.progressFill, { width: `${pct * 100}%` as any, backgroundColor: color }]} />
      </View>
    </View>
  );
}

function MicroExpandRow({
  label, value, unit, colors,
}: {
  label: string;
  value: number | null;
  unit: string;
  colors: typeof Colors.light;
}) {
  const hasValue = value != null;
  return (
    <View
      style={styles.microExpandRow}
      accessible
      accessibilityLabel={hasValue ? `${label}, ${value} ${unit}` : `${label}, no data`}
    >
      <Text style={{ fontSize: 14, color: colors.icon, flexShrink: 1 }}>{label}</Text>
      <Text style={{ fontSize: 14, fontWeight: hasValue ? '600' : '400', color: hasValue ? colors.text : colors.icon, fontVariant: ['tabular-nums'] }}>
        {hasValue ? `${value} ${unit}` : 'No Data'}
      </Text>
    </View>
  );
}

function NumPadModal({
  visible, value, onChange, onClose, colors,
}: {
  visible: boolean;
  value: string;
  onChange: (v: string) => void;
  onClose: () => void;
  colors: typeof Colors.light;
}) {
  const { bottom } = useSafeAreaInsets();

  const tap = (key: string) => {
    if (key === '⌫') {
      onChange(value.slice(0, -1) || '');
    } else if (key === '.' && value.includes('.')) {
      return;
    } else if (key === '.' && value === '') {
      onChange('0.');
    } else {
      onChange(value + key);
    }
  };

  const rows = [['1', '2', '3'], ['4', '5', '6'], ['7', '8', '9'], ['.', '0', '⌫']];

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.modalOverlay}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
        <View style={[styles.numPadSheet, { paddingBottom: 16 + bottom }]}>
          {/* Header */}
          <View style={[styles.numPadHeader, { borderBottomColor: colors.separator }]}>
            <Text style={[styles.numPadHeaderLabel, { color: colors.icon }]}>SERVINGS</Text>
            <Text style={[styles.numPadHeaderValue, { color: colors.text }]}>{value || '0'}</Text>
            <TouchableOpacity
              onPress={onClose}
              style={[styles.numPadDoneBtn, { backgroundColor: colors.tint }]}
            >
              <Text style={styles.numPadDoneText}>Done</Text>
            </TouchableOpacity>
          </View>
          {/* Keys */}
          <View style={styles.numPadKeys}>
            {rows.map((row, i) => (
              <View key={i} style={styles.numPadRow}>
                {row.map((key) => (
                  <TouchableOpacity
                    key={key}
                    onPress={() => tap(key)}
                    style={[
                      styles.numPadKey,
                      key === '⌫'
                        ? { backgroundColor: 'transparent' }
                        : { backgroundColor: colors.cardSecondary },
                    ]}
                    activeOpacity={0.6}
                  >
                    <Text style={[styles.numPadKeyText, { color: colors.text }]}>{key}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            ))}
          </View>
        </View>
      </View>
    </Modal>
  );
}

function UnitPickerModal({
  visible, servingUnit, per100g, baseGrams, foodServingUnits,
  onSelectUnit, onTogglePer100g, onClose, colors,
}: {
  visible: boolean;
  servingUnit: ServingUnit;
  per100g: boolean;
  baseGrams: number | null;
  foodServingUnits: string;
  onSelectUnit: (unit: ServingUnit) => void;
  onTogglePer100g: () => void;
  onClose: () => void;
  colors: typeof Colors.light;
}) {
  const { bottom } = useSafeAreaInsets();

  type UnitOption = { unit: ServingUnit; label: string; sublabel: string };
  const unitOptions: UnitOption[] = [
    { unit: 'default', label: 'Serving', sublabel: foodServingUnits },
    ...(baseGrams
      ? [
          { unit: 'grams' as ServingUnit, label: 'Grams', sublabel: 'g' },
          { unit: 'oz' as ServingUnit, label: 'Ounces', sublabel: 'oz' },
        ]
      : []),
  ];

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.modalOverlay}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
        <View style={[styles.pickerSheet, { backgroundColor: colors.cardBackground, paddingBottom: 24 + bottom }]}>
          <Text style={[styles.pickerTitle, { color: colors.text }]}>Unit</Text>

          {unitOptions.map(({ unit, label, sublabel }, i) => {
            const isActive = servingUnit === unit && !per100g;
            const isLast = i === unitOptions.length - 1 && !baseGrams;
            return (
              <TouchableOpacity
                key={unit}
                style={[
                  styles.unitOption,
                  { borderBottomColor: colors.separator },
                  isLast && styles.unitOptionLast,
                ]}
                onPress={() => onSelectUnit(unit)}
                activeOpacity={0.7}
              >
                <View>
                  <Text style={[styles.unitOptionLabel, { color: colors.text }]}>{label}</Text>
                  <Text style={[styles.unitOptionSub, { color: colors.icon }]}>{sublabel}</Text>
                </View>
                {isActive && (
                  <Text style={[styles.unitOptionCheck, { color: colors.tint }]}>✓</Text>
                )}
              </TouchableOpacity>
            );
          })}

          {baseGrams ? (
            <TouchableOpacity
              style={[styles.unitOption, styles.unitOptionLast]}
              onPress={onTogglePer100g}
              activeOpacity={0.7}
            >
              <View>
                <Text style={[styles.unitOptionLabel, { color: colors.text }]}>Per 100g</Text>
                <Text style={[styles.unitOptionSub, { color: colors.icon }]}>Reference view</Text>
              </View>
              {per100g && (
                <Text style={[styles.unitOptionCheck, { color: colors.tint }]}>✓</Text>
              )}
            </TouchableOpacity>
          ) : null}
        </View>
      </View>
    </Modal>
  );
}

function TimePickerModal({
  visible, value, onChange, onClose, colors,
}: {
  visible: boolean;
  value: Date;
  onChange: (d: Date) => void;
  onClose: () => void;
  colors: typeof Colors.light;
}) {
  const { bottom } = useSafeAreaInsets();
  const [hour, setHour] = useState(value.getHours() % 12 || 12);
  const [minute, setMinute] = useState(value.getMinutes());
  const [isPM, setIsPM] = useState(value.getHours() >= 12);

  useEffect(() => {
    if (visible) {
      setHour(value.getHours() % 12 || 12);
      setMinute(value.getMinutes());
      setIsPM(value.getHours() >= 12);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);

  const apply = () => {
    const h24 = isPM ? (hour === 12 ? 12 : hour + 12) : hour === 12 ? 0 : hour;
    const d = new Date();
    d.setHours(h24, minute, 0, 0);
    onChange(d);
    onClose();
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.modalOverlay}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
        <View
          style={[
            styles.pickerSheet,
            { backgroundColor: colors.cardBackground, paddingBottom: 24 + bottom },
          ]}
        >
          <Text style={[styles.pickerTitle, { color: colors.text }]}>Time</Text>

          <View style={styles.pickerRow}>
            <View style={styles.pickerColumn}>
              <TouchableOpacity onPress={() => setHour((h) => (h % 12) + 1)} hitSlop={8}>
                <Text style={[styles.pickerArrow, { color: colors.tint }]}>▲</Text>
              </TouchableOpacity>
              <Text style={[styles.pickerNumber, { color: colors.text }]}>
                {String(hour).padStart(2, '0')}
              </Text>
              <TouchableOpacity onPress={() => setHour((h) => (h === 1 ? 12 : h - 1))} hitSlop={8}>
                <Text style={[styles.pickerArrow, { color: colors.tint }]}>▼</Text>
              </TouchableOpacity>
            </View>

            <Text style={[styles.pickerColon, { color: colors.text }]}>:</Text>

            <View style={styles.pickerColumn}>
              <TouchableOpacity onPress={() => setMinute((m) => (m + 5) % 60)} hitSlop={8}>
                <Text style={[styles.pickerArrow, { color: colors.tint }]}>▲</Text>
              </TouchableOpacity>
              <Text style={[styles.pickerNumber, { color: colors.text }]}>
                {String(minute).padStart(2, '0')}
              </Text>
              <TouchableOpacity onPress={() => setMinute((m) => (m - 5 + 60) % 60)} hitSlop={8}>
                <Text style={[styles.pickerArrow, { color: colors.tint }]}>▼</Text>
              </TouchableOpacity>
            </View>

            <View style={styles.ampmColumn}>
              <TouchableOpacity
                onPress={() => setIsPM(false)}
                style={[styles.ampmBtn, !isPM && { backgroundColor: colors.tint }]}
              >
                <Text style={[styles.ampmText, { color: !isPM ? '#fff' : colors.icon }]}>AM</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => setIsPM(true)}
                style={[styles.ampmBtn, isPM && { backgroundColor: colors.tint }]}
              >
                <Text style={[styles.ampmText, { color: isPM ? '#fff' : colors.icon }]}>PM</Text>
              </TouchableOpacity>
            </View>
          </View>

          <TouchableOpacity
            style={[styles.doneBtn, { backgroundColor: colors.tint }]}
            onPress={apply}
          >
            <Text style={styles.doneBtnText}>Done</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: { flex: 1 },

  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  headerBtn: { width: 64 },
  headerBtnText: { fontSize: 16 },
  title: { fontSize: 17, fontWeight: '600' },

  scroll: { padding: 16, paddingBottom: 48, gap: 8 },

  sectionHeading: {
    fontSize: 12,
    fontWeight: '600',
    letterSpacing: 0.5,
    marginTop: 8,
    marginBottom: 2,
    marginLeft: 4,
  },

  macroDetailCard: {
    borderRadius: 18,
    borderTopLeftRadius: 0,
    borderTopRightRadius: 0,
    paddingTop: 12,
    paddingBottom: 12,
  },
  macroDetailHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    marginBottom: 4,
  },
  macroDetailTitle: { fontSize: 14, fontWeight: '700' },
  detailRow: { gap: 4, paddingRight: 16, paddingVertical: 6 },
  detailRowTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  detailRowLabel: { fontSize: 13 },
  detailRowValueInline: { fontSize: 12, fontVariant: ['tabular-nums'] },
  detailRowPct: { fontSize: 12, fontWeight: '400', minWidth: 36, textAlign: 'right' },
  formRowBorderedBox: {
    borderWidth: 1.5,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 8,
    minWidth: 72,
    alignItems: 'flex-end',
  },

  foodCard: { borderRadius: 18, padding: 16 },
  foodName: { fontSize: 17, fontWeight: '600', marginBottom: 2, lineHeight: 24 },
  foodBrand: { fontSize: 14, marginBottom: 4 },
  foodServing: { fontSize: 13, marginTop: 2 },

  // Form card
  formCard: { borderRadius: 18, paddingHorizontal: 16, paddingVertical: 4 },
  formRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 14,
  },
  formRowLabel: { fontSize: 15, fontWeight: '500' },
  formRowValueText: { fontSize: 17, fontWeight: '600', textAlign: 'right' },

  // Ring + macros
  ringMacroCard: {
    borderRadius: 18,
    padding: 16,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
  },
  ringMacroCardOpen: {
    borderBottomLeftRadius: 0,
    borderBottomRightRadius: 0,
  },
  ringMacroRight: {
    flex: 1,
    flexDirection: 'row',
    justifyContent: 'space-around',
    gap: 6,
  },
  macroCol: { alignItems: 'center', gap: 2, flex: 1, minWidth: 0 },
  macroGrams: { fontSize: 16, fontWeight: '700', fontVariant: ['tabular-nums'] },
  macroColLabel: { fontSize: 11 },

  // Expand sections
  expandCard: { borderRadius: 18, overflow: 'hidden' },
  expandHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
  },
  expandTitle: { fontSize: 15, fontWeight: '700' },
  expandBody: {
    borderTopWidth: StyleSheet.hairlineWidth,
    padding: 16,
    gap: 12,
  },

  // Progress rows
  progressBlock: { gap: 5 },
  progressInline: { fontSize: 12 },
  progressBar: { height: 4, borderRadius: 2 },
  progressFill: { height: 4, borderRadius: 2 },

  // Micro expand rows
  microExpandRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },

  // Save
  saveFooter: {
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 24,
  },
  saveBtn: { borderRadius: 18, paddingVertical: 16, alignItems: 'center' },
  saveBtnText: { color: '#fff', fontSize: 17, fontWeight: '600' },
  saveErrorText: { fontSize: 13, textAlign: 'center', marginTop: 10 },

  // Modals shared
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.45)',
    justifyContent: 'flex-end',
  },

  // Number pad
  numPadSheet: {
    backgroundColor: '#1c1c1e',
    borderTopLeftRadius: 14,
    borderTopRightRadius: 14,
  },
  numPadHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 12,
    paddingHorizontal: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  numPadHeaderLabel: { fontSize: 11, fontWeight: '600', letterSpacing: 0.5 },
  numPadHeaderValue: { fontSize: 22, fontWeight: '700', fontVariant: ['tabular-nums'] },
  numPadDoneBtn: { paddingHorizontal: 14, paddingVertical: 6, borderRadius: 8 },
  numPadDoneText: { fontSize: 13, fontWeight: '700', color: '#fff' },
  numPadKeys: { padding: 8, gap: 6 },
  numPadRow: { flexDirection: 'row', gap: 6 },
  numPadKey: {
    flex: 1,
    height: 44,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  numPadKeyText: { fontSize: 20, fontWeight: '500' },

  // Picker sheet (unit + time)
  pickerSheet: {
    padding: 24,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
  },
  pickerTitle: { fontSize: 16, fontWeight: '600', textAlign: 'center', marginBottom: 24 },

  // Unit picker
  unitOption: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  unitOptionLast: { borderBottomWidth: 0 },
  unitOptionLabel: { fontSize: 16, fontWeight: '500' },
  unitOptionSub: { fontSize: 12, marginTop: 1 },
  unitOptionCheck: { fontSize: 18, fontWeight: '600' },

  // Time picker
  pickerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    marginBottom: 28,
  },
  pickerColumn: { alignItems: 'center', gap: 10 },
  pickerArrow: { fontSize: 18, paddingHorizontal: 12, paddingVertical: 2 },
  pickerNumber: { fontSize: 40, fontWeight: '700', minWidth: 64, textAlign: 'center' },
  pickerColon: { fontSize: 36, fontWeight: '700', marginBottom: 10 },
  ampmColumn: { gap: 8, marginLeft: 12 },
  ampmBtn: { paddingHorizontal: 14, paddingVertical: 9, borderRadius: 8 },
  ampmText: { fontSize: 14, fontWeight: '600' },
  doneBtn: { borderRadius: 12, paddingVertical: 15, alignItems: 'center' },
  doneBtnText: { color: '#fff', fontSize: 16, fontWeight: '600' },
});
