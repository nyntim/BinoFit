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

export type FoodLog = {
  id: string;
  date: string;
  meal_slot: 'breakfast' | 'lunch' | 'dinner' | 'snack';
  food_id: string;
  serving_amount: number;
  serving_unit: string;
  created_at: string;
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
