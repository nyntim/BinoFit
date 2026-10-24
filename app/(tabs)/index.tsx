import { useCallback, useEffect, useRef, useState, useMemo } from 'react';
import {
  AccessibilityInfo,
  StyleSheet,
  View,
  ScrollView,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTabBarInset, useTabBarInsetMode } from '@/context/TabBarInsetContext';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { GestureDetector } from 'react-native-gesture-handler';
import Animated from 'react-native-reanimated';
import { useThemeColor } from '@/hooks/use-theme-color';
import {
  getUserGoals,
  getQuickAddDrinks,
  saveQuickAddDrinks,
} from '@/lib/storage';
import {
  getFoodLogsWithFoodByDate,
  getMealSlotConfirmationsByDate,
  addWaterLog,
  getWaterLogsByDate,
  deleteWaterLog,
  countFoodLogsForMeal,
} from '@/lib/database';
import { CalendarWidget } from '@/components/CalendarWidget';
import { DayWorkouts } from '@/components/dashboard/DayWorkouts';
import { useDashboardTraining } from '@/hooks/useDashboardTraining';
import { EditModeBar } from '@/components/dashboard/EditModeBar';
import { CustomWaterModal, QuickAddSearchModal } from '@/components/dashboard/WaterModals';
import { ActivityCard } from '@/components/dashboard/ActivityCard';
import { CalorieCard } from '@/components/dashboard/CalorieCard';
import { DashboardHeader } from '@/components/dashboard/DashboardHeader';
import { DefaultStatusRow } from '@/components/dashboard/DefaultStatusRow';
import { MacroCard } from '@/components/dashboard/MacroCard';
import { MealCardList } from '@/components/dashboard/MealCardList';
import { MealEditList } from '@/components/dashboard/MealEditList';
import { WaterCard } from '@/components/dashboard/WaterCard';
import { Card } from '@/components/ui/Card';
import { useDate } from '@/context/DateContext';
import { useSwipeDayNavigation } from '@/hooks/useSwipeDayNavigation';
import { useHealthKit } from '@/hooks/use-health-kit';
import { useKeyboardHeight } from '@/hooks/useKeyboardHeight';
import { useScrollRestore } from '@/hooks/useScrollRestore';
import { WATER_TRACKING_ENABLED } from '@/constants/features';
import { useMealLogs } from '@/hooks/useMealLogs';
import { useMealDefinitions } from '@/hooks/useMealDefinitions';
import { useMealDraft } from '@/hooks/useMealDraft';
import { restoreMealReminders } from '@/lib/reminders';
import { MealNutritionSummary } from '@/components/dashboard/MealNutritionSummary';
import { isSlotEaten, logsForSlot, sumPlannedTotals } from '@/lib/nutrition-totals';
import { syncToSupabase } from '@/lib/sync';
import { deleteMealMessage, mealsForDay } from '@/lib/meals';
import { openMealEditAfterReload } from '@/lib/meal-settings-entry';
import { usePreferences } from '@/hooks/usePreferences';
import type { FoodLogWithFood, UserGoals, MealSlot, WaterLog, QuickAddDrink } from '@/lib/types';

const DEFAULT_GOALS: UserGoals = {
  calorie_goal: 2000,
  protein_goal: 150,
  carb_goal: 200,
  fat_goal: 65,
  updated_at: '',
};

const DEFAULT_QUICK_DRINKS: QuickAddDrink[] = [
  { id: '1', name: '8 oz Water', amount: 8 },
  { id: '2', name: '12 oz Coke Zero', amount: 12 },
  { id: '3', name: '16 oz Coffee', amount: 16 },
];

