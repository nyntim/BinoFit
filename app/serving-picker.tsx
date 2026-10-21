import { useState, useEffect, useRef, useCallback, type ReactNode } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  ScrollView,
  Modal,
  Pressable,
  TextInput,
  InputAccessoryView,
  Keyboard,
  Platform,
  type DimensionValue,
} from 'react-native';
import Svg, { Circle, Line, Polyline } from 'react-native-svg';
import * as Haptics from 'expo-haptics';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { MacroColors, TargetTints } from '@/constants/theme';
import type { Colors } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { useThemeColor } from '@/hooks/use-theme-color';
import { TimePickerSheet } from '@/components/time-picker-sheet';
import { useMealDefinitions } from '@/hooks/useMealDefinitions';
import {
  getFoodById,
  addFoodLog,
  updateFoodLog,
  getFoodLogsWithFoodByDate,
  cacheRemoteFood,
  hasAnyMicros,
  getMealSlotConfirmationsByDate,
  ensureMealSlotStatus,
} from '@/lib/database';
import { NUTRIENTS, scaleNutrients, type NutrientValues } from '@/lib/nutrients';
import { isSlotEaten, sumEatenTotals } from '@/lib/nutrition-totals';
import { getFullBrandedFood } from '@/lib/food-service';
import { parseBaseGrams } from '@/lib/serving-units';
import { validateServing, parseFoodDecimal, servingMultiplier, formatServingAmount, validBaseGrams, type ServingUnit } from '@/lib/food-validation';
import { getUSDAFoodById } from '@/lib/foods-db';
import { getUserGoals, getDefaultLogStatus } from '@/lib/storage';
import type { Food, LogStatus, MealSlot, MealSlotConfirmation } from '@/lib/types';

// Food ids already refetched for micronutrients this app session
const refetchedFoodIds = new Set<string>();

const AMOUNT_ACCESSORY_ID = 'serving-amount-accessory';



function formatTime(d: Date): string {
  let h = d.getHours();
  const m = d.getMinutes();
  const ampm = h >= 12 ? 'PM' : 'AM';
  h = h % 12 || 12;
  return `${h}:${String(m).padStart(2, '0')} ${ampm}`;
}

