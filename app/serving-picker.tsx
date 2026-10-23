import { foodSourceLabel } from '@/lib/food-source';
import { useState, useEffect, useRef, useCallback } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  ScrollView,
  Pressable,
  TextInput,
  InputAccessoryView,
  Keyboard,
  Platform,
} from 'react-native';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import Svg, { Circle, Line } from 'react-native-svg';
import * as Haptics from 'expo-haptics';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { MacroColors, TargetTints } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { useThemeColor } from '@/hooks/use-theme-color';
import { TimePickerSheet } from '@/components/time-picker-sheet';
import { Chevron } from '@/components/serving-picker/Chevron';
import { ExpandSection } from '@/components/serving-picker/ExpandSection';
import { FormRow, formRowStyles } from '@/components/serving-picker/FormRow';
import { MacroDetailPanel } from '@/components/serving-picker/MacroDetailPanel';
import { MicroExpandRow } from '@/components/serving-picker/MicroExpandRow';
import { NutritionRing } from '@/components/serving-picker/NutritionRing';
import { SectionHeading } from '@/components/serving-picker/SectionHeading';
import { TargetRow } from '@/components/serving-picker/TargetRow';
import { UnitPickerModal } from '@/components/serving-picker/UnitPickerModal';
import { round1 } from '@/components/serving-picker/format';
import { useMealDefinitions } from '@/hooks/useMealDefinitions';
import { useServingDayTotals } from '@/hooks/useServingDayTotals';
import {
  getFoodById,
  addFoodLog,
  updateFoodLog,
  getFoodLogsWithFoodByDate,
  cacheRemoteFood,
  hasAnyMicros,
  ensureMealSlotStatus,
} from '@/lib/database';
import { NUTRIENTS, scaleNutrients } from '@/lib/nutrients';
import { isSlotEaten } from '@/lib/nutrition-totals';
import { getFullBrandedFood } from '@/lib/food-service';
import { parseBaseGrams } from '@/lib/serving-units';
import { validateServing, parseFoodDecimal, servingMultiplier, formatServingAmount, validBaseGrams, type ServingUnit } from '@/lib/food-validation';
import { getUSDAFoodById } from '@/lib/foods-db';
import type { Food, MealSlot } from '@/lib/types';

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

export default function ServingPickerScreen() {
  const { food_id, meal_slot, date, log_id, initial_amount, origin } = useLocalSearchParams<{
    food_id: string;
    meal_slot: string;
    date: string;
    log_id?: string;
    initial_amount?: string;
    origin?: string;
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

  const {
    dailyCalories,
    dailyProtein,
    dailyCarbsState,
    dailyFat,
    calorieGoal,
    proteinGoal,
    carbGoal,
    fatGoal,
    confirmations,
    defaultStatus,
  } = useServingDayTotals(date, log_id);

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
      // From search the picker sits above it: close both so logging lands on Nutrition
      if (origin === 'search') router.dismiss(2);
      else router.back();
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
          accessibilityLabel={isEdit ? 'Cancel' : origin === 'search' ? 'Back to search' : 'Back'}
        >
          {isEdit ? (
            <Text style={[styles.headerBtnText, { color: colors.tint }]}>Cancel</Text>
          ) : (
            <MaterialIcons name="chevron-left" size={28} color={colors.tint} style={styles.backIcon} />
          )}
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
                Log
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
                {foodSourceLabel(food.source) ?? 'Generic'}
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
              style={[formRowStyles.formRow, formRowStyles.formRowDivider, { borderBottomColor: colors.separator }]}
              accessible={false}
            >
              <View style={styles.amountLabelCol}>
                <Text style={[formRowStyles.formRowLabel, { color: colors.text }]}>Amount</Text>
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
  backIcon: { marginLeft: -6 },
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

  editFood: { minHeight: 44, justifyContent: 'center', alignSelf: 'flex-start' },
  foodCard: { borderRadius: 18, padding: 16 },
  foodName: { fontSize: 17, fontWeight: '600', marginBottom: 2, lineHeight: 24 },
  foodBrand: { fontSize: 14, marginBottom: 4 },

  // Form card
  formCard: { borderRadius: 18, paddingHorizontal: 16, paddingVertical: 4 },
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
});
