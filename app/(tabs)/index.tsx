import { useCallback, useEffect, useRef, useState, useMemo } from 'react';
import {
  StyleSheet,
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
  Modal,
  TextInput,
  Keyboard,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect, useRouter } from 'expo-router';
import { format, parseISO } from 'date-fns';
import * as Crypto from 'expo-crypto';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { GestureDetector } from 'react-native-gesture-handler';
import Animated from 'react-native-reanimated';
import { Colors, MacroColors } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
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
  searchLiquids,
  countFoodLogsForMeal,
} from '@/lib/database';
import { CalorieRing } from '@/components/calorie-ring';
import { MacroBar } from '@/components/macro-bar';
import { CalendarWidget } from '@/components/CalendarWidget';
import { StreakBadge } from '@/components/StreakBadge';
import { EditModeBar } from '@/components/dashboard/EditModeBar';
import { useDate } from '@/context/DateContext';
import { useSwipeDayNavigation } from '@/hooks/useSwipeDayNavigation';
import { useHealthKit } from '@/hooks/use-health-kit';
import { useScrollRestore } from '@/hooks/useScrollRestore';
import { WATER_TRACKING_ENABLED } from '@/constants/features';
import { useMealLogs } from '@/hooks/useMealLogs';
import { MealSlotCard, MEAL_EDIT_CARD_HEIGHT } from '@/components/dashboard/MealSlotCard';
import { ReorderableList } from '@/components/dashboard/ReorderableList';
import { useMealDefinitions } from '@/hooks/useMealDefinitions';
import { useMealDraft } from '@/hooks/useMealDraft';
import { restoreMealReminders } from '@/lib/reminders';
import { logsForSlot } from '@/lib/nutrition-totals';
import { syncToSupabase } from '@/lib/sync';
import { MEAL_LIMITS, deleteMealMessage, mealsForDay } from '@/lib/meals';
import type { FoodLogWithFood, UserGoals, MealSlot, WaterLog, QuickAddDrink, Food } from '@/lib/types';

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
  const colorScheme = useColorScheme();
  const colors = Colors[colorScheme ?? 'light'];
  const router = useRouter();
  const { selectedDate } = useDate();
  const [isEditing, setIsEditing] = useState(false);
  const { panGesture, animatedStyle } = useSwipeDayNavigation({ enabled: !isEditing });
  const { scrollRef: dashScrollRef, onScroll: onDashScroll, onContentSizeChange: onDashContentSizeChange } = useScrollRestore('dashboard');

  const today = format(new Date(), 'yyyy-MM-dd');
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
  const [keyboardHeight, setKeyboardHeight] = useState(0);
  useEffect(() => {
    if (Platform.OS !== 'android') return;
    const show = Keyboard.addListener('keyboardDidShow', (e) => setKeyboardHeight(e.endCoordinates.height));
    const hide = Keyboard.addListener('keyboardDidHide', () => setKeyboardHeight(0));
    return () => {
      show.remove();
      hide.remove();
    };
  }, []);
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
        if (userGoals) setGoals(userGoals);
        setLogs(foodLogs);
        setConfirmations(slotConfirmations);
        setWaterLogs(wLogs);
        if (storedQuickDrinks) setQuickAddDrinks(storedQuickDrinks);
      })
      .finally(() => setLoading(false));
  }, [selectedDate, loadActivity, setLogs, setConfirmations]);

  useFocusEffect(
    useCallback(() => {
      // Use silent reload if we already have some data, to avoid scroll-to-top
      const hasData = logs.length > 0 || waterLogs.length > 0;
      loadData(hasData);
    }, [loadData, logs.length, waterLogs.length])
  );

  useEffect(() => {
    loadData();
  }, [selectedDate, loadData]); // Re-trigger only when date changes

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

  const draftMeals = mealDraft.draft?.meals;
  const editItems = useMemo(
    () => (draftMeals ?? []).map((m) => ({ ...m, label: m.name })),
    [draftMeals]
  );

  const startEditing = () => {
    mealDraft.start(defs, names, today);
    setIsEditing(true);
  };

  const { cancel: cancelDraft } = mealDraft;
  const cancelEditing = useCallback(() => {
    cancelDraft();
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
          <CalendarWidget />
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
                isEditing && keyboardHeight > 0 && { paddingBottom: 40 + keyboardHeight },
              ]}
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
                  <Text style={[styles.dateLabel, { color: colors.icon }]}>
                    {displayDate}{selectedDate === today ? '  · Today' : ''}
                  </Text>
                  <StreakBadge trigger={logs.length} />
                </View>
                <View style={styles.titleRow}>
                  <Text style={[styles.pageTitle, { color: colors.text }]}>Dashboard</Text>
                  {!isEditing && (
                    <TouchableOpacity
                      onPress={startEditing}
                      style={[styles.editModeBtn, { backgroundColor: colors.cardSecondary }]}
                      accessibilityRole="button"
                      accessibilityLabel="Edit meals"
                      hitSlop={{ top: 6, bottom: 6, left: 4, right: 4 }}
                    >
                      <Text style={[styles.editModeBtnText, { color: colors.text }]}>Edit</Text>
                    </TouchableOpacity>
                  )}
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

