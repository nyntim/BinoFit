import { Platform } from 'react-native';
import AppleHealthKit from 'react-native-health';

const HK = (AppleHealthKit as any)?.default || AppleHealthKit;

let cachedActivity = { steps: 0, activeCalories: 0 };
let lastFetchTime = 0;
const CACHE_DURATION = 15 * 60 * 1000;

export async function fetchTodayActivityFromHealthKit(
  available: boolean,
  force = false
): Promise<{ steps: number; activeCalories: number }> {
  if (Platform.OS !== 'ios' || !available) return { steps: 0, activeCalories: 0 };

  const now = Date.now();
  if (!force && now - lastFetchTime < CACHE_DURATION) {
    return cachedActivity;
  }

  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);
  const options = { startDate: todayStart.toISOString() };

  const getSteps = (): Promise<number> =>
    new Promise((resolve) => {
      if (typeof HK.getStepCount !== 'function') {
        resolve(0);
        return;
      }
      HK.getStepCount(options, (err: unknown, results: { value?: number }) => {
        if (err || !results) resolve(0);
        else resolve(results.value ?? 0);
      });
    });

  const getActiveCalories = (): Promise<number> =>
    new Promise((resolve) => {
      if (typeof HK.getActiveEnergyBurned !== 'function') {
        resolve(0);
        return;
      }
      HK.getActiveEnergyBurned(options, (err: unknown, results: { value?: number }[]) => {
        if (err || !results || results.length === 0) resolve(0);
        else resolve(results.reduce((acc, cur) => acc + (cur.value || 0), 0));
      });
    });

  try {
    const [steps, activeCalories] = await Promise.all([getSteps(), getActiveCalories()]);
    cachedActivity = { steps, activeCalories };
    lastFetchTime = Date.now();
    return cachedActivity;
  } catch {
    return { steps: 0, activeCalories: 0 };
  }
}
