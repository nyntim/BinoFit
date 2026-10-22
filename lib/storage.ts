import AsyncStorage from '@react-native-async-storage/async-storage';
import { resolveDefaultSetCount } from '@/lib/workouts/prefill';
import type {
  EffortMetric,
  LogStatus,
  RestTimerState,
  WeightUnit,   RemoteUserGoals,
  RemoteUserProfile,
  UserGoals,
  UserProfile,
} from '@/lib/types';

const KEYS = {
  USER_GOALS: 'user_goals',
  USER_PROFILE: 'user_profile',
  ONBOARDING_COMPLETE: 'onboarding_complete',
  DEFAULT_LOG_STATUS: 'default_log_status',
  QUICK_ADD_DRINKS: 'quick_add_drinks',
  DEVICE_ID: 'device_id',
  LAST_SYNC_AT: 'last_sync_at',
  LEGACY_CLAIMED: 'legacy_data_claimed',
  PENDING_MERGE_TICKET: 'pending_merge_ticket',
  PENDING_WIPE: 'pending_wipe',
  RESTORE_PENDING: 'restore_pending',
  SYNCED_UID: 'last_synced_uid',
  WEIGHT_UNIT: 'weight_unit',
  APPEARANCE: 'appearance',
  // Key kept from when this was Show RPE; it now means "show the effort column".
  SHOW_RPE: 'show_rpe',
  EFFORT_METRIC: 'effort_metric',
  REST_TIMER_ENABLED: 'rest_timer_enabled',
  DEFAULT_SET_COUNT: 'default_set_count',
  ACTIVE_REST_TIMER: 'active_rest_timer',
} as const;

type StoredUserGoals = UserGoals & { synced_at?: string };
type StoredUserProfile = UserProfile & { synced_at?: string };

export async function getOnboardingComplete(): Promise<boolean> {
  const val = await AsyncStorage.getItem(KEYS.ONBOARDING_COMPLETE);
  return val === 'true';
}

export async function setOnboardingComplete(): Promise<void> {
  await AsyncStorage.setItem(KEYS.ONBOARDING_COMPLETE, 'true');
}

export async function resetOnboarding(): Promise<void> {
  await AsyncStorage.removeItem(KEYS.ONBOARDING_COMPLETE);
}

export async function getUserGoals(): Promise<StoredUserGoals | null> {
  const val = await AsyncStorage.getItem(KEYS.USER_GOALS);
  return val ? (JSON.parse(val) as StoredUserGoals) : null;
}

export async function saveUserGoals(goals: Omit<UserGoals, 'updated_at'>): Promise<void> {
  const data: StoredUserGoals = { ...goals, updated_at: new Date().toISOString(), synced_at: undefined };
  await AsyncStorage.setItem(KEYS.USER_GOALS, JSON.stringify(data));
}

export async function markGoalsSynced(ts: string): Promise<void> {
  const existing = await getUserGoals();
  if (!existing) return;
  await AsyncStorage.setItem(KEYS.USER_GOALS, JSON.stringify({ ...existing, synced_at: ts }));
}

export async function getUserProfile(): Promise<StoredUserProfile | null> {
  const val = await AsyncStorage.getItem(KEYS.USER_PROFILE);
  return val ? (JSON.parse(val) as StoredUserProfile) : null;
}

export async function saveUserProfile(profile: Omit<UserProfile, 'updated_at'>): Promise<void> {
  const data: StoredUserProfile = { ...profile, updated_at: new Date().toISOString(), synced_at: undefined };
  await AsyncStorage.setItem(KEYS.USER_PROFILE, JSON.stringify(data));
}

export async function markProfileSynced(ts: string): Promise<void> {
  const existing = await getUserProfile();
  if (!existing) return;
  await AsyncStorage.setItem(KEYS.USER_PROFILE, JSON.stringify({ ...existing, synced_at: ts }));
}

export function resolveDefaultLogStatus(stored: string | null): LogStatus {
  return stored === 'planned' ? 'planned' : 'eaten';
}

export async function getDefaultLogStatus(): Promise<LogStatus> {
  return resolveDefaultLogStatus(await AsyncStorage.getItem(KEYS.DEFAULT_LOG_STATUS));
}

export async function setDefaultLogStatus(status: LogStatus): Promise<void> {
  await AsyncStorage.setItem(KEYS.DEFAULT_LOG_STATUS, status);
}

// ── Training preferences (device only) ──────────────────────────

export function resolveWeightUnit(stored: string | null): WeightUnit {
  return stored === 'kg' ? 'kg' : 'lb';
}

export async function getWeightUnit(): Promise<WeightUnit> {
  return resolveWeightUnit(await AsyncStorage.getItem(KEYS.WEIGHT_UNIT));
}

export async function setWeightUnit(unit: WeightUnit): Promise<void> {
  await AsyncStorage.setItem(KEYS.WEIGHT_UNIT, unit);
}

