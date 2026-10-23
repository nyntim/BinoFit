import type { NutrientValues } from '@/lib/nutrients';

export type Food = Partial<NutrientValues> & {
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
  /** Search-only row that needs a full catalog fetch. Never persisted. */
  detailsPending?: boolean;
  /** GTIN (EAN-13 normalized) when the food came from a barcode scan. Device-only, not synced. */
  barcode?: string | null;
  synced_at?: string | null;
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

export type WeightUnit = 'kg' | 'lb';

/** Absolute end time so the remaining time survives backgrounding and app kills. */
export type RestTimerState = {
  workoutId: string;
  /** Epoch ms. */
  endsAt: number;
  durationSeconds: number;
  /** The exercise block that started the rest (for the banner label); optional for older stored timers. */
  workoutExerciseId?: string;
  /** The set whose tick started the rest; only unticking this set cancels it. */
  setId?: string;
  exerciseName?: string;
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
  food_nutrients?: NutrientValues;
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

// ── Weight log ──────────────────────────────────────────────────
export type WeightEntrySource = 'manual' | 'healthkit';

export type WeightEntry = {
  id: string;
  /** Local calendar day, yyyy-MM-dd. */
  date: string;
  /** Always kg; display converts with lib/units. */
  weight_kg: number;
  /** ISO time of the weighing; the latest per day wins. */
  measured_at: string;
  source: WeightEntrySource;
  created_at: string;
  updated_at: string;
  synced_at?: string | null;
  deleted_at?: string | null;
};

export type RemoteWeightEntry = {
  id: string;
  user_id: string;
  date: string;
  weight_kg: number;
  measured_at: string | null;
  source?: WeightEntrySource | null;
  created_at: string | null;
  updated_at: string | null;
  deleted_at?: string | null;
};

// ── Workouts (Phase 4 training) ─────────────────────────────────────────────
// Units: weight kg, distance metres, time seconds. Dates yyyy-MM-dd local, times ISO.

export type ExerciseLogType =
  | 'weight_reps'
  | 'bodyweight_reps'
  | 'assisted'
  | 'duration'
  | 'distance_duration';

/** Which per-set effort column the editor shows (device preference). */
export type EffortMetric = 'rpe' | 'rir';

export type MuscleGroup =
  | 'chest'
  | 'front_delts'
  | 'side_delts'
  | 'rear_delts'
  | 'triceps'
  | 'biceps'
  | 'forearms'
  | 'lats'
  | 'upper_back'
  | 'lower_back'
  | 'abs'
  | 'glutes'
  | 'abductors'
  | 'quads'
  | 'hamstrings'
  | 'adductors'
  | 'calves'
  | 'full_body'
  | 'cardio';

export type Equipment =
  | 'machine'
  | 'cable'
  | 'barbell'
  | 'dumbbell'
  | 'bodyweight'
  | 'cardio_machine'
  | 'other';

export type LoadType = 'stack' | 'plate';
export type SetType = 'normal' | 'warmup' | 'drop' | 'failure';
export type WorkoutStatus = 'active' | 'draft' | 'done';
export type WorkoutSource = 'live' | 'manual';
export type ExerciseSource = 'seed' | 'custom';

export type Exercise = {
  id: string;
  name: string;
  log_type: ExerciseLogType;
  primary_muscles: MuscleGroup[];
  secondary_muscles: MuscleGroup[];
  equipment: Equipment;
  brand: string | null;
  load_type: LoadType | null;
  base_weight_kg: number | null;
  per_side: number; // 0 | 1
  setup_notes: string | null;
  default_rest_seconds: number | null;
  met: number | null;
  source: ExerciseSource;
  hidden: number; // 0 | 1
  created_at: string;
  updated_at: string;
  synced_at?: string | null;
  deleted_at?: string | null;
};

export type Workout = {
  id: string;
  status: WorkoutStatus;
  source: WorkoutSource;
  name: string | null;
  date: string;
  started_at: string | null;
  ended_at: string | null;
  duration_seconds: number | null;
  notes: string | null;
  routine_id: string | null;
  playlist_name?: string | null;
  playlist_id?: string | null;
  created_at: string;
  updated_at: string;
  synced_at?: string | null;
  deleted_at?: string | null;
};

export type WorkoutExercise = {
  id: string;
  workout_id: string;
  exercise_id: string;
  position: number;
  rest_seconds: number | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
  synced_at?: string | null;
  deleted_at?: string | null;
};

export type WorkoutSet = {
  id: string;
  workout_id: string;
  workout_exercise_id: string;
  position: number;
  set_type: SetType;
  weight_kg: number | null;
  reps: number | null;
  duration_seconds: number | null;
  distance_m: number | null;
  rpe: number | null;
  /** Reps in reserve, whole 0 to 10. */
  rir: number | null;
  completed_at: string | null;
  created_at: string;
  updated_at: string;
  synced_at?: string | null;
  deleted_at?: string | null;
};

/** A workout exercise with its (live) sets and the exercise definition (null name fields fall back). */
export type WorkoutExerciseWithSets = WorkoutExercise & {
  /** "Unknown exercise" when the exercise row is missing (e.g. restored before its definition). */
  exercise_name: string;
  exercise: Exercise | null;
  sets: WorkoutSet[];
};

export type WorkoutWithExercises = Workout & { exercises: WorkoutExerciseWithSets[] };

export type RemoteExercise = {
  user_id: string;
  id: string;
  name: string;
  log_type: ExerciseLogType;
  primary_muscles: MuscleGroup[] | null;
  secondary_muscles: MuscleGroup[] | null;
  equipment: Equipment;
  brand: string | null;
  load_type: LoadType | null;
  base_weight_kg: number | null;
  per_side: number | boolean | null;
  setup_notes: string | null;
  default_rest_seconds: number | null;
  met: number | null;
  source?: string | null;
  hidden: number | boolean | null;
  created_at: string | null;
  updated_at: string | null;
  deleted_at?: string | null;
};

export type RemoteWorkout = {
  user_id: string;
  id: string;
  status?: string | null;
  source: WorkoutSource | null;
  name: string | null;
  date: string;
  started_at: string | null;
  ended_at: string | null;
  duration_seconds: number | null;
  notes: string | null;
  routine_id: string | null;
  playlist_name?: string | null;
  playlist_id?: string | null;
  created_at: string | null;
  updated_at: string | null;
  deleted_at?: string | null;
};

export type RemoteWorkoutExercise = {
  user_id: string;
  id: string;
  workout_id: string;
  exercise_id: string;
  position: number;
  rest_seconds: number | null;
  notes: string | null;
  created_at: string | null;
  updated_at: string | null;
  deleted_at?: string | null;
};

export type RemoteWorkoutSet = {
  user_id: string;
  id: string;
  workout_id: string;
  workout_exercise_id: string;
  position: number;
  set_type: SetType;
  weight_kg: number | null;
  reps: number | null;
  duration_seconds: number | null;
  distance_m: number | null;
  rpe: number | null;
  /** Absent on rows written before the column existed. */
  rir?: number | null;
  completed_at: string | null;
  created_at: string | null;
  updated_at: string | null;
  deleted_at?: string | null;
};

// ── Training tab summaries (C8) ─────────────────────────────────────────────

/** One finished workout as shown in the Training tab and the history list. */
export type WorkoutSummary = {
  id: string;
  /** yyyy-MM-dd */
  date: string;
  title: string;
  /** e.g. "Thu 16 Oct · Deadlift, Lat pulldown" or "Mon 13 Oct · 5.00 km · 5:30 /km". */
  subtitle: string;
  /** e.g. "58 min", "1h 04m". */
  durationLabel: string;
  /** e.g. "4,820 kg", "cardio", or null when there is nothing to show. */
  detailLabel: string | null;
  /** Saved Spotify playlist name (fallback label when unnamed), or null when none was saved. */
  playlistLabel: string | null;
};

/** Totals for one Monday to Sunday week (volume in kg). */
export type WeekSummary = {
  sessions: number;
  volumeKg: number;
  durationSeconds: number;
};

// ── Routines ────────────────────────────────────────────────────────────────

export type Routine = {
  id: string;
  name: string;
  position: number;
  created_at: string;
  updated_at: string;
  synced_at?: string | null;
  deleted_at?: string | null;
};

export type RoutineExercise = {
  id: string;
  routine_id: string;
  exercise_id: string;
  position: number;
  set_count: number;
  rest_seconds: number | null;
  created_at: string;
  updated_at: string;
  synced_at?: string | null;
  deleted_at?: string | null;
};

export type RoutineExerciseWithExercise = RoutineExercise & {
  /** "Unknown exercise" when the definition is missing. */
  exercise_name: string;
  exercise: Exercise | null;
};

export type RoutineWithExercises = Routine & { exercises: RoutineExerciseWithExercise[] };

export type RemoteRoutine = {
  user_id: string;
  id: string;
  name: string;
  position: number;
  created_at: string | null;
  updated_at: string | null;
  deleted_at?: string | null;
};

export type RemoteRoutineExercise = {
  user_id: string;
  id: string;
  routine_id: string;
  exercise_id: string;
  position: number;
  set_count: number;
  rest_seconds: number | null;
  created_at: string | null;
  updated_at: string | null;
  deleted_at?: string | null;
};

