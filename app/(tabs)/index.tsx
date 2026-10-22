import { useCallback, useEffect, useRef, useState, useMemo } from 'react';
import {
  AccessibilityInfo,
  StyleSheet,
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTabBarInset, useTabBarInsetMode } from '@/context/TabBarInsetContext';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { format, parseISO } from 'date-fns';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { GestureDetector } from 'react-native-gesture-handler';
import Animated from 'react-native-reanimated';
import { MacroColors } from '@/constants/theme';
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
import { CalorieRing } from '@/components/calorie-ring';
import { MacroBar } from '@/components/macro-bar';
import { CalendarWidget } from '@/components/CalendarWidget';
import { DayWorkouts } from '@/components/dashboard/DayWorkouts';
import { useDashboardTraining } from '@/hooks/useDashboardTraining';
import { StreakBadge } from '@/components/StreakBadge';
import { SyncIndicator } from '@/components/SyncIndicator';
import { EditModeBar } from '@/components/dashboard/EditModeBar';
import { CalorieStat } from '@/components/dashboard/CalorieStat';
import { QuickAddButton } from '@/components/dashboard/QuickAddButton';
import { CustomWaterModal, QuickAddSearchModal } from '@/components/dashboard/WaterModals';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { useDate } from '@/context/DateContext';
import { useSwipeDayNavigation } from '@/hooks/useSwipeDayNavigation';
import { useHealthKit } from '@/hooks/use-health-kit';
import { useKeyboardHeight } from '@/hooks/useKeyboardHeight';
import { useScrollRestore } from '@/hooks/useScrollRestore';
import { WATER_TRACKING_ENABLED } from '@/constants/features';
import { useMealLogs } from '@/hooks/useMealLogs';
import { MealSlotCard, MEAL_EDIT_CARD_HEIGHT } from '@/components/dashboard/MealSlotCard';
import { ReorderableList } from '@/components/dashboard/ReorderableList';
import { useMealDefinitions } from '@/hooks/useMealDefinitions';
import { useMealDraft } from '@/hooks/useMealDraft';
import { restoreMealReminders } from '@/lib/reminders';
import { MealNutritionSummary } from '@/components/dashboard/MealNutritionSummary';
import { isSlotEaten, logsForSlot } from '@/lib/nutrition-totals';
import { syncToSupabase } from '@/lib/sync';
import { MEAL_LIMITS, deleteMealMessage, mealsForDay } from '@/lib/meals';
import { openMealEditAfterReload } from '@/lib/meal-settings-entry';
import { usePreferences } from '@/hooks/usePreferences';
import { setDefaultLogStatus } from '@/lib/app-preferences';
import { PillSwitch } from '@/components/settings/PillSwitch';
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
  const [foodDefaultError, setFoodDefaultError] = useState('');
  const background = useThemeColor({}, 'background');
  const cardBackground = useThemeColor({}, 'cardBackground');
  const cardSecondary = useThemeColor({}, 'cardSecondary');
  const danger = useThemeColor({}, 'danger');
  const fieldBorder = useThemeColor({}, 'fieldBorder');
  const icon = useThemeColor({}, 'icon');
  const separator = useThemeColor({}, 'separator');
  const text = useThemeColor({}, 'text');
  const tint = useThemeColor({}, 'tint');
  const colors = { background, cardBackground, cardSecondary, danger, fieldBorder, icon, separator, text, tint };
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
  const displayDate = format(parseISO(selectedDate), 'EEEE, MMM d');

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

  const draftMeals = mealDraft.draft?.meals;
  const editItems = useMemo(
    () => (draftMeals ?? []).map((m) => ({ ...m, label: m.name })),
    [draftMeals]
  );

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

  const remaining = Math.max(0, goals.calorie_goal - Math.round(consumed.calories));

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]} edges={['top']}>
      {/* The week strip stays mounted (keeps its logged-day dots) and the edit bar covers it */}
      <View>
        <View
          accessibilityElementsHidden={isEditing}
          importantForAccessibility={isEditing ? 'no-hide-descendants' : 'auto'}
        >
          <CalendarWidget trainedDates={training.trainedDates} today={today} foodRevision={logs} />
        </View>
        {isEditing && (
          <EditModeBar
            colors={colors}
            onCancel={cancelEditing}
            onDone={finishEditing}
            hasErrors={mealDraft.hasErrors}
            saving={mealDraft.saving}
            style={StyleSheet.absoluteFill}
          />
        )}
      </View>
      <GestureDetector gesture={panGesture}>
        <View style={styles.swipeOuter}>
          <Animated.View style={[styles.swipeInner, animatedStyle]}>
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
              <View style={styles.topRow}>
                <View style={styles.headerTop}>
                  <Text numberOfLines={1} style={[styles.dateLabel, { color: colors.icon }]}>
                    {displayDate}{selectedDate === today ? '  · Today' : ''}
                  </Text>
                  <View style={styles.badgeRow}>
                    <SyncIndicator />
                    <StreakBadge trigger={logs.length} />
                  </View>
                </View>
                <View style={styles.titleRow}>
                  <Text style={[styles.pageTitle, { color: colors.text }]}>Dashboard</Text>
                  {!isEditing && <View style={styles.titleActions}>
                    <TouchableOpacity onPress={startEditing} hitSlop={{ top: 6, bottom: 6 }} style={[styles.editModeBtn, { backgroundColor: colors.cardSecondary }]} accessibilityRole="button" accessibilityLabel="Edit meals">
                      <Text style={[styles.editModeBtnText, { color: colors.text }]}>Edit</Text>
                    </TouchableOpacity>
                    <TouchableOpacity onPress={() => { setSummarySelection(null); router.push('/settings/nutrition'); }} style={styles.gearButton} accessibilityRole="button" accessibilityLabel="Nutrition settings">
                      <IconSymbol name="gear" size={21} color={colors.icon} />
                    </TouchableOpacity>
                  </View>}
                </View>
              </View>

        {loading || !mealsLoaded ? (
          <View style={styles.loadingContainer}>
            <ActivityIndicator color={colors.tint} />
          </View>
        ) : (
          <>
            {/* Calorie ring + remaining */}
            <View style={[styles.calorieCard, { backgroundColor: colors.cardBackground }]}>
              <View style={styles.ringRow}>
                <CalorieRing
                  consumed={Math.round(consumed.calories)}
                  goal={goals.calorie_goal}
                  ringColor={colors.tint}
                  trackColor={colors.tint + '26'}
                  textColor={colors.text}
                  subTextColor={colors.icon}
                />
                <View style={styles.calorieSummary}>
                  <CalorieStat
                    label="Goal"
                    value={goals.calorie_goal}
                    textColor={colors.text}
                    subColor={colors.icon}
                  />
                  <CalorieStat
                    label="Eaten"
                    value={Math.round(consumed.calories)}
                    textColor={colors.text}
                    subColor={colors.icon}
                  />
                  <CalorieStat
                    label="Remaining"
                    value={remaining}
                    textColor={remaining === 0 ? colors.danger : colors.text}
                    subColor={colors.icon}
                  />
                </View>
              </View>
            </View>

            {/* Macro bars */}
            <View style={[styles.macroCard, { backgroundColor: colors.cardBackground }]}>
              <MacroBar
                label="Protein"
                consumed={Math.round(consumed.protein * 10) / 10}
                goal={goals.protein_goal}
                color={MacroColors.protein}
                textColor={colors.text}
                subTextColor={colors.icon}
              />
              <MacroBar
                label="Carbs"
                consumed={Math.round(consumed.carbs * 10) / 10}
                goal={goals.carb_goal}
                color={MacroColors.carbs}
                textColor={colors.text}
                subTextColor={colors.icon}
              />
              <MacroBar
                label="Fat"
                consumed={Math.round(consumed.fat * 10) / 10}
                goal={goals.fat_goal}
                color={MacroColors.fat}
                textColor={colors.text}
                subTextColor={colors.icon}
              />
            </View>

            {!isEditing && <DayWorkouts workouts={training.dayWorkouts} />}

            {/* Water Card */}
            {WATER_TRACKING_ENABLED && (
            <View style={[styles.waterCard, { backgroundColor: colors.cardBackground }]}>
              <View style={styles.waterHeader}>
                <View style={styles.waterHeaderLeft}>
                  <Text style={[styles.waterLabel, { color: colors.text }]}>Water</Text>
                  <Text style={[styles.waterProgress, { color: colors.icon }]}>
                    {Math.round(waterConsumed)} / 128 oz
                  </Text>
                </View>
                <TouchableOpacity
                  style={[styles.addWaterBtn, { backgroundColor: colors.tint + '18' }]}
                  onPress={() => setWaterModalVisible(true)}
                  activeOpacity={0.7}
                >
                  <MaterialIcons name="add" size={20} color={colors.tint} />
                </TouchableOpacity>
              </View>

              <View style={[styles.waterBarBg, { backgroundColor: colors.cardSecondary, borderColor: colors.separator }]}>
                <View
                  style={[
                    styles.waterBarFill,
                    {
                      backgroundColor: colors.tint + '50',
                      width: `${Math.min(100, Math.max(0, (waterConsumed / 128) * 100)) || 0}%`,
                    },
                  ]}
                />
              </View>

              <View style={styles.quickAddRow}>
                {quickAddDrinks.map((drink) => (
                  <QuickAddButton
                    key={drink.id}
                    label={drink.name}
                    onPress={() => handleAddWater(drink.amount, drink.name)}
                    colors={colors}
                    isEditing={isEditing}
                    onRemove={() => handleRemoveQuickAdd(drink.id)}
                  />
                ))}
                {isEditing && quickAddDrinks.length < 3 && (
                  <TouchableOpacity
                    style={[styles.addQuickAddBtn, { backgroundColor: colors.cardSecondary, borderColor: colors.separator }]}
                    onPress={() => setIsAddingQuickAdd(true)}
                  >
                    <MaterialIcons name="edit" size={18} color={colors.tint} />
                  </TouchableOpacity>
                )}
              </View>

              {waterLogs.length > 0 && (
                <View style={styles.logList}>
                  {waterLogs.map((log) => (
                    <TouchableOpacity
                      key={log.id}
                      style={[styles.logRow, { borderTopColor: colors.separator }]}
                      onLongPress={() => handleDeleteWaterLog(log)}
                      activeOpacity={0.7}
                    >
                      <View style={styles.logInfo}>
                        <Text style={[styles.logName, { color: colors.text }]} numberOfLines={1}>
                          {log.drink_name}
                        </Text>
                      </View>
                      <View style={styles.logRight}>
                        <Text style={[styles.logCals, { color: colors.text }]}>
                          {log.amount}
                        </Text>
                        <Text style={[styles.logCalsUnit, { color: colors.icon }]}>oz</Text>
                        <TouchableOpacity
                          onPress={() => handleDeleteWaterLog(log)}
                          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                        >
                          <MaterialIcons name="delete-outline" size={18} color={colors.icon} />
                        </TouchableOpacity>
                      </View>
                    </TouchableOpacity>
                  ))}
                </View>
              )}
            </View>
            )}

            {/* Activity Row */}
            {available && readGranted && selectedDate === today && (
              <View style={[styles.activityCard, { backgroundColor: colors.cardBackground }]}>
                <View style={styles.activityRow}>
                  <View style={styles.activityItem}>
                    <MaterialIcons name="directions-walk" size={20} color={colors.tint} />
                    <Text style={[styles.activityText, { color: colors.text }]}>
                      {activity.steps.toLocaleString()} steps
                    </Text>
                  </View>
                  <View style={[styles.activityDivider, { backgroundColor: colors.separator }]} />
                  <View style={styles.activityItem}>
                    <MaterialIcons name="local-fire-department" size={20} color={MacroColors.protein} />
                    <Text style={[styles.activityText, { color: colors.text }]}>
                      {Math.round(activity.activeCalories)} cal
                    </Text>
                  </View>
                </View>
              </View>
            )}

            {/* Meals */}
            {!isEditing && preferences.loaded && (
              <View style={styles.foodDefault}>
                <Text style={[styles.foodDefaultLabel, { color: text }]}>Default for new food</Text>
                <PillSwitch
                  value={preferences.defaultLogStatus}
                  options={[{ value: 'eaten', label: 'Eaten' }, { value: 'planned', label: 'Planned' }]}
                  onChange={(value) => {
                    void setDefaultLogStatus(value).then(() => setFoodDefaultError('')).catch(() => {
                      setFoodDefaultError('Couldn’t save the food default. Try again.');
                    });
                  }}
                  accessibilityLabel="Default for new food"
                />
                <Text style={[styles.foodDefaultHelp, { color: icon }]}>Planned meals don’t count toward your daily totals until you mark them eaten.</Text>
                {foodDefaultError ? <Text accessibilityRole="alert" style={{ color: danger }}>{foodDefaultError}</Text> : null}
              </View>
            )}
            {isEditing && mealDraft.draft ? (
              <>
                <Text style={[styles.editWarning, { color: colors.text }]}>
                  Deleting a meal deletes its logged food.
                </Text>
                <Text style={[styles.editNote, { color: colors.icon }]}>Changes apply from today.</Text>
                <ReorderableList
                  items={editItems}
                  itemHeight={MEAL_EDIT_CARD_HEIGHT}
                  gap={14}
                  iconColor={colors.icon}
                  onReorder={mealDraft.reorder}
                  onDragActiveChange={setScrollLocked}
                  renderItem={(m, handle) => (
                    <MealSlotCard
                      mode="edit"
                      slot={m.id}
                      index={editItems.findIndex((e) => e.id === m.id)}
                      label={m.name}
                      logs={logs}
                      targets={m}
                      colors={colors}
                      nameError={mealDraft.errors[m.id] ?? null}
                      canDelete={mealDraft.draft!.meals.length > MEAL_LIMITS.min}
                      dragHandle={handle}
                      onChangeName={(name) => mealDraft.rename(m.id, name)}
                      onChangeSettings={(t, r) => {
                        mealDraft.setTargets(m.id, t);
                        mealDraft.setReminder(m.id, r);
                      }}
                      onDelete={() => confirmDeleteMeal(m.id, m.name)}
                    />
                  )}
                />
                {mealDraft.draft.meals.length < MEAL_LIMITS.max && (
                  <TouchableOpacity
                    style={[styles.addMealRow, { borderColor: colors.separator }]}
                    onPress={mealDraft.add}
                    activeOpacity={0.7}
                    accessibilityRole="button"
                    accessibilityLabel="Add meal"
                  >
                    <MaterialIcons name="add" size={20} color={colors.tint} />
                    <Text style={[styles.addMealText, { color: colors.tint }]}>Add meal</Text>
                  </TouchableOpacity>
                )}
              </>
            ) : (
              meals.map(({ id, name, def, orphan }) => {
                const slotLogs = logsForSlot(logs, id);
                const showToggle = slotLogs.length > 0;

                // We need to know if it's explicitly UNCONFIRMED (0) to show the "Planned" state,
                // otherwise (if it's confirmed or doesn't exist), we show "Eaten".
                const isExplicitlyPlanned = confirmations.find(c => c.meal_slot === id)?.confirmed === false;
                const displayConfirmed = !isExplicitlyPlanned;

                return (
                  <MealSlotCard
                    key={id}
                    slot={id}
                    label={name}
                    logs={slotLogs}
                    targets={def}
                    eaten={displayConfirmed}
                    showToggle={showToggle}
                    allowAdd={!orphan}
                    onShowNutrition={loadedDataDate === selectedDate ? (slot, focusTarget) => {
                      summaryFocusTarget.current = focusTarget ?? null;
                      setSummarySelection({ id: slot, date: selectedDate });
                    } : undefined}
                    onToggle={handleToggleSlot}
                    onAdd={handleAddToSlot}
                    onEditLog={handleEditLog}
                    onDeleteLog={handleDeleteLog}
                    colors={colors}
                  />
                );
              })
            )}
          </>
        )}
        </ScrollView>
          </Animated.View>
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
            colors={colors}
          />

          <QuickAddSearchModal
            visible={isAddingQuickAdd}
            onClose={() => setIsAddingQuickAdd(false)}
            onSelect={handleAddQuickAdd}
            colors={colors}
          />
        </>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  foodDefault: { gap: 8, marginBottom: 16, alignItems: 'flex-start' },
  foodDefaultLabel: { fontSize: 14, fontWeight: '600' },
  foodDefaultHelp: { fontSize: 12, lineHeight: 16 },
  container: { flex: 1 },
  swipeOuter: { flex: 1, overflow: 'hidden' },
  swipeInner: { flex: 1 },
  scroll: { padding: 20, paddingBottom: 40 },
  topRow: { marginBottom: 20 },
  headerTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 8,
    marginBottom: 4,
  },
  badgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    flexShrink: 1,
    maxWidth: '100%',
    justifyContent: 'flex-end',
  },
  dateLabel: { fontSize: 13, fontWeight: '500', flex: 1, minWidth: 0 },
  pageTitle: { fontSize: 28, fontWeight: '700', flexShrink: 1, minWidth: 0, maxWidth: '100%' },
  titleActions: { flexDirection: 'row', alignItems: 'center', gap: 4, flexShrink: 0, marginLeft: 'auto' },
  gearButton: { minHeight: 44, minWidth: 44, alignItems: 'center', justifyContent: 'center', borderRadius: 12 },
  titleRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 8,
  },
  editWarning: { fontSize: 13, marginBottom: 2 },
  editNote: { fontSize: 12, marginBottom: 12 },
  addMealRow: {
    height: 48,
    marginTop: 14,
    borderRadius: 12,
    borderWidth: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  addMealText: { fontSize: 15, fontWeight: '600' },
  editModeBtn: {
    minHeight: 32, justifyContent: 'center',
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 12,
  },
  editModeBtnText: {
    fontSize: 14,
    fontWeight: '600',
  },
  loadingContainer: { paddingTop: 60, alignItems: 'center' },
  calorieCard: { borderRadius: 18, padding: 20, marginBottom: 14 },
  ringRow: { flexDirection: 'row', alignItems: 'center', gap: 20 },
  calorieSummary: { flex: 1, gap: 12 },
  macroCard: { borderRadius: 18, padding: 16, marginBottom: 14 },
  activityCard: { borderRadius: 18, padding: 14, marginBottom: 14 },
  activityRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 16 },
  activityItem: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  activityText: { fontSize: 14, fontWeight: '600' },
  activityDivider: { width: 1, height: 20 },
  logList: { marginTop: 12, gap: 2 },
  logRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  logInfo: { flex: 1, marginRight: 8 },
  logName: { fontSize: 14, fontWeight: '500' },
  logRight: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  logCals: { fontSize: 14, fontWeight: '600' },
  logCalsUnit: { fontSize: 12, marginRight: 6 },
  waterCard: { borderRadius: 18, padding: 16, marginBottom: 14 },
  waterHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  waterHeaderLeft: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  waterLabel: { fontSize: 16, fontWeight: '600' },
  waterProgress: { fontSize: 16 },
  addWaterBtn: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
  },
  waterBarBg: { height: 32, borderRadius: 10, borderWidth: 2, overflow: 'hidden' },
  waterBarFill: { height: '100%', borderRadius: 8 },
  quickAddRow: { flexDirection: 'row', gap: 8, marginTop: 12 },
  addQuickAddBtn: {
    width: 40,
    height: 32,
    borderRadius: 10,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    borderStyle: 'dashed',
  },
});
