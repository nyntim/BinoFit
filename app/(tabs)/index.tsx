import { useCallback, useEffect, useState } from 'react';
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
import { getUserGoals } from '@/lib/storage';
import { getFoodLogsWithFoodByDate, deleteFoodLog } from '@/lib/database';
import { CalorieRing } from '@/components/calorie-ring';
import { MacroBar } from '@/components/macro-bar';
import { CalendarWidget } from '@/components/CalendarWidget';
import { useDate } from '@/context/DateContext';
import { useSwipeDayNavigation } from '@/hooks/useSwipeDayNavigation';
import type { FoodLogWithFood, UserGoals } from '@/lib/types';

type MealSlot = 'breakfast' | 'lunch' | 'dinner' | 'snack';

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

  const [goals, setGoals] = useState<UserGoals>(DEFAULT_GOALS);
  const [logs, setLogs] = useState<FoodLogWithFood[]>([]);
  const [loading, setLoading] = useState(true);

  const loadData = useCallback(() => {
    setLoading(true);
    Promise.all([getUserGoals(), getFoodLogsWithFoodByDate(selectedDate)])
      .then(([userGoals, foodLogs]) => {
        if (userGoals) setGoals(userGoals);
        setLogs(foodLogs);
      })
      .finally(() => setLoading(false));
  }, [selectedDate]);

  useFocusEffect(loadData);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const consumed = logs.reduce(
    (acc, log) => ({
      calories: acc.calories + log.food_calories * log.serving_amount,
      protein: acc.protein + log.food_protein * log.serving_amount,
      carbs: acc.carbs + log.food_carbs * log.serving_amount,
      fat: acc.fat + log.food_fat * log.serving_amount,
    }),
    { calories: 0, protein: 0, carbs: 0, fat: 0 }
  );

  const logsForSlot = (slot: MealSlot) => logs.filter((l) => l.meal_slot === slot);

  const slotCalories = (slot: MealSlot) =>
    logsForSlot(slot).reduce((sum, l) => sum + l.food_calories * l.serving_amount, 0);

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
                <Text style={[styles.dateLabel, { color: colors.icon }]}>
                  {displayDate}{selectedDate === today ? '  · Today' : ''}
                </Text>
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

            {/* Meal slots */}
            {MEAL_SLOTS.map(({ key, label }) => {
              const slotLogs = logsForSlot(key);
              const slotCals = Math.round(slotCalories(key));
              return (
                <View key={key} style={[styles.slotCard, { backgroundColor: colors.cardBackground }]}>
                  <View style={styles.slotHeader}>
                    <View>
                      <Text style={[styles.slotLabel, { color: colors.text }]}>{label}</Text>
                      {slotCals > 0 && (
                        <Text style={[styles.slotCals, { color: colors.icon }]}>{slotCals} kcal</Text>
                      )}
                    </View>
                    <TouchableOpacity
                      style={[styles.addBtn, { backgroundColor: colors.tint + '18' }]}
                      onPress={() => handleAddToSlot(key)}
                      activeOpacity={0.7}
                    >
                      <MaterialIcons name="add" size={20} color={colors.tint} />
                    </TouchableOpacity>
                  </View>

                  {slotLogs.length > 0 && (
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

                  {slotLogs.length === 0 && (
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
  dateLabel: { fontSize: 13, fontWeight: '500', marginBottom: 2 },
  pageTitle: { fontSize: 28, fontWeight: '700' },
  loadingContainer: { paddingTop: 60, alignItems: 'center' },
  calorieCard: { borderRadius: 18, padding: 20, marginBottom: 14 },
  ringRow: { flexDirection: 'row', alignItems: 'center', gap: 20 },
  calorieSummary: { flex: 1, gap: 12 },
  calorieStatValue: { fontSize: 18, fontWeight: '700' },
  calorieStatLabel: { fontSize: 12, marginTop: 1 },
  macroCard: { borderRadius: 18, padding: 16, marginBottom: 14 },
  slotCard: { borderRadius: 18, padding: 16, marginBottom: 14 },
  slotHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
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
