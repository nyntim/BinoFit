import { useCallback, useMemo, useState } from 'react';
import { Alert } from 'react-native';
import {
  deleteFoodLog,
  upsertMealSlotConfirmation,
  deleteMealSlotConfirmation,
} from '@/lib/database';
import { isSlotEaten, sumEatenTotals, logsForSlot } from '@/lib/nutrition-totals';
import type { FoodLogWithFood, MealSlot, MealSlotConfirmation } from '@/lib/types';

/**
 * Meal-related dashboard state for one date. The owning screen loads the data
 * (alongside its other fetches) and pushes it in via setLogs / setConfirmations.
 */
export function useMealLogs(selectedDate: string) {
  const [logs, setLogs] = useState<FoodLogWithFood[]>([]);
  const [confirmations, setConfirmations] = useState<MealSlotConfirmation[]>([]);

  const isSlotConfirmed = useCallback(
    // If no confirmation record exists, treat as confirmed (Eaten) by default.
    (slot: MealSlot) => isSlotEaten(confirmations, slot),
    [confirmations]
  );

  const consumed = useMemo(() => sumEatenTotals(logs, confirmations), [logs, confirmations]);

  const handleToggleSlot = async (slot: MealSlot) => {
    const currentStatus = isSlotConfirmed(slot);
    const newStatus = !currentStatus;

    // Optimistic UI update
    const tempConfirmations = [...confirmations];
    const index = tempConfirmations.findIndex((c) => c.meal_slot === slot);
    if (index > -1) {
      tempConfirmations[index] = { ...tempConfirmations[index], confirmed: newStatus };
    } else {
      tempConfirmations.push({
        id: 'temp',
        date: selectedDate,
        meal_slot: slot,
        confirmed: newStatus,
        updated_at: new Date().toISOString(),
      });
    }
    setConfirmations(tempConfirmations);

    try {
      await upsertMealSlotConfirmation(selectedDate, slot, newStatus);
    } catch (error) {
      console.error('Failed to update confirmation:', error);
      Alert.alert('Error', 'Failed to save confirmation. Please try again.');
      // Revert optimistic update
      setConfirmations(confirmations);
    }
  };

  /** Asks for confirmation, deletes the log, then calls onDeleted (e.g. to reload). */
  const handleDeleteLog = (log: FoodLogWithFood, onDeleted: () => void) => {
    Alert.alert('Remove Food', `Remove ${log.food_name}?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Remove',
        style: 'destructive',
        onPress: async () => {
          await deleteFoodLog(log.id);
          const remainingLogsInSlot = logsForSlot(logs, log.meal_slot).filter(
            (l) => l.id !== log.id
          );
          if (remainingLogsInSlot.length === 0) {
            await deleteMealSlotConfirmation(selectedDate, log.meal_slot);
          }
          onDeleted();
        },
      },
    ]);
  };

  return {
    logs,
    setLogs,
    confirmations,
    setConfirmations,
    isSlotConfirmed,
    consumed,
    handleToggleSlot,
    handleDeleteLog,
  };
}
