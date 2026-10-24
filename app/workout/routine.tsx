import { useCallback, useRef, useState } from 'react';
import { Alert, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { ReorderableList } from '@/components/dashboard/ReorderableList';
import { ThemedText } from '@/components/themed-text';
import { Button } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/EmptyState';
import { ListGroup } from '@/components/ui/ListGroup';
import { AddExercisesButton } from '@/components/workouts/AddExercisesButton';
import { BuilderInput } from '@/components/workouts/BuilderInput';
import { OptionsSheet } from '@/components/workouts/OptionsSheet';
import { NavIconButton, WorkoutNavBar } from '@/components/workouts/WorkoutNavBar';
import { RestPickerSheet } from '@/components/workouts/RestPickerSheet';
import {
  ROUTINE_EXERCISE_ROW_HEIGHT,
  RoutineExerciseRow,
} from '@/components/workouts/RoutineExerciseRow';
import { Fonts } from '@/constants/theme';
import { useThemeColor } from '@/hooks/use-theme-color';
import { useShadow } from '@/hooks/useShadow';
import { syncToSupabase } from '@/lib/sync';
import type { RoutineWithExercises } from '@/lib/types';
import { exerciseDisplayName } from '@/lib/workouts/exercise-catalog';
import { startRoutineWithFeedback } from '@/lib/workouts/routine-flow';
import { clampSetCount, routineDisplayName } from '@/lib/workouts/routine-plan';
import {
  deleteRoutine,
  getRoutineWithExercises,
  removeRoutineExercise,
  renameRoutine,
  reorderRoutineExercises,
  startDraftFromRoutine,
  updateRoutineExerciseRest,
  updateRoutineExerciseSetCount,
} from '@/lib/workouts/routines';

type Status = 'loading' | 'ready' | 'missing' | 'error';

export default function RoutineScreen() {
  const params = useLocalSearchParams<{ id?: string }>();
  const id = typeof params.id === 'string' && params.id ? params.id : undefined;

  const [status, setStatus] = useState<Status>('loading');
  const [routine, setRoutine] = useState<RoutineWithExercises | null>(null);
  const [nameText, setNameText] = useState<string | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [restTargetId, setRestTargetId] = useState<string | null>(null);
  const [scrollLocked, setScrollLocked] = useState(false);
  const [starting, setStarting] = useState(false);
  const requestRef = useRef(0);

  const background = useThemeColor({}, 'background');
  const muted = useThemeColor({}, 'icon');
  const card = useThemeColor({}, 'cardBackground');
  const separator = useThemeColor({}, 'separator');
  const floating = useShadow('floating');
  const insets = useSafeAreaInsets();

  const reload = useCallback(() => {
    if (!id) {
      setStatus('missing');
      return;
    }
    const req = ++requestRef.current;
    getRoutineWithExercises(id)
      .then((loaded) => {
        if (req !== requestRef.current) return;
        if (!loaded) {
          setRoutine(null);
          setStatus('missing');
          return;
        }
        setRoutine(loaded);
        setStatus('ready');
      })
      .catch(() => {
        if (req !== requestRef.current) return;
        setStatus((s) => (s === 'ready' ? 'ready' : 'error'));
      });
  }, [id]);

  useFocusEffect(reload);

  const commitName = async () => {
    if (!id || !routine || nameText === null) return;
    const normalized = routineDisplayName(nameText);
    setNameText(null);
    if (normalized === routine.name) return;
    setRoutine((prev) => (prev ? { ...prev, name: normalized } : prev));
    try {
      await renameRoutine(id, normalized);
      syncToSupabase();
    } catch {
      reload();
    }
  };

  const confirmDelete = () => {
    Alert.alert('Delete this routine?', 'This can’t be undone.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          if (!id) return;
          try {
            await deleteRoutine(id);
            syncToSupabase();
            router.back();
          } catch {
            Alert.alert('Couldn’t delete the routine.', 'Try again.');
          }
        },
      },
    ]);
  };

  const onReorder = async (orderedIds: string[]) => {
    if (!id || !routine) return;
    const byId = new Map(routine.exercises.map((e) => [e.id, e]));
    const next = orderedIds
      .map((itemId, idx) => {
        const found = byId.get(itemId);
        return found ? { ...found, position: idx } : null;
      })
      .filter((x): x is NonNullable<typeof x> => x !== null);
    setRoutine({ ...routine, exercises: next });
    try {
      await reorderRoutineExercises(id, orderedIds);
      syncToSupabase();
    } catch {
      reload();
    }
  };

  const onChangeSetCount = async (routineExerciseId: string, nextCount: number) => {
    const clamped = clampSetCount(nextCount);
    setRoutine((prev) =>
      prev
        ? {
            ...prev,
            exercises: prev.exercises.map((e) =>
              e.id === routineExerciseId ? { ...e, set_count: clamped } : e
            ),
          }
        : prev
    );
    try {
      await updateRoutineExerciseSetCount(routineExerciseId, clamped);
      syncToSupabase();
    } catch {
      reload();
    }
  };

  const onSelectRest = async (routineExerciseId: string, seconds: number) => {
    setRoutine((prev) =>
      prev
        ? {
            ...prev,
            exercises: prev.exercises.map((e) =>
              e.id === routineExerciseId ? { ...e, rest_seconds: seconds } : e
            ),
          }
        : prev
    );
    try {
      await updateRoutineExerciseRest(routineExerciseId, seconds);
      syncToSupabase();
    } catch {
      reload();
    }
  };

  const confirmRemoveExercise = (routineExerciseId: string) => {
    Alert.alert('Remove this exercise?', undefined, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Remove',
        style: 'destructive',
        onPress: async () => {
          setRoutine((prev) =>
            prev
              ? {
                  ...prev,
                  exercises: prev.exercises.filter((e) => e.id !== routineExerciseId),
                }
              : prev
          );
          try {
            await removeRoutineExercise(routineExerciseId);
            syncToSupabase();
          } catch {
            reload();
          }
        },
      },
    ]);
  };

  const onAddExercises = async () => {
    if (!id) return;
    await commitName();
    router.push({ pathname: '/workout/exercises', params: { pick: '1', routineId: id } });
  };

  const onStartLive = async () => {
    if (!id || !routine || starting) return;
    await commitName();
    if (routine.exercises.length === 0) {
      Alert.alert('Add an exercise first.');
      return;
    }
    setStarting(true);
    try {
      await startRoutineWithFeedback(id);
    } finally {
      setStarting(false);
    }
  };

  const onStartDraft = async () => {
    if (!id || !routine || starting) return;
    await commitName();
    if (routine.exercises.length === 0) {
      Alert.alert('Add an exercise first.');
      return;
    }
    setStarting(true);
    try {
      const result = await startDraftFromRoutine(id, new Date());
      if (result === 'empty') {
        Alert.alert('Add an exercise first.');
        return;
      }
      router.push({ pathname: '/workout/log', params: { id: result.id } });
    } catch {
      Alert.alert('Couldn’t open the workout.', 'Try again.');
    } finally {
      setStarting(false);
    }
  };

  const restTarget = restTargetId
    ? routine?.exercises.find((e) => e.id === restTargetId)
    : undefined;

  let body: React.ReactNode = null;
  let footer: React.ReactNode = null;
  if (status === 'missing' || !id) {
    body = <EmptyState image={false} title="This routine was deleted." style={styles.message} />;
  } else if (status === 'error') {
    body = (
      <EmptyState
        image={false}
        title="Couldn’t load this routine."
        style={styles.message}
        actions={<Button variant="secondary" label="Retry" onPress={reload} />}
      />
    );
  } else if (status === 'ready' && routine) {
    const items = routine.exercises.map((ex) => ({
      ...ex,
      label: ex.exercise ? exerciseDisplayName(ex.exercise) : ex.exercise_name,
    }));

    body = (
      <ScrollView
        scrollEnabled={!scrollLocked}
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        automaticallyAdjustKeyboardInsets
      >
        <View style={styles.nameBlock}>
          <ThemedText type="label" style={{ color: muted }}>Name</ThemedText>
          <BuilderInput
            value={nameText ?? routine.name}
            placeholder="Routine"
            accessibilityLabel="Routine name"
            returnKeyType="done"
            maxFontSizeMultiplier={1.3}
            onChangeText={setNameText}
            onEndEditing={() => {
              void commitName();
            }}
            style={styles.nameInput}
          />
        </View>

        <ThemedText type="section" accessibilityRole="header">Exercises</ThemedText>

        {items.length > 0 ? (
          <ListGroup>
            <ReorderableList
              items={items}
              itemHeight={ROUTINE_EXERCISE_ROW_HEIGHT}
              gap={0}
              iconColor={muted}
              onReorder={(orderedIds) => {
                void onReorder(orderedIds);
              }}
              onDragActiveChange={setScrollLocked}
              renderItem={(item, handle) => (
                <RoutineExerciseRow
                  item={item}
                  dragHandle={handle}
                  last={item.id === items[items.length - 1].id}
                  onChangeSetCount={(n) => {
                    void onChangeSetCount(item.id, n);
                  }}
                  onPressRest={() => setRestTargetId(item.id)}
                  onRemove={() => confirmRemoveExercise(item.id)}
                />
              )}
            />
          </ListGroup>
        ) : null}

        <AddExercisesButton onPress={() => void onAddExercises()} />
      </ScrollView>
    );
    // A footer with stacked full-width actions (StickyFooter lays out a message and one action in a row)
    footer = (
      <View
        style={[
          styles.footer,
          { backgroundColor: card, borderTopColor: separator, boxShadow: floating, paddingBottom: 12 + insets.bottom },
        ]}
      >
        <Button size="lg" label="Start workout" disabled={starting} onPress={() => void onStartLive()} />
        <Button variant="ghost" label="Log past workout" fullWidth disabled={starting} onPress={() => void onStartDraft()} />
      </View>
    );
  }

  return (
    <SafeAreaView edges={['top', 'left', 'right']} style={[styles.container, { backgroundColor: background }]}>
      <WorkoutNavBar
        label="Training"
        title="Routine"
        onBack={() => {
          void commitName().then(() => router.back());
        }}
        trailing={<NavIconButton icon="ellipsis" label="More options" disabled={status !== 'ready'} onPress={() => setMenuOpen(true)} />}
      />

      {body}
      {footer}

      <OptionsSheet
        visible={menuOpen}
        onClose={() => setMenuOpen(false)}
        options={[{ key: 'delete', label: 'Delete routine', onPress: confirmDelete }]}
      />

      <RestPickerSheet
        visible={!!restTarget}
        current={restTarget?.rest_seconds}
        onClose={() => setRestTargetId(null)}
        onSelect={(sec) => {
          if (restTarget) void onSelectRest(restTarget.id, sec);
        }}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  message: { padding: 16 },
  content: { padding: 16, gap: 12, paddingBottom: 24 },
  nameBlock: { gap: 6 },
  nameInput: {
    height: 56,
    minHeight: 56,
    borderRadius: 12,
    paddingHorizontal: 14,
    fontFamily: Fonts.rounded,
    fontSize: 24,
    fontWeight: '800',
  },
  footer: { paddingTop: 12, paddingHorizontal: 16, gap: 8, borderTopWidth: StyleSheet.hairlineWidth },
});
