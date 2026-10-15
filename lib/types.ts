export type Food = {
  id: string;
  name: string;
  brand: string | null;
  serving_units: string;
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  source: string | null;
  updated_at: string;
  matchTier?: number;
  // micronutrients (all in standard label units; null = not available)
  fiber?: number | null;
  sugar?: number | null;
  sodium?: number | null;
  cholesterol?: number | null;
  saturated_fat?: number | null;
  trans_fat?: number | null;
  vitamin_d?: number | null;
  calcium?: number | null;
  iron?: number | null;
  potassium?: number | null;
};

/** Id of a user-defined meal. The four seeded defaults use 'breakfast' | 'lunch' | 'dinner' | 'snack'. */
export type MealId = string;

/** Kept under this name because the columns and route params stay `meal_slot`. */
export type MealSlot = MealId;

export type MealTargets = {
  calorie_target: number | null;
  protein_target: number | null;
  carb_target: number | null;
  fat_target: number | null;
};

export type MealDefinition = MealTargets & {
  id: MealId;
  position: number;
  created_at: string;
  updated_at: string;
  synced_at?: string | null;
};

/** Name history: the name in force for a meal from `effective_from` (yyyy-MM-dd) onward. */
export type MealNameEntry = {
  meal_id: MealId;
  name: string;
  effective_from: string;
  updated_at: string;
  synced_at?: string | null;
};

export type FoodLog = {
  id: string;
  date: string;
  meal_slot: MealSlot;
  food_id: string;
  serving_amount: number;
  serving_unit: string;
  logged_time?: string | null;
  created_at: string;
  updated_at: string;
  synced_at?: string | null;
};

export type MealSlotConfirmation = {
  id: string;
  date: string;
  meal_slot: MealSlot;
  confirmed: boolean;
  updated_at: string;
};

export type LogStatus = 'eaten' | 'planned';

export type UserGoals = {
  calorie_goal: number;
  protein_goal: number;
  carb_goal: number;
  fat_goal: number;
  updated_at: string;
};

export type UserProfile = {
  weight: number | null;
  height: number | null;
  activity_level: 'sedentary' | 'light' | 'moderate' | 'active' | 'very_active' | null;
  updated_at: string;
};

export type FoodLogWithFood = FoodLog & {
  food_name: string;
  food_brand: string | null;
  food_calories: number;
  food_protein: number;
  food_carbs: number;
  food_fat: number;
  food_serving_units: string;
};

export type WaterLog = {
  id: string;
  date: string;
  amount: number;
  drink_name: string;
  created_at: string;
};

export type QuickAddDrink = {
  id: string;
  name: string;
  amount: number;
  food_id?: string;
};
