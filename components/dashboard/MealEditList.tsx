import { StyleSheet } from 'react-native';
import { MealSlotCard, useEditCardHeight } from '@/components/dashboard/MealSlotCard';
import { ReorderableList } from '@/components/dashboard/ReorderableList';
import { ThemedText } from '@/components/themed-text';
import { Button } from '@/components/ui/Button';
import { useThemeColor } from '@/hooks/use-theme-color';
import { MEAL_LIMITS, type DraftMeal } from '@/lib/meals';
import type { FoodLogWithFood, MealId, MealTargets } from '@/lib/types';

type Props = {
  meals: DraftMeal[];
  logs: FoodLogWithFood[];
  errors: Record<string, string | null | undefined>;
  onReorder: (orderedIds: string[]) => void;
  onDragActiveChange: (active: boolean) => void;
  onRename: (id: MealId, name: string) => void;
  onChangeSettings: (id: MealId, targets: MealTargets, reminderTime: string | null) => void;
  onDelete: (id: MealId, name: string) => void;
  onAdd: () => void;
};

/** Edit-mode meal list: drag to reorder, rename, delete, and add below the limit. */
export function MealEditList({ meals, logs, errors, onReorder, onDragActiveChange, onRename, onChangeSettings, onDelete, onAdd }: Props) {
  const icon = useThemeColor({}, 'icon');
  const cardHeight = useEditCardHeight();
  const items = meals.map((m) => ({ ...m, label: m.name }));
  return (
    <>
      <ThemedText type="label">Deleting a meal deletes its logged food.</ThemedText>
      <ReorderableList
        items={items}
        itemHeight={cardHeight}
        gap={14}
        iconColor={icon}
        onReorder={onReorder}
        onDragActiveChange={onDragActiveChange}
        renderItem={(m, handle) => (
          <MealSlotCard
            mode="edit"
            slot={m.id}
            index={items.findIndex((e) => e.id === m.id)}
            label={m.name}
            logs={logs}
            targets={m}
            nameError={errors[m.id] ?? null}
            canDelete={meals.length > MEAL_LIMITS.min}
            dragHandle={handle}
            onChangeName={(name) => onRename(m.id, name)}
            onChangeSettings={(t, r) => onChangeSettings(m.id, t, r)}
            onDelete={() => onDelete(m.id, m.name)}
          />
        )}
      />
      {meals.length < MEAL_LIMITS.max && (
        <Button
          label="Add meal"
          variant="secondary"
          size="lg"
          onPress={onAdd}
          style={styles.add}
        />
      )}
    </>
  );
}

const styles = StyleSheet.create({
  add: { borderStyle: 'dashed' },
});
