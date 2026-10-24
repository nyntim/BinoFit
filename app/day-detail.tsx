import { useCallback, useState } from 'react';
import {
  StyleSheet,
  View,
  ScrollView,
  ActivityIndicator,
  Pressable,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { format, parseISO, subDays, addDays } from 'date-fns';
import { DayWorkouts } from '@/components/dashboard/DayWorkouts';
import { ThemedText } from '@/components/themed-text';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { EmptyState } from '@/components/ui/EmptyState';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { ProgressBar } from '@/components/ui/ProgressBar';
import { Tag } from '@/components/ui/Tag';
import { MacroColors } from '@/constants/theme';
import { useThemeColor } from '@/hooks/use-theme-color';
import { useDaySummary } from '@/hooks/useDaySummary';
import { getUserGoals } from '@/lib/storage';
import { getFoodLogsWithFoodByDate, getMealSlotConfirmationsByDate } from '@/lib/database';
import { isSlotEaten, sumEatenTotals, logsForSlot, slotCalories } from '@/lib/nutrition-totals';
import { formatMealTargets, mealsForDay } from '@/lib/meals';
import { useMealDefinitions } from '@/hooks/useMealDefinitions';
import { formatServingAmountDisplay } from '@/lib/food-validation';
import type { FoodLogWithFood, MealSlotConfirmation, UserGoals } from '@/lib/types';

const DEFAULT_GOALS: UserGoals = {
  calorie_goal: 2000,
  protein_goal: 150,
  carb_goal: 200,
  fat_goal: 65,
  updated_at: '',
};

export default function DayDetailScreen() {
  const { date } = useLocalSearchParams<{ date: string }>();
  const router = useRouter();
  const background = useThemeColor({}, 'background');
  const icon = useThemeColor({}, 'icon');
  const separator = useThemeColor({}, 'separator');
  const tint = useThemeColor({}, 'tint');

  const [goals, setGoals] = useState<UserGoals>(DEFAULT_GOALS);
  const [logs, setLogs] = useState<FoodLogWithFood[]>([]);
  const [confirmations, setConfirmations] = useState<MealSlotConfirmation[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const { workouts } = useDaySummary(date ?? null);

  const parsed = date ? parseISO(date) : null;
  const today = format(new Date(), 'yyyy-MM-dd');

  useFocusEffect(
    useCallback(() => {
      if (!date) return;
      void attempt; // Try again bumps this to reload
      let cancelled = false;
      // Every date shows a spinner while it loads, so the arrows never leave stale data on screen
      setLoading(true);
      setLoadError(false);
      Promise.all([getUserGoals(), getFoodLogsWithFoodByDate(date), getMealSlotConfirmationsByDate(date)])
        .then(([userGoals, foodLogs, slotConfirmations]) => {
          if (cancelled) return;
          if (userGoals) setGoals(userGoals);
          setLogs(foodLogs);
          setConfirmations(slotConfirmations);
        })
        .catch(() => {
          if (!cancelled) setLoadError(true);
        })
        .finally(() => {
          if (!cancelled) setLoading(false);
        });
      return () => {
        cancelled = true;
      };
    }, [date, attempt])
  );

  const { defs, names, loaded: mealsLoaded } = useMealDefinitions();
  const meals = mealsForDay(defs, names, logs, date ?? '');

  const consumed = sumEatenTotals(logs, confirmations);
  const eatenCalories = Math.round(consumed.calories);
  const macros = [
    { label: 'Protein', value: Math.round(consumed.protein * 10) / 10, goal: goals.protein_goal, color: MacroColors.protein },
    { label: 'Carbs', value: Math.round(consumed.carbs * 10) / 10, goal: goals.carb_goal, color: MacroColors.carbs },
    { label: 'Fat', value: Math.round(consumed.fat * 10) / 10, goal: goals.fat_goal, color: MacroColors.fat },
  ];
  const goToDay = (target: Date) => router.setParams({ date: format(target, 'yyyy-MM-dd') });
  const nextDisabled = !date || date >= today;

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: background }]}>
      {/* Navbar */}
      <View style={styles.navRow}>
        <Pressable accessibilityRole="button" accessibilityLabel="Progress" onPress={() => router.back()} style={styles.backBtn} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
          <IconSymbol name="chevron.left" size={22} color={tint} />
          <ThemedText style={[styles.backText, { color: tint }]}>Progress</ThemedText>
        </Pressable>
        <View style={styles.arrows}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Previous day"
            disabled={!parsed}
            onPress={() => parsed && goToDay(subDays(parsed, 1))}
            style={styles.arrow}
          >
            <IconSymbol name="chevron.left" size={22} color={tint} />
          </Pressable>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Next day"
            accessibilityState={{ disabled: nextDisabled }}
            disabled={nextDisabled}
            onPress={() => parsed && goToDay(addDays(parsed, 1))}
            style={[styles.arrow, nextDisabled && styles.disabled]}
          >
            <IconSymbol name="chevron.right" size={22} color={tint} />
          </Pressable>
        </View>
      </View>

      {loadError && !loading ? (
        <View style={styles.loadingContainer} accessibilityRole="alert">
          <ThemedText type="body" style={styles.errorText}>Couldn’t load this day.</ThemedText>
          <Button label="Try again" variant="soft" onPress={() => setAttempt((n) => n + 1)} />
        </View>
      ) : loading || !mealsLoaded ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator color={tint} />
        </View>
      ) : (
        <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
          <View style={styles.title}>
            <ThemedText type="largeTitle">{parsed ? format(parsed, 'EEE d MMM') : ''}</ThemedText>
            <ThemedText type="label" style={{ color: icon }}>Day summary</ThemedText>
          </View>

          {logs.length === 0 ? (
            <EmptyState title="No food logged this day" />
          ) : (
            <>
              {/* Summary */}
              <Card style={styles.summaryCard}>
                <View style={styles.summaryRow}>
                  <View>
                    <ThemedText type="caption">Eaten</ThemedText>
                    <ThemedText type="hero" style={styles.eaten}>{eatenCalories.toLocaleString()}</ThemedText>
                  </View>
                  <View style={styles.goalCol}>
                    <ThemedText type="caption">Goal</ThemedText>
                    <ThemedText type="body" style={styles.bold}>{`${goals.calorie_goal.toLocaleString()} cal`}</ThemedText>
                  </View>
                </View>
                <ProgressBar
                  value={eatenCalories}
                  max={goals.calorie_goal}
                  height={12}
                  accessibilityLabel={`${eatenCalories.toLocaleString()} of ${goals.calorie_goal.toLocaleString()} calories eaten`}
                />
                <View style={styles.macroGrid}>
                  {macros.map((macro) => (
                    <View key={macro.label} style={styles.macro}>
                      <View style={styles.macroLabel}>
                        <View style={[styles.dot, { backgroundColor: macro.color }]} />
                        <ThemedText type="caption">{macro.label}</ThemedText>
                      </View>
                      <ThemedText type="body" style={styles.tabular}>
                        <ThemedText type="body" style={styles.bold}>{macro.value}</ThemedText>
                        <ThemedText type="caption">{` / ${macro.goal} g`}</ThemedText>
                      </ThemedText>
                      <ProgressBar
                        value={macro.value}
                        max={macro.goal}
                        color={macro.color}
                        height={6}
                        accessibilityLabel={`${macro.label}, ${macro.value} of ${macro.goal} grams`}
                      />
                    </View>
                  ))}
                </View>
              </Card>

              {/* Meal slots (read-only) */}
              <Card padding="none">
                {meals.map(({ id: key, name: label, def }, index, all) => {
                  const slotLogs = logsForSlot(logs, key);
                  if (slotLogs.length === 0) return null;
                  const slotCals = Math.round(slotCalories(logs, key));
                  const eaten = isSlotEaten(confirmations, key);
                  const targetText = formatMealTargets(def, sumEatenTotals(slotLogs, []));
                  const calText = targetText.calories ?? `${slotCals} cal`;
                  const first = all.findIndex((m) => logsForSlot(logs, m.id).length > 0) === index;
                  return (
                    <View key={key} style={[styles.slot, !first && [styles.slotDivider, { borderTopColor: separator }]]}>
                      <View style={styles.slotHeader}>
                        <ThemedText type="title" style={styles.slotLabel}>{label}</ThemedText>
                        {!eaten && <Tag label="Planned" />}
                        <ThemedText type="body" style={[styles.bold, styles.tabular]}>{calText}</ThemedText>
                      </View>
                      {targetText.macros && <ThemedText type="caption" style={styles.tabular}>{targetText.macros}</ThemedText>}
                      {slotLogs.map((log) => (
                        <View key={log.id} style={styles.logRow}>
                          <ThemedText type="caption" style={styles.logName} numberOfLines={1}>{log.food_name}</ThemedText>
                          <ThemedText type="caption">{`${formatServingAmountDisplay(log.serving_amount)} × ${log.food_serving_units}`}</ThemedText>
                          <ThemedText type="caption" style={styles.tabular}>{Math.round(log.food_calories * log.serving_amount)}</ThemedText>
                        </View>
                      ))}
                    </View>
                  );
                })}
              </Card>
            </>
          )}

          <DayWorkouts workouts={workouts} />
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  navRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 12, paddingVertical: 4 },
  backBtn: { flexDirection: 'row', alignItems: 'center', minHeight: 44 },
  backText: { fontSize: 17 },
  arrows: { flexDirection: 'row', alignItems: 'center' },
  arrow: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  disabled: { opacity: 0.35 },
  loadingContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', gap: 12 },
  errorText: { textAlign: 'center' },
  scroll: { padding: 16, paddingBottom: 40, gap: 14 },
  title: { gap: 2 },
  summaryCard: { gap: 14 },
  summaryRow: { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', gap: 12 },
  eaten: { fontSize: 34, lineHeight: 38 },
  goalCol: { alignItems: 'flex-end' },
  bold: { fontWeight: '600' },
  tabular: { fontVariant: ['tabular-nums'] },
  macroGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  macro: { flexGrow: 1, flexBasis: 96, gap: 4 },
  macroLabel: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  dot: { width: 8, height: 8, borderRadius: 4 },
  slot: { paddingHorizontal: 18, paddingVertical: 14, gap: 4 },
  slotDivider: { borderTopWidth: StyleSheet.hairlineWidth },
  slotHeader: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  slotLabel: { flex: 1 },
  logRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  logName: { flex: 1 },
});
