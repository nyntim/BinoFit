import { useCallback, useEffect, useState, useMemo } from 'react';
import {
  StyleSheet,
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect, useRouter } from 'expo-router';
import { format, parseISO } from 'date-fns';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { GestureDetector } from 'react-native-gesture-handler';
import Animated from 'react-native-reanimated';
import { Colors, MacroColors } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import {
  getUserGoals,
  getRequireMealConfirmation,
} from '@/lib/storage';
import {
  getFoodLogsWithFoodByDate,
  deleteFoodLog,
  getMealSlotConfirmationsByDate,
  upsertMealSlotConfirmation,
  deleteMealSlotConfirmation,
} from '@/lib/database';
import { CalorieRing } from '@/components/calorie-ring';
import { MacroBar } from '@/components/macro-bar';
import { CalendarWidget } from '@/components/CalendarWidget';
import { StreakBadge } from '@/components/StreakBadge';
import { useDate } from '@/context/DateContext';
import { useSwipeDayNavigation } from '@/hooks/useSwipeDayNavigation';
import { useHealthKit } from '@/hooks/use-health-kit';
import type { FoodLogWithFood, UserGoals, MealSlot, MealSlotConfirmation } from '@/lib/types';

const MEAL_SLOTS: { key: MealSlot; label: string }[] = [
  { key: 'breakfast', label: 'Breakfast' },
  { key: 'lunch', label: 'Lunch' },
  { key: 'dinner', label: 'Dinner' },
  { key: 'snack', label: 'Snacks' },
];

const DEFAULT_GOALS: UserGoals = {
  calorie_goal: 2000,
  protein_goal: 150,
  carb_goal: 200,
  fat_goal: 65,
  updated_at: '',
};

