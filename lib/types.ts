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
};

export type MealSlot = 'breakfast' | 'lunch' | 'dinner' | 'snack';

export type FoodLog = {
  id: string;
  date: string;
  meal_slot: MealSlot;
  food_id: string;
  serving_amount: number;
  serving_unit: string;
  created_at: string;
  updated_at: string;
};

export type MealSlotConfirmation = {
  id: string;
  date: string;
  meal_slot: MealSlot;
  confirmed: boolean;
  updated_at: string;
};

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
