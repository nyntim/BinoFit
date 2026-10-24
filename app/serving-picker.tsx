import { foodSourceLabel } from '@/lib/food-source';
import { useState, useEffect, useRef, useCallback } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  Pressable,
  TextInput,
  InputAccessoryView,
  Keyboard,
  Platform,
} from 'react-native';
import * as Haptics from 'expo-haptics';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Fonts, MacroColors, TargetTints } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { useThemeColor } from '@/hooks/use-theme-color';
import { TimePickerSheet } from '@/components/time-picker-sheet';
import { ThemedText } from '@/components/themed-text';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Chip } from '@/components/ui/Chip';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { Stepper } from '@/components/ui/Stepper';
import { Tag } from '@/components/ui/Tag';
import { ExpandSection } from '@/components/serving-picker/ExpandSection';
import { MacroDetailPanel } from '@/components/serving-picker/MacroDetailPanel';
import { MicroExpandRow } from '@/components/serving-picker/MicroExpandRow';
import { NutritionRing } from '@/components/serving-picker/NutritionRing';
import { TargetRow } from '@/components/serving-picker/TargetRow';
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
import { isSlotEaten, newFoodStatus } from '@/lib/nutrition-totals';
import { getFullBrandedFood } from '@/lib/food-service';
import { parseBaseGrams } from '@/lib/serving-units';
import { validateServing, parseFoodDecimal, servingMultiplier, formatServingAmount, stepServingAmount, validBaseGrams, GRAMS_PER_OUNCE, type ServingUnit } from '@/lib/food-validation';
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

