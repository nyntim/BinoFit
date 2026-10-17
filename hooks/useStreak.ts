import { useState, useEffect, useCallback } from 'react';
import { format } from 'date-fns';
import { getAllLoggedDates } from '@/lib/database';
import { computeStreaks } from '@/lib/streak';

export function useStreak(trigger?: any) {
  const [streak, setStreak] = useState({ currentStreak: 0, longestStreak: 0 });

  const loadStreak = useCallback(async () => {
    try {
      const today = format(new Date(), 'yyyy-MM-dd');
      setStreak(computeStreaks(await getAllLoggedDates(today), today));
    } catch (error) {
      console.error('Failed to calculate streak:', error);
      setStreak({ currentStreak: 0, longestStreak: 0 });
    }
  }, []);

  useEffect(() => {
    loadStreak();
  }, [loadStreak, trigger]);

  return streak;
}
