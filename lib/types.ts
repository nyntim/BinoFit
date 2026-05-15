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

export type MealSlot = 'breakfast' | 'lunch' | 'dinner' | 'snack';

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
