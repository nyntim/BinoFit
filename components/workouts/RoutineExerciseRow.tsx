import type { ReactNode } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { ThemedText } from '@/components/themed-text';
import { Button } from '@/components/ui/Button';
import { Stepper } from '@/components/ui/Stepper';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { useThemeColor } from '@/hooks/use-theme-color';
import type { RoutineExerciseWithExercise } from '@/lib/types';
import { restChoiceLabel } from '@/lib/workouts/rest-timer';
import { exerciseDisplayName } from '@/lib/workouts/exercise-catalog';
import {
  DEFAULT_REST_SECONDS,
  MAX_DEFAULT_SET_COUNT,
  MIN_DEFAULT_SET_COUNT,
} from '@/lib/workouts/prefill';

/** Fixed height of a routine exercise row so ReorderableList can drag rows by index. */
export const ROUTINE_EXERCISE_ROW_HEIGHT = 108;

type Props = {
  item: RoutineExerciseWithExercise;
  dragHandle: ReactNode;
  onChangeSetCount: (setCount: number) => void;
  onPressRest: () => void;
  onRemove: () => void;
  /** Omits the bottom separator. */
  last?: boolean;
};

/** One exercise of a routine: handle, name and remove, then the set stepper and the rest button. */
export function RoutineExerciseRow({
  item,
  dragHandle,
  onChangeSetCount,
  onPressRest,
  onRemove,
  last = false,
}: Props) {
  const muted = useThemeColor({}, 'icon');
  const separator = useThemeColor({}, 'separator');
  const card = useThemeColor({}, 'cardBackground');

  const title = item.exercise ? exerciseDisplayName(item.exercise) : item.exercise_name;
  const setCount = item.set_count;
  const restValue = restChoiceLabel(item.rest_seconds ?? DEFAULT_REST_SECONDS);

  return (
    <View style={[styles.row, { backgroundColor: card }, !last && { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: separator }]}>
      <View style={styles.topRow}>
        {dragHandle}
        <ThemedText type="body" style={styles.title} numberOfLines={1}>{title}</ThemedText>
        <Pressable
          onPress={onRemove}
          accessibilityRole="button"
          accessibilityLabel={`Remove ${title}`}
          style={({ pressed }) => [styles.remove, pressed && styles.pressed]}
        >
          <IconSymbol name="minus.circle.fill" size={22} color={muted} />
        </Pressable>
      </View>
      <View style={styles.bottomRow}>
        <Stepper
          value={setCount}
          valueLabel={`Sets, ${setCount}`}
          decrementLabel="Fewer sets"
          incrementLabel="More sets"
          decrementDisabled={setCount <= MIN_DEFAULT_SET_COUNT}
          incrementDisabled={setCount >= MAX_DEFAULT_SET_COUNT}
          onDecrement={() => onChangeSetCount(setCount - 1)}
          onIncrement={() => onChangeSetCount(setCount + 1)}
        />
        <ThemedText type="caption" accessible={false}>{setCount === 1 ? 'set' : 'sets'}</ThemedText>
        <View style={styles.spacer} />
        <Button
          variant="soft"
          size="sm"
          icon="clock"
          label={restValue}
          accessibilityLabel={`Rest for ${title}, ${restValue}`}
          onPress={onPressRest}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { height: ROUTINE_EXERCISE_ROW_HEIGHT, paddingLeft: 4, paddingRight: 8, paddingVertical: 4, justifyContent: 'space-between' },
  pressed: { opacity: 0.7 },
  topRow: { flexDirection: 'row', alignItems: 'center', gap: 4, minHeight: 44 },
  title: { flex: 1, fontWeight: '600' },
  remove: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  bottomRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingLeft: 36, minHeight: 48 },
  spacer: { flex: 1 },
});