export async function getShowEffort(): Promise<boolean> {
  return (await AsyncStorage.getItem(KEYS.SHOW_RPE)) === 'true';
}

export async function setShowEffort(show: boolean): Promise<void> {
  await AsyncStorage.setItem(KEYS.SHOW_RPE, show ? 'true' : 'false');
}

export function resolveEffortMetric(stored: string | null): EffortMetric {
  return stored === 'rir' ? 'rir' : 'rpe';
}

export async function getEffortMetric(): Promise<EffortMetric> {
  return resolveEffortMetric(await AsyncStorage.getItem(KEYS.EFFORT_METRIC));
}

export async function setEffortMetric(metric: EffortMetric): Promise<void> {
  await AsyncStorage.setItem(KEYS.EFFORT_METRIC, metric);
}

/** On unless the stored value is exactly 'false'. */
export async function getRestTimerEnabled(): Promise<boolean> {
  return (await AsyncStorage.getItem(KEYS.REST_TIMER_ENABLED)) !== 'false';
}

export async function setRestTimerEnabled(enabled: boolean): Promise<void> {
  await AsyncStorage.setItem(KEYS.REST_TIMER_ENABLED, enabled ? 'true' : 'false');
}

export { resolveDefaultSetCount };

export async function getDefaultSetCount(): Promise<number> {
  return resolveDefaultSetCount(await AsyncStorage.getItem(KEYS.DEFAULT_SET_COUNT));
}

export async function setDefaultSetCount(count: number): Promise<void> {
  await AsyncStorage.setItem(KEYS.DEFAULT_SET_COUNT, String(count));
}

export function parseRestTimer(raw: string | null): RestTimerState | null {
  if (!raw) return null;
  try {
    const v = JSON.parse(raw) as Partial<RestTimerState>;
    return typeof v.workoutId === 'string' &&
      typeof v.endsAt === 'number' &&
      typeof v.durationSeconds === 'number'
      ? {
          workoutId: v.workoutId,
          endsAt: v.endsAt,
          durationSeconds: v.durationSeconds,
          ...(typeof v.workoutExerciseId === 'string' ? { workoutExerciseId: v.workoutExerciseId } : {}),
          ...(typeof v.setId === 'string' ? { setId: v.setId } : {}),
          ...(typeof v.exerciseName === 'string' ? { exerciseName: v.exerciseName } : {}),
        }
      : null;
  } catch {
    return null;
  }
}

export async function getActiveRestTimer(): Promise<RestTimerState | null> {
  return parseRestTimer(await AsyncStorage.getItem(KEYS.ACTIVE_REST_TIMER));
}

export async function setActiveRestTimer(timer: RestTimerState | null): Promise<void> {
  if (timer) await AsyncStorage.setItem(KEYS.ACTIVE_REST_TIMER, JSON.stringify(timer));
  else await AsyncStorage.removeItem(KEYS.ACTIVE_REST_TIMER);
}

export async function getQuickAddDrinks(): Promise<any[] | null> {
  const val = await AsyncStorage.getItem(KEYS.QUICK_ADD_DRINKS);
  return val ? JSON.parse(val) : null;
}

export async function saveQuickAddDrinks(drinks: any[]): Promise<void> {
  await AsyncStorage.setItem(KEYS.QUICK_ADD_DRINKS, JSON.stringify(drinks));
}

export async function getLastSyncAt(): Promise<string | null> {
  return AsyncStorage.getItem(KEYS.LAST_SYNC_AT);
}

export async function setLastSyncAt(iso: string): Promise<void> {
  await AsyncStorage.setItem(KEYS.LAST_SYNC_AT, iso);
}

// ── Account ─────────────────────────────────────────────────────

export async function getLegacyClaimed(): Promise<boolean> {
  return (await AsyncStorage.getItem(KEYS.LEGACY_CLAIMED)) === 'true';
}

export async function setLegacyClaimed(): Promise<void> {
  await AsyncStorage.setItem(KEYS.LEGACY_CLAIMED, 'true');
}

export type PendingMergeTicket = { ticket: string; from: string };

export async function getPendingMergeTicket(): Promise<PendingMergeTicket | null> {
  const raw = await AsyncStorage.getItem(KEYS.PENDING_MERGE_TICKET);
  if (!raw) return null;
  try {
    const v = JSON.parse(raw) as Partial<PendingMergeTicket>;
    return typeof v.ticket === 'string' && typeof v.from === 'string'
      ? { ticket: v.ticket, from: v.from }
      : null;
  } catch {
    return null;
  }
}

/** `from` is the anonymous user id the ticket was made by. */
export async function setPendingMergeTicket(ticket: string, from: string): Promise<void> {
  await AsyncStorage.setItem(KEYS.PENDING_MERGE_TICKET, JSON.stringify({ ticket, from }));
}

