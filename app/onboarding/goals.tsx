import { useCallback, useEffect, useRef, useState } from 'react';
import {
  AccessibilityInfo,
  Alert,
  BackHandler,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  findNodeHandle,
} from 'react-native';
import { Stack, router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { AboutYouStep } from '@/components/onboarding/AboutYouStep';
import { DailyTargetsStep, type TargetsDraft } from '@/components/onboarding/DailyTargetsStep';
import { OnboardingHeader } from '@/components/onboarding/OnboardingHeader';
import { Button } from '@/components/ui/Button';
import { useThemeColor } from '@/hooks/use-theme-color';
import { usePreferences } from '@/hooks/usePreferences';
import { setWeightUnit } from '@/lib/app-preferences';
import {
  convertStatsDraft,
  statsDraftFrom,
  validateStats,
  type StatsDraft,
  type StatsOriginal,
} from '@/lib/onboarding-setup';
import { getUserGoals, getUserProfile, saveUserGoals, saveUserProfile } from '@/lib/storage';
import { syncToSupabase } from '@/lib/sync';
import { getLatestWeightEntry, saveWeightEntry } from '@/lib/weight';

type Step = 'stats' | 'targets';
type StatsError = { field: 'weight' | 'height'; message: string };

const GOALS_ERROR = 'Please fill in all calorie and macro goals.';
const EMPTY_STATS: StatsDraft = { weight: '', heightCm: '', feet: '', inches: '', activity: null };

/** Onboarding setup: About you, then Daily targets. One route so validation, the loaded snapshot and the save order stay together. */
export default function GoalsScreen() {
  const { restart } = useLocalSearchParams<{ restart?: string }>();
  const background = useThemeColor({}, 'background');
  const tint = useThemeColor({}, 'tint');
  const { weightUnit } = usePreferences();

  const [targets, setTargets] = useState<TargetsDraft>({ calories: '2000', protein: '150', carbs: '200', fat: '65' });
  const [stats, setStats] = useState<StatsDraft>(EMPTY_STATS);
  const [step, setStep] = useState<Step>('stats');
  const [statsError, setStatsError] = useState<StatsError | null>(null);
  const [goalsError, setGoalsError] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  const [saving, setSaving] = useState(false);

  const busy = useRef(false);
  const original = useRef<StatsOriginal | null>(null);
  const statsRef = useRef(stats);
  // Read through refs so a unit change never reloads the screen and wipes typed values.
  const unitRef = useRef(weightUnit);
  const previousUnit = useRef(weightUnit);
  const scrollRef = useRef<ScrollView>(null);
  const headingRef = useRef<View>(null);
  const firstStep = useRef(true);

  useEffect(() => {
    statsRef.current = stats;
    unitRef.current = weightUnit;
  });

  useEffect(() => {
    let active = true;
    Promise.all([getUserGoals(), getUserProfile(), getLatestWeightEntry()]).then(([goals, profile, latest]) => {
      if (!active) return;
      if (goals) {
        setTargets({
          calories: String(goals.calorie_goal),
          protein: String(goals.protein_goal),
          carbs: String(goals.carb_goal),
          fat: String(goals.fat_goal),
        });
      }
      const kg = latest?.weight_kg ?? profile?.weight ?? null;
      const draft = statsDraftFrom(profile, kg, unitRef.current, profile?.activity_level ?? (restart === '1' ? null : 'moderate'));
      original.current = { profile, draft, weightKg: kg };
      setStats(draft);
      setReady(true);
    }).catch(() => Alert.alert('Could not load setup', 'Return to Settings and try again.'));
    return () => { active = false; };
  }, [restart]);

  // The Imperial / Metric control writes the preference; the draft follows it here.
  useEffect(() => {
    const from = previousUnit.current;
    if (from === weightUnit) return;
    previousUnit.current = weightUnit;
    setStatsError(null);
    if (!original.current) return;
    const converted = convertStatsDraft(statsRef.current, original.current, from, weightUnit);
    original.current = converted.original;
    setStats(converted.draft);
  }, [weightUnit]);

  // New step: top of the page, screen reader on the new heading.
  useEffect(() => {
    if (firstStep.current) {
      firstStep.current = false;
      return;
    }
    scrollRef.current?.scrollTo({ y: 0, animated: false });
    const node = findNodeHandle(headingRef.current);
    if (node) AccessibilityInfo.setAccessibilityFocus(node);
  }, [step]);

  // Android back on Daily targets returns to About you instead of leaving setup.
  useFocusEffect(
    useCallback(() => {
      const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
        if (step !== 'targets') return false;
        setStep('stats');
        return true;
      });
      return () => subscription.remove();
    }, [step]),
  );

  function changeStats(patch: Partial<StatsDraft>) {
    setStats((prev) => ({ ...prev, ...patch }));
    setStatsError(null);
  }

  function changeTargets(name: keyof TargetsDraft, value: string) {
    setTargets((prev) => ({ ...prev, [name]: value }));
    setGoalsError(null);
  }

  function handleContinue() {
    if (!ready || !original.current) return;
    const result = validateStats(stats, original.current, weightUnit);
    if (!result.ok) {
      setStatsError({ field: result.field, message: result.message });
      return;
    }
    setStatsError(null);
    setStep('targets');
  }

  function handleSkip() {
    if (original.current) setStats(original.current.draft);
    setStatsError(null);
    setStep('targets');
  }

  async function handleSave() {
    const base = original.current;
    if (!ready || !base || busy.current) return;
    const cal = Number(targets.calories);
    const prot = Number(targets.protein);
    const carb = Number(targets.carbs);
    const f = Number(targets.fat);

    if (![cal, prot, carb, f].every((v) => Number.isFinite(v) && v > 0)) {
      setGoalsError(GOALS_ERROR);
      return;
    }

    const result = validateStats(stats, base, weightUnit);
    if (!result.ok) {
      setStatsError({ field: result.field, message: result.message });
      setStep('stats');
      return;
    }
    const { weightKg, heightCm } = result;
    const weightUntouched = stats.weight === base.draft.weight;

    busy.current = true;
    setSaving(true);
    try {
      await saveUserGoals({
        calorie_goal: cal,
        protein_goal: prot,
        carb_goal: carb,
        fat_goal: f,
      });

      const unchangedProfile = restart === '1' && weightUntouched && !result.heightChanged
        && stats.activity === (base.profile?.activity_level ?? null);
      if (!unchangedProfile) await saveUserProfile({
        weight: weightKg ?? base.weightKg ?? null,
        height: heightCm,
        activity_level: stats.activity,
      });

      if (weightKg !== null && !weightUntouched) {
        await saveWeightEntry({ weight_kg: weightKg });
      }
      syncToSupabase();

      router.push({ pathname: '/onboarding/complete', params: { restart } });
    } catch {
      Alert.alert('Could not save setup', 'Your entries are still here. Try again.');
    } finally {
      busy.current = false;
      setSaving(false);
    }
  }

  const onStats = step === 'stats';

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: background }]}>
      <Stack.Screen options={{ gestureEnabled: onStats && !saving }} />
      <OnboardingHeader
        step={onStats ? 2 : 3}
        onBack={onStats ? (router.canGoBack() ? () => router.back() : undefined) : () => setStep('stats')}
        backDisabled={saving}
        trailing={
          onStats ? (
            <Pressable onPress={handleSkip} style={styles.skip} accessibilityRole="button" accessibilityLabel="Skip">
              <Text style={[styles.skipText, { color: tint }]}>Skip</Text>
            </Pressable>
          ) : null
        }
      />
      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView
          ref={scrollRef}
          contentContainerStyle={styles.scroll}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {onStats ? (
            <AboutYouStep
              headingRef={headingRef}
              unit={weightUnit}
              onUnitChange={(unit) => void setWeightUnit(unit).catch(() => undefined)}
              draft={stats}
              onChange={changeStats}
              error={statsError}
            />
          ) : (
            <DailyTargetsStep headingRef={headingRef} values={targets} onChange={changeTargets} error={goalsError} />
          )}
        </ScrollView>
        <View style={[styles.footer, { backgroundColor: background }]}>
          {onStats ? (
            <Button label="Continue" size="lg" onPress={handleContinue} disabled={!ready} />
          ) : (
            <Button label="Save targets" size="lg" onPress={handleSave} loading={saving} disabled={!ready} />
          )}
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  flex: { flex: 1 },
  scroll: { paddingHorizontal: 20, paddingTop: 12, paddingBottom: 24 },
  footer: { paddingHorizontal: 20, paddingTop: 12, paddingBottom: 24 },
  skip: { minHeight: 44, minWidth: 44, alignItems: 'flex-end', justifyContent: 'center' },
  skipText: { fontSize: 17, fontWeight: '600' },
});
