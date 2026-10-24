import { useCallback, useEffect, useRef, useState } from 'react';
import { BackHandler, Keyboard, Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { router, useFocusEffect } from 'expo-router';
import { ThemedText } from '@/components/themed-text';
import { Button } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/EmptyState';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { NowPlayingLine } from '@/components/workouts/NowPlayingLine';
import { useSpotifyNowPlaying } from '@/hooks/useSpotifyNowPlaying';
import { useKeyboardHeight } from '@/hooks/useKeyboardHeight';
import { RestBanner } from '@/components/workouts/RestBanner';
import { WorkoutEditorBody } from '@/components/workouts/WorkoutEditor';
import { useThemeColor } from '@/hooks/use-theme-color';
import { useActiveWorkout } from '@/hooks/useActiveWorkout';
import { useNow } from '@/hooks/useNow';
import { useWorkoutEditor, type ToggleResult } from '@/hooks/useWorkoutEditor';
import { elapsedSeconds } from '@/components/workouts/ActiveWorkoutBar';
import { getPreferences } from '@/lib/app-preferences';
import { formatDuration } from '@/lib/units';
import { refreshActiveWorkout } from '@/lib/workouts/active-workout-store';
import { setProgress } from '@/lib/workouts/editor-state';
import { markJustFinished } from '@/lib/workouts/finish-celebration';
import { confirmAndDiscard, confirmAndFinish, type FlowResult } from '@/lib/workouts/finish-flow';
import { workoutDisplayName } from '@/lib/workouts/format';
import { restSecondsForTick } from '@/lib/workouts/rest-timer';
import { startRestTimer, stopRestTimerForSet } from '@/lib/workouts/rest-timer-store';
import { startEmptyWorkout } from '@/lib/workouts/session';

function useKeyboardOpen(): boolean {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    const show = Keyboard.addListener('keyboardWillShow', () => setOpen(true));
    const showDid = Keyboard.addListener('keyboardDidShow', () => setOpen(true));
    const hide = Keyboard.addListener('keyboardWillHide', () => setOpen(false));
    const hideDid = Keyboard.addListener('keyboardDidHide', () => setOpen(false));
    return () => {
      show.remove();
      showDid.remove();
      hide.remove();
      hideDid.remove();
    };
  }, []);
  return open;
}

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
  const nowPlaying = useSpotifyNowPlaying(id);
  const keyboardHeight = useKeyboardHeight();
  const keyboardOpen = useKeyboardOpen();
  // Explicit insets: SafeAreaView can report zero inside a native fullScreenModal,
  // which put the header (and Finish) under the status bar and Dynamic Island.
  const insets = useSafeAreaInsets();

  const background = useThemeColor({}, 'background');
  const text = useThemeColor({}, 'text');
  const muted = useThemeColor({}, 'icon');
  const nested = useThemeColor({}, 'cardSecondary');

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
        markJustFinished(id);
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
    const durationSeconds = restSecondsForTick(result.restSeconds, getPreferences().restTimerEnabled);
    if (durationSeconds === 0 && !getPreferences().restTimerEnabled) return;
    startRestTimer({
      workoutId: id,
      durationSeconds,
      workoutExerciseId: result.workoutExerciseId,
      setId: result.setId,
      exerciseName: result.exerciseName,
    });
  };

  const shown = editor.workout ?? active;
  const title = shown ? workoutDisplayName(shown) : 'Workout';
  const elapsed = formatDuration(elapsedSeconds(shown?.started_at ?? null, now));
  const progress = setProgress(editor.workout);
  const subtitle = progress.total > 0 ? `${elapsed} · ${progress.done} of ${progress.total} sets` : elapsed;
  const finishDisabled = !id || busy || editor.status !== 'ready';

  let body: React.ReactNode = null;
  if (startFailed || editor.status === 'error' || editor.status === 'missing') {
    body = (
      <EmptyState
        image={false}
        title="Couldn’t open the workout."
        style={styles.message}
        actions={
          <Button
            variant="secondary"
            label="Retry"
            onPress={() => {
              if (startFailed) start();
              else if (editor.status === 'missing') void refreshActiveWorkout();
              else void editor.reload();
            }}
          />
        }
      />
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
          <Button
            variant="danger"
            size="lg"
            fullWidth={false}
            label="Discard"
            accessibilityLabel="Discard workout"
            disabled={busy}
            onPress={onDiscard}
          />
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
      <View style={styles.header}>
        <View style={styles.headerRow}>
          <Pressable
            onPress={() => void minimize()}
            accessibilityRole="button"
            accessibilityLabel="Minimize workout"
            style={[styles.iconButton, { backgroundColor: nested }]}
          >
            <IconSymbol name="chevron.down" size={22} color={text} />
          </Pressable>
          <View style={styles.titles}>
            <ThemedText type="title" numberOfLines={1} accessibilityRole="header">
              {title}
            </ThemedText>
            <ThemedText type="label" style={[styles.subtitle, { color: muted }]}>{subtitle}</ThemedText>
          </View>
          <Button
            label="Finish"
            accessibilityLabel="Finish workout"
            disabled={finishDisabled}
            onPress={onFinish}
          />
        </View>
        {nowPlaying && keyboardHeight === 0 && !keyboardOpen ? <NowPlayingLine nowPlaying={nowPlaying} /> : null}
        <RestBanner />
      </View>
      {body}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { paddingHorizontal: 16, paddingTop: 8, paddingBottom: 10, gap: 10 },
  headerRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  iconButton: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  titles: { flex: 1, minWidth: 0 },
  subtitle: { fontVariant: ['tabular-nums'] },
  message: { padding: 16 },
});
