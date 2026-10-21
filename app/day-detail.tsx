import { useCallback, useState } from 'react';
import {
  StyleSheet,
  View,
  Text,
  ScrollView,
  ActivityIndicator,
  TouchableOpacity,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { format, parseISO } from 'date-fns';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { MacroColors } from '@/constants/theme';
import { useThemeColor } from '@/hooks/use-theme-color';
import { getUserGoals } from '@/lib/storage';
import { getFoodLogsWithFoodByDate, getMealSlotConfirmationsByDate } from '@/lib/database';
import { isSlotEaten, sumEatenTotals, logsForSlot, slotCalories } from '@/lib/nutrition-totals';
import { formatMealTargets, mealsForDay } from '@/lib/meals';
import { useMealDefinitions } from '@/hooks/useMealDefinitions';
import { CalorieRing } from '@/components/calorie-ring';
import { MacroBar } from '@/components/macro-bar';
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
  const cardBackground = useThemeColor({}, 'cardBackground');
  const icon = useThemeColor({}, 'icon');
  const separator = useThemeColor({}, 'separator');
  const text = useThemeColor({}, 'text');
  const tint = useThemeColor({}, 'tint');
  const colors = { background, cardBackground, icon, separator, text, tint };

  const [goals, setGoals] = useState<UserGoals>(DEFAULT_GOALS);
  const [logs, setLogs] = useState<FoodLogWithFood[]>([]);
  const [confirmations, setConfirmations] = useState<MealSlotConfirmation[]>([]);
  const [loading, setLoading] = useState(true);

  const displayDate = date ? format(parseISO(date), 'EEEE, MMM d') : '';

  useFocusEffect(
    useCallback(() => {
      if (!date) return;
      let cancelled = false;
      Promise.all([getUserGoals(), getFoodLogsWithFoodByDate(date), getMealSlotConfirmationsByDate(date)])
        .then(([userGoals, foodLogs, slotConfirmations]) => {
          if (cancelled) return;
          if (userGoals) setGoals(userGoals);
          setLogs(foodLogs);
          setConfirmations(slotConfirmations);
        })
        .finally(() => {
          if (!cancelled) setLoading(false);
        });
      return () => {
        cancelled = true;
      };
    }, [date])
  );

  const { defs, names, loaded: mealsLoaded } = useMealDefinitions();
  const meals = mealsForDay(defs, names, logs, date ?? '');

  const consumed = sumEatenTotals(logs, confirmations);

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
      {/* Header */}
      <View style={styles.headerRow}>
        <TouchableOpacity accessibilityRole="button" accessibilityLabel="Back" onPress={() => router.back()} style={styles.backBtn} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
          <MaterialIcons name="chevron-left" size={28} color={colors.tint} />
        </TouchableOpacity>
        <View style={styles.headerCenter}>
          <Text style={[styles.headerDate, { color: colors.icon }]}>{displayDate}</Text>
          <Text style={[styles.headerTitle, { color: colors.text }]}>Day Summary</Text>
        </View>
        <View style={styles.backBtn} />
      </View>

      {loading || !mealsLoaded ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator color={colors.tint} />
        </View>
      ) : (
        <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
          {logs.length === 0 ? (
            <View style={styles.emptyContainer}>
              <MaterialIcons name="no-meals" size={48} color={colors.icon} />
              <Text style={[styles.emptyText, { color: colors.icon }]}>No foods logged this day</Text>
            </View>
          ) : (
            <>
              {/* Calorie ring */}
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
                    <CalorieStat label="Goal" value={goals.calorie_goal} textColor={colors.text} subColor={colors.icon} />
                    <CalorieStat label="Eaten" value={Math.round(consumed.calories)} textColor={colors.text} subColor={colors.icon} />
                  </View>
                </View>
              </View>

              {/* Macro bars */}
              <View style={[styles.macroCard, { backgroundColor: colors.cardBackground }]}>
                <MacroBar label="Protein" consumed={Math.round(consumed.protein * 10) / 10} goal={goals.protein_goal} color={MacroColors.protein} textColor={colors.text} subTextColor={colors.icon} />
                <MacroBar label="Carbs" consumed={Math.round(consumed.carbs * 10) / 10} goal={goals.carb_goal} color={MacroColors.carbs} textColor={colors.text} subTextColor={colors.icon} />
                <MacroBar label="Fat" consumed={Math.round(consumed.fat * 10) / 10} goal={goals.fat_goal} color={MacroColors.fat} textColor={colors.text} subTextColor={colors.icon} />
              </View>

              {/* Meal slots (read-only) */}
              {meals.map(({ id: key, name: label, def }) => {
                const slotLogs = logsForSlot(logs, key);
                if (slotLogs.length === 0) return null;
                const slotCals = Math.round(slotCalories(logs, key));
                const eaten = isSlotEaten(confirmations, key);
                const targetText = formatMealTargets(def, sumEatenTotals(slotLogs, []));
                const calText = targetText.calories ?? `${slotCals} cal`;
                return (
                  <View
                    key={key}
                    style={[
                      styles.slotCard,
                      { backgroundColor: colors.cardBackground },
                      !eaten && {
                        opacity: 0.7,
                        borderWidth: 1,
                        borderStyle: 'dashed',
                        borderColor: colors.icon + '40',
                      },
                    ]}
                  >
                    <View style={styles.slotHeader}>
                      <Text style={[styles.slotLabel, { color: colors.text }]}>{label}</Text>
                      <Text style={[styles.slotCals, { color: colors.icon }]}>
                        {eaten ? calText : `Planned · ${calText}`}
                      </Text>
                    </View>
                    {targetText.macros && (
                      <Text style={[styles.slotMacros, { color: colors.icon }]}>{targetText.macros}</Text>
                    )}
                    <View style={styles.logList}>
                      {slotLogs.map((log) => (
                        <View key={log.id} style={[styles.logRow, { borderTopColor: colors.separator }]}>
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
                            <Text style={[styles.logCalsUnit, { color: colors.icon }]}>cal</Text>
                          </View>
                        </View>
                      ))}
                    </View>
                  </View>
                );
              })}
            </>
          )}
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

function CalorieStat({ label, value, textColor, subColor }: { label: string; value: number; textColor: string; subColor: string }) {
  return (
    <View>
      <Text style={[styles.calorieStatValue, { color: textColor }]}>{value.toLocaleString()}</Text>
      <Text style={[styles.calorieStatLabel, { color: subColor }]}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  headerRow: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingVertical: 10 },
  backBtn: { width: 36 },
  headerCenter: { flex: 1, alignItems: 'center' },
  headerDate: { fontSize: 13, fontWeight: '500', marginBottom: 1 },
  headerTitle: { fontSize: 20, fontWeight: '700' },
  loadingContainer: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  scroll: { padding: 20, paddingBottom: 40 },
  emptyContainer: { marginTop: 80, alignItems: 'center', gap: 12 },
  emptyText: { fontSize: 16 },
  calorieCard: { borderRadius: 18, padding: 20, marginBottom: 14 },
  ringRow: { flexDirection: 'row', alignItems: 'center', gap: 20 },
  calorieSummary: { flex: 1, gap: 12 },
  calorieStatValue: { fontSize: 18, fontWeight: '700' },
  calorieStatLabel: { fontSize: 12, marginTop: 1 },
  macroCard: { borderRadius: 18, padding: 16, marginBottom: 14 },
  slotCard: { borderRadius: 18, padding: 16, marginBottom: 14 },
  slotHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 },
  slotLabel: { fontSize: 16, fontWeight: '600' },
  slotCals: { fontSize: 13, fontVariant: ['tabular-nums'] },
  slotMacros: { fontSize: 12, fontVariant: ['tabular-nums'] },
  logList: { marginTop: 8, gap: 2 },
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
  logCals: { fontSize: 14, fontWeight: '600', fontVariant: ['tabular-nums'] },
  logCalsUnit: { fontSize: 12 },
});