export default function HomeScreen() {
  const colorScheme = useColorScheme();
  const colors = Colors[colorScheme ?? 'light'];
  const router = useRouter();
  const { selectedDate } = useDate();
  const { panGesture, animatedStyle } = useSwipeDayNavigation();

  const today = format(new Date(), 'yyyy-MM-dd');
  const displayDate = format(parseISO(selectedDate), 'EEEE, MMM d');
  const isPast = selectedDate < today;

  const [goals, setGoals] = useState<UserGoals>(DEFAULT_GOALS);
  const [logs, setLogs] = useState<FoodLogWithFood[]>([]);
  const [confirmations, setConfirmations] = useState<MealSlotConfirmation[]>([]);
  const [requireMealConfirmation, setRequireMealConfirmation] = useState(true);
  const [loading, setLoading] = useState(true);
  const [activity, setActivity] = useState({ steps: 0, activeCalories: 0 });

  const { readGranted, available, fetchTodayActivity } = useHealthKit();

  const loadActivity = useCallback(async () => {
    if (selectedDate === today && readGranted) {
      const data = await fetchTodayActivity();
      setActivity(data);
    } else {
      setActivity({ steps: 0, activeCalories: 0 });
    }
  }, [selectedDate, today, readGranted, fetchTodayActivity]);

  const loadData = useCallback(() => {
    setLoading(true);
    loadActivity();
    Promise.all([
      getUserGoals(),
      getFoodLogsWithFoodByDate(selectedDate),
      getMealSlotConfirmationsByDate(selectedDate),
      getRequireMealConfirmation(),
    ])
      .then(([userGoals, foodLogs, slotConfirmations, reqConf]) => {
        if (userGoals) setGoals(userGoals);
        setLogs(foodLogs);
        setConfirmations(slotConfirmations);
        setRequireMealConfirmation(reqConf);
      })
      .finally(() => setLoading(false));
  }, [selectedDate]);

  useFocusEffect(loadData);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const isSlotConfirmed = useCallback(
    (slot: MealSlot) => {
      const conf = confirmations.find((c) => c.meal_slot === slot);
      return conf ? conf.confirmed : false;
    },
    [confirmations]
  );

  const consumed = useMemo(() => {
    return logs.reduce(
      (acc, log) => {
        const confirmed = isSlotConfirmed(log.meal_slot);
        const shouldCount = !requireMealConfirmation || confirmed;
        if (!shouldCount) return acc;

        return {
          calories: acc.calories + log.food_calories * log.serving_amount,
          protein: acc.protein + log.food_protein * log.serving_amount,
          carbs: acc.carbs + log.food_carbs * log.serving_amount,
          fat: acc.fat + log.food_fat * log.serving_amount,
        };
      },
      { calories: 0, protein: 0, carbs: 0, fat: 0 }
    );
  }, [logs, isSlotConfirmed, requireMealConfirmation]);

  const logsForSlot = (slot: MealSlot) => logs.filter((l) => l.meal_slot === slot);

  const slotCalories = (slot: MealSlot) =>
    logsForSlot(slot).reduce((sum, l) => sum + l.food_calories * l.serving_amount, 0);

  const handleToggleSlot = async (slot: MealSlot) => {
    const currentStatus = isSlotConfirmed(slot);
    const newStatus = !currentStatus;

    // Optimistic UI update
    const tempConfirmations = [...confirmations];
    const index = tempConfirmations.findIndex((c) => c.meal_slot === slot);
    if (index > -1) {
      tempConfirmations[index] = { ...tempConfirmations[index], confirmed: newStatus };
    } else {
      tempConfirmations.push({
        id: 'temp',
        date: selectedDate,
        meal_slot: slot,
        confirmed: newStatus,
        updated_at: new Date().toISOString(),
      });
    }
    setConfirmations(tempConfirmations);

    try {
      await upsertMealSlotConfirmation(selectedDate, slot, newStatus);
    } catch (error) {
      console.error('Failed to update confirmation:', error);
      Alert.alert('Error', 'Failed to save confirmation. Please try again.');
      // Revert optimistic update
      setConfirmations(confirmations);
    }
  };

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

  const handleDeleteLog = (log: FoodLogWithFood) => {
    Alert.alert('Remove Food', `Remove ${log.food_name}?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Remove',
        style: 'destructive',
        onPress: async () => {
          await deleteFoodLog(log.id);
          const remainingLogsInSlot = logsForSlot(log.meal_slot).filter((l) => l.id !== log.id);
          if (remainingLogsInSlot.length === 0) {
            await deleteMealSlotConfirmation(selectedDate, log.meal_slot);
          }
          loadData();
        },
      },
    ]);
  };

  const remaining = Math.max(0, goals.calorie_goal - Math.round(consumed.calories));

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]} edges={['top']}>
      <CalendarWidget />
      <GestureDetector gesture={panGesture}>
        <View style={styles.swipeOuter}>
          <Animated.View style={[styles.swipeInner, animatedStyle]}>
            <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
              <View style={styles.topRow}>
                <View style={styles.headerTop}>
                  <Text style={[styles.dateLabel, { color: colors.icon }]}>
                    {displayDate}{selectedDate === today ? '  · Today' : ''}
                  </Text>
                  <StreakBadge trigger={logs.length} />
                </View>
                <Text style={[styles.pageTitle, { color: colors.text }]}>Dashboard</Text>
              </View>

        {loading ? (
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
                      {Math.round(activity.activeCalories)} kcal
                    </Text>
                  </View>
                </View>
              </View>
            )}

            {/* Meal slots */}
            {MEAL_SLOTS.map(({ key, label }) => {
              const slotLogs = logsForSlot(key);
              const slotCals = Math.round(slotCalories(key));
              const confirmed = isSlotConfirmed(key);
              const hasLogs = slotLogs.length > 0;
              const showToggle = hasLogs && !isPast && requireMealConfirmation;

              return (
                <View
                  key={key}
                  style={[
                    styles.slotCard,
                    { backgroundColor: colors.cardBackground },
                    hasLogs &&
                      !confirmed && {
                        opacity: 0.7,
                        borderWidth: 1,
                        borderStyle: 'dashed',
                        borderColor: colors.icon + '40',
                      },
                  ]}
                >
                  <View style={styles.slotHeader}>
                    <View style={styles.slotHeaderLeft}>
                      <Text style={[styles.slotLabel, { color: colors.text }]}>{label}</Text>
                      {slotCals > 0 && (
                        <Text style={[styles.slotCals, { color: colors.icon }]}>
                          {slotCals} kcal
                        </Text>
                      )}
                    </View>

                    <View style={styles.slotHeaderRight}>
                      {showToggle && (
                        <TouchableOpacity
                          style={[
                            styles.confirmBtn,
                            {
                              backgroundColor: confirmed ? colors.success + '18' : colors.icon + '12',
                            },
                          ]}
                          onPress={() => handleToggleSlot(key)}
                          activeOpacity={0.7}
                        >
                          <MaterialIcons
                            name={confirmed ? 'check-circle' : 'radio-button-unchecked'}
                            size={18}
                            color={confirmed ? colors.success : colors.icon}
                          />
                          <Text
                            style={[
                              styles.confirmBtnText,
                              { color: confirmed ? colors.success : colors.icon },
                            ]}
                          >
                            {confirmed ? 'Eaten' : 'Planned'}
                          </Text>
                        </TouchableOpacity>
                      )}

                      <TouchableOpacity
                        style={[styles.addBtn, { backgroundColor: colors.tint + '18' }]}
                        onPress={() => handleAddToSlot(key)}
                        activeOpacity={0.7}
                      >
                        <MaterialIcons name="add" size={20} color={colors.tint} />
                      </TouchableOpacity>
                    </View>
                  </View>

                  {hasLogs && (
                    <View style={styles.logList}>
                      {slotLogs.map((log) => (
                        <TouchableOpacity
                          key={log.id}
                          style={[styles.logRow, { borderTopColor: colors.separator }]}
                          onPress={() => handleEditLog(log)}
                          onLongPress={() => handleDeleteLog(log)}
                          activeOpacity={0.7}
                        >
                          <View style={styles.logInfo}>
                            <Text style={[styles.logName, { color: colors.text }]} numberOfLines={1}>
                              {log.food_name}
                            </Text>
                            <Text style={[styles.logMeta, { color: colors.icon }]}>
                              {log.serving_amount} × {log.food_serving_units}
                            </Text>
                          </View>
                          <View style={styles.logRight}>
                            <Text style={[styles.logCals, { color: colors.text }]}>
                              {Math.round(log.food_calories * log.serving_amount)}
                            </Text>
                            <Text style={[styles.logCalsUnit, { color: colors.icon }]}>kcal</Text>
                            <TouchableOpacity
                              onPress={() => handleDeleteLog(log)}
                              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                            >
                              <MaterialIcons name="delete-outline" size={18} color={colors.icon} />
                            </TouchableOpacity>
                          </View>
                        </TouchableOpacity>
                      ))}
                    </View>
                  )}

                  {!hasLogs && (
                    <TouchableOpacity
                      style={styles.emptySlot}
                      onPress={() => handleAddToSlot(key)}
                      activeOpacity={0.6}
                    >
                      <Text style={[styles.emptySlotText, { color: colors.icon }]}>
                        Tap to add food
                      </Text>
                    </TouchableOpacity>
                  )}
                </View>
              );
            })}
          </>
        )}
        </ScrollView>
          </Animated.View>
        </View>
      </GestureDetector>
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
  slotCard: { borderRadius: 18, padding: 16, marginBottom: 14 },
  slotHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  slotHeaderLeft: { flex: 1 },
  slotHeaderRight: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  confirmBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 20,
  },
  confirmBtnText: { fontSize: 12, fontWeight: '600' },
  slotLabel: { fontSize: 16, fontWeight: '600' },
  slotCals: { fontSize: 13, marginTop: 2 },
  addBtn: { width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center' },
  logList: { marginTop: 12, gap: 2 },
  logRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  logInfo: { flex: 1, marginRight: 8 },
  logName: { fontSize: 14, fontWeight: '500' },
  logMeta: { fontSize: 12, marginTop: 1 },
  logRight: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  logCals: { fontSize: 14, fontWeight: '600' },
  logCalsUnit: { fontSize: 12, marginRight: 6 },
  emptySlot: { marginTop: 10, paddingVertical: 8, alignItems: 'center' },
  emptySlotText: { fontSize: 14 },
});
