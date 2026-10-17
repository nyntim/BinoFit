import { useEffect, useState, useCallback, useRef } from 'react';
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
  Linking,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, useFocusEffect } from 'expo-router';
import Constants from 'expo-constants';
import { Colors } from '@/constants/theme';
import { AccountSection } from '@/components/settings/AccountSection';
import { TrainingSection } from '@/components/settings/TrainingSection';
import { ExportDataSheet } from '@/components/settings/ExportDataSheet';
import { usePreferences } from '@/hooks/usePreferences';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { useHealthKit } from '@/hooks/use-health-kit';
import {
  getUserGoals,
  saveUserGoals,
  getUserProfile,
  saveUserProfile,
  resetOnboarding,
  getDefaultLogStatus,
  setDefaultLogStatus,
  getLastSyncAt,
} from '@/lib/storage';
import { formatWeight, lbToKg, parseDecimal } from '@/lib/units';
import {
  getLatestWeightEntry,
  saveWeightEntry,
  weightInputToKg,
  weightRangeMessage,
} from '@/lib/weight';
import { syncToSupabase } from '@/lib/sync';
import { deriveLastSynced, isSyncConfigured } from '@/lib/sync-status';
import { useSyncStatus } from '@/hooks/useSyncStatus';
import type { LogStatus, UserProfile } from '@/lib/types';

type ActivityLevel = NonNullable<UserProfile['activity_level']>;

const ACTIVITY_OPTIONS: { value: ActivityLevel; label: string }[] = [
  { value: 'sedentary', label: 'Sedentary' },
  { value: 'light', label: 'Light' },
  { value: 'moderate', label: 'Moderate' },
  { value: 'active', label: 'Active' },
  { value: 'very_active', label: 'Very Active' },
];

function formatLastSynced(v: ReturnType<typeof deriveLastSynced>): string {
  switch (v.kind) {
    case 'off':
      return 'Off';
    case 'paused':
      return 'Paused';
    case 'never':
      return 'Not yet';
    case 'at':
      return new Date(v.at).toLocaleString([], {
        month: 'short',
        day: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
      });
  }
}

