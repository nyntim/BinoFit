import { useEffect, useState } from 'react';
import { getFoodLogsWithFoodByDate, getMealSlotConfirmationsByDate } from '@/lib/database';
import { sumEatenTotals } from '@/lib/nutrition-totals';
import { getUserGoals, getDefaultLogStatus } from '@/lib/storage';
import type { LogStatus, MealSlotConfirmation } from '@/lib/types';

/**
 * Serving picker context for `date`: what is already eaten (without the log being edited), the
 * macro goals, the slot statuses and the default status for new food.
 */
export function useServingDayTotals(date: string, log_id: string | undefined) {
  const [dailyCalories, setDailyCalories] = useState(0);
  const [dailyProtein, setDailyProtein] = useState(0);
  const [dailyCarbsState, setDailyCarbsState] = useState(0);
  const [dailyFat, setDailyFat] = useState(0);
  const [calorieGoal, setCalorieGoal] = useState<number | null>(null);
  const [proteinGoal, setProteinGoal] = useState<number | null>(null);
  const [carbGoal, setCarbGoal] = useState<number | null>(null);
  const [fatGoal, setFatGoal] = useState<number | null>(null);
  const [confirmations, setConfirmations] = useState<MealSlotConfirmation[]>([]);
  const [defaultStatus, setDefaultStatus] = useState<LogStatus>('eaten');

  useEffect(() => {
    if (!date) return;
    Promise.all([
      getFoodLogsWithFoodByDate(date),
      getUserGoals(),
      getMealSlotConfirmationsByDate(date),
      getDefaultLogStatus(),
    ]).then(([logs, goals, slotConfirmations, status]) => {
      setConfirmations(slotConfirmations);
      setDefaultStatus(status);
      const others = logs.filter((l) => l.id !== log_id);
      const totals = sumEatenTotals(others, slotConfirmations);
      setDailyCalories(Math.round(totals.calories));
      setDailyProtein(Math.round(totals.protein * 10) / 10);
      setDailyCarbsState(Math.round(totals.carbs * 10) / 10);
      setDailyFat(Math.round(totals.fat * 10) / 10);
      if (goals) {
        setCalorieGoal(goals.calorie_goal);
        setProteinGoal(goals.protein_goal);
        setCarbGoal(goals.carb_goal);
        setFatGoal(goals.fat_goal);
      }
    }).catch(() => {
      // Totals are supplementary; the food/edit loaders expose their own retry states.
    });
  }, [date, log_id]);

  return {
    dailyCalories,
    dailyProtein,
    dailyCarbsState,
    dailyFat,
    calorieGoal,
    proteinGoal,
    carbGoal,
    fatGoal,
    confirmations,
    defaultStatus,
  };
}
