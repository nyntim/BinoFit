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
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Colors, MacroColors } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { getFoodById, addFoodLog, updateFoodLog, getFoodLogsWithFoodByDate } from '@/lib/database';
import type { Food } from '@/lib/types';

const SLOT_LABELS: Record<string, string> = {
  breakfast: 'Breakfast',
  lunch: 'Lunch',
  dinner: 'Dinner',
  snack: 'Snacks',
};

export default function ServingPickerScreen() {
  const { food_id, meal_slot, date, log_id } = useLocalSearchParams<{
    food_id: string;
    meal_slot: string;
    date: string;
    log_id?: string;
  }>();
  const router = useRouter();
  const colorScheme = useColorScheme();
  const colors = Colors[colorScheme ?? 'light'];

  const [food, setFood] = useState<Food | null>(null);
  const [servingAmount, setServingAmount] = useState('1');
  const [saving, setSaving] = useState(false);
  const inputRef = useRef<TextInput>(null);

  const isEdit = Boolean(log_id);
  const slotLabel = SLOT_LABELS[meal_slot ?? ''] ?? 'Meal';

  useEffect(() => {
    if (!food_id) return;
    getFoodById(food_id).then(setFood);

    if (log_id && date) {
      getFoodLogsWithFoodByDate(date).then((logs) => {
        const entry = logs.find((l) => l.id === log_id);
        if (entry) setServingAmount(String(entry.serving_amount));
      });
    }
  }, [food_id, log_id, date]);

  useEffect(() => {
    const timer = setTimeout(() => inputRef.current?.focus(), 300);
    return () => clearTimeout(timer);
  }, []);

  const parsedAmount = parseFloat(servingAmount) || 0;

  const calories = food ? Math.round(food.calories * parsedAmount) : 0;
  const protein = food ? Math.round(food.protein * parsedAmount * 10) / 10 : 0;
  const carbs = food ? Math.round(food.carbs * parsedAmount * 10) / 10 : 0;
  const fat = food ? Math.round(food.fat * parsedAmount * 10) / 10 : 0;

  const handleSave = async () => {
    if (!food || parsedAmount <= 0 || !meal_slot || !date) return;
    setSaving(true);
    try {
      if (isEdit && log_id) {
        await updateFoodLog(log_id, parsedAmount, food.serving_units);
      } else {
        await addFoodLog({
          date,
          meal_slot: meal_slot as 'breakfast' | 'lunch' | 'dinner' | 'snack',
          food_id: food.id,
          serving_amount: parsedAmount,
          serving_unit: food.serving_units,
        });
      }
      router.back();
    } finally {
      setSaving(false);
    }
  };

  if (!food) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
        <ActivityIndicator style={{ marginTop: 48 }} color={colors.tint} />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()} style={styles.cancelBtn}>
            <Text style={[styles.cancelText, { color: colors.tint }]}>
              {isEdit ? 'Cancel' : 'Back'}
            </Text>
          </TouchableOpacity>
          <Text style={[styles.title, { color: colors.text }]}>
            {isEdit ? 'Edit Serving' : slotLabel}
          </Text>
          <View style={styles.cancelBtn} />
        </View>

        <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.scroll}>
          <View style={[styles.card, { backgroundColor: colors.cardBackground }]}>
            <Text style={[styles.foodName, { color: colors.text }]}>{food.name}</Text>
            {food.brand ? (
              <Text style={[styles.foodBrand, { color: colors.icon }]}>{food.brand}</Text>
            ) : null}
            <Text style={[styles.servingBase, { color: colors.icon }]}>
              Per serving: {food.serving_units}
            </Text>
          </View>

          <Text style={[styles.sectionLabel, { color: colors.icon }]}>SERVINGS</Text>
          <View style={[styles.servingRow, { backgroundColor: colors.cardBackground }]}>
            <TouchableOpacity
              style={[styles.stepper, { borderColor: colors.icon + '40' }]}
              onPress={() => {
                const v = Math.max(0.25, parsedAmount - 0.25);
                setServingAmount(String(v));
              }}
            >
              <Text style={[styles.stepperText, { color: colors.text }]}>−</Text>
            </TouchableOpacity>
            <TextInput
              ref={inputRef}
              style={[styles.servingInput, { color: colors.text }]}
              value={servingAmount}
              onChangeText={setServingAmount}
              keyboardType="decimal-pad"
              selectTextOnFocus
            />
            <TouchableOpacity
              style={[styles.stepper, { borderColor: colors.icon + '40' }]}
              onPress={() => {
                const v = parsedAmount + 0.25;
                setServingAmount(String(parseFloat(v.toFixed(2))));
              }}
            >
              <Text style={[styles.stepperText, { color: colors.text }]}>+</Text>
            </TouchableOpacity>
          </View>

          <Text style={[styles.sectionLabel, { color: colors.icon }]}>NUTRITION</Text>
          <View style={[styles.nutritionCard, { backgroundColor: colors.cardBackground }]}>
            <View style={[styles.nutritionRow, styles.calorieRow]}>
              <Text style={[styles.nutritionLabel, { color: colors.text, fontSize: 16, fontWeight: '600' }]}>
                Calories
              </Text>
              <Text style={[styles.nutritionValue, { color: colors.tint, fontSize: 22, fontWeight: '700' }]}>
                {calories}
              </Text>
            </View>
            <View style={styles.macroRow}>
              <NutrientCell label="Protein" value={protein} color={MacroColors.protein} textColor={colors.text} subColor={colors.icon} />
              <NutrientCell label="Carbs" value={carbs} color={MacroColors.carbs} textColor={colors.text} subColor={colors.icon} />
              <NutrientCell label="Fat" value={fat} color={MacroColors.fat} textColor={colors.text} subColor={colors.icon} />
            </View>
          </View>

          <TouchableOpacity
            style={[styles.saveBtn, { backgroundColor: colors.tint, opacity: parsedAmount > 0 ? 1 : 0.5 }]}
            onPress={handleSave}
            disabled={parsedAmount <= 0 || saving}
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
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function NutrientCell({
  label,
  value,
  color,
  textColor,
  subColor,
}: {
  label: string;
  value: number;
  color: string;
  textColor: string;
  subColor: string;
}) {
  return (
    <View style={styles.nutrientCell}>
      <View style={[styles.nutrientDot, { backgroundColor: color }]} />
      <Text style={[styles.nutrientValue, { color: textColor }]}>{value}g</Text>
      <Text style={[styles.nutrientLabel, { color: subColor }]}>{label}</Text>
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
  cancelBtn: { width: 64 },
  cancelText: { fontSize: 16 },
  title: { fontSize: 17, fontWeight: '600' },
  scroll: { padding: 16, paddingBottom: 40 },
  card: { borderRadius: 14, padding: 16, marginBottom: 24 },
  foodName: { fontSize: 18, fontWeight: '700', marginBottom: 2 },
  foodBrand: { fontSize: 14, marginBottom: 4 },
  servingBase: { fontSize: 13, marginTop: 4 },
  sectionLabel: {
    fontSize: 12,
    fontWeight: '600',
    letterSpacing: 0.5,
    marginBottom: 8,
    marginLeft: 4,
  },
  servingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 14,
    padding: 12,
    marginBottom: 24,
    gap: 12,
  },
  stepper: {
    width: 44,
    height: 44,
    borderRadius: 22,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepperText: { fontSize: 22, lineHeight: 26 },
  servingInput: {
    flex: 1,
    textAlign: 'center',
    fontSize: 28,
    fontWeight: '700',
  },
  nutritionCard: { borderRadius: 14, padding: 16, marginBottom: 32 },
  nutritionRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  calorieRow: { marginBottom: 16, paddingBottom: 16, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: '#ccc' },
  nutritionLabel: { fontSize: 15 },
  nutritionValue: { fontSize: 20 },
  macroRow: { flexDirection: 'row', justifyContent: 'space-around' },
  nutrientCell: { alignItems: 'center', gap: 3 },
  nutrientDot: { width: 8, height: 8, borderRadius: 4 },
  nutrientValue: { fontSize: 16, fontWeight: '700' },
  nutrientLabel: { fontSize: 12 },
  saveBtn: {
    borderRadius: 14,
    paddingVertical: 16,
    alignItems: 'center',
  },
  saveBtnText: { color: '#fff', fontSize: 17, fontWeight: '600' },
});
