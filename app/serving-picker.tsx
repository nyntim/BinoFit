import { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
  Modal,
  Pressable,
} from 'react-native';
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
} from '@/lib/database';
import { getUSDAFoodById } from '@/lib/foods-db';
import { getUserGoals } from '@/lib/storage';
import { writeNutritionLog } from '@/services/healthKitService';
import type { Food } from '@/lib/types';

const SLOT_LABELS: Record<string, string> = {
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
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [dailyCalories, setDailyCalories] = useState(0);
  const [calorieGoal, setCalorieGoal] = useState<number | null>(null);
  const inputRef = useRef<TextInput>(null);

  const isEdit = Boolean(log_id);
  const slotLabel = SLOT_LABELS[meal_slot ?? ''] ?? 'Meal';

  useEffect(() => {
    if (!food_id) return;
    (async () => {
      let found = await getFoodById(food_id);
      if (!found) {
        const usda = await getUSDAFoodById(food_id);
        if (usda) {
          await cacheRemoteFood(usda);
          found = usda;
        }
      }
      setFood(found);
    })();
    if (log_id && date) {
      getFoodLogsWithFoodByDate(date).then((logs) => {
        const entry = logs.find((l) => l.id === log_id);
        if (entry) setServingAmount(String(entry.serving_amount));
      });
    }
  }, [food_id, log_id, date]);

  useEffect(() => {
    if (!date) return;
    Promise.all([getFoodLogsWithFoodByDate(date), getUserGoals()]).then(([logs, goals]) => {
      const cals = logs
        .filter((l) => l.id !== log_id)
        .reduce((s, l) => s + l.food_calories * l.serving_amount, 0);
      setDailyCalories(Math.round(cals));
      if (goals) setCalorieGoal(goals.calorie_goal);
    });
  }, [date, log_id]);

  useEffect(() => {
    const t = setTimeout(() => inputRef.current?.focus(), 300);
    return () => clearTimeout(t);
  }, []);

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
  const fiber = food?.fiber != null ? Math.round(food.fiber * nutriScale * 10) / 10 : null;
  const sugar = food?.sugar != null ? Math.round(food.sugar * nutriScale * 10) / 10 : null;
  const sodium = food?.sodium != null ? Math.round(food.sodium * nutriScale) : null;
  const satFat = food?.saturated_fat != null ? Math.round(food.saturated_fat * nutriScale * 10) / 10 : null;

  const hasMicros = [fiber, sugar, sodium, satFat].some((v) => v !== null);

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
    ? 'Serving'
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

  const thisCal = Math.round(food.calories * multiplier);
  const totalAfter = dailyCalories + thisCal;

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
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
            ) : null}
            <Text style={[styles.foodServing, { color: colors.icon }]}>
              Per serving: {food.serving_units}
            </Text>
          </View>

          {/* Amount */}
          <View style={styles.section}>
            <Text style={[styles.sectionLabel, { color: colors.icon }]}>AMOUNT</Text>

            <View style={[styles.amountCard, { backgroundColor: colors.cardBackground }]}>
              <TextInput
                ref={inputRef}
                style={[styles.amountInput, { color: colors.text }]}
                value={servingAmount}
                onChangeText={(v) => { setServingAmount(v); setSaveError(null); }}
                keyboardType="decimal-pad"
                selectTextOnFocus
              />
              <Text style={[styles.unitSublabel, { color: colors.icon }]}>
                {servingUnit === 'default' ? food.serving_units : servingUnit}
              </Text>
            </View>

            <TouchableOpacity
              style={[styles.unitSelector, { backgroundColor: colors.cardBackground }]}
              onPress={() => setShowUnitPicker(true)}
              activeOpacity={0.7}
              accessibilityRole="button"
              accessibilityLabel={`Unit: ${unitLabel}. Tap to change.`}
            >
              <Text style={[styles.unitSelectorLabel, { color: colors.icon }]}>Unit</Text>
              <View style={styles.unitSelectorRight}>
                <Text style={[styles.unitSelectorValue, { color: colors.tint }]}>{unitLabel}</Text>
                <Text style={[styles.unitSelectorChevron, { color: colors.icon }]}>{'\u203A'}</Text>
              </View>
            </TouchableOpacity>
          </View>

          {/* Nutrition */}
          <View style={styles.section}>
            <Text style={[styles.sectionLabel, { color: colors.icon }]}>
              NUTRITION{per100g ? '  \u00b7  per 100g' : ''}
            </Text>

            <View style={[styles.nutritionCard, { backgroundColor: colors.cardBackground }]}>
              <View style={styles.calorieRow}>
                <Text style={[styles.calorieLabel, { color: colors.icon }]}>Calories</Text>
                <Text style={[styles.calorieValue, { color: colors.tint }]}>{cal}</Text>
              </View>

              <View style={[styles.macroRow, { borderTopColor: colors.separator }]}>
                <MacroCell label="Protein" value={pro} unit="g" color={MacroColors.protein} textColor={colors.text} subColor={colors.icon} />
                <View style={[styles.macroDivider, { backgroundColor: colors.separator }]} />
                <MacroCell label="Carbs" value={carb} unit="g" color={MacroColors.carbs} textColor={colors.text} subColor={colors.icon} />
                <View style={[styles.macroDivider, { backgroundColor: colors.separator }]} />
                <MacroCell label="Fat" value={fat} unit="g" color={MacroColors.fat} textColor={colors.text} subColor={colors.icon} />
              </View>

              {hasMicros && (
                <View style={[styles.microSection, { borderTopColor: colors.separator }]}>
                  {fiber !== null && (
                    <MicroRow label="Fiber" value={fiber} unit="g" textColor={colors.text} subColor={colors.icon} />
                  )}
                  {sugar !== null && (
                    <MicroRow label="Sugar" value={sugar} unit="g" textColor={colors.text} subColor={colors.icon} />
                  )}
                  {sodium !== null && (
                    <MicroRow label="Sodium" value={sodium} unit="mg" textColor={colors.text} subColor={colors.icon} />
                  )}
                  {satFat !== null && (
                    <MicroRow label="Sat. Fat" value={satFat} unit="g" textColor={colors.text} subColor={colors.icon} />
                  )}
                </View>
              )}
            </View>
          </View>

          {/* Daily context */}
          {calorieGoal !== null && thisCal > 0 && (
            <View style={[styles.contextStrip, { backgroundColor: colors.cardBackground }]}>
              <Text style={[styles.contextValue, { color: colors.text }]}>
                {totalAfter} / {calorieGoal} kcal
              </Text>
              <Text style={[styles.contextSub, { color: colors.icon }]}>
                +{thisCal} kcal from this item
              </Text>
            </View>
          )}

          {/* Time row */}
          <TouchableOpacity
            style={[styles.timeRow, { backgroundColor: colors.cardBackground }]}
            onPress={() => setShowTimePicker(true)}
            activeOpacity={0.7}
            accessibilityRole="button"
            accessibilityLabel={`Log time: ${formatTime(loggedTime)}. Tap to change.`}
          >
            <Text style={[styles.timeLabel, { color: colors.text }]}>Time</Text>
            <Text style={[styles.timeDisplay, { color: colors.tint }]}>{formatTime(loggedTime)}</Text>
          </TouchableOpacity>

          {/* Save */}
          <TouchableOpacity
            style={[styles.saveBtn, { backgroundColor: colors.tint, opacity: multiplier > 0 ? 1 : 0.4 }]}
            onPress={handleSave}
            disabled={multiplier <= 0 || saving}
            activeOpacity={0.8}
          >
            {saving ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.saveBtnText}>
                {isEdit ? 'Save Changes' : `Add to ${slotLabel}`}
              </Text>
            )}
          </TouchableOpacity>
          {saveError ? (
            <Text style={[styles.saveErrorText, { color: colors.danger }]}>{saveError}</Text>
          ) : null}
        </ScrollView>
      </KeyboardAvoidingView>

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
    </SafeAreaView>
  );
}

