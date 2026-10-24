import { MealSlotCard } from '@/components/dashboard/MealSlotCard';
import { logsForSlot } from '@/lib/nutrition-totals';
import type { DayMeal } from '@/lib/meals';
import type { FoodLogWithFood, MealSlot, MealSlotConfirmation } from '@/lib/types';

type Props = {
  meals: DayMeal[];
  logs: FoodLogWithFood[];
  confirmations: Pick<MealSlotConfirmation, 'meal_slot' | 'confirmed'>[];
  /** Undefined until this date's data has loaded, which disables the nutrition summary. */
  onShowNutrition?: (slot: MealSlot, focusTarget?: number | null) => void;
  onToggle: (slot: MealSlot) => void;
  onAdd: (slot: MealSlot) => void;
  onEditLog: (log: FoodLogWithFood) => void;
  onDeleteLog: (log: FoodLogWithFood) => void;
};

/** The day's meals as view-mode cards. */
export function MealCardList({ meals, logs, confirmations, onShowNutrition, onToggle, onAdd, onEditLog, onDeleteLog }: Props) {
  return (
    <>
      {meals.map(({ id, name, def, orphan }) => {
        const slotLogs = logsForSlot(logs, id);
        const showToggle = slotLogs.length > 0;

        // We need to know if it's explicitly UNCONFIRMED (0) to show the "Planned" state,
        // otherwise (if it's confirmed or doesn't exist), we show "Eaten".
        const isExplicitlyPlanned = confirmations.find((c) => c.meal_slot === id)?.confirmed === false;
        const displayConfirmed = !isExplicitlyPlanned;

        return (
          <MealSlotCard
            key={id}
            slot={id}
            label={name}
            logs={slotLogs}
            targets={def}
            eaten={displayConfirmed}
            showToggle={showToggle}
            allowAdd={!orphan}
            onShowNutrition={onShowNutrition}
            onToggle={onToggle}
            onAdd={onAdd}
            onEditLog={onEditLog}
            onDeleteLog={onDeleteLog}
          />
        );
      })}
    </>
  );
}
