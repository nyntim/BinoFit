import { useEffect, useState, useCallback } from 'react';
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
  Switch,
  Linking,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import Constants from 'expo-constants';
import { Colors } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { useHealthKit } from '@/hooks/use-health-kit';
import {
  getUserGoals,
  saveUserGoals,
  getUserProfile,
  saveUserProfile,
  resetOnboarding,
  getRequireMealConfirmation,
  setRequireMealConfirmation,
} from '@/lib/storage';
import type { UserProfile } from '@/lib/types';

type ActivityLevel = NonNullable<UserProfile['activity_level']>;

const ACTIVITY_OPTIONS: { value: ActivityLevel; label: string }[] = [
  { value: 'sedentary', label: 'Sedentary' },
  { value: 'light', label: 'Light' },
  { value: 'moderate', label: 'Moderate' },
  { value: 'active', label: 'Active' },
  { value: 'very_active', label: 'Very Active' },
];

export default function SettingsScreen() {
  const colorScheme = useColorScheme();
  const colors = Colors[colorScheme ?? 'light'];

  const [calories, setCalories] = useState('');
  const [protein, setProtein] = useState('');
  const [carbs, setCarbs] = useState('');
  const [fat, setFat] = useState('');
  const [weight, setWeight] = useState('');
  const [height, setHeight] = useState('');
  const [activityLevel, setActivityLevel] = useState<ActivityLevel>('moderate');
  const [requireConfirmation, setRequireConfirmation] = useState(true);
  const [saved, setSaved] = useState(false);

  const { available, writeGranted, initHealthKit } = useHealthKit();

  const loadData = useCallback(async () => {
    const [goals, profile, reqConf] = await Promise.all([
      getUserGoals(),
      getUserProfile(),
      getRequireMealConfirmation(),
    ]);
    if (goals) {
      setCalories(String(goals.calorie_goal));
      setProtein(String(goals.protein_goal));
      setCarbs(String(goals.carb_goal));
      setFat(String(goals.fat_goal));
    }
    if (profile) {
      setWeight(profile.weight ? String(profile.weight) : '');
      setHeight(profile.height ? String(profile.height) : '');
      if (profile.activity_level) setActivityLevel(profile.activity_level);
    }
    setRequireConfirmation(reqConf);
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  async function handleToggleConfirmation(value: boolean) {
    setRequireConfirmation(value);
    await setRequireMealConfirmation(value);
  }

  async function handleSave() {
    const cal = parseInt(calories, 10);
    const prot = parseInt(protein, 10);
    const carb = parseInt(carbs, 10);
    const f = parseInt(fat, 10);

    if (!cal || !prot || !carb || !f) {
      Alert.alert('Invalid input', 'Please enter valid numbers for all nutrition goals.');
      return;
    }

    await Promise.all([
      saveUserGoals({ calorie_goal: cal, protein_goal: prot, carb_goal: carb, fat_goal: f }),
      saveUserProfile({
        weight: weight ? parseFloat(weight) : null,
        height: height ? parseFloat(height) : null,
        activity_level: activityLevel,
      }),
    ]);

    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  }

  const bg = { backgroundColor: colors.cardBackground };
  const inputStyle = [styles.input, bg, { color: colors.text }];
  const labelStyle = [styles.label, { color: colors.text }];

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
          <Text style={[styles.title, { color: colors.text }]}>Settings</Text>

          <View style={styles.section}>
            <Text style={[styles.sectionTitle, { color: colors.text }]}>Daily Goals</Text>

            <Text style={labelStyle}>Calories</Text>
            <TextInput
              style={inputStyle}
              value={calories}
              onChangeText={setCalories}
              keyboardType="numeric"
              placeholder="kcal"
              placeholderTextColor={colors.icon}
            />

            <Text style={labelStyle}>Protein (g)</Text>
            <TextInput
              style={inputStyle}
              value={protein}
              onChangeText={setProtein}
              keyboardType="numeric"
              placeholderTextColor={colors.icon}
            />

            <Text style={labelStyle}>Carbohydrates (g)</Text>
            <TextInput
              style={inputStyle}
              value={carbs}
              onChangeText={setCarbs}
              keyboardType="numeric"
              placeholderTextColor={colors.icon}
            />

            <Text style={labelStyle}>Fat (g)</Text>
            <TextInput
              style={inputStyle}
              value={fat}
              onChangeText={setFat}
              keyboardType="numeric"
              placeholderTextColor={colors.icon}
            />
          </View>

          <View style={styles.section}>
            <Text style={[styles.sectionTitle, { color: colors.text }]}>Preferences</Text>
            <View style={[styles.preferenceRow, bg]}>
              <View style={styles.preferenceInfo}>
                <Text style={[styles.preferenceLabel, { color: colors.text }]}>
                  Require meal confirmation
                </Text>
                <Text style={[styles.preferenceSubtitle, { color: colors.icon }]}>
                  When on, only meals marked as Eaten count toward your daily totals
                </Text>
              </View>
              <Switch
                value={requireConfirmation}
                onValueChange={handleToggleConfirmation}
                trackColor={{ false: colors.separator, true: colors.tint + '80' }}
                thumbColor={requireConfirmation ? colors.tint : Platform.OS === 'ios' ? undefined : '#f4f3f4'}
              />
            </View>
          </View>

          {Platform.OS === 'ios' && available && (
            <View style={styles.section}>
              <Text style={[styles.sectionTitle, { color: colors.text }]}>Apple Health</Text>
              <View style={[styles.preferenceRow, bg]}>
                <View style={styles.preferenceInfo}>
                  <Text style={[styles.preferenceLabel, { color: colors.text }]}>
                    Sync nutrition data
                  </Text>
                  <Text style={[styles.preferenceSubtitle, { color: colors.icon }]}>
                    {writeGranted ? 'Connected' : 'Not connected'}
                  </Text>
                </View>
                <TouchableOpacity
                  style={[styles.connectBtn, { backgroundColor: colors.tint + '12' }]}
                  onPress={writeGranted ? () => Linking.openURL('x-apple-health://') : initHealthKit}
                >
                  <Text style={[styles.connectBtnText, { color: colors.tint }]}>
                    {writeGranted ? 'Manage' : 'Connect'}
                  </Text>
                </TouchableOpacity>
              </View>
            </View>
          )}

          <View style={styles.section}>
            <Text style={[styles.sectionTitle, { color: colors.text }]}>Personal Stats</Text>

            <Text style={labelStyle}>Weight (kg)</Text>
            <TextInput
              style={inputStyle}
              value={weight}
              onChangeText={setWeight}
              keyboardType="decimal-pad"
              placeholderTextColor={colors.icon}
            />

            <Text style={labelStyle}>Height (cm)</Text>
            <TextInput
              style={inputStyle}
              value={height}
              onChangeText={setHeight}
              keyboardType="decimal-pad"
              placeholderTextColor={colors.icon}
            />

            <Text style={labelStyle}>Activity Level</Text>
            <View style={styles.activityRow}>
              {ACTIVITY_OPTIONS.map((opt) => {
                const selected = activityLevel === opt.value;
                return (
                  <TouchableOpacity
                    key={opt.value}
                    style={[
                      styles.activityChip,
                      {
                        backgroundColor: selected ? colors.tint : colors.cardBackground,
                      },
                    ]}
                    onPress={() => setActivityLevel(opt.value)}
                  >
                    <Text style={[styles.chipText, { color: selected ? colors.background : colors.text }]}>
                      {opt.label}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>

          <View style={[styles.section, styles.appInfoSection]}>
            <Text style={[styles.sectionTitle, { color: colors.text }]}>App Info</Text>
            <View style={[styles.infoRow, bg, { borderRadius: 12 }]}>
              <Text style={[styles.infoKey, { color: colors.text }]}>Version</Text>
              <Text style={[styles.infoVal, { color: colors.icon }]}>
                {Constants.expoConfig?.version ?? '1.0.0'}
              </Text>
            </View>
          </View>

          <View style={[styles.section, { marginBottom: 16 }]}>
            <TouchableOpacity
              style={[styles.resetBtn, bg]}
              onPress={() =>
                Alert.alert('Reset Setup', 'This will restart the onboarding flow. Continue?', [
                  { text: 'Cancel', style: 'cancel' },
                  {
                    text: 'Reset',
                    style: 'destructive',
                    onPress: async () => {
                      await resetOnboarding();
                      // eslint-disable-next-line @typescript-eslint/no-explicit-any
                      router.replace('/onboarding' as any);
                    },
                  },
                ])
              }
            >
              <Text style={[styles.resetText, { color: colors.danger }]}>Reset Setup</Text>
            </TouchableOpacity>
          </View>
        </ScrollView>

        <View style={[styles.footer, { backgroundColor: colors.background }]}>
          <TouchableOpacity
            style={[styles.button, { backgroundColor: saved ? colors.success : colors.tint }]}
            onPress={handleSave}
          >
            <Text style={[styles.buttonText, { color: colors.background }]}>{saved ? 'Saved!' : 'Save Changes'}</Text>
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
  title: { fontSize: 28, fontWeight: '700', marginBottom: 24 },
  section: { marginBottom: 28 },
  appInfoSection: { marginBottom: 8 },
  sectionTitle: { fontSize: 18, fontWeight: '600', marginBottom: 12 },
  label: { fontSize: 14, fontWeight: '500', marginBottom: 6, marginTop: 12 },
  input: { borderRadius: 10, paddingHorizontal: 14, paddingVertical: 12, fontSize: 16 },
  activityRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 4 },
  activityChip: { borderRadius: 20, paddingHorizontal: 14, paddingVertical: 8 },
  chipText: { fontSize: 14, fontWeight: '500' },
  infoRow: { flexDirection: 'row', justifyContent: 'space-between', padding: 14 },
  infoKey: { fontSize: 15 },
  infoVal: { fontSize: 15 },
  preferenceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    borderRadius: 12,
    marginTop: 8,
  },
  preferenceInfo: { flex: 1, marginRight: 16 },
  preferenceLabel: { fontSize: 16, fontWeight: '500' },
  preferenceSubtitle: { fontSize: 12, marginTop: 4, lineHeight: 16 },
  connectBtn: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 8,
  },
  connectBtnText: {
    fontSize: 14,
    fontWeight: '600',
  },
  resetBtn: { borderRadius: 12, paddingVertical: 14, alignItems: 'center' },
  resetText: { fontSize: 16, fontWeight: '500' },
  footer: { paddingHorizontal: 24, paddingTop: 12, paddingBottom: 24 },
  button: { borderRadius: 14, paddingVertical: 16, alignItems: 'center' },
  buttonText: { fontSize: 17, fontWeight: '600' },
});
