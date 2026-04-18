import { useState } from 'react';
import {
  StyleSheet,
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
  Alert,
} from 'react-native';
import { router } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Colors } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { saveUserGoals, saveUserProfile } from '@/lib/storage';

type ActivityLevel = 'sedentary' | 'light' | 'moderate' | 'active' | 'very_active';

const ACTIVITY_OPTIONS: { value: ActivityLevel; label: string; description: string }[] = [
  { value: 'sedentary', label: 'Sedentary', description: 'Desk job, little exercise' },
  { value: 'light', label: 'Light', description: '1–3 days/week' },
  { value: 'moderate', label: 'Moderate', description: '3–5 days/week' },
  { value: 'active', label: 'Active', description: '6–7 days/week' },
  { value: 'very_active', label: 'Very Active', description: 'Physical job + training' },
];

export default function GoalsScreen() {
  const colorScheme = useColorScheme();
  const colors = Colors[colorScheme ?? 'light'];

  const [calories, setCalories] = useState('2000');
  const [protein, setProtein] = useState('150');
  const [carbs, setCarbs] = useState('200');
  const [fat, setFat] = useState('65');
  const [weight, setWeight] = useState('');
  const [height, setHeight] = useState('');
  const [activityLevel, setActivityLevel] = useState<ActivityLevel>('moderate');

  async function handleNext() {
    const cal = parseInt(calories, 10);
    const prot = parseInt(protein, 10);
    const carb = parseInt(carbs, 10);
    const f = parseInt(fat, 10);

    if (!cal || !prot || !carb || !f) {
      Alert.alert('Missing fields', 'Please fill in all calorie and macro goals.');
      return;
    }

    await saveUserGoals({
      calorie_goal: cal,
      protein_goal: prot,
      carb_goal: carb,
      fat_goal: f,
    });

    await saveUserProfile({
      weight: weight ? parseFloat(weight) : null,
      height: height ? parseFloat(height) : null,
      activity_level: activityLevel,
    });

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    router.push('/onboarding/complete' as any);
  }

  const inputStyle = [
    styles.input,
    { backgroundColor: colors.cardBackground, color: colors.text },
  ];

  const labelStyle = [styles.label, { color: colors.text }];
  const hintStyle = [styles.hint, { color: colors.icon }];

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
          <Text style={[styles.title, { color: colors.text }]}>Set Your Goals</Text>
          <Text style={[styles.subtitle, { color: colors.icon }]}>
            You can always update these in Settings.
          </Text>

          <View style={styles.section}>
            <Text style={[styles.sectionTitle, { color: colors.text }]}>Daily Targets</Text>

            <Text style={labelStyle}>Calories</Text>
            <TextInput
              style={inputStyle}
              value={calories}
              onChangeText={setCalories}
              keyboardType="numeric"
              placeholder="e.g. 2000"
              placeholderTextColor={colors.icon}
            />

            <Text style={labelStyle}>Protein (g)</Text>
            <TextInput
              style={inputStyle}
              value={protein}
              onChangeText={setProtein}
              keyboardType="numeric"
              placeholder="e.g. 150"
              placeholderTextColor={colors.icon}
            />

            <Text style={labelStyle}>Carbohydrates (g)</Text>
            <TextInput
              style={inputStyle}
              value={carbs}
              onChangeText={setCarbs}
              keyboardType="numeric"
              placeholder="e.g. 200"
              placeholderTextColor={colors.icon}
            />

            <Text style={labelStyle}>Fat (g)</Text>
            <TextInput
              style={inputStyle}
              value={fat}
              onChangeText={setFat}
              keyboardType="numeric"
              placeholder="e.g. 65"
              placeholderTextColor={colors.icon}
            />
          </View>

          <View style={styles.section}>
            <Text style={[styles.sectionTitle, { color: colors.text }]}>
              Personal Stats{' '}
              <Text style={[styles.optional, { color: colors.icon }]}>(optional)</Text>
            </Text>

            <Text style={labelStyle}>Weight (kg)</Text>
            <TextInput
              style={inputStyle}
              value={weight}
              onChangeText={setWeight}
              keyboardType="decimal-pad"
              placeholder="e.g. 75"
              placeholderTextColor={colors.icon}
            />

            <Text style={labelStyle}>Height (cm)</Text>
            <TextInput
              style={inputStyle}
              value={height}
              onChangeText={setHeight}
              keyboardType="decimal-pad"
              placeholder="e.g. 175"
              placeholderTextColor={colors.icon}
            />

            <Text style={labelStyle}>Activity Level</Text>
            <View style={styles.activityGrid}>
              {ACTIVITY_OPTIONS.map((opt) => {
                const selected = activityLevel === opt.value;
                return (
                  <TouchableOpacity
                    key={opt.value}
                    style={[
                      styles.activityOption,
                      {
                        backgroundColor: selected ? colors.tint : colors.cardBackground,
                      },
                    ]}
                    onPress={() => setActivityLevel(opt.value)}
                  >
                    <Text
                      style={[
                        styles.activityLabel,
                        { color: selected ? colors.background : colors.text },
                      ]}
                    >
                      {opt.label}
                    </Text>
                    <Text
                      style={[
                        styles.activityDesc,
                        { color: selected ? colors.background : colors.icon },
                      ]}
                    >
                      {opt.description}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
            <Text style={hintStyle}>Used for goal suggestions in future updates.</Text>
          </View>
        </ScrollView>

        <View style={[styles.footer, { backgroundColor: colors.background }]}>
          <TouchableOpacity
            style={[styles.button, { backgroundColor: colors.tint }]}
            onPress={handleNext}
          >
            <Text style={styles.buttonText}>Continue</Text>
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  flex: { flex: 1 },
  scroll: { padding: 24, paddingBottom: 0 },
  title: { fontSize: 28, fontWeight: '700', marginBottom: 8 },
  subtitle: { fontSize: 15, marginBottom: 28 },
  section: { marginBottom: 28 },
  sectionTitle: { fontSize: 18, fontWeight: '600', marginBottom: 16 },
  optional: { fontWeight: '400', fontSize: 14 },
  label: { fontSize: 14, fontWeight: '500', marginBottom: 6, marginTop: 12 },
  hint: { fontSize: 12, marginTop: 8 },
  input: {
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 16,
  },
  activityGrid: { gap: 8 },
  activityOption: {
    borderRadius: 10,
    padding: 12,
  },
  activityLabel: { fontSize: 15, fontWeight: '600' },
  activityDesc: { fontSize: 12, marginTop: 2 },
  footer: {
    paddingHorizontal: 24,
    paddingTop: 12,
    paddingBottom: 24,
  },
  button: {
    borderRadius: 14,
    paddingVertical: 16,
    alignItems: 'center',
  },
  buttonText: { color: '#fff', fontSize: 17, fontWeight: '600' },
});
