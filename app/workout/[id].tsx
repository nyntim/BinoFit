import { useEffect, useRef, useState } from 'react';
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, useLocalSearchParams } from 'expo-router';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { OptionsSheet } from '@/components/workouts/OptionsSheet';
import { WorkoutEditorBody } from '@/components/workouts/WorkoutEditor';
import { useThemeColor } from '@/hooks/use-theme-color';
import { useWorkoutEditor } from '@/hooks/useWorkoutEditor';
import { syncToSupabase } from '@/lib/sync';
import { deleteWorkout } from '@/lib/workouts/db';
import { cleanupEmptyEntries } from '@/lib/workouts/drafts';
import { saveAsRoutineWithFeedback } from '@/lib/workouts/routine-flow';

/** A finished workout: every edit writes through to SQLite and syncs. */
export default function WorkoutDetailScreen() {
  const params = useLocalSearchParams<{ id?: string }>();
  const id = typeof params.id === 'string' && params.id ? params.id : undefined;
  const editor = useWorkoutEditor(id, 'edit');
  const [menuOpen, setMenuOpen] = useState(false);

  const background = useThemeColor({}, 'background');
  const text = useThemeColor({}, 'text');
  const muted = useThemeColor({}, 'icon');
  const tint = useThemeColor({}, 'tint');
  const separator = useThemeColor({}, 'separator');
  const fieldBorder = useThemeColor({}, 'fieldBorder');

  // On leaving: finish pending writes, then drop sets and exercises left empty.
  const flushRef = useRef(editor.flush);
  useEffect(() => {
    flushRef.current = editor.flush;
  });
  useEffect(
    () => () => {
      if (!id) return;
      void flushRef
        .current()
        .then(() => cleanupEmptyEntries(id, new Date()))
        .then(() => syncToSupabase())
        .catch(() => undefined);
    },
    [id]
  );

  const onSaveAsRoutine = async () => {
    if (!id) return;
    await editor.flush();
    await saveAsRoutineWithFeedback(id);
  };

  const confirmDelete = () => {
    Alert.alert('Delete this workout?', 'This can’t be undone.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          if (!id) return;
          try {
            await editor.flush();
            await deleteWorkout(id);
            syncToSupabase();
            router.back();
          } catch {
            Alert.alert('Couldn’t delete the workout', 'Try again.');
          }
        },
      },
    ]);
  };

  const onAddExercises = async () => {
    if (!id) return;
    await editor.flush();
    router.push({ pathname: '/workout/exercises', params: { pick: '1', workoutId: id } });
  };

  let body: React.ReactNode = null;
  if (editor.status === 'missing' || !id) {
    body = (
      <View style={styles.message}>
        <Text style={[styles.messageText, { color: muted }]}>This workout was deleted.</Text>
      </View>
    );
  } else if (editor.status === 'error') {
    body = (
      <View style={styles.message}>
        <Text style={[styles.messageText, { color: muted }]}>Couldn’t load this workout.</Text>
        <Pressable
          onPress={() => void editor.reload()}
          accessibilityRole="button"
          style={[styles.retry, { borderColor: fieldBorder }]}
        >
          <Text style={[styles.retryText, { color: tint }]}>Retry</Text>
        </Pressable>
      </View>
    );
  } else if (editor.status === 'ready' && editor.workout) {
    body = <WorkoutEditorBody editor={editor} mode="edit" onAddExercises={onAddExercises} />;
  }

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: background }]}>
      <View style={[styles.header, { borderBottomColor: separator }]}>
        <Pressable
          onPress={() => {
            void editor.flush().then(() => router.back());
          }}
          accessibilityRole="button"
          accessibilityLabel="Back"
          style={styles.iconButton}
        >
          <IconSymbol name="chevron.left" size={22} color={tint} />
        </Pressable>
        <Text style={[styles.title, { color: text }]} accessibilityRole="header">
          Workout
        </Text>
        <Pressable
          onPress={() => setMenuOpen(true)}
          disabled={editor.status !== 'ready'}
          accessibilityRole="button"
          accessibilityLabel="More options"
          style={[styles.iconButton, editor.status !== 'ready' && { opacity: 0.5 }]}
        >
          <IconSymbol name="ellipsis" size={22} color={tint} />
        </Pressable>
      </View>
      {body}
      <OptionsSheet
        visible={menuOpen}
        onClose={() => setMenuOpen(false)}
        options={[
          { key: 'routine', label: 'Save as routine', onPress: () => void onSaveAsRoutine() },
          { key: 'delete', label: 'Delete workout', onPress: confirmDelete },
        ]}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
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
});