export async function getPendingWipe(): Promise<boolean> {
  return (await AsyncStorage.getItem(KEYS.PENDING_WIPE)) === 'true';
}

export async function setPendingWipe(): Promise<void> {
  await AsyncStorage.setItem(KEYS.PENDING_WIPE, 'true');
}

export async function clearPendingWipe(): Promise<void> {
  await AsyncStorage.removeItem(KEYS.PENDING_WIPE);
}

export async function getRestorePending(): Promise<boolean> {
  return (await AsyncStorage.getItem(KEYS.RESTORE_PENDING)) === 'true';
}

export async function setRestorePending(pending: boolean): Promise<void> {
  if (pending) await AsyncStorage.setItem(KEYS.RESTORE_PENDING, 'true');
  else await AsyncStorage.removeItem(KEYS.RESTORE_PENDING);
}

export async function getSyncedUid(): Promise<string | null> {
  return AsyncStorage.getItem(KEYS.SYNCED_UID);
}

export async function setSyncedUid(uid: string): Promise<void> {
  await AsyncStorage.setItem(KEYS.SYNCED_UID, uid);
}

/** Clears the synced flag on goals and profile so the next sync pushes them again. */
export async function clearGoalsProfileSyncFlags(): Promise<void> {
  const [goals, profile] = await Promise.all([getUserGoals(), getUserProfile()]);
  if (goals?.synced_at) {
    await AsyncStorage.setItem(KEYS.USER_GOALS, JSON.stringify({ ...goals, synced_at: undefined }));
  }
  if (profile?.synced_at) {
    await AsyncStorage.setItem(KEYS.USER_PROFILE, JSON.stringify({ ...profile, synced_at: undefined }));
  }
}

export async function clearPendingMergeTicket(): Promise<void> {
  await AsyncStorage.removeItem(KEYS.PENDING_MERGE_TICKET);
}

const ACTIVITY_LEVELS = ['sedentary', 'light', 'moderate', 'active', 'very_active'] as const;

/** Replaces local goals with the account's. Returns false (and writes nothing) if the row is incomplete. */
export async function applyRemoteGoals(remote: RemoteUserGoals): Promise<boolean> {
  const { calorie_goal, protein_goal, carb_goal, fat_goal } = remote;
  if (
    calorie_goal == null || protein_goal == null || carb_goal == null || fat_goal == null
  ) {
    return false;
  }
  const now = new Date().toISOString();
  const data: StoredUserGoals = {
    calorie_goal,
    protein_goal,
    carb_goal,
    fat_goal,
    updated_at: remote.updated_at ? new Date(remote.updated_at).toISOString() : now,
    synced_at: now,
  };
  await AsyncStorage.setItem(KEYS.USER_GOALS, JSON.stringify(data));
  return true;
}

/** Replaces the local profile with the account's. */
export async function applyRemoteProfile(remote: RemoteUserProfile): Promise<void> {
  const now = new Date().toISOString();
  const level = (ACTIVITY_LEVELS as readonly string[]).includes(remote.activity_level ?? '')
    ? (remote.activity_level as UserProfile['activity_level'])
    : null;
  const data: StoredUserProfile = {
    weight: remote.weight,
    height: remote.height,
    activity_level: level,
    updated_at: remote.updated_at ? new Date(remote.updated_at).toISOString() : now,
    synced_at: now,
  };
  await AsyncStorage.setItem(KEYS.USER_PROFILE, JSON.stringify(data));
}

/**
 * Removes everything a signed-out user owns in AsyncStorage: goals, profile, the onboarding
 * flag, quick-add drinks, the pending merge ticket, the last-sync stamp, restore-pending, synced uid, and the active rest timer. Keeps the device
 * id, the legacy-claimed flag, the default log status, weight unit, effort per set, effort scale, rest timer switch and default set count preferences.
 */
export async function clearUserStorage(): Promise<void> {
  await AsyncStorage.multiRemove([
    KEYS.USER_GOALS,
    KEYS.USER_PROFILE,
    KEYS.ONBOARDING_COMPLETE,
    KEYS.QUICK_ADD_DRINKS,
    KEYS.PENDING_MERGE_TICKET,
    KEYS.LAST_SYNC_AT,
    KEYS.RESTORE_PENDING,
    KEYS.SYNCED_UID,
    KEYS.ACTIVE_REST_TIMER,
  ]);
}

export type AppearancePreference = 'system' | 'light' | 'dark';
export async function getAppearance(): Promise<AppearancePreference> {
  const value = await AsyncStorage.getItem(KEYS.APPEARANCE);
  return value === 'light' || value === 'dark' ? value : 'system';
}
export async function setAppearance(value: AppearancePreference): Promise<void> {
  await AsyncStorage.setItem(KEYS.APPEARANCE, value);
}
