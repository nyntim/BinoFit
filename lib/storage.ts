import AsyncStorage from '@react-native-async-storage/async-storage';
import type { UserGoals, UserProfile } from '@/lib/types';

const KEYS = {
  USER_GOALS: 'user_goals',
  USER_PROFILE: 'user_profile',
  ONBOARDING_COMPLETE: 'onboarding_complete',
  REQUIRE_MEAL_CONFIRMATION: 'require_meal_confirmation',
} as const;

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

export async function getUserGoals(): Promise<UserGoals | null> {
  const val = await AsyncStorage.getItem(KEYS.USER_GOALS);
  return val ? (JSON.parse(val) as UserGoals) : null;
}

export async function saveUserGoals(goals: Omit<UserGoals, 'updated_at'>): Promise<void> {
  const data: UserGoals = { ...goals, updated_at: new Date().toISOString() };
  await AsyncStorage.setItem(KEYS.USER_GOALS, JSON.stringify(data));
}

export async function getUserProfile(): Promise<UserProfile | null> {
  const val = await AsyncStorage.getItem(KEYS.USER_PROFILE);
  return val ? (JSON.parse(val) as UserProfile) : null;
}

export async function saveUserProfile(profile: Omit<UserProfile, 'updated_at'>): Promise<void> {
  const data: UserProfile = { ...profile, updated_at: new Date().toISOString() };
  await AsyncStorage.setItem(KEYS.USER_PROFILE, JSON.stringify(data));
}

export async function getRequireMealConfirmation(): Promise<boolean> {
  const val = await AsyncStorage.getItem(KEYS.REQUIRE_MEAL_CONFIRMATION);
  if (val === null) return true;
  return val === 'true';
}

export async function setRequireMealConfirmation(value: boolean): Promise<void> {
  await AsyncStorage.setItem(KEYS.REQUIRE_MEAL_CONFIRMATION, String(value));
}
