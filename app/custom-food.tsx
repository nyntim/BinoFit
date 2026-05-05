import { useState } from 'react';
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
import { Colors } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { addCustomFood } from '@/lib/database';
import { saveCustomFoodToSupabase } from '@/lib/food-service';
import { getDeviceId } from '@/lib/device-id';

export default function CustomFoodScreen() {
  const { meal_slot, date } = useLocalSearchParams<{ meal_slot: string; date: string }>();
  const router = useRouter();
  const colorScheme = useColorScheme();
  const colors = Colors[colorScheme ?? 'light'];

  const [name, setName] = useState('');
  const [brand, setBrand] = useState('');
  const [servingUnits, setServingUnits] = useState('');
  const [calories, setCalories] = useState('');
  const [protein, setProtein] = useState('');
  const [carbs, setCarbs] = useState('');
  const [fat, setFat] = useState('');
  const [saving, setSaving] = useState(false);

  const canSave =
    name.trim().length > 0 &&
    servingUnits.trim().length > 0 &&
    parseFloat(calories) >= 0;

  const handleSave = async () => {
    if (!canSave) return;
    setSaving(true);
    try {
      const food = await addCustomFood({
        name: name.trim(),
        brand: brand.trim() || null,
        serving_units: servingUnits.trim(),
        calories: parseFloat(calories) || 0,
        protein: parseFloat(protein) || 0,
        carbs: parseFloat(carbs) || 0,
        fat: parseFloat(fat) || 0,
        source: 'custom',
      });

      // Fire-and-forget — custom foods live in Supabase as source of truth
      getDeviceId().then((deviceId) => saveCustomFoodToSupabase(food, deviceId));

      router.replace({
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        pathname: '/serving-picker' as any,
        params: { food_id: food.id, meal_slot, date },
      });
    } catch {
      Alert.alert('Error', 'Failed to save food. Please try again.');
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
          <TouchableOpacity onPress={handleSave} disabled={!canSave || saving} style={styles.cancelBtn}>
            <Text style={[styles.saveText, { color: canSave ? colors.tint : colors.icon }]}>
              {saving ? 'Saving…' : 'Save'}
            </Text>
          </TouchableOpacity>
        </View>

        <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
          {/* Basic info */}
          <Text style={[styles.sectionTitle, { color: colors.icon }]}>FOOD INFO</Text>
          <View style={[styles.card, { backgroundColor: colors.cardBackground }]}>
            <Field label="Name *" value={name} onChangeText={setName} placeholder="e.g. Greek Yogurt" colors={colors} />
            <Field label="Brand" value={brand} onChangeText={setBrand} placeholder="Optional" colors={colors} />
            <Field label="Serving size *" value={servingUnits} onChangeText={setServingUnits} placeholder="e.g. 1 cup (240g)" colors={colors} last />
          </View>

          {/* Nutrition */}
          <Text style={[styles.sectionTitle, { color: colors.icon }]}>NUTRITION PER SERVING</Text>
          <View style={[styles.card, { backgroundColor: colors.cardBackground }]}>
            <Field label="Calories *" value={calories} onChangeText={setCalories} placeholder="0" keyboardType="decimal-pad" colors={colors} />
            <Field label="Protein (g)" value={protein} onChangeText={setProtein} placeholder="0" keyboardType="decimal-pad" colors={colors} />
            <Field label="Carbs (g)" value={carbs} onChangeText={setCarbs} placeholder="0" keyboardType="decimal-pad" colors={colors} />
            <Field label="Fat (g)" value={fat} onChangeText={setFat} placeholder="0" keyboardType="decimal-pad" colors={colors} last />
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
}: {
  label: string;
  value: string;
  onChangeText: (v: string) => void;
  placeholder: string;
  keyboardType?: 'default' | 'decimal-pad';
  colors: typeof Colors['light'];
  last?: boolean;
}) {
  return (
    <View style={[styles.fieldRow, !last && { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.separator }]}>
      <Text style={[styles.fieldLabel, { color: colors.text }]}>{label}</Text>
      <TextInput
        style={[styles.fieldInput, { color: colors.text }]}
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={colors.icon}
        keyboardType={keyboardType}
        returnKeyType="next"
      />
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
  card: { borderRadius: 14, overflow: 'hidden', marginBottom: 24 },
  fieldRow: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 12 },
  fieldLabel: { width: 130, fontSize: 15 },
  fieldInput: { flex: 1, fontSize: 15, textAlign: 'right' },
});
