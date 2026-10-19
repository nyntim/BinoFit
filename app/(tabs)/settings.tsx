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
} from 'react-native';
import { format } from 'date-fns';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTabBarInset, useTabBarInsetMode } from '@/context/TabBarInsetContext';
import { router, useFocusEffect } from 'expo-router';
import Constants from 'expo-constants';
import { Colors } from '@/constants/theme';
import { AccountSection } from '@/components/settings/AccountSection';
import { NutritionSettingsSheet, TrainingSettingsSheet } from '@/components/settings/TabSettingsSheet';
import { ExportDataSheet } from '@/components/settings/ExportDataSheet';
import { usePreferences } from '@/hooks/usePreferences';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { homeRouteFor } from '@/lib/tracking-mode';
import { useHealthKit } from '@/hooks/use-health-kit';
import {
  getUserProfile,
  saveUserProfile,
  resetOnboarding,
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
import type { UserProfile } from '@/lib/types';

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
  const tabBarInset = useTabBarInset();
  const nativeTabInsets = useTabBarInsetMode() === 'automatic';
  const colorScheme = useColorScheme();
  const colors = Colors[colorScheme ?? 'light'];

  const [exportOpen, setExportOpen] = useState(false);
  const [nutritionOpen, setNutritionOpen] = useState(false);
  const [trainingOpen, setTrainingOpen] = useState(false);
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
  const [persistedSyncAt, setPersistedSyncAt] = useState<number | null>(null);
  const { state: syncState, now: syncNow } = useSyncStatus();

  const { available, syncing, lastSyncedAt, syncFailed, initFailed, syncV1, runSync } = useHealthKit();

  const healthSubtitle = (() => {
    if (syncing) return 'Syncing…';
    if (initFailed) return 'Health access is off.';
    if (syncFailed) return "Couldn't sync.";
    if (lastSyncedAt) return `Last synced ${format(lastSyncedAt, 'h:mm a')}`;
    if (!syncV1) return 'Weight, steps, calories, nutrition, and workouts.';
    return 'Weight, steps, calories, nutrition, and workouts.';
  })();

  const loadData = useCallback(async () => {
    const profile = await getUserProfile();
    if (profile) {
      setHeight(profile.height ? String(profile.height) : '');
      if (profile.activity_level) setActivityLevel(profile.activity_level);
    }
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

  async function handleSave() {
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

    await saveUserProfile({
      weight: weightKg,
      height: height ? parseFloat(height) : null,
      activity_level: activityLevel,
    });
    syncToSupabase();

  }

  const bg = { backgroundColor: colors.cardBackground };
  const inputStyle = [styles.input, bg, { color: colors.text }];
  const labelStyle = [styles.label, { color: colors.text }];
  const showAppleHealth = Platform.OS === 'ios' && available;

  return (
    <SafeAreaView edges={['top']} style={[styles.container, { backgroundColor: colors.background }]}>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView contentContainerStyle={[styles.scroll, { paddingBottom: 24 + tabBarInset }]} contentInsetAdjustmentBehavior={nativeTabInsets ? 'automatic' : undefined} scrollIndicatorInsets={nativeTabInsets ? undefined : { bottom: tabBarInset }} showsVerticalScrollIndicator={false}>
          <Text style={[styles.title, { color: colors.text }]}>Settings</Text>

          <Text
            style={[styles.sectionTitle, { color: colors.text }]}
            accessibilityRole="header"
          >
            General
          </Text>

          <AccountSection />

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

          <View style={styles.section}>
            <Text style={[styles.sectionTitle, { color: colors.text }]}>Nutrition</Text>
            <TouchableOpacity style={[styles.settingsEntry, bg]} onPress={() => setNutritionOpen(true)} accessibilityRole="button" accessibilityLabel="Nutrition settings">
              <Text style={[styles.preferenceLabel, { color: colors.text }]}>Nutrition settings</Text>
              <Text style={{ color: colors.icon }}>›</Text>
            </TouchableOpacity>
          </View>

          {showAppleHealth ? (
            <View style={styles.section}>
              <TouchableOpacity style={[styles.healthSyncBtn, { backgroundColor: colors.tint + '12' }]} onPress={runSync} disabled={syncing} accessibilityRole="button" accessibilityLabel="Sync with Apple Health">
                <Text style={[styles.connectBtnText, { color: colors.tint }]}>Sync with Apple Health</Text>
              </TouchableOpacity>
              <Text style={[styles.healthSyncSubtitle, { color: colors.icon }]}>{healthSubtitle}</Text>
            </View>
          ) : null}

          <View style={styles.section}>
            <Text style={[styles.sectionTitle, { color: colors.text }]}>Training</Text>
            <TouchableOpacity style={[styles.settingsEntry, bg]} onPress={() => setTrainingOpen(true)} accessibilityRole="button" accessibilityLabel="Training settings">
              <Text style={[styles.preferenceLabel, { color: colors.text }]}>Training settings</Text>
              <Text style={{ color: colors.icon }}>›</Text>
            </TouchableOpacity>
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
          <View style={[styles.footer, { backgroundColor: colors.background, paddingHorizontal: 0 }]}>
            <TouchableOpacity
              style={[styles.button, { backgroundColor: colors.tint }]}
              onPress={handleSave}
              accessibilityRole="button"
            >
              <Text style={[styles.buttonText, { color: colors.background }]}>Save personal stats</Text>
            </TouchableOpacity>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
      <ExportDataSheet visible={exportOpen} onClose={() => setExportOpen(false)} />
      <NutritionSettingsSheet visible={nutritionOpen} onClose={() => setNutritionOpen(false)} onManageReminders={() => router.push({ pathname: homeRouteFor(), params: { editMeals: '1' } })} />
      <TrainingSettingsSheet visible={trainingOpen} onClose={() => setTrainingOpen(false)} />
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
  settingsEntry: { minHeight: 52, borderRadius: 12, paddingHorizontal: 16, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  exportBtn: { minHeight: 44, justifyContent: 'center' },
  healthSyncBtn: {
    minHeight: 44,
    borderRadius: 10,
    paddingVertical: 12,
    paddingHorizontal: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  healthSyncSubtitle: {
    fontSize: 13,
    marginTop: 8,
    paddingHorizontal: 4,
  },
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
