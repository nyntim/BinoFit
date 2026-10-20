import { useState, useRef } from 'react';
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
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { Colors } from '@/constants/theme';
import { useThemeColor } from '@/hooks/use-theme-color';
import { addCustomFood } from '@/lib/database';
import { saveCustomFoodToSupabase } from '@/lib/food-service';
import { getSessionUserId } from '@/lib/auth';
import { validateNutrient } from '@/lib/food-validation';

export default function CustomFoodScreen() {
  const params = useLocalSearchParams<{
    meal_slot: string;
    date: string;
    name?: string;
    brand?: string;
    barcode?: string;
  }>();
  const { meal_slot, date, barcode } = params;
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

  const savingRef = useRef(false);
  const [touched, setTouched] = useState<Record<string, boolean>>({});
  const blur = (field: string) => () => setTouched((previous) => ({ ...previous, [field]: true }));
  const nutrition = {
    calories: validateNutrient(calories, 'Calories', 'required'),
    protein: validateNutrient(protein, 'Protein', 'zero'),
    carbs: validateNutrient(carbs, 'Carbs', 'zero'),
    fat: validateNutrient(fat, 'Fat', 'zero'),
  };
  const canSave = name.trim().length > 0 && servingUnits.trim().length > 0 && Object.values(nutrition).every((value) => value.valid);
  const nutrientError = (field: keyof typeof nutrition, raw: string) =>
    (raw.trim() || touched[field]) ? nutrition[field].error ?? undefined : undefined;

  const handleSave = async () => {
    const checked = {
      calories: validateNutrient(calories, 'Calories', 'required'),
      protein: validateNutrient(protein, 'Protein', 'zero'),
      carbs: validateNutrient(carbs, 'Carbs', 'zero'),
      fat: validateNutrient(fat, 'Fat', 'zero'),
    };
    if (!name.trim() || !servingUnits.trim() || Object.values(checked).some((value) => !value.valid) || savingRef.current) return;
    savingRef.current = true;
    setSaving(true);
    try {
      const food = await addCustomFood({
        name: name.trim(),
        brand: brand.trim() || null,
        serving_units: servingUnits.trim(),
        calories: checked.calories.value!,
        protein: checked.protein.value!,
        carbs: checked.carbs.value!,
        fat: checked.fat.value!,
        source: 'custom',
        barcode: barcode || null,
      });

      // Fire-and-forget — custom foods live in Supabase as source of truth
      getSessionUserId()
        .then((userId) => (userId ? saveCustomFoodToSupabase(food, userId) : undefined))
        .catch(() => {});

      router.replace({
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        pathname: '/serving-picker' as any,
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
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()} style={styles.cancelBtn}>
            <Text style={[styles.cancelText, { color: colors.tint }]}>Cancel</Text>
          </TouchableOpacity>
          <Text style={[styles.title, { color: colors.text }]}>New Food</Text>
          <TouchableOpacity onPress={handleSave} disabled={!canSave || saving} accessibilityRole="button" accessibilityLabel="Save food" accessibilityState={{ disabled: !canSave || saving, busy: saving }} style={styles.cancelBtn}>
            <Text style={[styles.saveText, { color: canSave ? colors.tint : colors.icon }]}>
              {saving ? 'Saving…' : 'Save'}
            </Text>
          </TouchableOpacity>
        </View>

        <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
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
  card: { borderRadius: 14, overflow: 'hidden', marginBottom: 24 },
  fieldRow: { paddingHorizontal: 16, paddingVertical: 12 },
  fieldContent: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  fieldError: { fontSize: 13, lineHeight: 18, marginTop: 8 },
  fieldLabel: { flex: 1, fontSize: 15 },
  fieldInput: { flex: 1, minHeight: 44, paddingHorizontal: 8, fontSize: 15, textAlign: 'right' },
});