function CalorieStat({
  label,
  value,
  textColor,
  subColor,
}: {
  label: string;
  value: number;
  textColor: string;
  subColor: string;
}) {
  return (
    <View>
      <Text style={[styles.calorieStatValue, { color: textColor }]}>{value.toLocaleString()}</Text>
      <Text style={[styles.calorieStatLabel, { color: subColor }]}>{label}</Text>
    </View>
  );
}

function QuickAddButton({
  label,
  onPress,
  colors,
  isEditing,
  onRemove,
}: {
  label: string;
  onPress: () => void;
  colors: any;
  isEditing?: boolean;
  onRemove?: () => void;
}) {
  const colorScheme = useColorScheme();
  return (
    <View style={styles.quickAddBtnWrapper}>
      <TouchableOpacity
        style={[
          styles.quickAddBtn,
          { backgroundColor: colors.cardSecondary, borderColor: colors.separator },
        ]}
        onPress={isEditing ? undefined : onPress}
        activeOpacity={isEditing ? 1 : 0.7}
      >
        <Text style={[styles.quickAddBtnText, { color: colors.text }]} numberOfLines={1}>
          {label}
        </Text>
      </TouchableOpacity>
      {isEditing && (
        <TouchableOpacity
          style={[styles.removeQuickAddBtn, { backgroundColor: Colors[colorScheme ?? 'light'].danger }]}
          onPress={onRemove}
        >
          <MaterialIcons name="close" size={12} color="#fff" />
        </TouchableOpacity>
      )}
    </View>
  );
}

function CustomWaterModal({
  visible,
  onClose,
  onAdd,
  colors,
}: {
  visible: boolean;
  onClose: () => void;
  onAdd: (amount: number, name: string) => void;
  colors: any;
}) {
  const colorScheme = useColorScheme();
  const [amount, setAmount] = useState('8');
  const [name, setName] = useState('Water');

  const handleAdd = () => {
    const val = parseFloat(amount);
    if (isNaN(val) || val <= 0) {
      Alert.alert('Invalid Amount', 'Please enter a valid amount in oz.');
      return;
    }
    onAdd(val, name || 'Water');
    onClose();
    setAmount('8');
    setName('Water');
  };

  return (
    <Modal visible={visible} animationType="fade" transparent>
      <View style={styles.modalOverlay}>
        <View style={[styles.modalContent, { backgroundColor: colors.background }]}>
          <Text style={[styles.modalTitle, { color: colors.text }]}>Add Custom Drink</Text>
          
          <View style={styles.inputGroup}>
            <Text style={[styles.inputLabel, { color: colors.icon }]}>Drink Name</Text>
            <TextInput
              style={[styles.input, { color: colors.text, backgroundColor: colors.cardBackground }]}
              value={name}
              onChangeText={setName}
              placeholder="Water, Coffee, etc."
              placeholderTextColor={colors.icon}
            />
          </View>

          <View style={styles.inputGroup}>
            <Text style={[styles.inputLabel, { color: colors.icon }]}>Amount (oz)</Text>
            <TextInput
              style={[styles.input, { color: colors.text, backgroundColor: colors.cardBackground }]}
              value={amount}
              onChangeText={setAmount}
              keyboardType="decimal-pad"
              placeholder="8"
              placeholderTextColor={colors.icon}
            />
          </View>

          <View style={styles.modalButtons}>
            <TouchableOpacity
              style={[styles.modalBtn, { backgroundColor: colors.cardSecondary }]}
              onPress={onClose}
            >
              <Text style={[styles.modalBtnText, { color: colors.text }]}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.modalBtn, { backgroundColor: colors.tint }]}
              onPress={handleAdd}
            >
              <Text
                style={[
                  styles.modalBtnText,
                  { color: colorScheme === 'dark' ? '#000' : '#fff', fontWeight: '700' },
                ]}
              >
                Add
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