export default function SettingsScreen() {
  const colorScheme = useColorScheme();
  const colors = Colors[colorScheme ?? 'light'];

  const [exportOpen, setExportOpen] = useState(false);
  const [calories, setCalories] = useState('');
  const [protein, setProtein] = useState('');
  const [carbs, setCarbs] = useState('');
  const [fat, setFat] = useState('');
  const [weight, setWeight] = useState('');
  const { weightUnit } = usePreferences();
  const weightTouched = useRef(false);
  // The weight shown when loaded: latest entry, else profile.weight. Save writes an entry only if the field differs.
  const weightBase = useRef<{ kg: number | null; text: string; hasEntry: boolean }>({
    kg: null,
    text: '',
    hasEntry: false,
  });
  const [height, setHeight] = useState('');
  const [activityLevel, setActivityLevel] = useState<ActivityLevel>('moderate');
  const [defaultStatus, setDefaultStatus] = useState<LogStatus>('eaten');
  const [saved, setSaved] = useState(false);
  const [persistedSyncAt, setPersistedSyncAt] = useState<number | null>(null);
  const { state: syncState, now: syncNow } = useSyncStatus();

  const { available, writeGranted, initHealthKit } = useHealthKit();

  const loadData = useCallback(async () => {
    const [goals, profile, status] = await Promise.all([
      getUserGoals(),
      getUserProfile(),
      getDefaultLogStatus(),
    ]);
    if (goals) {
      setCalories(String(goals.calorie_goal));
      setProtein(String(goals.protein_goal));
      setCarbs(String(goals.carb_goal));
      setFat(String(goals.fat_goal));
    }
    if (profile) {
      setHeight(profile.height ? String(profile.height) : '');
      if (profile.activity_level) setActivityLevel(profile.activity_level);
    }
    setDefaultStatus(status);
    const lastSync = await getLastSyncAt();
    setPersistedSyncAt(lastSync ? Date.parse(lastSync) : null);
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const loadWeight = useCallback(async () => {
    // Never replace what the user is typing.
    if (weightTouched.current) return;
    const [entry, profile] = await Promise.all([getLatestWeightEntry(), getUserProfile()]);
    const kg = entry?.weight_kg ?? profile?.weight ?? null;
    const text = kg ? formatWeight(kg, weightUnit) : '';
    weightBase.current = { kg, text, hasEntry: entry !== null };
    setWeight(text);
  }, [weightUnit]);

  // The tab stays mounted, so reload when it regains focus (an entry may have been logged elsewhere).
  useFocusEffect(
    useCallback(() => {
      loadWeight();
    }, [loadWeight])
  );

  // A unit change converts the typed text instead of refetching over it.
  const prevUnit = useRef(weightUnit);
  useEffect(() => {
    const prev = prevUnit.current;
    if (prev === weightUnit) return;
    prevUnit.current = weightUnit;
    if (!weightTouched.current) return;
    const base = weightBase.current;
    weightBase.current = { ...base, text: base.kg ? formatWeight(base.kg, weightUnit) : '' };
    setWeight((current) => {
      const v = parseDecimal(current);
      if (v === null) return current;
      return formatWeight(prev === 'kg' ? v : lbToKg(v), weightUnit);
    });
  }, [weightUnit]);

  async function handleSelectDefaultStatus(next: LogStatus) {
    if (next === defaultStatus) return;
    setDefaultStatus(next);
    await setDefaultLogStatus(next);
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

    const base = weightBase.current;
    const typedWeight = parseDecimal(weight);
    // Untouched field: keep whatever the profile holds now, not the base loaded earlier.
    const currentProfile = await getUserProfile();
    let weightKg = currentProfile?.weight ?? null;
    if (weight.trim() === '') {
      // Cleared field: entries stay as they are.
      if (!base.hasEntry) weightKg = null;
    } else if (typedWeight === null || typedWeight !== parseDecimal(base.text)) {
      const kg = weightInputToKg(weight, weightUnit);
      if (kg === null) {
        Alert.alert('Invalid input', weightRangeMessage(weightUnit));
        return;
      }
      try {
        await saveWeightEntry({ weight_kg: kg });
        syncToSupabase();
      } catch {
        Alert.alert("Couldn't save weight", 'Your entry was not saved. Try again.');
        return;
      }
      weightKg = kg;
      weightBase.current = { kg, text: weight, hasEntry: true };
      weightTouched.current = false;
    }

    await Promise.all([
      saveUserGoals({ calorie_goal: cal, protein_goal: prot, carb_goal: carb, fat_goal: f }),
      saveUserProfile({
        weight: weightKg,
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
              placeholder="cal"
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
                  Default for new food
                </Text>
                <Text style={[styles.preferenceSubtitle, { color: colors.icon }]}>
                  Planned meals don&apos;t count toward your daily totals until you mark them eaten.
                </Text>
              </View>
              <View
                style={[styles.statusSwitch, { backgroundColor: colors.cardSecondary }]}
                accessibilityRole="radiogroup"
                accessibilityLabel="Default for new food"
              >
                {(['planned', 'eaten'] as const).map((status) => {
                  const selected = defaultStatus === status;
                  return (
                    <TouchableOpacity
                      key={status}
                      style={[styles.statusSegment, selected && { backgroundColor: colors.tint }]}
                      onPress={() => handleSelectDefaultStatus(status)}
                      activeOpacity={0.7}
                      accessibilityRole="radio"
                      accessibilityState={{ selected }}
                    >
                      <Text
                        style={[
                          styles.statusSegmentText,
                          { color: selected ? colors.background : colors.icon },
                        ]}
                      >
                        {status === 'eaten' ? 'Eaten' : 'Planned'}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
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

            <Text style={labelStyle}>Weight ({weightUnit})</Text>
            <TextInput
              style={[inputStyle, styles.tabular]}
              value={weight}
              onChangeText={(t) => {
                weightTouched.current = true;
                setWeight(t);
              }}
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

          <TrainingSection />

          <View style={styles.section}>
            <Text style={[styles.sectionTitle, { color: colors.text }]}>Data</Text>
            <View style={[styles.preferenceRow, bg]}>
              <View style={styles.preferenceInfo}>
                <Text style={[styles.preferenceLabel, { color: colors.text }]}>Export data</Text>
                <Text style={[styles.preferenceSubtitle, { color: colors.icon }]}>
                  Food log as a CSV file. Works offline.
                </Text>
              </View>
              <TouchableOpacity
                style={[styles.connectBtn, styles.exportBtn, { backgroundColor: colors.cardSecondary }]}
                onPress={() => setExportOpen(true)}
                accessibilityRole="button"
                accessibilityLabel="Export data"
              >
                <Text style={[styles.connectBtnText, { color: colors.text }]}>Export</Text>
              </TouchableOpacity>
            </View>
          </View>

          <AccountSection />

          <View style={[styles.section, styles.appInfoSection]}>
            <Text style={[styles.sectionTitle, { color: colors.text }]}>App Info</Text>
            <View style={[styles.infoRow, bg, { borderRadius: 12 }]}>
              <Text style={[styles.infoKey, { color: colors.text }]}>Version</Text>
              <Text style={[styles.infoVal, { color: colors.icon }]}>
                {Constants.expoConfig?.version ?? '1.0.0'}
              </Text>
            </View>
            <View style={[styles.infoRow, bg, { borderRadius: 12, marginTop: 8 }]}>
              <Text style={[styles.infoKey, { color: colors.text }]}>Last synced</Text>
              <Text style={[styles.infoVal, { color: colors.icon }]}>
                {formatLastSynced(
                  deriveLastSynced(syncState, syncNow, isSyncConfigured(), persistedSyncAt)
                )}
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
      <ExportDataSheet visible={exportOpen} onClose={() => setExportOpen(false)} />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  tabular: { fontVariant: ['tabular-nums'] },
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
  statusSwitch: { flexDirection: 'row', borderRadius: 20, padding: 3 },
  statusSegment: {
    minHeight: 38,
    paddingHorizontal: 14,
    borderRadius: 17,
    justifyContent: 'center',
  },
  statusSegmentText: { fontSize: 13, fontWeight: '600' },
  exportBtn: { minHeight: 44, justifyContent: 'center' },
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
  resetText: { fontSize: 16, fontWeight: '600' },
  footer: { paddingHorizontal: 24, paddingTop: 12, paddingBottom: 24 },
  button: { borderRadius: 14, paddingVertical: 16, alignItems: 'center' },
  buttonText: { fontSize: 17, fontWeight: '600' },
});
