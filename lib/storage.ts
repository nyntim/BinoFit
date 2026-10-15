import AsyncStorage from '@react-native-async-storage/async-storage';
import type { LogStatus, UserGoals, UserProfile } from '@/lib/types';

const KEYS = {
  USER_GOALS: 'user_goals',
  USER_PROFILE: 'user_profile',
  ONBOARDING_COMPLETE: 'onboarding_complete',
  DEFAULT_LOG_STATUS: 'default_log_status',
  QUICK_ADD_DRINKS: 'quick_add_drinks',
  DEVICE_ID: 'device_id',
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

export async function getQuickAddDrinks(): Promise<any[] | null> {
  const val = await AsyncStorage.getItem(KEYS.QUICK_ADD_DRINKS);
  return val ? JSON.parse(val) : null;
}

export async function saveQuickAddDrinks(drinks: any[]): Promise<void> {
  await AsyncStorage.setItem(KEYS.QUICK_ADD_DRINKS, JSON.stringify(drinks));
}