export default function HomeScreen() {
  const preferences = usePreferences();
  const background = useThemeColor({}, 'background');
  const tint = useThemeColor({}, 'tint');
  const router = useRouter();
  const { editMeals, manageMeals } = useLocalSearchParams<{ editMeals?: string; manageMeals?: string }>();
  const [summarySelection, setSummarySelection] = useState<{ id: MealSlot; date: string } | null>(null);
  const summaryFocusTarget = useRef<number | null>(null);
  const restoreSummaryFocus = useCallback(() => {
    const target = summaryFocusTarget.current;
    if (target != null) requestAnimationFrame(() => AccessibilityInfo.setAccessibilityFocus(target));
  }, []);
  const [loadedDataDate, setLoadedDataDate] = useState<string | null>(null);
  const requestGeneration = useRef(0);
  const focused = useRef(false);
  const loadedDateRef = useRef<string | null>(null);
  const { selectedDate } = useDate();
  const [isEditing, setIsEditing] = useState(false);
  const editingRef = useRef(false);
  const { panGesture, animatedStyle } = useSwipeDayNavigation({ enabled: !isEditing });
  const { scrollRef: dashScrollRef, onScroll: onDashScroll, onContentSizeChange: onDashContentSizeChange } = useScrollRestore('dashboard');

  const training = useDashboardTraining(selectedDate);
  const today = training.today;

  const [goals, setGoals] = useState<UserGoals>(DEFAULT_GOALS);
  const {
    logs,
    setLogs,
    confirmations,
    setConfirmations,
    consumed,
    handleToggleSlot,
    handleDeleteLog: deleteMealLog,
  } = useMealLogs(selectedDate);
  const { defs, names, loaded: mealsLoaded, reload: reloadMeals } = useMealDefinitions();
  const mealDraft = useMealDraft();
  const [scrollLocked, setScrollLocked] = useState(false);
  // Android: pad the scroll content by the keyboard height so lower meal inputs can scroll into view.
  // iOS uses automaticallyAdjustKeyboardInsets instead.
  const keyboardHeight = useKeyboardHeight();
  const tabBarInset = useTabBarInset();
  const nativeTabInsets = useTabBarInsetMode() === 'automatic';
  const [waterLogs, setWaterLogs] = useState<WaterLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [activity, setActivity] = useState({ steps: 0, activeCalories: 0 });
  const [waterModalVisible, setWaterModalVisible] = useState(false);
  const [quickAddDrinks, setQuickAddDrinks] = useState<QuickAddDrink[]>(DEFAULT_QUICK_DRINKS);
  const [isAddingQuickAdd, setIsAddingQuickAdd] = useState(false);

  const { readGranted, available, fetchTodayActivity } = useHealthKit();

  const loadActivity = useCallback(async () => {
    if (selectedDate === today && readGranted) {
      const data = await fetchTodayActivity();
      setActivity(data);
    } else {
      setActivity({ steps: 0, activeCalories: 0 });
    }
  }, [selectedDate, today, readGranted, fetchTodayActivity]);

  const loadData = useCallback((silent = false) => {
    const generation = ++requestGeneration.current;
    if (!focused.current) return;
    if (!silent) setLoading(true);
    loadActivity();
    Promise.all([
      getUserGoals(),
      getFoodLogsWithFoodByDate(selectedDate),
      getMealSlotConfirmationsByDate(selectedDate),
      getWaterLogsByDate(selectedDate),
      getQuickAddDrinks(),
    ])
      .then(([userGoals, foodLogs, slotConfirmations, wLogs, storedQuickDrinks]) => {
        if (generation !== requestGeneration.current || !focused.current) return;
        setLoadedDataDate(selectedDate);
        loadedDateRef.current = selectedDate;
        if (userGoals) setGoals(userGoals);
        setLogs(foodLogs);
        setConfirmations(slotConfirmations);
        setWaterLogs(wLogs);
        if (storedQuickDrinks) setQuickAddDrinks(storedQuickDrinks);
      })
      .catch((error) => {
        if (generation !== requestGeneration.current || !focused.current) return;
        setLoadedDataDate(null);
        if (loadedDateRef.current !== selectedDate) {
          setLogs([]);
          setConfirmations([]);
          setWaterLogs([]);
        }
        loadedDateRef.current = null;
        console.error('Failed to load dashboard:', error);
      })
      .finally(() => {
        if (generation === requestGeneration.current && focused.current) setLoading(false);
      });
  }, [selectedDate, loadActivity, setLogs, setConfirmations]);

  useFocusEffect(
    useCallback(() => {
      focused.current = true;
      loadData(loadedDateRef.current === selectedDate);
      return () => {
        focused.current = false;
        requestGeneration.current++;
        setSummarySelection(null);
      };
    }, [loadData, selectedDate])
  );

  const waterConsumed = useMemo(() => {
    return waterLogs.reduce((sum, log) => sum + (log.amount || 0), 0) || 0;
  }, [waterLogs]);

  const handleAddWater = async (amount: number, name: string) => {
    try {
      await addWaterLog({
        date: selectedDate,
        amount,
        drink_name: name,
      });
      loadData(true);
    } catch (error) {
      console.error('Failed to add water log:', error);
      Alert.alert('Error', 'Failed to log water intake.');
    }
  };

  const handleRemoveQuickAdd = async (id: string) => {
    const updated = quickAddDrinks.filter(d => d.id !== id);
    setQuickAddDrinks(updated);
    await saveQuickAddDrinks(updated);
  };

  const handleAddQuickAdd = async (drink: QuickAddDrink) => {
    const updated = [...quickAddDrinks, drink].slice(0, 3);
    setQuickAddDrinks(updated);
    await saveQuickAddDrinks(updated);
    setIsAddingQuickAdd(false);
  };

  const handleDeleteWaterLog = async (log: WaterLog) => {
    try {
      await deleteWaterLog(log.id);
      loadData(true);
    } catch (error) {
      console.error('Failed to delete water log:', error);
      Alert.alert('Error', 'Failed to delete drink entry.');
    }
  };

  const meals = useMemo(
    () => mealsForDay(defs, names, logs, selectedDate),
    [defs, names, logs, selectedDate]
  );

  const summaryMeal = summarySelection ? meals.find(m => m.id === summarySelection.id) : undefined;
  const summaryVisible = !!summarySelection && !!summaryMeal && summarySelection.date === selectedDate
    && loadedDataDate === selectedDate && !isEditing && !waterModalVisible && !isAddingQuickAdd;
  // Reset an invalid selection before committing the render, so returning to a date
  // or closing settings cannot reopen a summary that was already dismissed.
  if (summarySelection && !summaryVisible) setSummarySelection(null);

  const { start: startMealDraft } = mealDraft;
  const startEditing = useCallback(() => {
    startMealDraft(defs, names, today);
    editingRef.current = true;
    setIsEditing(true);
  }, [startMealDraft, defs, names, today]);

  useFocusEffect(useCallback(() => {
    if ((editMeals !== '1' && manageMeals !== '1') || !mealsLoaded) return;
    let cancelled = false;
    openMealEditAfterReload(reloadMeals, () => cancelled || editingRef.current, ({ defs: freshDefs, names: freshNames }) => {
      editingRef.current = true;
      startMealDraft(freshDefs, freshNames, today);
      setIsEditing(true);
    }).then(() => {
      if (!cancelled) router.setParams({ editMeals: undefined, manageMeals: undefined });
    }).catch(() => {
      if (!cancelled) {
        router.setParams({ editMeals: undefined, manageMeals: undefined });
        Alert.alert('Couldn’t load meals.', 'Try again from Nutrition settings.');
      }
    });
    return () => { cancelled = true; };
  }, [editMeals, manageMeals, mealsLoaded, reloadMeals, startMealDraft, today, router]));

  const { cancel: cancelDraft } = mealDraft;
  const cancelEditing = useCallback(() => {
    cancelDraft();
    editingRef.current = false;
    setIsEditing(false);
    setScrollLocked(false);
  }, [cancelDraft]);

  const finishEditing = async () => {
    if (!mealDraft.dirty) {
      cancelEditing();
      return;
    }
    try {
      const ok = await mealDraft.save(today);
      if (!ok) return;
      editingRef.current = false;
      setIsEditing(false);
      setScrollLocked(false);
      syncToSupabase();
      restoreMealReminders();
      await reloadMeals();
      loadData(true);
    } catch (error) {
      console.error('Failed to save meals:', error);
      Alert.alert('Error', 'Failed to save your meals. Your changes are still here.');
    }
  };

  const confirmDeleteMeal = async (id: string, name: string) => {
    const isNew = mealDraft.draft?.meals.find((m) => m.id === id)?.isNew ?? false;
    const count = isNew ? 0 : await countFoodLogsForMeal(id);
    Alert.alert('Delete meal', deleteMealMessage(name.trim() || 'this meal', count), [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: () => mealDraft.remove(id) },
    ]);
  };

  // Leaving the tab with unsaved meal edits: ask what to do with them.
  const dirtyRef = useRef(false);
  const cancelRef = useRef(cancelEditing);
  useEffect(() => {
    dirtyRef.current = isEditing && mealDraft.dirty;
    cancelRef.current = cancelEditing;
  });
  useFocusEffect(
    useCallback(
      () => () => {
        if (!dirtyRef.current) return;
        Alert.alert('Discard changes?', 'Your meal edits have not been saved.', [
          { text: 'Keep editing', onPress: () => router.navigate('/') },
          { text: 'Discard', style: 'destructive', onPress: () => cancelRef.current() },
        ]);
      },
      [router]
    )
  );

  const handleAddToSlot = (slot: MealSlot) => {
    router.push({
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      pathname: '/food-search' as any,
      params: { meal_slot: slot, date: selectedDate },
    });
  };

  const handleEditLog = (log: FoodLogWithFood) => {
    router.push({
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      pathname: '/serving-picker' as any,
      params: { food_id: log.food_id, meal_slot: log.meal_slot, date: selectedDate, log_id: log.id },
    });
  };

  const handleDeleteLog = (log: FoodLogWithFood) => deleteMealLog(log, () => loadData(true));

  const planned = useMemo(() => sumPlannedTotals(logs, confirmations), [logs, confirmations]);
  const errorCount = isEditing ? Object.values(mealDraft.errors).filter(Boolean).length : 0;
  const showDay = !loading && mealsLoaded;

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: background }]} edges={['top']}>
      {isEditing && (
        <EditModeBar
          onCancel={cancelEditing}
          onDone={finishEditing}
          errorCount={errorCount}
          saving={mealDraft.saving}
        />
      )}
      <GestureDetector gesture={panGesture}>
        <View style={styles.swipeOuter}>
          <ScrollView
            ref={dashScrollRef}
            contentContainerStyle={[
              styles.scroll,
              { paddingBottom: 40 + tabBarInset + (isEditing ? keyboardHeight : 0) },
            ]}
            contentInsetAdjustmentBehavior={nativeTabInsets ? 'automatic' : undefined}
            scrollIndicatorInsets={nativeTabInsets ? undefined : { bottom: tabBarInset }}
            automaticallyAdjustKeyboardInsets={isEditing}
            showsVerticalScrollIndicator={false}
            scrollEnabled={!scrollLocked}
            keyboardShouldPersistTaps="handled"
            scrollEventThrottle={16}
            onScroll={onDashScroll}
            onContentSizeChange={onDashContentSizeChange}
          >
            <DashboardHeader
              selectedDate={selectedDate}
              today={today}
              streakTrigger={logs.length}
              isEditing={isEditing}
              onEdit={startEditing}
              onOpenSettings={() => { setSummarySelection(null); router.push('/settings/nutrition'); }}
            />

            {/* The week strip stays mounted while editing (keeps its logged-day dots) but is hidden */}
            <View
              style={isEditing ? styles.hidden : undefined}
              accessibilityElementsHidden={isEditing}
              importantForAccessibility={isEditing ? 'no-hide-descendants' : 'auto'}
            >
              <Card padding="none" style={styles.weekCard}>
                <CalendarWidget trainedDates={training.trainedDates} today={today} foodRevision={logs} />
              </Card>
            </View>

            <Animated.View style={[styles.day, animatedStyle]}>
              {!showDay ? (
                <View style={styles.loadingContainer}>
                  <ActivityIndicator color={tint} />
                </View>
              ) : isEditing && mealDraft.draft ? (
                <>
                  {WATER_TRACKING_ENABLED && (
                    <WaterCard
                      total={waterConsumed}
                      logs={waterLogs}
                      quickAddDrinks={quickAddDrinks}
                      unit={preferences.weightUnit}
                      isEditing
                      onAdd={handleAddWater}
                      onOpenDrinkSheet={() => setWaterModalVisible(true)}
                      onDeleteLog={handleDeleteWaterLog}
                      onRemoveQuickAdd={handleRemoveQuickAdd}
                      onAddQuickAdd={() => setIsAddingQuickAdd(true)}
                    />
                  )}
                  <MealEditList
                    meals={mealDraft.draft.meals}
                    logs={logs}
                    errors={mealDraft.errors}
                    onReorder={mealDraft.reorder}
                    onDragActiveChange={setScrollLocked}
                    onRename={mealDraft.rename}
                    onChangeSettings={(id, t, r) => {
                      mealDraft.setTargets(id, t);
                      mealDraft.setReminder(id, r);
                    }}
                    onDelete={confirmDeleteMeal}
                    onAdd={mealDraft.add}
                  />
                </>
              ) : (
                <>
                  <CalorieCard eaten={Math.round(consumed.calories)} goal={goals.calorie_goal} planned={Math.round(planned.calories)} />
                  <MacroCard consumed={consumed} goals={goals} />
                  {!isEditing && <DayWorkouts workouts={training.dayWorkouts} />}
                  {WATER_TRACKING_ENABLED && (
                    <WaterCard
                      total={waterConsumed}
                      logs={waterLogs}
                      quickAddDrinks={quickAddDrinks}
                      unit={preferences.weightUnit}
                      isEditing={false}
                      onAdd={handleAddWater}
                      onOpenDrinkSheet={() => setWaterModalVisible(true)}
                      onDeleteLog={handleDeleteWaterLog}
                      onRemoveQuickAdd={handleRemoveQuickAdd}
                      onAddQuickAdd={() => setIsAddingQuickAdd(true)}
                    />
                  )}
                  {available && readGranted && selectedDate === today && (
                    <ActivityCard steps={activity.steps} activeCalories={activity.activeCalories} />
                  )}
                  {!isEditing && preferences.loaded && <DefaultStatusRow value={preferences.defaultLogStatus} />}
                  <MealCardList
                    meals={meals}
                    logs={logs}
                    confirmations={confirmations}
                    onShowNutrition={loadedDataDate === selectedDate ? (slot, focusTarget) => {
                      summaryFocusTarget.current = focusTarget ?? null;
                      setSummarySelection({ id: slot, date: selectedDate });
                    } : undefined}
                    onToggle={handleToggleSlot}
                    onAdd={handleAddToSlot}
                    onEditLog={handleEditLog}
                    onDeleteLog={handleDeleteLog}
                  />
                </>
              )}
            </Animated.View>
          </ScrollView>
        </View>
      </GestureDetector>

      {summaryVisible && summaryMeal && (
        <MealNutritionSummary meal={summaryMeal} logs={logsForSlot(logs, summaryMeal.id)}
          date={selectedDate} today={today} eaten={isSlotEaten(confirmations, summaryMeal.id)}
          onClose={() => { setSummarySelection(null); restoreSummaryFocus(); }} onDismiss={restoreSummaryFocus} />
      )}
      {WATER_TRACKING_ENABLED && (
        <>
          <CustomWaterModal
            visible={waterModalVisible}
            onClose={() => setWaterModalVisible(false)}
            onAdd={handleAddWater}
            unit={preferences.weightUnit}
            todayTotal={waterConsumed}
          />

          <QuickAddSearchModal
            visible={isAddingQuickAdd}
            onClose={() => setIsAddingQuickAdd(false)}
            onSelect={handleAddQuickAdd}
            unit={preferences.weightUnit}
          />
        </>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  swipeOuter: { flex: 1, overflow: 'hidden' },
  scroll: { paddingHorizontal: 16, paddingTop: 8, paddingBottom: 40, gap: 14 },
  weekCard: { paddingTop: 10, paddingHorizontal: 8, paddingBottom: 8 },
  hidden: { display: 'none' },
  day: { gap: 14 },
  loadingContainer: { paddingTop: 60, alignItems: 'center' },
});
