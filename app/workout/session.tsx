import { ControlSurface } from '@/components/navigation/ControlSurface';
import { useCallback, useEffect, useRef, useState } from 'react';
import { BackHandler, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { router, useFocusEffect } from 'expo-router';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { RestBanner } from '@/components/workouts/RestBanner';
import { WorkoutEditorBody } from '@/components/workouts/WorkoutEditor';
import { useThemeColor } from '@/hooks/use-theme-color';
import { useActiveWorkout } from '@/hooks/useActiveWorkout';
import { useNow } from '@/hooks/useNow';
import { useWorkoutEditor, type ToggleResult } from '@/hooks/useWorkoutEditor';
import { elapsedSeconds } from '@/components/workouts/ActiveWorkoutBar';
import { formatDuration } from '@/lib/units';
import { refreshActiveWorkout } from '@/lib/workouts/active-workout-store';
import { confirmAndDiscard, confirmAndFinish, type FlowResult } from '@/lib/workouts/finish-flow';
import { workoutDisplayName } from '@/lib/workouts/format';
import { DEFAULT_REST_SECONDS } from '@/lib/workouts/prefill';
import { startRestTimer, stopRestTimerForSet } from '@/lib/workouts/rest-timer-store';
import { startEmptyWorkout } from '@/lib/workouts/session';

/**
 * The live session. Opens the active workout, or starts an empty one when none is active. The
 * chevron (and the Android back button) minimizes it to the session bar; Finish and Discard end it.
 */
export default function SessionScreen() {
  const { workout: active, loaded } = useActiveWorkout();
  const [startFailed, setStartFailed] = useState(false);
  const [busy, setBusy] = useState(false);
  const startingRef = useRef(false);
  const hadWorkoutRef = useRef(false);
  const leavingRef = useRef(false);

  const id = active?.id;
  const editor = useWorkoutEditor(id, 'live');
  const flushRef = useRef(editor.flush);
  useEffect(() => {
    flushRef.current = editor.flush;
  });
  const now = useNow(1000, !!active);
  // Explicit insets: SafeAreaView can report zero inside a native fullScreenModal,
  // which put the header (and Finish) under the status bar and Dynamic Island.
  const insets = useSafeAreaInsets();

  const background = useThemeColor({}, 'background');
  const text = useThemeColor({}, 'text');
  const muted = useThemeColor({}, 'icon');
  const tint = useThemeColor({}, 'tint');
  const onTint = useThemeColor({}, 'background');
  const separator = useThemeColor({}, 'separator');
  const fieldBorder = useThemeColor({}, 'fieldBorder');

  const close = useCallback(() => {
    if (router.canGoBack()) router.back();
  }, []);

  const start = useCallback(() => {
    if (startingRef.current) return;
    startingRef.current = true;
    setStartFailed(false);
    startEmptyWorkout(new Date())
      .catch(() => setStartFailed(true))
      .finally(() => {
        startingRef.current = false;
      });
  }, []);

  useEffect(() => {
    if (!loaded) {
      void refreshActiveWorkout();
      return;
    }
    if (active) {
      hadWorkoutRef.current = true;
      return;
    }
    // The session ended elsewhere (stale prompt discard or finish): close instead of starting a new one.
    if (hadWorkoutRef.current) {
      if (!leavingRef.current) close();
      return;
    }
    start();
  }, [loaded, active, start, close]);

  // Minimize: finish pending writes first so nothing typed is lost.
  const minimize = useCallback(async () => {
    try {
      await flushRef.current();
    } catch {
      // The editor reloads from SQLite on a failed write.
    }
    close();
  }, [close]);

  // Android back minimizes the session.
  useFocusEffect(
    useCallback(() => {
      const sub = BackHandler.addEventListener('hardwareBackPress', () => {
        void minimize();
        return true;
      });
      return () => sub.remove();
    }, [minimize])
  );

  // leavingRef is set before the flow starts so the "ended elsewhere" effect never navigates too.
  const runEnd = async (flow: () => Promise<FlowResult>) => {
    if (!id || busy) return;
    setBusy(true);
    leavingRef.current = true;
    try {
      await editor.flush();
      const result = await flow();
      if (result === 'finished') {
        router.replace({ pathname: '/workout/[id]', params: { id } });
        return;
      }
      if (result === 'discarded' || result === 'gone') {
        close();
        return;
      }
    } catch {
      // The workout stays active; the user can try again.
    }
    leavingRef.current = false;
    setBusy(false);
  };

  const onFinish = () => runEnd(() => confirmAndFinish(id as string));
  const onDiscard = () => runEnd(() => confirmAndDiscard(id as string));

  const onAddExercises = async () => {
    if (!id) return;
    await editor.flush();
    router.push({ pathname: '/workout/exercises', params: { pick: '1', workoutId: id } });
  };

  // Ticking starts the exercise's rest (warmups too; unset = 90 s, 0 = off); unticking cancels it.
  const onToggled = (result: ToggleResult) => {
    if (!id) return;
    if (!result.ticked) {
      void stopRestTimerForSet(id, result.setId);
      return;
    }
    startRestTimer({
      workoutId: id,
      durationSeconds: result.restSeconds ?? DEFAULT_REST_SECONDS,
      workoutExerciseId: result.workoutExerciseId,
      setId: result.setId,
      exerciseName: result.exerciseName,
    });
  };

  const shown = editor.workout ?? active;
  const title = shown ? workoutDisplayName(shown) : 'Workout';
  const elapsed = formatDuration(elapsedSeconds(shown?.started_at ?? null, now));

  let body: React.ReactNode = null;
  if (startFailed || editor.status === 'error' || editor.status === 'missing') {
    body = (
      <View style={styles.message}>
        <Text style={[styles.messageText, { color: muted }]}>Couldn’t open the workout.</Text>
        <Pressable
          onPress={() => {
            if (startFailed) start();
            else if (editor.status === 'missing') void refreshActiveWorkout();
            else void editor.reload();
          }}
          accessibilityRole="button"
          style={[styles.retry, { borderColor: fieldBorder }]}
        >
          <Text style={[styles.retryText, { color: tint }]}>Retry</Text>
        </Pressable>
      </View>
    );
  } else if (editor.status === 'ready' && editor.workout) {
    body = (
      <WorkoutEditorBody
        editor={editor}
        mode="live"
        showMeta={false}
        onToggled={onToggled}
        onAddExercises={onAddExercises}
        footer={
          <Pressable
            onPress={onDiscard}
            disabled={busy}
            accessibilityRole="button"
            accessibilityLabel="Discard workout"
            accessibilityState={{ disabled: busy }}
            style={styles.discard}
          >
            <Text style={[styles.discardText, { color: muted }]}>Discard workout</Text>
          </Pressable>
        }
      />
    );
  }

  return (
    <View
      style={[
        styles.container,
        {
          backgroundColor: background,
          paddingTop: insets.top,
          paddingBottom: insets.bottom,
          paddingLeft: insets.left,
          paddingRight: insets.right,
        },
      ]}
    >
      <ControlSurface style={[styles.header, { borderBottomColor: separator }]}>
        <Pressable
          onPress={() => void minimize()}
          accessibilityRole="button"
          accessibilityLabel="Minimize workout"
          style={styles.iconButton}
        >
          <IconSymbol name="chevron.down" size={26} color={text} />
        </Pressable>
        <View style={styles.titles}>
          <Text style={[styles.title, { color: text }]} numberOfLines={1} accessibilityRole="header">
            {title}
          </Text>
          <Text style={[styles.elapsed, { color: muted }]}>{elapsed} elapsed</Text>
        </View>
        <Pressable
          onPress={onFinish}
          disabled={!id || busy || editor.status !== 'ready'}
          accessibilityRole="button"
          accessibilityLabel="Finish workout"
          accessibilityState={{ disabled: !id || busy || editor.status !== 'ready' }}
          style={[
            styles.finish,
            { backgroundColor: tint },
            (!id || busy || editor.status !== 'ready') && { opacity: 0.5 },
          ]}
        >
          <Text style={[styles.finishText, { color: onTint }]}>Finish</Text>
        </Pressable>
      </ControlSurface>
      <RestBanner />
      {body}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingLeft: 4,
    paddingRight: 12,
    paddingVertical: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  iconButton: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  titles: { flex: 1, minWidth: 0 },
  title: { fontSize: 17, fontWeight: '600' },
  elapsed: { fontSize: 13, fontWeight: '500', fontVariant: ['tabular-nums'] },
  finish: {
    minHeight: 44,
    paddingHorizontal: 16,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  finishText: { fontSize: 15, fontWeight: '600' },
  discard: { minHeight: 44, alignItems: 'center', justifyContent: 'center' },
  discardText: { fontSize: 15, fontWeight: '500' },
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
});
