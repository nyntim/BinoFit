import type { ReactNode } from 'react';
import { Pressable, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useThemeColor } from '@/hooks/use-theme-color';
import type { RoutineExerciseWithExercise } from '@/lib/types';
import { formatDuration } from '@/lib/units';
import { exerciseDisplayName } from '@/lib/workouts/exercise-catalog';
import {
  DEFAULT_REST_SECONDS,
  MAX_DEFAULT_SET_COUNT,
  MIN_DEFAULT_SET_COUNT,
} from '@/lib/workouts/prefill';

/** Fixed height of a routine exercise card so ReorderableList can drag rows by index. */
export const ROUTINE_EXERCISE_ROW_HEIGHT = 112;

type Props = {
  item: RoutineExerciseWithExercise;
  dragHandle: ReactNode;
  onChangeSetCount: (setCount: number) => void;
  onPressRest: () => void;
  onRemove: () => void;
};

export function RoutineExerciseRow({
  item,
  dragHandle,
  onChangeSetCount,
  onPressRest,
  onRemove,
}: Props) {
  const text = useThemeColor({}, 'text');
  const muted = useThemeColor({}, 'icon');
  const card = useThemeColor({}, 'cardBackground');
  const subtle = useThemeColor({}, 'cardSecondary');
  const tint = useThemeColor({}, 'tint');
  const separator = useThemeColor({}, 'separator');

  const title = item.exercise ? exerciseDisplayName(item.exercise) : item.exercise_name;
  const setCount = item.set_count;
  const restSeconds = item.rest_seconds ?? DEFAULT_REST_SECONDS;
  const restValue = restSeconds === 0 ? 'Off' : formatDuration(restSeconds);
  const canDecrement = setCount > MIN_DEFAULT_SET_COUNT;
  const canIncrement = setCount < MAX_DEFAULT_SET_COUNT;

  return (
    <View style={[styles.card, { backgroundColor: card }]}>
      <View style={styles.topRow}>
        {dragHandle}
        <Text style={[styles.title, { color: text }]} numberOfLines={1}>
          {title}
        </Text>
        <View style={[styles.stepper, { backgroundColor: subtle }]}>
          <TouchableOpacity
            style={styles.stepperButton}
            onPress={() => {
              if (canDecrement) onChangeSetCount(setCount - 1);
            }}
            disabled={!canDecrement}
            activeOpacity={0.7}
            accessibilityRole="button"
            accessibilityLabel="Fewer sets"
            accessibilityState={{ disabled: !canDecrement }}
          >
            <Text style={[styles.stepperSymbol, { color: muted }]}>−</Text>
          </TouchableOpacity>
          <Text
            style={[styles.stepperValue, { color: text }]}
            accessibilityLabel={`Sets, ${setCount}`}
          >
            {setCount}
          </Text>
          <TouchableOpacity
            style={styles.stepperButton}
            onPress={() => {
              if (canIncrement) onChangeSetCount(setCount + 1);
            }}
            disabled={!canIncrement}
            activeOpacity={0.7}
            accessibilityRole="button"
            accessibilityLabel="More sets"
            accessibilityState={{ disabled: !canIncrement }}
          >
            <Text style={[styles.stepperSymbol, { color: muted }]}>+</Text>
          </TouchableOpacity>
        </View>
      </View>

      <View
        style={[
          styles.bottomRow,
          { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: separator },
        ]}
      >
        <Pressable
          onPress={onPressRest}
          accessibilityRole="button"
          accessibilityLabel={`Rest, ${restValue}`}
          style={({ pressed }) => [styles.restButton, pressed && styles.pressed]}
        >
          <Text style={[styles.metaLabel, { color: muted }]}>Rest</Text>
          <Text style={[styles.restValue, { color: tint }]}>{restValue}</Text>
        </Pressable>

        <Pressable
          onPress={onRemove}
          accessibilityRole="button"
          accessibilityLabel="Remove"
          style={({ pressed }) => [styles.removeButton, pressed && styles.pressed]}
        >
          <Text style={[styles.removeText, { color: tint }]}>Remove</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    height: ROUTINE_EXERCISE_ROW_HEIGHT,
    borderRadius: 18,
    paddingHorizontal: 12,
    paddingVertical: 6,
    justifyContent: 'space-between',
  },
  pressed: { opacity: 0.85 },
  topRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    minHeight: 50,
  },
  title: {
    flex: 1,
    fontSize: 17,
    fontWeight: '600',
  },
  stepper: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 20,
    padding: 3,
  },
  stepperButton: {
    minHeight: 44,
    minWidth: 44,
    borderRadius: 17,
    justifyContent: 'center',
    alignItems: 'center',
  },
  stepperSymbol: { fontSize: 20, fontWeight: '600', lineHeight: 22 },
  stepperValue: {
    fontSize: 16,
    fontWeight: '600',
    minWidth: 28,
    textAlign: 'center',
    fontVariant: ['tabular-nums'],
  },
  bottomRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingLeft: 8,
    paddingRight: 4,
    minHeight: 44,
  },
  restButton: {
    minHeight: 44,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  metaLabel: { fontSize: 13, fontWeight: '500' },
  restValue: { fontSize: 13, fontWeight: '500', fontVariant: ['tabular-nums'] },
  removeButton: {
    minHeight: 44,
    paddingHorizontal: 8,
    justifyContent: 'center',
    alignItems: 'center',
  },
  removeText: { fontSize: 13, fontWeight: '500' },
});