const round1 = (v: number) => Math.round(v * 10) / 10;
const formatNutrientValue = (value: number) => value.toLocaleString('en-US', { maximumSignificantDigits: 8 });
const formatNum = (v: number) => v.toLocaleString('en-US', { maximumFractionDigits: 1 });
const percent = (fraction: number) => `${fraction * 100}%` as DimensionValue;

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
  const background = useThemeColor({}, 'background');
  const cardBackground = useThemeColor({}, 'cardBackground');
  const cardSecondary = useThemeColor({}, 'cardSecondary');
  const danger = useThemeColor({}, 'danger');
  const fieldBorder = useThemeColor({}, 'fieldBorder');
  const icon = useThemeColor({}, 'icon');
  const separator = useThemeColor({}, 'separator');
  const text = useThemeColor({}, 'text');
  const tint = useThemeColor({}, 'tint');
  const track = useThemeColor({}, 'track');
  const colors = { background, cardBackground, cardSecondary, danger, fieldBorder, icon, separator, text, tint, track };
  const tints = TargetTints[cs ?? 'light'];

  const [food, setFood] = useState<Food | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);
  const [loadAttempt, setLoadAttempt] = useState(0);
  const [servingAmount, setServingAmount] = useState(initial_amount ?? '1');
  const [servingUnit, setServingUnit] = useState<ServingUnit>('default');
  const [amountFocused, setAmountFocused] = useState(false);
  const [loggedTime, setLoggedTime] = useState<Date>(new Date());
  const [showTimePicker, setShowTimePicker] = useState(false);
  const [showUnitPicker, setShowUnitPicker] = useState(false);
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
  const [confirmations, setConfirmations] = useState<MealSlotConfirmation[]>([]);
  const [defaultStatus, setDefaultStatus] = useState<LogStatus>('eaten');
  const [expandedMacro, setExpandedMacro] = useState<null | 'protein' | 'carbs' | 'fat'>(null);
  const [expandNutrients, setExpandNutrients] = useState(false);
  const amountRef = useRef<TextInput>(null);
  const savingRef = useRef(false);
  const [editLoading, setEditLoading] = useState(Boolean(log_id));
  const [editLoadFailed, setEditLoadFailed] = useState(false);
  const [definitionRefreshing, setDefinitionRefreshing] = useState(false);
  const [definitionRefreshFailed, setDefinitionRefreshFailed] = useState(false);

  useFocusEffect(useCallback(() => {
    if (!food_id || food?.source !== 'custom') return;
    let cancelled = false;
    setDefinitionRefreshing(true);
    getFoodById(food_id).then((current) => {
      if (cancelled) return;
      if (!current || current.source !== 'custom') throw new Error('Custom food unavailable');
      setFood(current);
      setDefinitionRefreshFailed(false);
    }).catch(() => { if (!cancelled) setDefinitionRefreshFailed(true); })
      .finally(() => { if (!cancelled) setDefinitionRefreshing(false); });
    return () => { cancelled = true; };
  }, [food_id, food?.source]));


  const isEdit = Boolean(log_id);
  const { labelFor, loaded: mealsLoaded } = useMealDefinitions();
  const slotLabel = mealsLoaded ? labelFor(meal_slot, date) : '';

  useEffect(() => {
    if (!food_id) return;
    let cancelled = false;
    (async () => {
      try {
        const found = await getFoodById(food_id);
        if (cancelled) return;
        if (found) { setFood(found); setDefinitionRefreshFailed(false); }

        const needsMicros = !found || (!hasAnyMicros(found) && found.source !== 'custom' && found.source !== 'open_food_facts');
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
        if (!found) {
          if (full) setFood(full);
          else setLoadFailed(true);
        } else if (full && hasAnyMicros(full)) setFood(full);
      } catch {
        // A food already shown stays usable; only a missing food is a failure
        if (!cancelled) setLoadFailed(true);
      }
    })();
    if (log_id && date) {
      getFoodLogsWithFoodByDate(date).then((logs) => {
        const entry = logs.find((l) => l.id === log_id);
        if (cancelled) return;
        if (entry) setServingAmount(formatServingAmount(entry.serving_amount));
        setEditLoading(!entry);
        setEditLoadFailed(!entry);
      }).catch(() => { if (!cancelled) setEditLoadFailed(true); });
    }
    return () => {
      cancelled = true;
    };
  }, [food_id, log_id, date, loadAttempt]);

  useEffect(() => {
    if (!date) return;
    Promise.all([
      getFoodLogsWithFoodByDate(date),
      getUserGoals(),
      getMealSlotConfirmationsByDate(date),
      getDefaultLogStatus(),
    ]).then(([logs, goals, slotConfirmations, status]) => {
      setConfirmations(slotConfirmations);
      setDefaultStatus(status);
      const others = logs.filter((l) => l.id !== log_id);
      const totals = sumEatenTotals(others, slotConfirmations);
      setDailyCalories(Math.round(totals.calories));
      setDailyProtein(Math.round(totals.protein * 10) / 10);
      setDailyCarbsState(Math.round(totals.carbs * 10) / 10);
      setDailyFat(Math.round(totals.fat * 10) / 10);
      if (goals) {
        setCalorieGoal(goals.calorie_goal);
        setProteinGoal(goals.protein_goal);
        setCarbGoal(goals.carb_goal);
        setFatGoal(goals.fat_goal);
      }
    }).catch(() => {
      // Totals are supplementary; the food/edit loaders expose their own retry states.
    });
  }, [date, log_id]);

  const parsedBaseGrams = food ? parseBaseGrams(food.serving_units) : null;
  const baseGrams = validBaseGrams(parsedBaseGrams) ? parsedBaseGrams : null;
  const validation = validateServing(servingAmount, servingUnit, baseGrams);
  const multiplier = validation.valid ? validation.multiplier! : 0;

  const cal = food ? Math.round(food.calories * multiplier) : 0;
  const pro = food ? round1(food.protein * multiplier) : 0;
  const carb = food ? round1(food.carbs * multiplier) : 0;
  const fat = food ? round1(food.fat * multiplier) : 0;
  const nutrients = scaleNutrients(food, validation.valid ? multiplier : NaN);

  // Reference only: never changes what gets logged
  const per100 =
    food && baseGrams
      ? (() => {
          const s = 100 / baseGrams;
          return `Per 100 g · ${Math.round(food.calories * s)} cal · P ${round1(food.protein * s)} g · C ${round1(food.carbs * s)} g · F ${round1(food.fat * s)} g`;
        })()
      : null;

  const canLog = Boolean(food && meal_slot && date && mealsLoaded) && validation.valid && !editLoading && !definitionRefreshFailed && !definitionRefreshing && !saving;

  const handleUnitChange = (unit: ServingUnit) => {
    if (unit === servingUnit || !baseGrams) return;
    const parsed = parseFoodDecimal(servingAmount, 'required');
    if (validation.valid && parsed.valid && parsed.value !== null) {
      const canonical = servingMultiplier(parsed.value, servingUnit, baseGrams);
      const amount = unit === 'default' ? canonical : unit === 'grams' ? canonical * baseGrams : canonical * baseGrams / 28.35;
      if (Number.isFinite(amount)) setServingAmount(formatServingAmount(amount));
    }
    setServingUnit(unit);
  };

  const handleSave = async () => {
    const checked = validateServing(servingAmount, servingUnit, baseGrams);
    if (!food || !checked.valid || checked.multiplier === null || !meal_slot || !date || !mealsLoaded || editLoading || definitionRefreshFailed || definitionRefreshing || savingRef.current) return;
    const multiplier = checked.multiplier;
    savingRef.current = true;
    Keyboard.dismiss();
    setSaving(true);
    setSaveError(null);
    try {
      const timeStr = `${String(loggedTime.getHours()).padStart(2, '0')}:${String(loggedTime.getMinutes()).padStart(2, '0')}`;
      const calSave = Math.round(food.calories * multiplier);
      const proSave = round1(food.protein * multiplier);
      const carbSave = round1(food.carbs * multiplier);
      const fatSave = round1(food.fat * multiplier);

      const slot = meal_slot as MealSlot;
      let eaten: boolean;
      if (isEdit && log_id) {
        await updateFoodLog(log_id, multiplier, food.serving_units, timeStr);
        // Edits keep the slot's current status (no row = eaten)
        eaten = isSlotEaten(confirmations, slot);
      } else {
        await addFoodLog({
          date,
          meal_slot: slot,
          food_id: food.id,
          serving_amount: multiplier,
          serving_unit: food.serving_units,
          logged_time: timeStr,
        });
        // First food in a slot takes the default status; an existing status is kept
        eaten = await ensureMealSlotStatus(date, slot, defaultStatus === 'eaten');
      }

      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      router.back();
    } catch {
      setSaveError("Couldn't save this entry.");
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  };

  const retryLoad = () => {
    setLoadFailed(false);
    setEditLoadFailed(false);
    setLoadAttempt((n) => n + 1);
  };

  const unitLabel =
    servingUnit === 'default'
      ? food?.serving_units ?? 'Serving'
      : servingUnit === 'grams'
      ? 'Grams'
      : 'Ounces';
  const unitSpoken = servingUnit === 'default' ? 'servings' : servingUnit === 'grams' ? 'grams' : 'ounces';


  const macros = [
    { key: 'protein' as const, label: 'Protein', value: pro, color: MacroColors.protein },
    { key: 'carbs' as const, label: 'Carbs', value: carb, color: MacroColors.carbs },
    { key: 'fat' as const, label: 'Fat', value: fat, color: MacroColors.fat },
  ];

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
      {/* Header */}
      <View style={[styles.header, { backgroundColor: colors.background, borderBottomColor: colors.separator }]}>
        <TouchableOpacity
          onPress={() => router.back()}
          style={styles.headerSide}
          hitSlop={8}
          accessibilityRole="button"
        >
          <Text style={[styles.headerBtnText, { color: colors.tint }]}>
            {isEdit ? 'Cancel' : 'Back'}
          </Text>
        </TouchableOpacity>
        <Text style={[styles.title, { color: colors.text }]} accessibilityRole="header">
          {isEdit ? 'Edit Serving' : slotLabel}
        </Text>
        <View style={[styles.headerSide, styles.headerSideRight]}>
          <TouchableOpacity
            onPress={handleSave}
            disabled={!canLog}
            style={[styles.logPill, { backgroundColor: colors.tint, opacity: canLog || saving ? 1 : 0.4 }]}
            hitSlop={6}
            activeOpacity={0.85}
            accessibilityRole="button"
            accessibilityLabel={isEdit ? 'Save changes' : `Log to ${slotLabel || "meal"}`}
            accessibilityState={{ disabled: !canLog, busy: saving }}
          >
            {saving ? (
              <ActivityIndicator size="small" color={colors.background} />
            ) : (
              <Text style={[styles.logPillText, { color: colors.background }]}>
                {isEdit ? 'Save' : 'Log'}
              </Text>
            )}
          </TouchableOpacity>
        </View>
      </View>

      {saveError ? (
        <View
          style={[styles.errorBanner, { backgroundColor: colors.cardBackground }]}
          accessibilityRole="alert"
          accessibilityLiveRegion="polite"
        >
          <Svg width={18} height={18} viewBox="0 0 24 24" fill="none">
            <Circle cx={12} cy={12} r={10} stroke={colors.danger} strokeWidth={2} />
            <Line x1={12} y1={8} x2={12} y2={12} stroke={colors.danger} strokeWidth={2} strokeLinecap="round" />
            <Line x1={12} y1={16} x2={12.01} y2={16} stroke={colors.danger} strokeWidth={2} strokeLinecap="round" />
          </Svg>
          <Text style={[styles.errorText, { color: colors.text }]}>{saveError}</Text>
          <TouchableOpacity onPress={handleSave} disabled={!canLog} hitSlop={8} accessibilityRole="button" accessibilityState={{ disabled: !canLog, busy: saving }}>
            <Text style={[styles.errorRetry, { color: colors.tint }]}>Try again</Text>
          </TouchableOpacity>
        </View>
      ) : null}

      {definitionRefreshFailed ? (
        <View style={[styles.errorBanner, { backgroundColor: colors.cardBackground }]} accessibilityRole="alert">
          <Text style={[styles.errorText, { color: colors.text }]}>Couldn’t refresh this food.</Text>
          <TouchableOpacity onPress={retryLoad} accessibilityRole="button" style={styles.editRetry}><Text style={{ color: colors.tint }}>Try again</Text></TouchableOpacity>
        </View>
      ) : null}
      {editLoadFailed ? (
        <View style={[styles.errorBanner, { backgroundColor: colors.cardBackground }]} accessibilityRole="alert" accessibilityLiveRegion="polite">
          <Text style={[styles.errorText, { color: colors.text }]}>{"Couldn't load this entry."}</Text>
          <TouchableOpacity onPress={retryLoad} accessibilityRole="button" accessibilityLabel="Retry loading entry" style={styles.editRetry}>
            <Text style={[styles.errorRetry, { color: colors.tint }]}>Try again</Text>
          </TouchableOpacity>
        </View>
      ) : null}

      {!food && loadFailed ? (
        <View style={styles.failWrap}>
          <View style={[styles.failIcon, { backgroundColor: colors.cardBackground }]}>
            <Svg width={26} height={26} viewBox="0 0 24 24" fill="none">
              <Circle cx={11} cy={11} r={7} stroke={colors.icon} strokeWidth={2} />
              <Line x1={21} y1={21} x2={16.65} y2={16.65} stroke={colors.icon} strokeWidth={2} strokeLinecap="round" />
              <Line x1={8.5} y1={8.5} x2={13.5} y2={13.5} stroke={colors.icon} strokeWidth={2} strokeLinecap="round" />
              <Line x1={13.5} y1={8.5} x2={8.5} y2={13.5} stroke={colors.icon} strokeWidth={2} strokeLinecap="round" />
            </Svg>
          </View>
          <Text style={[styles.failTitle, { color: colors.text }]}>{"Couldn't load this food"}</Text>
          <Text style={[styles.failBody, { color: colors.icon }]}>Check your connection, then try again.</Text>
          <TouchableOpacity
            onPress={retryLoad}
            style={[styles.failBtn, { backgroundColor: colors.tint }]}
            accessibilityRole="button"
          >
            <Text style={[styles.failBtnText, { color: colors.background }]}>Try again</Text>
          </TouchableOpacity>
        </View>
      ) : !food ? (
        <View style={styles.scroll} accessibilityLabel="Loading food" accessibilityState={{ busy: true }}>
          <View style={[styles.foodCard, styles.skeletonCard, { backgroundColor: colors.cardBackground }]}>
            <View style={[styles.skeletonBar, { width: '70%', height: 16, backgroundColor: colors.cardSecondary }]} />
            <View style={[styles.skeletonBar, { width: '35%', height: 12, backgroundColor: colors.cardSecondary }]} />
          </View>
          <View style={[styles.skeletonHeading, { width: 64, backgroundColor: colors.cardSecondary }]} />
          <View style={[styles.skeletonBlock, { height: 152, backgroundColor: colors.cardBackground }]} />
          <View style={[styles.skeletonHeading, { width: 80, backgroundColor: colors.cardSecondary }]} />
          <View style={[styles.skeletonBlock, styles.skeletonLoading, { height: 112, backgroundColor: colors.cardBackground }]}>
            <ActivityIndicator size="small" color={colors.tint} />
            <Text style={[styles.skeletonText, { color: colors.icon }]}>Loading food</Text>
          </View>
        </View>
      ) : (
        <ScrollView
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
          contentContainerStyle={styles.scroll}
        >
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
            {food.source === 'custom' ? (
              <TouchableOpacity style={styles.editFood} accessibilityRole="button" accessibilityLabel="Edit food" onPress={() => router.push({ pathname: '/custom-food', params: { food_id: food.id, meal_slot, date } })}>
                <Text style={{ fontSize: 15, color: colors.tint }}>Edit food</Text>
              </TouchableOpacity>
            ) : null}
          </View>

          {/* Form group card */}
          <SectionHeading title="SERVING" colors={colors} />
          <View style={[styles.formCard, { backgroundColor: colors.cardBackground }]}>
            <Pressable
              onPress={() => amountRef.current?.focus()}
              style={[styles.formRow, styles.formRowDivider, { borderBottomColor: colors.separator }]}
              accessible={false}
            >
              <View style={styles.amountLabelCol}>
                <Text style={[styles.formRowLabel, { color: colors.text }]}>Amount</Text>
              </View>
              <TextInput
                ref={amountRef}
                value={servingAmount}
                onChangeText={(t) => {
                  setServingAmount(t);
                  setSaveError(null);
                }}
                onFocus={() => setAmountFocused(true)}
                onBlur={() => setAmountFocused(false)}
                keyboardType="decimal-pad"
                inputAccessoryViewID={AMOUNT_ACCESSORY_ID}
                selectTextOnFocus
                placeholder="0"
                placeholderTextColor={colors.icon}
                accessibilityLabel={`Amount, in ${unitSpoken}`}
                accessibilityHint={validation.error ?? undefined}
                style={[
                  styles.amountInput,
                  {
                    borderColor: validation.error ? colors.danger : amountFocused ? colors.tint : colors.fieldBorder,
                    color: colors.tint,
                  },
                ]}
              />
            </Pressable>
            {validation.error ? <Text accessibilityRole="alert" accessibilityLiveRegion="polite" style={[styles.amountHint, { color: colors.text, paddingVertical: 8 }]}>{validation.error}</Text> : null}
            <FormRow
              label="Serving Size"
              value={unitLabel}
              onPress={() => setShowUnitPicker(true)}
              accessibilityLabel={`Serving size, ${unitLabel}. Change unit`}
              divider
              chevron
              colors={colors}
            />
            <FormRow
              label="Time"
              value={formatTime(loggedTime)}
              onPress={() => setShowTimePicker(true)}
              accessibilityLabel={`Time, ${formatTime(loggedTime)}. Change time`}
              colors={colors}
            />
          </View>

          {/* Ring + Macros */}
          <SectionHeading title="NUTRITION" colors={colors} />
          <View style={[styles.nutritionCard, { backgroundColor: colors.cardBackground }, expandedMacro && styles.cardOpenBottom]}>
            <View style={styles.ringMacroRow}>
              <NutritionRing cal={cal} protein={pro} carbs={carb} fat={fat} colors={colors} />
              <View style={styles.ringMacroRight}>
                {macros.map((m) => {
                  const active = expandedMacro === m.key;
                  return (
                    <TouchableOpacity
                      key={m.key}
                      style={[styles.macroCol, { backgroundColor: active ? m.color + '18' : colors.cardSecondary }]}
                      onPress={() => setExpandedMacro((prev) => (prev === m.key ? null : m.key))}
                      activeOpacity={0.7}
                      accessibilityRole="button"
                      accessibilityLabel={`${m.label}, ${m.value} grams`}
                      accessibilityHint={active ? 'Hides details' : 'Shows details'}
                      accessibilityState={{ expanded: active }}
                    >
                      <View style={[styles.macroDot, { backgroundColor: m.color }]} />
                      <Text style={[styles.macroGrams, { color: colors.text }]} numberOfLines={1} adjustsFontSizeToFit>{m.value}g</Text>
                      <View style={styles.macroLabelRow}>
                        <Text style={[styles.macroColLabel, { color: colors.icon }]}>{m.label}</Text>
                        <Chevron size={10} color={colors.icon} up={active} />
                      </View>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </View>
            {per100 ? (
              <Text style={[styles.per100, { color: colors.icon, borderTopColor: colors.separator }]}>{per100}</Text>
            ) : null}
          </View>

          {expandedMacro && (
            <MacroDetailPanel
              macro={expandedMacro}
              pro={pro}
              carb={carb}
              fat={fat}
              nutrients={nutrients}
              proteinGoal={proteinGoal}
              carbGoal={carbGoal}
              fatGoal={fatGoal}
              onClose={() => setExpandedMacro(null)}
              colors={colors}
            />
          )}

          {/* Targets: what's eaten so far, plus this food */}
          {calorieGoal !== null && (
            <>
              <SectionHeading title="TARGETS" colors={colors} />
              <View style={[styles.targetsCard, { backgroundColor: colors.cardBackground }]}>
                <TargetRow
                  label="Energy"
                  eaten={dailyCalories}
                  add={cal}
                  goal={calorieGoal}
                  unit="cal"
                  color={colors.tint}
                  tint={tints.energy}
                  colors={colors}
                />
                {proteinGoal !== null && (
                  <TargetRow
                    label="Protein"
                    eaten={dailyProtein}
                    add={pro}
                    goal={proteinGoal}
                    unit="g"
                    color={MacroColors.protein}
                    tint={tints.protein}
                    colors={colors}
                  />
                )}
                {carbGoal !== null && (
                  <TargetRow
                    label="Carbs"
                    eaten={dailyCarbsState}
                    add={carb}
                    goal={carbGoal}
                    unit="g"
                    color={MacroColors.carbs}
                    tint={tints.carbs}
                    colors={colors}
                  />
                )}
                {fatGoal !== null && (
                  <TargetRow
                    label="Fat"
                    eaten={dailyFat}
                    add={fat}
                    goal={fatGoal}
                    unit="g"
                    color={MacroColors.fat}
                    tint={tints.fat}
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
            {NUTRIENTS.filter(({ id }) => nutrients[id] !== null).map(({ id, label, unit }) => (
              <MicroExpandRow key={id} label={label} value={nutrients[id]} unit={unit === 'ug' ? 'µg' : unit} colors={colors} />
            ))}
            {NUTRIENTS.every(({ id }) => nutrients[id] === null) ? <Text style={{ fontSize: 13, color: colors.icon }}>No nutrient details for this food.</Text> : null}
          </ExpandSection>
        </ScrollView>
      )}

      {/* The decimal pad has no return key, so it gets a Done bar */}
      {Platform.OS === 'ios' ? (
        <InputAccessoryView nativeID={AMOUNT_ACCESSORY_ID}>
          <View style={[styles.accessoryBar, { backgroundColor: colors.cardBackground, borderTopColor: colors.separator }]}>
            <TouchableOpacity onPress={Keyboard.dismiss} style={styles.accessoryAction} hitSlop={8} accessibilityRole="button">
              <Text style={[styles.accessoryDone, { color: colors.tint }]}>Done</Text>
            </TouchableOpacity>
          </View>
        </InputAccessoryView>
      ) : null}

      {food ? (
        <UnitPickerModal
          visible={showUnitPicker}
          servingUnit={servingUnit}
          baseGrams={baseGrams}
          foodServingUnits={food.serving_units}
          onSelectUnit={(unit) => {
            handleUnitChange(unit);
            setShowUnitPicker(false);
          }}
          onClose={() => setShowUnitPicker(false)}
          colors={colors}
        />
      ) : null}

      <TimePickerSheet
        visible={showTimePicker}
        value={loggedTime}
        onChange={setLoggedTime}
        onClose={() => setShowTimePicker(false)}
        colors={colors}
      />
    </SafeAreaView>
  );
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function SectionHeading({ title, colors }: { title: string; colors: Pick<typeof Colors.light, 'icon'> }) {
  return (
    <Text style={[styles.sectionHeading, { color: colors.icon }]}>{title}</Text>
  );
}

function Chevron({ size, color, up }: { size: number; color: string; up?: boolean }) {
  return (
    <View style={{ transform: [{ rotate: up ? '180deg' : '0deg' }] }}>
      <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
        <Polyline
          points="6 9 12 15 18 9"
          stroke={color}
          strokeWidth={2.5}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </Svg>
    </View>
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
  nutrients: NutrientValues,
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
  const rows: MacroDetailRow[] = [
    { key: 'total', label: macro === 'carbs' ? 'Carbs (Total)' : 'Fats (Total)', value: macro === 'carbs' ? carb : fat, goal: macro === 'carbs' ? carbGoal : fatGoal, unit: 'g' },
    ...NUTRIENTS.filter((nutrient) => 'macroParent' in nutrient && nutrient.macroParent === macro).map(({ id, label, unit }) => ({ key: id, label, value: nutrients[id], goal: null, unit: unit === 'ug' ? 'µg' : unit, indent: 1 })),
  ];
  if (macro === 'carbs' && nutrients.fiber !== null) rows.push({ key: 'net', label: 'Carbs (Net)', value: round1(carb - nutrients.fiber), goal: null, unit: 'g' });
  return rows;
}

function MacroDetailPanel({
  macro, pro, carb, fat, nutrients,
  proteinGoal, carbGoal, fatGoal, onClose, colors,
}: {
  macro: 'protein' | 'carbs' | 'fat';
  pro: number;
  carb: number;
  fat: number;
  nutrients: NutrientValues;
  proteinGoal: number | null;
  carbGoal: number | null;
  fatGoal: number | null;
  onClose: () => void;
  colors: Pick<typeof Colors.light, 'cardBackground' | 'icon' | 'separator' | 'text' | 'track'>;
}) {
  const rows = buildMacroRows(macro, pro, carb, fat, nutrients, proteinGoal, carbGoal, fatGoal);
  // Rows with no data are hidden; a single note says so
  const visibleRows = rows.filter((r) => r.value != null);
  const hiddenCount = rows.length - visibleRows.length;
  const color = macro === 'protein' ? MacroColors.protein : macro === 'carbs' ? MacroColors.carbs : MacroColors.fat;
  const title = macro === 'protein' ? 'Protein' : macro === 'carbs' ? 'Carbs' : 'Fats';
  const hiddenNote = macro === 'protein'
    ? 'No amino acid data for this food'
    : 'Details with no data for this food are hidden';

  return (
    <View style={[styles.macroDetailCard, { backgroundColor: colors.cardBackground, borderTopColor: colors.separator }]}>
      <View style={styles.macroDetailHeader}>
        <Text style={[styles.macroDetailTitle, { color: colors.text }]}>{title}</Text>
        <TouchableOpacity
          onPress={onClose}
          hitSlop={14}
          accessibilityRole="button"
          accessibilityLabel={`Close ${title.toLowerCase()} details`}
        >
          <Text style={{ color: colors.icon, fontSize: 16 }}>✕</Text>
        </TouchableOpacity>
      </View>
      {visibleRows.map((row) => (
        <DetailRow key={row.key} row={row} color={color} colors={colors} />
      ))}
      {hiddenCount > 0 ? (
        <Text style={[styles.macroDetailNote, { color: colors.icon }]}>{hiddenNote}</Text>
      ) : null}
    </View>
  );
}

function DetailRow({
  row, color, colors,
}: {
  row: MacroDetailRow;
  color: string;
  colors: Pick<typeof Colors.light, 'icon' | 'text' | 'track'>;
}) {
  const hasValue = row.value != null;
  const indent = row.indent ?? 0;
  const pct = hasValue && row.goal
    ? Math.min((row.value as number) / Math.max(row.goal, 1), 1)
    : 0;
  const valueText = !hasValue
    ? 'No Data'
    : row.goal
    ? `${formatNutrientValue(row.value!)} / ${row.goal} ${row.unit ?? 'g'}`
    : `${formatNutrientValue(row.value!)} ${row.unit ?? 'g'}`;
  const pctText = hasValue && row.goal ? `${Math.round(pct * 100)}%` : '0%';

  return (
    <View style={[styles.detailRow, { paddingLeft: 16 + indent * 16 }]}>
      <View style={styles.detailRowTop}>
        <View style={{ flex: 1, flexDirection: 'row', alignItems: 'baseline', flexWrap: 'wrap' }}>
          <Text style={[styles.detailRowLabel, { color: colors.text, fontWeight: indent === 0 ? '700' : '600' }]}>
            {row.label}
          </Text>
          <Text style={[styles.detailRowValueInline, { color: colors.icon }]}>
            {'  '}{valueText}
          </Text>
        </View>
        <Text style={[styles.detailRowPct, { color: colors.icon }]}>{pctText}</Text>
      </View>
      {hasValue && row.goal ? (
        <View style={[styles.progressBar, { backgroundColor: colors.track }]}>
          <View style={[styles.progressFill, { width: percent(pct), backgroundColor: color }]} />
        </View>
      ) : null}
    </View>
  );
}

function FormRow({
  label, value, onPress, accessibilityLabel, divider, chevron, colors,
}: {
  label: string;
  value: string;
  onPress: () => void;
  accessibilityLabel: string;
  divider?: boolean;
  chevron?: boolean;
  colors: Pick<typeof Colors.light, 'icon' | 'separator' | 'text' | 'tint'>;
}) {
  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.7}
      style={[styles.formRow, divider && [styles.formRowDivider, { borderBottomColor: colors.separator }]]}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
    >
      <Text style={[styles.formRowLabel, { color: colors.text }]}>{label}</Text>
      <View style={styles.formRowValue}>
        <Text style={[styles.formRowValueText, { color: colors.tint }]}>{value}</Text>
        {chevron && <Text style={{ fontSize: 13, color: colors.icon }}>▾</Text>}
      </View>
    </TouchableOpacity>
  );
}

function NutritionRing({
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

function ExpandSection({
  title, expanded, onToggle, colors, children,
}: {
  title: string;
  expanded: boolean;
  onToggle: () => void;
  colors: Pick<typeof Colors.light, 'cardBackground' | 'icon' | 'separator' | 'text'>;
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
        <Chevron size={14} color={colors.icon} up={expanded} />
      </TouchableOpacity>
      {expanded && (
        <View style={[styles.expandBody, { borderTopColor: colors.separator }]}>
          {children}
        </View>
      )}
    </View>
  );
}

// Already eaten in the macro color, then this food as a pale segment
function TargetRow({
  label, eaten, add, goal, unit, color, tint, colors,
}: {
  label: string;
  eaten: number;
  add: number;
  goal: number;
  unit: string;
  color: string;
  tint: string;
  colors: Pick<typeof Colors.light, 'text' | 'track'>;
}) {
  const g = Math.max(goal, 1);
  const eatenFrac = Math.min(eaten / g, 1);
  const addFrac = Math.max(Math.min((eaten + add) / g, 1) - eatenFrac, 0);
  const spokenUnit = unit === 'cal' ? 'calories' : 'grams';
  return (
    <View
      style={styles.targetBlock}
      accessible
      accessibilityLabel={`${label}, ${formatNum(eaten + add)} of ${formatNum(goal)} ${spokenUnit}`}
    >
      <View style={styles.targetTop}>
        <Text style={[styles.targetLabel, { color: colors.text }]}>{label}</Text>
        <View style={styles.targetNums}>
          <Text style={[styles.targetNum, styles.targetEaten, { color: colors.text }]}>{formatNum(eaten + add)}</Text>
          <Text style={[styles.targetNum, { color: colors.text }]}>/</Text>
          <Text style={[styles.targetNum, styles.targetGoal, { color: colors.text }]}>{formatNum(goal)}</Text>
          <Text style={[styles.targetNum, styles.targetUnit, { color: colors.text }]}>{unit}</Text>
        </View>
      </View>
      <View style={[styles.targetTrack, { backgroundColor: colors.track }]}>
        <View style={{ width: percent(eatenFrac), backgroundColor: color }} />
        <View style={{ width: percent(addFrac), backgroundColor: tint }} />
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
  colors: Pick<typeof Colors.light, 'icon' | 'text'>;
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
        {hasValue ? `${formatNutrientValue(value!)} ${unit}` : 'No Data'}
      </Text>
    </View>
  );
}

function UnitPickerModal({
  visible, servingUnit, baseGrams, foodServingUnits,
  onSelectUnit, onClose, colors,
}: {
  visible: boolean;
  servingUnit: ServingUnit;
  baseGrams: number | null;
  foodServingUnits: string;
  onSelectUnit: (unit: ServingUnit) => void;
  onClose: () => void;
  colors: Pick<typeof Colors.light, 'cardBackground' | 'icon' | 'separator' | 'text' | 'tint'>;
}) {
  const { bottom } = useSafeAreaInsets();

  type UnitOption = { unit: ServingUnit; label: string; sublabel: string };
  const unitOptions: UnitOption[] = [
    { unit: 'default', label: foodServingUnits, sublabel: 'Default serving' },
    ...(baseGrams
      ? [
          { unit: 'grams' as ServingUnit, label: 'Grams', sublabel: 'Weight in g' },
          { unit: 'oz' as ServingUnit, label: 'Ounces', sublabel: 'Weight in oz' },
        ]
      : []),
  ];

  const overlay = useThemeColor({}, 'overlay');
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={[styles.modalOverlay, { backgroundColor: overlay }]}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} accessibilityLabel="Close serving size" />
        <View style={[styles.pickerSheet, { backgroundColor: colors.cardBackground, paddingBottom: 24 + bottom }]}>
          <Text style={[styles.pickerTitle, { color: colors.text }]}>Serving Size</Text>

          {unitOptions.map(({ unit, label, sublabel }, i) => {
            const isActive = servingUnit === unit;
            const isLast = i === unitOptions.length - 1;
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
                accessibilityRole="button"
                accessibilityState={{ selected: isActive }}
              >
                <View style={styles.unitOptionText}>
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
            <Text style={[styles.unitNote, { color: colors.icon }]}>
              Per 100 g values show under Nutrition, so they never change what you log.
            </Text>
          ) : null}
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
    paddingVertical: 6,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  headerSide: { width: 72, minHeight: 44, justifyContent: 'center' },
  headerSideRight: { alignItems: 'flex-end' },
  headerBtnText: { fontSize: 16 },
  title: { fontSize: 17, fontWeight: '600' },
  logPill: {
    minWidth: 64,
    minHeight: 34,
    paddingHorizontal: 20,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  logPillText: { fontSize: 15, fontWeight: '600' },

  errorBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginHorizontal: 16,
    marginTop: 12,
    paddingVertical: 10,
    paddingLeft: 14,
    paddingRight: 12,
    borderRadius: 12,
  },
  errorText: { flex: 1, fontSize: 13, lineHeight: 18 },
  errorRetry: { fontSize: 13, fontWeight: '600' },
  editRetry: { minHeight: 44, minWidth: 44, justifyContent: 'center' },

  failWrap: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingHorizontal: 40,
    paddingBottom: 140,
  },
  failIcon: {
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 8,
  },
  failTitle: { fontSize: 17, fontWeight: '600', textAlign: 'center' },
  failBody: { fontSize: 14, lineHeight: 21, textAlign: 'center' },
  failBtn: {
    marginTop: 12,
    minHeight: 44,
    paddingHorizontal: 24,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  failBtnText: { fontSize: 15, fontWeight: '600' },

  skeletonCard: { gap: 10 },
  skeletonBar: { borderRadius: 4 },
  skeletonHeading: { height: 10, borderRadius: 4, marginTop: 14, marginBottom: 6, marginLeft: 4 },
  skeletonBlock: { borderRadius: 18 },
  skeletonLoading: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  skeletonText: { fontSize: 13 },

  scroll: { padding: 16, paddingBottom: 32, gap: 8 },

  sectionHeading: {
    fontSize: 12,
    fontWeight: '600',
    letterSpacing: 0.5,
    marginTop: 8,
    marginBottom: 2,
    marginLeft: 4,
  },

  macroDetailCard: {
    marginTop: -8,
    borderRadius: 18,
    borderTopLeftRadius: 0,
    borderTopRightRadius: 0,
    borderTopWidth: StyleSheet.hairlineWidth,
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
  macroDetailNote: { fontSize: 12, paddingHorizontal: 16, marginTop: 8 },
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

  editFood: { minHeight: 44, justifyContent: 'center', alignSelf: 'flex-start' },
  foodCard: { borderRadius: 18, padding: 16 },
  foodName: { fontSize: 17, fontWeight: '600', marginBottom: 2, lineHeight: 24 },
  foodBrand: { fontSize: 14, marginBottom: 4 },

  // Form card
  formCard: { borderRadius: 18, paddingHorizontal: 16, paddingVertical: 4 },
  formRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 14,
  },
  formRowDivider: { borderBottomWidth: StyleSheet.hairlineWidth },
  formRowLabel: { fontSize: 15, fontWeight: '500' },
  formRowValue: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  formRowValueText: { fontSize: 17, fontWeight: '600', textAlign: 'right' },
  amountLabelCol: { gap: 2 },
  amountHint: { fontSize: 12 },
  amountInput: {
    minWidth: 72,
    borderWidth: 1.5,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 8,
    fontSize: 17,
    fontWeight: '600',
    textAlign: 'right',
    fontVariant: ['tabular-nums'],
  },
  accessoryAction: { minHeight: 44, minWidth: 44, justifyContent: 'center', alignItems: 'center' },
  accessoryBar: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    alignItems: 'center',
    minHeight: 44,
    paddingHorizontal: 16,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  accessoryDone: { fontSize: 16, fontWeight: '600' },

  // Ring + macros
  nutritionCard: { borderRadius: 18, padding: 16, gap: 12 },
  cardOpenBottom: {
    borderBottomLeftRadius: 0,
    borderBottomRightRadius: 0,
  },
  ringMacroRow: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  ringMacroRight: {
    flex: 1,
    flexDirection: 'row',
    justifyContent: 'space-around',
    gap: 6,
  },
  macroCol: { alignItems: 'center', gap: 2, flex: 1, minWidth: 0, borderRadius: 10, padding: 6 },
  macroDot: { width: 8, height: 8, borderRadius: 4 },
  macroGrams: { fontSize: 16, fontWeight: '700', fontVariant: ['tabular-nums'] },
  macroLabelRow: { flexDirection: 'row', alignItems: 'center', gap: 2 },
  macroColLabel: { fontSize: 11 },
  per100: {
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingTop: 10,
    fontSize: 12,
    fontVariant: ['tabular-nums'],
  },

  // Targets
  targetsCard: { borderRadius: 18, padding: 16, gap: 12 },
  targetBlock: { gap: 6 },
  targetTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline' },
  targetLabel: { fontSize: 12, fontWeight: '600' },
  targetNums: { flexDirection: 'row', gap: 4 },
  targetNum: { fontSize: 12, fontVariant: ['tabular-nums'] },
  targetEaten: { minWidth: 36, textAlign: 'right' },
  targetGoal: { minWidth: 32, textAlign: 'right' },
  targetUnit: { minWidth: 22 },
  targetTrack: { flexDirection: 'row', height: 8, borderRadius: 4, overflow: 'hidden' },

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

  // Detail progress bars
  progressBar: { height: 4, borderRadius: 2 },
  progressFill: { height: 4, borderRadius: 2 },

  // Micro expand rows
  microExpandRow: {
    gap: 12,
    flexWrap: 'wrap',
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },

  // Modals
  modalOverlay: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  pickerSheet: {
    padding: 24,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
  },
  pickerTitle: { fontSize: 16, fontWeight: '600', textAlign: 'center', marginBottom: 12 },

  // Unit picker
  unitOption: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  unitOptionLast: { borderBottomWidth: 0 },
  unitOptionText: { flexShrink: 1 },
  unitOptionLabel: { fontSize: 16, fontWeight: '500' },
  unitOptionSub: { fontSize: 12, marginTop: 1 },
  unitOptionCheck: { fontSize: 18, fontWeight: '600' },
  unitNote: { fontSize: 12, lineHeight: 17, marginTop: 14 },
});
