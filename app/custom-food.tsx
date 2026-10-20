import { ControlSurface } from '@/components/navigation/ControlSurface';
import { useState, useRef, useEffect } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { Colors } from '@/constants/theme';
import { useThemeColor } from '@/hooks/use-theme-color';
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
  const cardBackground = useThemeColor({}, 'cardBackground');
  const icon = useThemeColor({}, 'icon');
  const separator = useThemeColor({}, 'separator');
  const text = useThemeColor({}, 'text');
  const tint = useThemeColor({}, 'tint');
  const danger = useThemeColor({}, 'danger');
  const colors = { danger, background, cardBackground, icon, separator, text, tint };

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
  const [expanded, setExpanded] = useState(false);
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
      if (optionalErrors.length) setExpanded(true);
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

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        {/* Header */}
        <ControlSurface style={styles.header}>
          <TouchableOpacity onPress={() => router.back()} style={styles.cancelBtn}>
            <Text style={[styles.cancelText, { color: colors.tint }]}>Cancel</Text>
          </TouchableOpacity>
          <Text style={[styles.title, { color: colors.text }]}>{food_id ? 'Edit Food' : 'New Food'}</Text>
          <TouchableOpacity onPress={handleSave} disabled={!canSave || saving} accessibilityRole="button" accessibilityLabel="Save food" accessibilityState={{ disabled: !canSave || saving, busy: saving }} style={styles.cancelBtn}>
            <Text style={[styles.saveText, { color: canSave ? colors.tint : colors.icon }]}>
              {saving ? 'Saving…' : 'Save'}
            </Text>
          </TouchableOpacity>
        </ControlSurface>

        <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
          {loading ? <ActivityIndicator color={colors.tint} accessibilityLabel="Loading food" /> : null}
          {loadFailed ? (
            <View accessibilityRole="alert">
              <Text style={[styles.loadError, { color: colors.text }]}>Couldn’t load this custom food.</Text>
              <TouchableOpacity style={styles.disclosure} accessibilityRole="button" accessibilityLabel="Retry loading food" onPress={() => { setLoading(true); setLoadFailed(false); setLoadAttempt((attempt) => attempt + 1); }}>
                <Text style={{ color: colors.tint }}>Try again</Text>
              </TouchableOpacity>
            </View>
          ) : null}
          {!loading && !loadFailed ? <>
          {barcode ? (
            <Text style={[styles.barcodeCaption, { color: colors.icon }]}>Barcode {barcode}</Text>
          ) : null}

          {/* Basic info */}
          <Text style={[styles.sectionTitle, { color: colors.icon }]}>FOOD INFO</Text>
          <View style={[styles.card, { backgroundColor: colors.cardBackground }]}>
            <Field label="Name *" onBlur={blur('name')} error={touched.name && !name.trim() ? 'Enter a name.' : undefined} value={name} onChangeText={setName} placeholder="e.g. Greek Yogurt" colors={colors} />
            <Field label="Brand" value={brand} onChangeText={setBrand} placeholder="Optional" colors={colors} />
            <Field label="Serving size *" onBlur={blur('servingUnits')} error={touched.servingUnits && !servingUnits.trim() ? 'Enter a serving size.' : undefined} value={servingUnits} onChangeText={setServingUnits} placeholder="e.g. 1 cup (240g)" colors={colors} last />
          </View>

          {/* Nutrition */}
          <Text style={[styles.sectionTitle, { color: colors.icon }]}>NUTRITION PER SERVING</Text>
          <View style={[styles.card, { backgroundColor: colors.cardBackground }]}>
            <Field label="Calories *" onBlur={blur('calories')} error={nutrientError('calories', calories)} value={calories} onChangeText={setCalories} placeholder="0" keyboardType="decimal-pad" colors={colors} />
            <Field label="Protein (g)" onBlur={blur('protein')} error={nutrientError('protein', protein)} value={protein} onChangeText={setProtein} placeholder="0" keyboardType="decimal-pad" colors={colors} />
            <Field label="Carbs (g)" onBlur={blur('carbs')} error={nutrientError('carbs', carbs)} value={carbs} onChangeText={setCarbs} placeholder="0" keyboardType="decimal-pad" colors={colors} />
            <Field label="Fat (g)" onBlur={blur('fat')} error={nutrientError('fat', fat)} value={fat} onChangeText={setFat} placeholder="0" keyboardType="decimal-pad" colors={colors} last />
          </View>
          <TouchableOpacity style={[styles.disclosure, { backgroundColor: colors.cardBackground }]} onPress={() => setExpanded((value) => !value)} accessibilityRole="button" accessibilityLabel="More nutrients" accessibilityState={{ expanded }}>
            <Text style={[styles.disclosureText, { color: colors.text }]}>More nutrients</Text>
            <Text style={{ color: colors.icon }}>{expanded ? '−' : '+'}</Text>
          </TouchableOpacity>
          {!expanded && optionalErrors.length > 0 ? <Text style={[styles.loadError, { color: colors.text }]} accessibilityRole="alert">{optionalErrors.map(({ checked }) => checked.error).join(' ')}</Text> : null}
          {expanded ? (['extended_macros', 'minerals', 'vitamins'] as const).map((group) => {
            const nutrients = optionalNutrition.filter((nutrient) => nutrient.group === group);
            return <View key={group}>
              <Text style={[styles.sectionTitle, { color: colors.icon }]}>{group === 'extended_macros' ? 'EXTENDED MACROS' : group.toUpperCase()}</Text>
              <View style={[styles.card, { backgroundColor: colors.cardBackground }]}>
                {nutrients.map((nutrient, index) => (
                  <Field
                    key={nutrient.id}
                    label={`${nutrient.label} (${nutrient.unit === 'ug' ? 'µg' : nutrient.unit})`}
                    value={nutrientDraft[nutrient.id] ?? ''}
                    onChangeText={(value) => setNutrientDraft((draft) => ({ ...draft, [nutrient.id]: value }))}
                    onBlur={blur(nutrient.id)}
                    error={nutrient.checked.error ?? undefined}
                    placeholder="Optional"
                    keyboardType="decimal-pad"
                    colors={colors}
                    last={index === nutrients.length - 1}
                  />
                ))}
              </View>
            </View>;
          }) : null}
          </> : null}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function Field({
  label,
  value,
  onChangeText,
  placeholder,
  keyboardType = 'default',
  colors,
  last = false,
  error,
  onBlur,
}: {
  label: string;
  value: string;
  onChangeText: (v: string) => void;
  placeholder: string;
  keyboardType?: 'default' | 'decimal-pad';
  colors: Pick<typeof Colors.light, 'separator' | 'text' | 'icon' | 'danger'>;
  last?: boolean;
  error?: string;
  onBlur?: () => void;
}) {
  return (
    <View style={[styles.fieldRow, !last && { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.separator }]}>
      <View style={styles.fieldContent}>
        <Text style={[styles.fieldLabel, { color: colors.text }]}>{label}</Text>
        <TextInput
          style={[styles.fieldInput, { color: colors.text }, error ? { borderWidth: 1.5, borderColor: colors.danger, borderRadius: 8 } : undefined]}
          accessibilityLabel={label.replace(' *', ' (required)')}
          accessibilityHint={error}
          onBlur={onBlur}
          value={value}
          onChangeText={onChangeText}
          placeholder={placeholder}
          placeholderTextColor={colors.icon}
          keyboardType={keyboardType}
          returnKeyType="next"
        />
      </View>
      {error ? <Text style={[styles.fieldError, { color: colors.text }]} accessibilityRole="alert" accessibilityLiveRegion="polite">{error}</Text> : null}
    </View>
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
  cancelBtn: { width: 64, minHeight: 44, justifyContent: 'center' },
  cancelText: { fontSize: 16 },
  saveText: { fontSize: 16, fontWeight: '600', textAlign: 'right' },
  title: { fontSize: 17, fontWeight: '600' },
  scroll: { padding: 20, paddingBottom: 40 },
  sectionTitle: {
    fontSize: 12,
    fontWeight: '600',
    letterSpacing: 0.5,
    marginBottom: 8,
    marginTop: 4,
  },
  barcodeCaption: { fontSize: 12, marginBottom: 12 },
  disclosure: { minHeight: 44, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 16, borderRadius: 12, marginBottom: 16 },
  disclosureText: { fontSize: 15, fontWeight: '600' },
  loadError: { fontSize: 13, lineHeight: 18, marginBottom: 16 },
  card: { borderRadius: 14, overflow: 'hidden', marginBottom: 24 },
  fieldRow: { paddingHorizontal: 16, paddingVertical: 12 },
  fieldContent: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 8 },
  fieldError: { fontSize: 13, lineHeight: 18, marginTop: 8 },
  fieldLabel: { flexGrow: 1, flexShrink: 1, flexBasis: 130, fontSize: 15 },
  fieldInput: { flexGrow: 1, flexBasis: 100, fontVariant: ['tabular-nums'], minHeight: 44, paddingHorizontal: 8, fontSize: 15, textAlign: 'right' },
});