function QuickAddSearchModal({
  visible,
  onClose,
  onSelect,
  colors,
}: {
  visible: boolean;
  onClose: () => void;
  onSelect: (drink: QuickAddDrink) => void;
  colors: any;
}) {
  const colorScheme = useColorScheme();
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<Food[]>([]);
  const [selectedFood, setSelectedFood] = useState<Food | null>(null);
  const [amount, setAmount] = useState('8');

  useEffect(() => {
    if (visible && query.length > 1) {
      searchLiquids(query).then(setResults);
    } else if (query.length <= 1) {
      setResults([]);
    }
  }, [query, visible]);

  const handleSelect = (food: Food) => {
    setSelectedFood(food);
  };

  const handleConfirm = () => {
    if (!selectedFood) return;
    const val = parseFloat(amount);
    if (isNaN(val) || val <= 0) {
      Alert.alert('Invalid Amount', 'Please enter a valid amount.');
      return;
    }
    onSelect({
      id: Crypto.randomUUID(),
      name: `${val} oz ${selectedFood.name}`,
      amount: val,
      food_id: selectedFood.id,
    });
    setQuery('');
    setResults([]);
    setSelectedFood(null);
    setAmount('8');
  };

  return (
    <Modal visible={visible} animationType="slide" transparent>
      <View style={styles.modalOverlay}>
        <View style={[styles.modalContent, { backgroundColor: colors.background, height: '80%' }]}>
          <View style={styles.modalHeader}>
            <Text style={[styles.modalTitle, { color: colors.text }]}>Add Quick-Add Drink</Text>
            <TouchableOpacity onPress={onClose}>
              <MaterialIcons name="close" size={24} color={colors.icon} />
            </TouchableOpacity>
          </View>

          {selectedFood ? (
            <View style={{ gap: 20 }}>
              <View>
                <Text style={[styles.inputLabel, { color: colors.icon }]}>Selected Drink</Text>
                <Text style={[styles.selectedFoodName, { color: colors.text }]}>{selectedFood.name}</Text>
                <TouchableOpacity onPress={() => setSelectedFood(null)}>
                  <Text style={{ color: colors.tint, marginTop: 4 }}>Change</Text>
                </TouchableOpacity>
              </View>

              <View style={styles.inputGroup}>
                <Text style={[styles.inputLabel, { color: colors.icon }]}>Quick-Add Amount (oz)</Text>
                <TextInput
                  style={[styles.input, { color: colors.text, backgroundColor: colors.cardBackground }]}
                  value={amount}
                  onChangeText={setAmount}
                  keyboardType="decimal-pad"
                  placeholder="8"
                  autoFocus
                />
              </View>

              <TouchableOpacity
                style={[styles.modalBtn, { backgroundColor: colors.tint }]}
                onPress={handleConfirm}
              >
                <Text style={[styles.modalBtnText, { color: colorScheme === 'dark' ? '#000' : '#fff', fontWeight: '700' }]}>
                  Confirm
                </Text>
              </TouchableOpacity>
            </View>
          ) : (
            <>
              <TextInput
                style={[styles.input, { color: colors.text, backgroundColor: colors.cardBackground }]}
                value={query}
                onChangeText={setQuery}
                placeholder="Search for water, coffee, soda..."
                placeholderTextColor={colors.icon}
                autoFocus
              />

              <ScrollView style={{ flex: 1, marginTop: 12 }}>
                {results.map((food) => (
                  <TouchableOpacity
                    key={food.id}
                    style={[styles.searchResultItem, { borderBottomColor: colors.separator }]}
                    onPress={() => handleSelect(food)}
                  >
                    <Text style={[styles.resultName, { color: colors.text }]}>{food.name}</Text>
                    {food.brand && <Text style={[styles.resultBrand, { color: colors.icon }]}>{food.brand}</Text>}
                  </TouchableOpacity>
                ))}
                {query.length > 1 && results.length === 0 && (
                  <Text style={{ textAlign: 'center', color: colors.icon, marginTop: 20 }}>No liquids found matching &quot;{query}&quot;</Text>
                )}
              </ScrollView>
            </>
          )}
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  swipeOuter: { flex: 1, overflow: 'hidden' },
  swipeInner: { flex: 1 },
  scroll: { padding: 20, paddingBottom: 40 },
  topRow: { marginBottom: 20 },
  headerTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  dateLabel: { fontSize: 13, fontWeight: '500' },
  pageTitle: { fontSize: 28, fontWeight: '700' },
  titleRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
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
    paddingHorizontal: 12,
    paddingVertical: 6,
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
  calorieStatValue: { fontSize: 18, fontWeight: '700' },
  calorieStatLabel: { fontSize: 12, marginTop: 1 },
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
  quickAddBtn: {
    flex: 1,
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 10,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  quickAddBtnText: { fontSize: 13, fontWeight: '500' },
  quickAddBtnWrapper: {
    flex: 1,
    position: 'relative',
  },
  removeQuickAddBtn: {
    position: 'absolute',
    top: -6,
    right: -6,
    width: 20,
    height: 20,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 1,
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.2,
    shadowRadius: 1,
  },
  addQuickAddBtn: {
    width: 40,
    height: 32,
    borderRadius: 10,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    borderStyle: 'dashed',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  modalContent: { width: '100%', borderRadius: 20, padding: 24, gap: 20 },
  modalTitle: { fontSize: 20, fontWeight: '700', marginBottom: 4 },
  inputGroup: { gap: 8 },
  inputLabel: { fontSize: 14, fontWeight: '500' },
  input: {
    height: 48,
    borderRadius: 12,
    paddingHorizontal: 16,
    fontSize: 16,
  },
  modalButtons: { flexDirection: 'row', gap: 12, marginTop: 8 },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  selectedFoodName: {
    fontSize: 18,
    fontWeight: '600',
    marginTop: 4,
  },
  searchResultItem: {
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  resultName: {
    fontSize: 16,
    fontWeight: '500',
  },
  resultBrand: {
    fontSize: 12,
    marginTop: 2,
  },
  modalBtn: {
    flex: 1,
    height: 48,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalBtnText: { fontSize: 16, fontWeight: '600' },
});