function Banner({ message, actionLabel, actionAccessibilityLabel, actionDisabled, onAction, polite = true }: {
  message: string; actionLabel: string; actionAccessibilityLabel?: string; actionDisabled?: boolean; onAction: () => void; polite?: boolean;
}) {
  const danger = useThemeColor({}, 'danger');
  return (
    <Card padding="compact" style={styles.banner} accessibilityRole="alert" accessibilityLiveRegion={polite ? 'polite' : undefined}>
      <IconSymbol name="exclamationmark.circle" size={18} color={danger} />
      <ThemedText type="label" style={styles.bannerText}>{message}</ThemedText>
      <Button label={actionLabel} variant="ghost" size="sm" accessibilityLabel={actionAccessibilityLabel} disabled={actionDisabled} onPress={onAction} />
    </Card>
  );
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
  const icon = useThemeColor({}, 'icon');
  const separator = useThemeColor({}, 'separator');
  const text = useThemeColor({}, 'text');
  const tint = useThemeColor({}, 'tint');
  const timeColors = { background, cardBackground, text, icon, tint };
  const tints = TargetTints[cs ?? 'light'];

  const [food, setFood] = useState<Food | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);
  const [loadAttempt, setLoadAttempt] = useState(0);
  const [servingAmount, setServingAmount] = useState(initial_amount ?? '1');
  const [servingUnit, setServingUnit] = useState<ServingUnit>('default');
  const [loggedTime, setLoggedTime] = useState<Date>(new Date());
  const [showTimePicker, setShowTimePicker] = useState(false);
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
          return `Per 100 g: ${Math.round(food.calories * s)} cal · P ${round1(food.protein * s)} · C ${round1(food.carbs * s)} · F ${round1(food.fat * s)}`;
        })()
      : null;

  const canLog = Boolean(food && meal_slot && date && mealsLoaded) && validation.valid && !editLoading && !definitionRefreshFailed && !definitionRefreshing && !saving;

  const handleUnitChange = (unit: ServingUnit) => {
    if (unit === servingUnit || !baseGrams) return;
    const parsed = parseFoodDecimal(servingAmount, 'required');
    if (validation.valid && parsed.valid && parsed.value !== null) {
      const canonical = servingMultiplier(parsed.value, servingUnit, baseGrams);
      const amount = unit === 'default' ? canonical : unit === 'grams' ? canonical * baseGrams : canonical * baseGrams / GRAMS_PER_OUNCE;
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

  const unitSpoken = servingUnit === 'default' ? 'servings' : servingUnit === 'grams' ? 'grams' : 'ounces';


  const macros = [
    { key: 'protein' as const, label: 'Protein', value: pro, color: MacroColors.protein },
    { key: 'carbs' as const, label: 'Carbs', value: carb, color: MacroColors.carbs },
    { key: 'fat' as const, label: 'Fat', value: fat, color: MacroColors.fat },
  ];

  const slot = meal_slot as MealSlot;
  const statusEaten = isEdit ? isSlotEaten(confirmations, slot) : newFoodStatus(confirmations, slot, defaultStatus) === 'eaten';
  const sourceLabel = food ? foodSourceLabel(food.source) : null;
  const unitOptions: { unit: ServingUnit; label: string; a11y?: string }[] = food
    ? [
        { unit: 'default', label: food.serving_units },
        ...(baseGrams ? [{ unit: 'grams' as ServingUnit, label: 'g', a11y: 'Grams' }, { unit: 'oz' as ServingUnit, label: 'oz', a11y: 'Ounces' }] : []),
      ]
    : [];
  const stepDown = stepServingAmount(servingAmount, servingUnit, -1);
  const step = (direction: 1 | -1) => {
    const next = stepServingAmount(servingAmount, servingUnit, direction);
    if (next === null) return;
    setServingAmount(next);
    setSaveError(null);
  };
  return (
    <SafeAreaView style={[styles.container, { backgroundColor: background }]}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity
          onPress={() => router.back()}
          style={styles.headerSide}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel={isEdit ? 'Cancel' : origin === 'search' ? 'Back to search' : 'Back'}
        >
          {isEdit ? (
            <ThemedText style={[styles.headerBtnText, { color: tint }]}>Cancel</ThemedText>
          ) : (
            <View style={styles.back}>
              <IconSymbol name="chevron.left" size={22} color={tint} />
              <ThemedText style={[styles.headerBtnText, { color: tint }]}>{origin === 'search' ? 'Search' : 'Back'}</ThemedText>
            </View>
          )}
        </TouchableOpacity>
        <ThemedText type="title" style={styles.title} numberOfLines={1} accessibilityRole="header">
          {isEdit ? 'Edit serving' : slotLabel}
        </ThemedText>
        <View style={[styles.headerSide, styles.headerSideRight]}>
          <Button
            label="Log"
            size="sm"
            accessibilityLabel={isEdit ? 'Save changes' : `Log to ${slotLabel || "meal"}`}
            disabled={!canLog}
            loading={saving}
            onPress={handleSave}
          />
        </View>
      </View>

      {saveError ? <Banner message={saveError} actionLabel="Try again" onAction={handleSave} actionDisabled={!canLog} /> : null}
      {definitionRefreshFailed ? <Banner message="Couldn’t refresh this food." actionLabel="Try again" onAction={retryLoad} polite={false} /> : null}
      {editLoadFailed ? <Banner message="Couldn't load this entry." actionLabel="Try again" actionAccessibilityLabel="Retry loading entry" onAction={retryLoad} /> : null}

      {!food && loadFailed ? (
        <View style={styles.failWrap}>
          <View style={[styles.failIcon, { backgroundColor: cardBackground }]}>
            <IconSymbol name="magnifyingglass" size={26} color={icon} />
          </View>
          <ThemedText type="title" style={styles.center}>{"Couldn't load this food"}</ThemedText>
          <ThemedText type="body" style={[styles.center, { color: icon }]}>Check your connection, then try again.</ThemedText>
          <Button label="Try again" onPress={retryLoad} />
        </View>
      ) : !food ? (
        <View style={styles.scroll} accessibilityLabel="Loading food" accessibilityState={{ busy: true }}>
          <View style={[styles.skeletonBar, { width: '70%', height: 26, backgroundColor: cardSecondary }]} />
          <View style={[styles.skeletonBar, { width: '35%', height: 14, backgroundColor: cardSecondary }]} />
          <View style={[styles.skeletonBlock, { height: 152, backgroundColor: cardBackground }]} />
          <View style={[styles.skeletonBlock, { height: 112, backgroundColor: cardBackground }]}>
            <ThemedText type="caption">Loading food</ThemedText>
          </View>
        </View>
      ) : (
        <ScrollView
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
          contentContainerStyle={styles.scroll}
        >
          {/* Food identity */}
          <View style={styles.identity}>
            <ThemedText type="heading" style={styles.foodName} numberOfLines={2}>{food.name}</ThemedText>
            <View style={styles.metaRow}>
              {sourceLabel ? <Tag label={sourceLabel} /> : null}
              <ThemedText type="caption">{food.brand ? food.brand : 'Generic'}</ThemedText>
              {food.source === 'custom' ? (
                <Button
                  label="Edit food"
                  variant="ghost"
                  size="sm"
                  accessibilityLabel="Edit food"
                  onPress={() => router.push({ pathname: '/custom-food', params: { food_id: food.id, meal_slot, date } })}
                />
              ) : null}
            </View>
          </View>

          {/* Serving */}
          <Card padding="compact" style={styles.cardGap}>
            <Pressable onPress={() => amountRef.current?.focus()} style={styles.amountRow} accessible={false}>
              <ThemedText type="label" style={styles.rowLabel}>Amount</ThemedText>
              <Stepper
                decrementLabel="Less"
                incrementLabel="More"
                decrementDisabled={stepDown === null}
                onDecrement={() => step(-1)}
                onIncrement={() => step(1)}
              >
                <TextInput
                  ref={amountRef}
                  value={servingAmount}
                  onChangeText={(t) => {
                    setServingAmount(t);
                    setSaveError(null);
                  }}
                  keyboardType="decimal-pad"
                  inputAccessoryViewID={AMOUNT_ACCESSORY_ID}
                  selectTextOnFocus
                  placeholder="0"
                  placeholderTextColor={icon}
                  accessibilityLabel={`Amount, in ${unitSpoken}`}
                  accessibilityHint={validation.error ?? undefined}
                  style={[styles.amountInput, { color: validation.error ? danger : text }]}
                />
              </Stepper>
            </Pressable>
            {validation.error ? <ThemedText type="label" accessibilityRole="alert" accessibilityLiveRegion="polite" style={{ color: danger }}>{validation.error}</ThemedText> : null}
            <View style={styles.chips} accessibilityRole="radiogroup" accessibilityLabel="Serving size">
              {unitOptions.map(({ unit, label, a11y }) => (
                <Chip
                  key={unit}
                  role="radio"
                  label={label}
                  accessibilityLabel={a11y}
                  selected={servingUnit === unit}
                  onPress={() => handleUnitChange(unit)}
                />
              ))}
            </View>
            <View style={[styles.separator, { backgroundColor: separator }]} />
            <View style={styles.settingRow}>
              <ThemedText type="body">Time</ThemedText>
              <Button
                label={formatTime(loggedTime)}
                variant="soft"
                size="sm"
                accessibilityLabel={`Time, ${formatTime(loggedTime)}. Change time`}
                onPress={() => setShowTimePicker(true)}
              />
            </View>
            <View style={styles.settingRow}>
              <ThemedText type="body">Status</ThemedText>
              <Tag label={statusEaten ? 'Eaten' : 'Planned'} tone={statusEaten ? 'tint' : 'neutral'} />
            </View>
          </Card>

          {/* Ring + Macros */}
          <Card padding="compact" style={styles.cardGap}>
            <View style={styles.ringMacroRow}>
              <NutritionRing cal={cal} protein={pro} carbs={carb} fat={fat} />
              <View style={styles.ringMacroRight}>
                {macros.map((m) => {
                  const active = expandedMacro === m.key;
                  return (
                    <TouchableOpacity
                      key={m.key}
                      style={[styles.macroCol, { backgroundColor: cardSecondary }, active && { borderColor: m.color, borderWidth: 1.5 }]}
                      onPress={() => setExpandedMacro((prev) => (prev === m.key ? null : m.key))}
                      activeOpacity={0.7}
                      accessibilityRole="button"
                      accessibilityLabel={`${m.label}, ${m.value} grams`}
                      accessibilityHint={active ? 'Hides details' : 'Shows details'}
                      accessibilityState={{ expanded: active }}
                    >
                      <View style={[styles.macroDot, { backgroundColor: m.color }]} />
                      <ThemedText type="body" style={styles.macroGrams} numberOfLines={1} adjustsFontSizeToFit>{`${m.value} g`}</ThemedText>
                      <ThemedText type="caption">{m.label}</ThemedText>
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
                nutrients={nutrients}
                proteinGoal={proteinGoal}
                carbGoal={carbGoal}
                fatGoal={fatGoal}
                onClose={() => setExpandedMacro(null)}
              />
            )}
            {per100 ? <ThemedText type="caption" style={styles.tabular}>{per100}</ThemedText> : null}
          </Card>

          {/* Your day with this food */}
          {calorieGoal !== null && (
            <Card padding="compact" style={styles.cardGap}>
              <View style={styles.dayHeader}>
                <ThemedText type="title">Your day with this</ThemedText>
                <ThemedText type="caption">Pale = this food</ThemedText>
              </View>
              <TargetRow
                label="Calories"
                eaten={dailyCalories}
                add={cal}
                goal={calorieGoal}
                unit="cal"
                color={tint}
                tint={tints.energy}
              />
              {proteinGoal !== null && (
                <TargetRow label="Protein" eaten={dailyProtein} add={pro} goal={proteinGoal} unit="g" color={MacroColors.protein} tint={tints.protein} />
              )}
              {carbGoal !== null && (
                <TargetRow label="Carbs" eaten={dailyCarbsState} add={carb} goal={carbGoal} unit="g" color={MacroColors.carbs} tint={tints.carbs} />
              )}
              {fatGoal !== null && (
                <TargetRow label="Fat" eaten={dailyFat} add={fat} goal={fatGoal} unit="g" color={MacroColors.fat} tint={tints.fat} />
              )}
            </Card>
          )}

          {/* Complete Nutrient Summary */}
          <ExpandSection
            title="Complete Nutrient Summary"
            expanded={expandNutrients}
            onToggle={() => setExpandNutrients((v) => !v)}
          >
            {NUTRIENTS.filter(({ id }) => nutrients[id] !== null).map(({ id, label, unit }) => (
              <MicroExpandRow key={id} label={label} value={nutrients[id]} unit={unit === 'ug' ? 'µg' : unit} />
            ))}
            {NUTRIENTS.every(({ id }) => nutrients[id] === null) ? <ThemedText type="caption">No nutrient details for this food.</ThemedText> : null}
          </ExpandSection>
        </ScrollView>
      )}

      {/* The decimal pad has no return key, so it gets a Done bar */}
      {Platform.OS === 'ios' ? (
        <InputAccessoryView nativeID={AMOUNT_ACCESSORY_ID}>
          <View style={[styles.accessoryBar, { backgroundColor: cardBackground, borderTopColor: separator }]}>
            <TouchableOpacity onPress={Keyboard.dismiss} style={styles.accessoryAction} hitSlop={8} accessibilityRole="button">
              <Text style={[styles.accessoryDone, { color: tint }]}>Done</Text>
            </TouchableOpacity>
          </View>
        </InputAccessoryView>
      ) : null}

      <TimePickerSheet
        visible={showTimePicker}
        value={loggedTime}
        onChange={setLoggedTime}
        onClose={() => setShowTimePicker(false)}
        colors={timeColors}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },

  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 6 },
  headerSide: { minWidth: 84, minHeight: 44, justifyContent: 'center' },
  back: { flexDirection: 'row', alignItems: 'center', marginLeft: -6 },
  headerSideRight: { alignItems: 'flex-end' },
  headerBtnText: { fontSize: 17 },
  title: { flex: 1, textAlign: 'center' },

  banner: { flexDirection: 'row', alignItems: 'center', gap: 10, marginHorizontal: 16, marginTop: 12 },
  bannerText: { flex: 1 },

  failWrap: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 8, paddingHorizontal: 40, paddingBottom: 140 },
  failIcon: { width: 56, height: 56, borderRadius: 28, alignItems: 'center', justifyContent: 'center', marginBottom: 8 },
  center: { textAlign: 'center' },

  skeletonBar: { borderRadius: 6 },
  skeletonBlock: { borderRadius: 22, alignItems: 'center', justifyContent: 'center' },

  scroll: { padding: 16, paddingBottom: 32, gap: 14 },

  identity: { gap: 8 },
  foodName: { fontSize: 26, lineHeight: 31 },
  metaRow: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 8 },

  cardGap: { gap: 12 },
  amountRow: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  rowLabel: { fontWeight: '600' },
  amountInput: { minWidth: 72, paddingVertical: 6, textAlign: 'center', fontFamily: Fonts.rounded, fontSize: 20, fontWeight: '800', fontVariant: ['tabular-nums'] },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  separator: { height: StyleSheet.hairlineWidth },
  settingRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', minHeight: 36 },
  accessoryAction: { minHeight: 44, minWidth: 44, justifyContent: 'center', alignItems: 'center' },
  accessoryBar: { flexDirection: 'row', justifyContent: 'flex-end', alignItems: 'center', minHeight: 44, paddingHorizontal: 16, borderTopWidth: StyleSheet.hairlineWidth },
  accessoryDone: { fontSize: 16, fontWeight: '600' },

  ringMacroRow: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  ringMacroRight: { flex: 1, flexDirection: 'row', gap: 6 },
  macroCol: { alignItems: 'center', gap: 2, flex: 1, minWidth: 0, borderRadius: 14, padding: 8, borderWidth: 1.5, borderColor: 'transparent' },
  macroDot: { width: 8, height: 8, borderRadius: 4 },
  macroGrams: { fontWeight: '600', fontVariant: ['tabular-nums'] },
  tabular: { fontVariant: ['tabular-nums'] },
  dayHeader: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'baseline', justifyContent: 'space-between', gap: 8 },
});
