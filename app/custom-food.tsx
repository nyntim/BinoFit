import { useState, useRef, useEffect } from 'react';
import {
  View,
  Pressable,
  StyleSheet,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ThemedText } from '@/components/themed-text';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { Tag } from '@/components/ui/Tag';
import { TextField } from '@/components/ui/TextField';
import { MacroColors } from '@/constants/theme';
import { useThemeColor } from '@/hooks/use-theme-color';
import { formatNutritionAmount, macroCalories } from '@/lib/meal-nutrition-summary';
import { addCustomFood, getFoodById, updateCustomFood } from '@/lib/database';
import { syncToSupabase } from '@/lib/sync';
import { NUTRIENTS, normalizeNutrients, type NutrientId } from '@/lib/nutrients';
import type { Food } from '@/lib/types';
import { formatServingAmount, validateNutrient } from '@/lib/food-validation';

export default function CustomFoodScreen() {
  const params = useLocalSearchParams<{
    meal_slot: string;
    date: string;
    name?: string;
    brand?: string;
    barcode?: string;
    food_id?: string;
  }>();
  const { meal_slot, date, barcode, food_id } = params;
  const router = useRouter();
  const background = useThemeColor({}, 'background');
  const icon = useThemeColor({}, 'icon');
  const separator = useThemeColor({}, 'separator');
  const tint = useThemeColor({}, 'tint');
  const danger = useThemeColor({}, 'danger');

  const [name, setName] = useState(params.name ?? '');
  const [brand, setBrand] = useState(params.brand ?? '');
  const [servingUnits, setServingUnits] = useState('');
  const [calories, setCalories] = useState('');
  const [protein, setProtein] = useState('');
  const [carbs, setCarbs] = useState('');
  const [fat, setFat] = useState('');
  const [saving, setSaving] = useState(false);
  const [loadedFood, setLoadedFood] = useState<Food | null>(null);
  const [loading, setLoading] = useState(Boolean(food_id));
  const [loadFailed, setLoadFailed] = useState(false);
  const [loadAttempt, setLoadAttempt] = useState(0);
  const [expandedGroups, setExpandedGroups] = useState<Record<string, boolean>>({});
  const [nutrientDraft, setNutrientDraft] = useState<Partial<Record<NutrientId, string>>>({});

  useEffect(() => {
    if (!food_id) return;
    let cancelled = false;
    getFoodById(food_id).then((food) => {
      if (cancelled) return;
      if (!food || food.source !== 'custom') {
        setLoadFailed(true);
        return;
      }
      setLoadedFood(food);
      setName(food.name);
      setBrand(food.brand ?? '');
      setServingUnits(food.serving_units);
      setCalories(formatServingAmount(food.calories));
      setProtein(formatServingAmount(food.protein));
      setCarbs(formatServingAmount(food.carbs));
      setFat(formatServingAmount(food.fat));
      setNutrientDraft(Object.fromEntries(
        Object.entries(normalizeNutrients(food)).map(([id, value]) => [id, value == null ? '' : formatServingAmount(value)]),
      ));
    }).catch(() => { if (!cancelled) setLoadFailed(true); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [food_id, loadAttempt]);

  const optionalNutrition = NUTRIENTS.map((nutrient) => ({
    ...nutrient,
    checked: validateNutrient(nutrientDraft[nutrient.id] ?? '', nutrient.label, 'null'),
  }));
  const optionalErrors = optionalNutrition.filter((nutrient) => !nutrient.checked.valid);


  const savingRef = useRef(false);
  const [touched, setTouched] = useState<Record<string, boolean>>({});
  const blur = (field: string) => () => setTouched((previous) => ({ ...previous, [field]: true }));
  const nutrition = {
    calories: validateNutrient(calories, 'Calories', 'required'),
    protein: validateNutrient(protein, 'Protein', 'zero'),
    carbs: validateNutrient(carbs, 'Carbs', 'zero'),
    fat: validateNutrient(fat, 'Fat', 'zero'),
  };
  const canSave = !loading && !loadFailed && (!food_id || Boolean(loadedFood)) && optionalErrors.length === 0 && name.trim().length > 0 && servingUnits.trim().length > 0 && Object.values(nutrition).every((value) => value.valid);
  const nutrientError = (field: keyof typeof nutrition, raw: string) =>
    (raw.trim() || touched[field]) ? nutrition[field].error ?? undefined : undefined;

  const handleSave = async () => {
    const checked = {
      calories: validateNutrient(calories, 'Calories', 'required'),
      protein: validateNutrient(protein, 'Protein', 'zero'),
      carbs: validateNutrient(carbs, 'Carbs', 'zero'),
      fat: validateNutrient(fat, 'Fat', 'zero'),
    };
    if (!canSave || !name.trim() || !servingUnits.trim() || Object.values(checked).some((value) => !value.valid) || savingRef.current) {
      if (optionalErrors.length) {
        setExpandedGroups((previous) => ({ ...previous, ...Object.fromEntries(optionalErrors.map((nutrient) => [nutrient.group, true])) }));
      }
      return;
    }
    savingRef.current = true;
    setSaving(true);
    try {
      const input: Omit<Food, 'id' | 'updated_at'> = {
        name: name.trim(),
        brand: brand.trim() || null,
        serving_units: servingUnits.trim(),
        calories: checked.calories.value!,
        protein: checked.protein.value!,
        carbs: checked.carbs.value!,
        fat: checked.fat.value!,
        source: 'custom',
        barcode: loadedFood?.barcode ?? barcode ?? null,
        ...Object.fromEntries(optionalNutrition.map(({ id, checked }) => [id, checked.value])),
      };
      const food = food_id ? await updateCustomFood(food_id, input) : await addCustomFood(input);

      syncToSupabase();
      if (food_id) {
        router.back();
        return;
      }

      router.replace({
        pathname: '/serving-picker',
        params: { food_id: food.id, meal_slot, date },
      });
    } catch {
      Alert.alert('Error', 'Failed to save food. Please try again.');
      savingRef.current = false;
      setSaving(false);
    }
  };

  const GROUPS = [
    { id: 'extended_macros', title: 'Other nutrients' },
    { id: 'minerals', title: 'Minerals' },
    { id: 'vitamins', title: 'Vitamins' },
  ] as const;
  const macroValues = [nutrition.protein, nutrition.carbs, nutrition.fat];
  const anyMacro = [protein, carbs, fat].some((raw) => raw.trim() !== '') && macroValues.every((value) => value.valid);
  const macroEnergy = anyMacro
    ? Number(formatNutritionAmount(macroCalories({ protein: nutrition.protein.value ?? 0, carbs: nutrition.carbs.value ?? 0, fat: nutrition.fat.value ?? 0 }), 0)).toLocaleString()
    : null;
  const macroFields = [
    { key: 'protein' as const, label: 'Protein', value: protein, set: setProtein, color: MacroColors.protein },
    { key: 'carbs' as const, label: 'Carbs', value: carbs, set: setCarbs, color: MacroColors.carbs },
    { key: 'fat' as const, label: 'Fat', value: fat, set: setFat, color: MacroColors.fat },
  ];

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: background }]}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        {/* Header */}
        <View style={styles.header}>
          <View style={styles.side}>
            <Button label="Cancel" variant="ghost" onPress={() => router.back()} />
          </View>
          <ThemedText type="title" accessibilityRole="header">{food_id ? 'Edit food' : 'New food'}</ThemedText>
          <View style={[styles.side, styles.sideEnd]}>
            <Button
              label={saving ? 'Saving…' : 'Save'}
              accessibilityLabel="Save food"
              variant="ghost"
              disabled={!canSave}
              loading={saving}
              onPress={handleSave}
            />
          </View>
        </View>

        <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
          {loading ? <ActivityIndicator color={tint} accessibilityLabel="Loading food" /> : null}
          {loadFailed ? (
            <Card padding="compact" style={styles.loadError} accessibilityRole="alert">
              <IconSymbol name="exclamationmark.circle" size={18} color={danger} />
              <ThemedText type="label" style={styles.flex}>Couldn’t load this custom food.</ThemedText>
              <Button label="Try again" variant="ghost" size="sm" accessibilityLabel="Retry loading food" onPress={() => { setLoading(true); setLoadFailed(false); setLoadAttempt((attempt) => attempt + 1); }} />
            </Card>
          ) : null}
          {!loading && !loadFailed ? <>
          <ThemedText type="section">Food</ThemedText>
          <Card padding="compact" style={styles.cardGap}>
            <TextField
              label="Name"
              accessibilityLabel="Name (required)"
              onBlur={blur('name')}
              error={touched.name && !name.trim() ? 'Enter a name.' : undefined}
              value={name}
              onChangeText={setName}
              placeholder="e.g. Greek yogurt"
              returnKeyType="next"
            />
            <TextField label="Brand" accessibilityLabel="Brand (optional)" value={brand} onChangeText={setBrand} placeholder="Optional" returnKeyType="next" />
            <TextField
              label="Serving size"
              accessibilityLabel="Serving size (required)"
              onBlur={blur('servingUnits')}
              error={touched.servingUnits && !servingUnits.trim() ? 'Add a serving size so amounts make sense.' : undefined}
              value={servingUnits}
              onChangeText={setServingUnits}
              placeholder="Like 1 piece (300 g)"
              returnKeyType="next"
            />
            {barcode ? (
              <View style={styles.barcodeRow}>
                <Tag label="Barcode" />
                <ThemedText type="label" style={styles.tabular}>{barcode}</ThemedText>
              </View>
            ) : null}
          </Card>

          <ThemedText type="section">Nutrition per serving</ThemedText>
          <Card padding="compact" style={styles.cardGap}>
            <TextField
              size="big"
              label="Calories"
              accessibilityLabel="Calories (required)"
              suffix="cal"
              onBlur={blur('calories')}
              error={nutrientError('calories', calories)}
              value={calories}
              onChangeText={setCalories}
              placeholder="0"
              keyboardType="decimal-pad"
              containerStyle={styles.calories}
            />
            <View style={styles.macroRow}>
              {macroFields.map((field) => (
                <View key={field.key} style={styles.macro}>
                  <View style={styles.macroLabel}>
                    <View style={[styles.dot, { backgroundColor: field.color }]} />
                    <ThemedText type="caption">{field.label}</ThemedText>
                  </View>
                  <TextField
                    accessibilityLabel={`${field.label} (g)`}
                    suffix="g"
                    onBlur={blur(field.key)}
                    error={nutrientError(field.key, field.value)}
                    value={field.value}
                    onChangeText={field.set}
                    placeholder="0"
                    keyboardType="decimal-pad"
                  />
                </View>
              ))}
            </View>
            {macroEnergy !== null ? <ThemedText type="caption">{`Macros add up to ${macroEnergy} cal. Grams per serving.`}</ThemedText> : null}
          </Card>

          <ThemedText type="section">More nutrients (optional)</ThemedText>
          <Card padding="none">
            {GROUPS.map(({ id, title }, index) => {
              const nutrients = optionalNutrition.filter((nutrient) => nutrient.group === id);
              const open = !!expandedGroups[id];
              const filled = nutrients.filter((nutrient) => (nutrientDraft[nutrient.id] ?? '').trim() !== '').length;
              const errors = nutrients.filter((nutrient) => !nutrient.checked.valid);
              return (
                <View key={id} style={index > 0 ? [styles.groupDivider, { borderTopColor: separator }] : undefined}>
                  <Pressable
                    style={({ pressed }) => [styles.groupHeader, pressed && styles.pressed]}
                    onPress={() => setExpandedGroups((previous) => ({ ...previous, [id]: !previous[id] }))}
                    accessibilityRole="button"
                    accessibilityLabel={title}
                    accessibilityState={{ expanded: open }}
                  >
                    <ThemedText type="body" style={styles.groupTitle}>{title}</ThemedText>
                    <ThemedText type="caption">{`${filled} of ${nutrients.length}`}</ThemedText>
                    <IconSymbol name={open ? 'chevron.up' : 'chevron.down'} size={20} color={icon} />
                  </Pressable>
                  {!open && errors.length > 0 ? (
                    <ThemedText type="label" style={[styles.groupError, { color: danger }]} accessibilityRole="alert">{errors.map(({ checked }) => checked.error).join(' ')}</ThemedText>
                  ) : null}
                  {open ? nutrients.map((nutrient) => (
                    <View key={nutrient.id} style={[styles.nutrientRow, { borderTopColor: separator }]}>
                      <ThemedText type="body" style={[styles.nutrientLabel, { color: icon }]}>{nutrient.label}</ThemedText>
                      <TextField
                        size="mini"
                        accessibilityLabel={`${nutrient.label} (${nutrient.unit === 'ug' ? 'µg' : nutrient.unit})`}
                        value={nutrientDraft[nutrient.id] ?? ''}
                        onChangeText={(value) => setNutrientDraft((draft) => ({ ...draft, [nutrient.id]: value }))}
                        onBlur={blur(nutrient.id)}
                        error={nutrient.checked.error ?? undefined}
                        placeholder="Unknown"
                        keyboardType="decimal-pad"
                      />
                      <ThemedText type="caption" style={styles.unit}>{nutrient.unit === 'ug' ? 'µg' : nutrient.unit}</ThemedText>
                    </View>
                  )) : null}
                </View>
              );
            })}
          </Card>
          <ThemedText type="caption">Blank means unknown, not zero.</ThemedText>
          </> : null}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 8, paddingVertical: 4 },
  side: { minWidth: 84 },
  sideEnd: { alignItems: 'flex-end' },
  scroll: { padding: 16, paddingBottom: 40, gap: 14 },
  flex: { flex: 1 },
  loadError: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  cardGap: { gap: 14 },
  barcodeRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  tabular: { fontVariant: ['tabular-nums'] },
  calories: { width: 180, maxWidth: '100%' },
  macroRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  macro: { flex: 1, minWidth: 96, gap: 4 },
  macroLabel: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  dot: { width: 8, height: 8, borderRadius: 4 },
  groupDivider: { borderTopWidth: StyleSheet.hairlineWidth },
  groupHeader: { flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 52, paddingHorizontal: 18, paddingVertical: 8 },
  groupTitle: { flex: 1, fontWeight: '600' },
  groupError: { paddingHorizontal: 18, paddingBottom: 12 },
  nutrientRow: { flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 52, paddingHorizontal: 18, paddingVertical: 6, borderTopWidth: StyleSheet.hairlineWidth },
  nutrientLabel: { flex: 1 },
  unit: { width: 28 },
  pressed: { opacity: 0.85 },
});
