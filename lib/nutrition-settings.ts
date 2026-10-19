import type { UserGoals } from '@/lib/types';

export type GoalField = 'calorie_goal' | 'protein_goal' | 'carb_goal' | 'fat_goal';
export type GoalValues = Pick<UserGoals, GoalField>;
export const GOAL_FIELDS: GoalField[] = ['calorie_goal', 'protein_goal', 'carb_goal', 'fat_goal'];

export function parseGoalInput(input: string): number | null {
  const trimmed = input.trim();
  if (!/^[0-9]+$/.test(trimmed)) return null;
  const value = Number(trimmed);
  return Number.isSafeInteger(value) && value > 0 ? value : null;
}

export function mergeValidGoalFields(base: GoalValues, draft: Record<GoalField, string>): GoalValues {
  const merged: GoalValues = { calorie_goal: base.calorie_goal, protein_goal: base.protein_goal, carb_goal: base.carb_goal, fat_goal: base.fat_goal };
  for (const field of GOAL_FIELDS) {
    const parsed = parseGoalInput(draft[field]);
    if (parsed !== null) merged[field] = parsed;
  }
  return merged;
}