function MacroCell({
  label, value, unit, color, textColor, subColor,
}: {
  label: string; value: number; unit: string;
  color: string; textColor: string; subColor: string;
}) {
  return (
    <View style={styles.macroCell}>
      <View style={[styles.macroDot, { backgroundColor: color }]} />
      <Text style={[styles.macroValue, { color: textColor }]}>{value}{unit}</Text>
      <Text style={[styles.macroLabel, { color: subColor }]}>{label}</Text>
    </View>
  );
}

function MicroRow({
  label, value, unit, textColor, subColor,
}: {
  label: string; value: number; unit: string; textColor: string; subColor: string;
}) {
  return (
    <View style={styles.microRow}>
      <Text style={[styles.microLabel, { color: subColor }]}>{label}</Text>
      <Text style={[styles.microValue, { color: textColor }]}>{value}{unit}</Text>
    </View>
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

  scroll: { padding: 16, paddingBottom: 48 },

  foodCard: { borderRadius: 18, padding: 16, marginBottom: 24 },
  foodName: { fontSize: 17, fontWeight: '600', marginBottom: 2, lineHeight: 24 },
  foodBrand: { fontSize: 14, marginBottom: 4 },
  foodServing: { fontSize: 13, marginTop: 2 },

  section: { marginBottom: 24 },
  sectionLabel: { fontSize: 12, fontWeight: '600', letterSpacing: 0.5, marginBottom: 8, marginLeft: 4 },

  amountCard: {
    borderRadius: 18,
    paddingVertical: 24,
    paddingHorizontal: 16,
    alignItems: 'center',
    marginBottom: 10,
  },
  amountInput: {
    fontSize: 48,
    fontWeight: '700',
    textAlign: 'center',
    width: '100%',
    fontVariant: ['tabular-nums'],
  },
  unitSublabel: { fontSize: 13, marginTop: 4 },

  unitSelector: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderRadius: 18,
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  unitSelectorLabel: { fontSize: 15 },
  unitSelectorRight: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  unitSelectorValue: { fontSize: 15, fontWeight: '500' },
  unitSelectorChevron: { fontSize: 20, lineHeight: 22 },

  nutritionCard: { borderRadius: 18, overflow: 'hidden' },
  calorieRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  calorieLabel: { fontSize: 15, fontWeight: '500' },
  calorieValue: { fontSize: 22, fontWeight: '700', fontVariant: ['tabular-nums'] },

  macroRow: {
    flexDirection: 'row',
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingVertical: 14,
  },
  macroCell: { flex: 1, alignItems: 'center', gap: 3 },
  macroDot: { width: 8, height: 8, borderRadius: 4 },
  macroValue: { fontSize: 16, fontWeight: '700', fontVariant: ['tabular-nums'] },
  macroLabel: { fontSize: 12 },
  macroDivider: { width: StyleSheet.hairlineWidth },

  microSection: {
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 8,
    gap: 9,
  },
  microRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  microLabel: { fontSize: 13 },
  microValue: { fontSize: 13, fontWeight: '600', fontVariant: ['tabular-nums'] },

  contextStrip: {
    borderRadius: 18,
    paddingHorizontal: 16,
    paddingVertical: 12,
    marginBottom: 12,
  },
  contextValue: { fontSize: 15, fontWeight: '600', fontVariant: ['tabular-nums'] },
  contextSub: { fontSize: 12, marginTop: 2 },

  timeRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderRadius: 18,
    paddingHorizontal: 16,
    paddingVertical: 15,
    marginBottom: 24,
  },
  timeLabel: { fontSize: 15 },
  timeDisplay: { fontSize: 15, fontWeight: '500' },

  saveBtn: { borderRadius: 18, paddingVertical: 16, alignItems: 'center' },
  saveBtnText: { color: '#fff', fontSize: 17, fontWeight: '600' },
  saveErrorText: { fontSize: 13, textAlign: 'center', marginTop: 10 },

  // Modals
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.45)',
    justifyContent: 'flex-end',
  },
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
