// v1.1.0 - Streak Tracking
import { useState, useEffect, useCallback } from 'react';
import { format, subDays, parseISO, differenceInCalendarDays } from 'date-fns';
import { getAllLoggedDates } from '@/lib/database';

export function useStreak(trigger?: any) {
  const [streak, setStreak] = useState({ currentStreak: 0, longestStreak: 0 });

  const loadStreak = useCallback(async () => {
    try {
      const loggedDates = await getAllLoggedDates();
      if (loggedDates.length === 0) {
        setStreak({ currentStreak: 0, longestStreak: 0 });
        return;
      }

      const today = format(new Date(), 'yyyy-MM-dd');
      const yesterday = format(subDays(new Date(), 1), 'yyyy-MM-dd');

      // Calculate current streak
      let currentStreak = 0;
      const loggedSet = new Set(loggedDates);
      
      let checkDate = today;
      let checkDateObj = new Date();

      // If today is not logged, check yesterday. 
      // If yesterday is also not logged, current streak is 0.
      if (!loggedSet.has(today) && !loggedSet.has(yesterday)) {
        currentStreak = 0;
      } else {
        // Start from either today or yesterday depending on what's available
        if (!loggedSet.has(today)) {
          checkDate = yesterday;
          checkDateObj = subDays(new Date(), 1);
        }

        while (loggedSet.has(format(checkDateObj, 'yyyy-MM-dd'))) {
          currentStreak++;
          checkDateObj = subDays(checkDateObj, 1);
        }
      }

      // Calculate longest streak
      let longestStreak = 0;
      if (loggedDates.length > 0) {
        // loggedDates is sorted DESC
        let tempLongest = 1;
        let currentLongest = 1;

        for (let i = 0; i < loggedDates.length - 1; i++) {
          const d1 = parseISO(loggedDates[i]);
          const d2 = parseISO(loggedDates[i+1]);
          const diff = differenceInCalendarDays(d1, d2);

          if (diff === 1) {
            currentLongest++;
          } else {
            tempLongest = Math.max(tempLongest, currentLongest);
            currentLongest = 1;
          }
        }
        longestStreak = Math.max(tempLongest, currentLongest);
      }

      setStreak({ currentStreak, longestStreak });
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
