import { useCallback, useRef, useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { ReorderableList } from '@/components/dashboard/ReorderableList';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { AddExercisesButton } from '@/components/workouts/AddExercisesButton';
import { BuilderInput } from '@/components/workouts/BuilderInput';
import { OptionsSheet } from '@/components/workouts/OptionsSheet';
import { RestPickerSheet } from '@/components/workouts/RestPickerSheet';
import {
  ROUTINE_EXERCISE_ROW_HEIGHT,
  RoutineExerciseRow,
} from '@/components/workouts/RoutineExerciseRow';
import { useThemeColor } from '@/hooks/use-theme-color';
import { syncToSupabase } from '@/lib/sync';
import type { RoutineWithExercises } from '@/lib/types';
import { exerciseDisplayName } from '@/lib/workouts/exercise-catalog';
import { clampSetCount, routineDisplayName } from '@/lib/workouts/routine-plan';
import {
  deleteRoutine,
  getRoutineWithExercises,
  removeRoutineExercise,
  renameRoutine,
  reorderRoutineExercises,
  startDraftFromRoutine,
  startLiveFromRoutine,
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
  const text = useThemeColor({}, 'text');
  const muted = useThemeColor({}, 'icon');
  const tint = useThemeColor({}, 'tint');
  const card = useThemeColor({}, 'cardBackground');
  const separator = useThemeColor({}, 'separator');
  const fieldBorder = useThemeColor({}, 'fieldBorder');

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
      const result = await startLiveFromRoutine(id, new Date());
      if (result === 'empty') {
        Alert.alert('Add an exercise first.');
        return;
      }
      if (result === 'active') {
        Alert.alert('A workout is already in progress.', undefined, [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Resume', onPress: () => router.push('/workout/session') },
        ]);
        return;
      }
      router.push('/workout/session');
    } catch {
      Alert.alert('Couldn’t start the workout.', 'Try again.');
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
  if (status === 'missing' || !id) {
    body = (
      <View style={styles.message}>
        <Text style={[styles.messageText, { color: muted }]}>This routine was deleted.</Text>
      </View>
    );
  } else if (status === 'error') {
    body = (
      <View style={styles.message}>
        <Text style={[styles.messageText, { color: muted }]}>Couldn’t load this routine.</Text>
        <Pressable
          onPress={reload}
          accessibilityRole="button"
          style={[styles.retry, { borderColor: fieldBorder }]}
        >
          <Text style={[styles.retryText, { color: tint }]}>Retry</Text>
        </Pressable>
      </View>
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
        <View style={[styles.metaCard, { backgroundColor: card }]}>
          <Text style={[styles.fieldLabel, { color: muted }]}>Name</Text>
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

        {items.length > 0 ? (
          <ReorderableList
            items={items}
            itemHeight={ROUTINE_EXERCISE_ROW_HEIGHT}
            gap={12}
            iconColor={muted}
            onReorder={(orderedIds) => {
              void onReorder(orderedIds);
            }}
            onDragActiveChange={setScrollLocked}
            renderItem={(item, handle) => (
              <RoutineExerciseRow
                item={item}
                dragHandle={handle}
                onChangeSetCount={(n) => {
                  void onChangeSetCount(item.id, n);
                }}
                onPressRest={() => setRestTargetId(item.id)}
                onRemove={() => confirmRemoveExercise(item.id)}
              />
            )}
          />
        ) : null}

        <AddExercisesButton onPress={() => void onAddExercises()} />

        <View style={styles.footer}>
          <Pressable
            onPress={() => void onStartLive()}
            disabled={starting}
            accessibilityRole="button"
            accessibilityLabel="Start workout"
            style={({ pressed }) => [
              styles.primary,
              { backgroundColor: tint },
              pressed && styles.pressed,
            ]}
          >
            <Text style={[styles.primaryLabel, { color: background }]}>Start workout</Text>
          </Pressable>

          <Pressable
            onPress={() => void onStartDraft()}
            disabled={starting}
            accessibilityRole="button"
            accessibilityLabel="Log past workout"
            style={({ pressed }) => [styles.textButton, pressed && styles.pressed]}
          >
            <Text style={[styles.textButtonLabel, { color: tint }]}>Log past workout</Text>
          </Pressable>
        </View>
      </ScrollView>
    );
  }

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: background }]}>
      <View style={[styles.header, { borderBottomColor: separator }]}>
        <Pressable
          onPress={() => {
            void commitName().then(() => router.back());
          }}
          accessibilityRole="button"
          accessibilityLabel="Back"
          style={styles.iconButton}
        >
          <IconSymbol name="chevron.left" size={22} color={tint} />
        </Pressable>
        <Text style={[styles.title, { color: text }]} accessibilityRole="header">
          Routine
        </Text>
        <Pressable
          onPress={() => setMenuOpen(true)}
          disabled={status !== 'ready'}
          accessibilityRole="button"
          accessibilityLabel="More options"
          style={[styles.iconButton, status !== 'ready' && { opacity: 0.5 }]}
        >
          <IconSymbol name="ellipsis" size={22} color={tint} />
        </Pressable>
      </View>

      {body}

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
  pressed: { opacity: 0.85 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 4,
    paddingVertical: 4,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  iconButton: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  title: { flex: 1, textAlign: 'center', fontSize: 17, fontWeight: '600' },
  message: { padding: 16, gap: 16 },
  messageText: { fontSize: 15 },
  retry: {
    alignSelf: 'flex-start',
    minHeight: 44,
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 20,
    justifyContent: 'center',
  },
  retryText: { fontSize: 17, fontWeight: '600' },
  content: { padding: 16, gap: 12, paddingBottom: 40 },
  metaCard: { borderRadius: 18, padding: 16, gap: 4 },
  fieldLabel: { fontSize: 13, fontWeight: '500' },
  nameInput: {
    height: 44,
    minHeight: 44,
    borderRadius: 8,
    paddingHorizontal: 12,
    fontSize: 15,
  },
  footer: { marginTop: 8, gap: 8, alignItems: 'center' },
  primary: {
    alignSelf: 'stretch',
    minHeight: 50,
    borderRadius: 18,
    paddingVertical: 14,
    paddingHorizontal: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryLabel: { fontSize: 17, fontWeight: '600' },
  textButton: {
    minHeight: 44,
    paddingHorizontal: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  textButtonLabel: { fontSize: 15, fontWeight: '600' },
});
