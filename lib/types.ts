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
  /** GTIN (EAN-13 normalized) when the food came from a barcode scan. Device-only, not synced. */
  barcode?: string | null;
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
  /** Optional daily reminder, 'HH:mm' (24h). */
  reminder_time: string | null;
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
  /** Tombstone: set when deleted; the row is purged after the deletion syncs. */
  deleted_at?: string | null;
};

export type MealSlotConfirmation = {
  id: string;
  date: string;
  meal_slot: MealSlot;
  confirmed: boolean;
  updated_at: string;
};

export type LogStatus = 'eaten' | 'planned';

export type TrackingMode = 'both' | 'nutrition' | 'training';

export type WeightUnit = 'kg' | 'lb';

/** Absolute end time so the remaining time survives backgrounding and app kills. */
export type RestTimerState = {
  workoutId: string;
  /** Epoch ms. */
  endsAt: number;
  durationSeconds: number;
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

/** 'none' = no session (offline first launch, or sync not configured). */
export type AuthStatus = 'none' | 'anonymous' | 'signedIn';

export type AuthMethod = 'apple' | 'email';

export type AuthState = {
  status: AuthStatus;
  email: string | null;
  /** How a signed-in user signs in; null when anonymous or unknown. */
  method: AuthMethod | null;
};

// Rows as returned by Supabase. Timestamps are timestamptz strings and may carry an offset.
export type RemoteFoodLog = {
  id: string;
  user_id: string;
  date: string;
  meal_slot: string;
  food_id: string;
  serving_amount: number;
  serving_unit: string;
  created_at: string | null;
  updated_at: string | null;
  deleted_at?: string | null;
};

export type RemoteMealDefinition = {
  user_id: string;
  id: string;
  position: number;
  calorie_target: number | null;
  protein_target: number | null;
  carb_target: number | null;
  fat_target: number | null;
  reminder_time: string | null;
  created_at: string | null;
  updated_at: string | null;
};

export type RemoteMealName = {
  user_id: string;
  meal_id: string;
  name: string;
  effective_from: string;
  updated_at: string | null;
};

export type RemoteUserGoals = {
  user_id: string;
  calorie_goal: number | null;
  protein_goal: number | null;
  carb_goal: number | null;
  fat_goal: number | null;
  updated_at: string | null;
};

export type RemoteUserProfile = {
  user_id: string;
  weight: number | null;
  height: number | null;
  activity_level: string | null;
  updated_at: string | null;
};
