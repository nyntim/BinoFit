import { useState } from 'react';
import { format } from 'date-fns';
import { Alert, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTabBarInset, useTabBarInsetMode } from '@/context/TabBarInsetContext';
import { router, useIsFocused } from 'expo-router';
import { ReorderableList } from '@/components/dashboard/ReorderableList';
import { ThemedText } from '@/components/themed-text';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { IconTile } from '@/components/ui/IconTile';
import { ListGroup, ListRow } from '@/components/ui/ListGroup';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { elapsedSeconds } from '@/components/workouts/ActiveWorkoutBar';
import { OptionsSheet } from '@/components/workouts/OptionsSheet';
import { MuscleSetsCard } from '@/components/workouts/MuscleSetsCard';
import { WeekSummaryCard } from '@/components/workouts/WeekSummaryCard';
import { WorkoutHistoryRow } from '@/components/workouts/WorkoutHistoryRow';
import { useThemeColor } from '@/hooks/use-theme-color';
import { useActiveWorkout } from '@/hooks/useActiveWorkout';
import { useNow } from '@/hooks/useNow';
import { usePreferences } from '@/hooks/usePreferences';
import { useRoutines } from '@/hooks/useRoutines';
import { useTrainingOverview } from '@/hooks/useTrainingOverview';
import { syncToSupabase } from '@/lib/sync';
import type { WorkoutSummary } from '@/lib/types';
import { formatDuration } from '@/lib/units';
import { workoutDisplayName } from '@/lib/workouts/format';
import { saveAsRoutineWithFeedback, startRoutineWithFeedback } from '@/lib/workouts/routine-flow';
import { routineDisplayName, routineSubtitle } from '@/lib/workouts/routine-plan';
import { createRoutine, reorderRoutines } from '@/lib/workouts/routines';
import { weekActivity, weekRange } from '@/lib/workouts/summary';

const ROUTINE_ROW_HEIGHT = 64;

export default function TrainingScreen() {
  const tabBarInset = useTabBarInset();
  const nativeTabInsets = useTabBarInsetMode() === 'automatic';
  const background = useThemeColor({}, 'background');
  const muted = useThemeColor({}, 'icon');
  const tint = useThemeColor({}, 'tint');
  const onTint = useThemeColor({}, 'onTint');
  const nested = useThemeColor({}, 'cardSecondary');
  const separator = useThemeColor({}, 'separator');

  const { weightUnit } = usePreferences();
  const { workout: active, loaded: activeLoaded } = useActiveWorkout();
  const focused = useIsFocused();
  const now = useNow(1000, focused && !!active);
  // Minute clock for the week strip so today rolls over while the tab stays open
  const minuteNow = useNow(60_000, focused);
  const overview = useTrainingOverview();
  const routines = useRoutines();
  const [optionsFor, setOptionsFor] = useState<WorkoutSummary | null>(null);
  const [reordering, setReordering] = useState(false);
  const [scrollLocked, setScrollLocked] = useState(false);
  const [creatingRoutine, setCreatingRoutine] = useState(false);
  const [startingRoutine, setStartingRoutine] = useState<string | null>(null);

  const isReordering = reordering && routines.routines.length >= 2;

  const onNewRoutine = async () => {
    if (creatingRoutine) return;
    setCreatingRoutine(true);
    try {
      const created = await createRoutine('Routine');
      syncToSupabase();
      router.push({ pathname: '/workout/routine', params: { id: created.id } });
    } catch {
      Alert.alert('Couldn’t create the routine.', 'Try again.');
    } finally {
      setCreatingRoutine(false);
    }
  };

  const onStartRoutine = async (routineId: string) => {
    if (startingRoutine) return;
    setStartingRoutine(routineId);
    try {
      await startRoutineWithFeedback(routineId);
    } finally {
      setStartingRoutine(null);
    }
  };

  const onReorderRoutines = async (orderedIds: string[]) => {
    const byId = new Map(routines.routines.map((r) => [r.id, r]));
    const next = orderedIds
      .map((id, index) => {
        const found = byId.get(id);
        return found ? { ...found, position: index } : null;
      })
      .filter((x): x is NonNullable<typeof x> => x !== null);
    routines.setRoutines(next);
    try {
      await reorderRoutines(orderedIds);
      syncToSupabase();
    } catch {
      routines.reload();
    }
  };

  const today = new Date(minuteNow);
  const days = weekActivity(weekRange(today), overview.doneDates, format(today, 'yyyy-MM-dd'), !!active);

  const cardHeader = (title: string, actions: React.ReactNode) => (
    <View style={styles.cardHeader}>
      <ThemedText type="title" accessibilityRole="header">{title}</ThemedText>
      <View style={styles.headerActions}>{actions}</View>
    </View>
  );
  const headerLink = (label: string, onPress: () => void, disabled?: boolean) => (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={label}
      hitSlop={{ left: 4, right: 4 }}
      style={({ pressed }) => [styles.headerAction, pressed && styles.pressed]}
    >
      <ThemedText type="label" style={[styles.sectionLink, { color: tint }]}>{label}</ThemedText>
    </Pressable>
  );
  const emptyBlock = (title: string, body?: string, retry?: () => void) => (
    <View style={styles.empty}>
      <ThemedText type="body">{title}</ThemedText>
      {body ? <ThemedText type="caption">{body}</ThemedText> : null}
      {retry ? (
        <Pressable onPress={retry} accessibilityRole="button" accessibilityLabel="Retry" style={({ pressed }) => [styles.retry, pressed && styles.pressed]}>
          <ThemedText type="label" style={[styles.sectionLink, { color: tint }]}>Retry</ThemedText>
        </Pressable>
      ) : null}
    </View>
  );

  let primary: React.ReactNode;
  if (!activeLoaded) {
    primary = <View style={styles.primaryPlaceholder} />;
  } else if (active) {
    const name = workoutDisplayName(active);
    const elapsed = formatDuration(elapsedSeconds(active.started_at ?? null, now));
    const progress = overview.activeProgress;
    const progressText = progress && progress.total > 0 ? `${progress.done} of ${progress.total} sets` : null;
    primary = (
      <Pressable
        onPress={() => router.push('/workout/session')}
        accessibilityRole="button"
        accessibilityLabel={`Resume workout. ${name}, ${elapsed}${progressText ? `, ${progressText}` : ''}`}
        style={({ pressed }) => [styles.progressCard, { backgroundColor: tint }, pressed && styles.pressed]}
      >
        <View style={styles.progressCopy}>
          <ThemedText type="label" style={[styles.progressEyebrow, { color: onTint }]}>In progress</ThemedText>
          <ThemedText type="title" style={[styles.progressName, { color: onTint }]} numberOfLines={2}>{name}</ThemedText>
          <ThemedText type="label" style={[styles.progressMeta, { color: onTint }]}>{progressText ? `${elapsed} · ${progressText}` : elapsed}</ThemedText>
        </View>
        {/* Visual only: the card is the one button */}
        <View pointerEvents="none" accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
          <Button variant="inverse" label="Resume" />
        </View>
      </Pressable>
    );
  } else {
    primary = <Button size="lg" label="Start empty workout" onPress={() => router.push('/workout/session')} />;
  }

  return (
    <SafeAreaView edges={['top']} style={[styles.container, { backgroundColor: background }]}>
      <ScrollView scrollEnabled={!scrollLocked} contentContainerStyle={[styles.content, { paddingBottom: 24 + tabBarInset }]} contentInsetAdjustmentBehavior={nativeTabInsets ? 'automatic' : undefined} scrollIndicatorInsets={nativeTabInsets ? undefined : { bottom: tabBarInset }}>
        <View style={styles.titleRow}>
          <ThemedText type="largeTitle" accessibilityRole="header">Training</ThemedText>
          <Pressable
            onPress={() => router.push('/settings/training')}
            accessibilityRole="button"
            accessibilityLabel="Training settings"
            style={({ pressed }) => [styles.gearButton, { backgroundColor: nested }, pressed && styles.pressed]}
          >
            <IconSymbol name="gear" size={20} color={muted} />
          </Pressable>
        </View>

        {primary}

        <WeekSummaryCard week={overview.week} weekLabel={overview.weekLabel} unit={weightUnit} days={days} />

        {overview.muscleSets.length > 0 ? <MuscleSetsCard rows={overview.muscleSets} onEditTargets={() => router.push('/settings/weekly-volume-targets')} /> : null}

        <Card padding="none">
          {cardHeader(
            'Routines',
            <>
              {routines.routines.length >= 2 ? headerLink(isReordering ? 'Done' : 'Reorder', () => setReordering((v) => !v)) : null}
              {headerLink('New routine', () => void onNewRoutine(), creatingRoutine)}
            </>
          )}
          {routines.routines.length > 0 ? (
            isReordering ? (
              <ReorderableList
                items={routines.routines.map((r) => ({ ...r, label: routineDisplayName(r) }))}
                itemHeight={ROUTINE_ROW_HEIGHT}
                gap={0}
                iconColor={muted}
                onReorder={(ids) => void onReorderRoutines(ids)}
                onDragActiveChange={setScrollLocked}
                renderItem={(r, handle) => (
                  <View style={[styles.routineRow, styles.routineReorderRow, { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: separator }]}>
                    {handle}
                    <View style={styles.routineMain}>
                      <ThemedText type="body" style={styles.semibold} numberOfLines={1}>{routineDisplayName(r)}</ThemedText>
                      <ThemedText type="caption" numberOfLines={1}>{routineSubtitle(r)}</ThemedText>
                    </View>
                  </View>
                )}
              />
            ) : (
              routines.routines.map((r) => {
                const title = routineDisplayName(r);
                const subtitle = routineSubtitle(r);
                return (
                  <View key={r.id} style={[styles.routineRow, { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: separator }]}>
                    <Pressable
                      onPress={() => router.push({ pathname: '/workout/routine', params: { id: r.id } })}
                      accessibilityRole="button"
                      accessibilityLabel={`${title}. ${subtitle}`}
                      style={({ pressed }) => [styles.routineMain, styles.routineTap, pressed && styles.pressed]}
                    >
                      <ThemedText type="body" style={styles.semibold} numberOfLines={1}>{title}</ThemedText>
                      <ThemedText type="caption" numberOfLines={1}>{subtitle}</ThemedText>
                    </Pressable>
                    <Button
                      variant="soft"
                      size="sm"
                      label="Start"
                      accessibilityLabel={`Start ${title}`}
                      disabled={startingRoutine !== null}
                      onPress={() => void onStartRoutine(r.id)}
                    />
                  </View>
                );
              })
            )
          ) : routines.status === 'error' ? (
            emptyBlock('Couldn’t load routines.', undefined, routines.reload)
          ) : routines.status === 'ready' ? (
            emptyBlock('No routines yet.', 'Save a workout, or create one.')
          ) : (
            <View style={styles.empty} />
          )}
        </Card>

        <Card padding="none">
          {cardHeader('History', overview.recent.length > 0 ? headerLink('All workouts', () => router.push('/workout/history')) : null)}
          {overview.recent.length > 0 ? (
            overview.recent.map((w) => (
              <View key={w.id} style={{ borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: separator }}>
                <WorkoutHistoryRow
                  summary={w}
                  inset
                  last
                  recordCount={overview.recordCounts.get(w.id)}
                  onPress={() => router.push({ pathname: '/workout/[id]', params: { id: w.id } })}
                  onLongPress={() => setOptionsFor(w)}
                />
              </View>
            ))
          ) : overview.status === 'error' ? (
            emptyBlock('Couldn’t load workouts.', undefined, overview.reload)
          ) : overview.status === 'ready' ? (
            emptyBlock('No workouts yet.', 'Start one above or log a past workout.')
          ) : (
            <View style={styles.empty} />
          )}
        </Card>

        <ListGroup>
          <ListRow title="Exercises" leading={<IconTile icon="dumbbell.fill" />} onPress={() => router.push('/workout/exercises')} />
          <ListRow title="Log past workout" leading={<IconTile icon="clock.arrow.circlepath" />} onPress={() => router.push('/workout/log')} />
        </ListGroup>
      </ScrollView>
      <OptionsSheet
        visible={!!optionsFor}
        title={optionsFor?.title}
        onClose={() => setOptionsFor(null)}
        options={[
          {
            key: 'routine',
            label: 'Save as routine',
            onPress: () => {
              if (optionsFor) void saveAsRoutineWithFeedback(optionsFor.id, { onSaved: () => routines.reload() });
            },
          },
          {
            key: 'open',
            label: 'Open',
            onPress: () => {
              if (optionsFor) router.push({ pathname: '/workout/[id]', params: { id: optionsFor.id } });
            },
          },
        ]}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  pressed: { opacity: 0.85 },
  content: { paddingHorizontal: 16, paddingTop: 8, paddingBottom: 24, gap: 14 },
  titleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  gearButton: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  primaryPlaceholder: { minHeight: 52 },
  progressCard: { flexDirection: 'row', alignItems: 'center', gap: 12, borderRadius: 22, paddingVertical: 16, paddingLeft: 20, paddingRight: 16 },
  progressCopy: { flex: 1, minWidth: 0, gap: 2 },
  progressEyebrow: { fontWeight: '600', opacity: 0.8 },
  progressName: { fontSize: 20, fontWeight: '700' },
  progressMeta: { opacity: 0.85, fontVariant: ['tabular-nums'] },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', minHeight: 52, paddingHorizontal: 18, paddingTop: 4 },
  headerActions: { flexDirection: 'row', alignItems: 'center', gap: 16 },
  headerAction: { minHeight: 44, justifyContent: 'center' },
  sectionLink: { fontWeight: '600' },
  empty: { paddingHorizontal: 18, paddingBottom: 16, gap: 2 },
  retry: { minHeight: 44, justifyContent: 'center' },
  routineRow: { minHeight: 64, paddingVertical: 8, paddingHorizontal: 18, flexDirection: 'row', alignItems: 'center', gap: 12 },
  routineReorderRow: { height: ROUTINE_ROW_HEIGHT, paddingVertical: 0 },
  routineMain: { flex: 1, minWidth: 0, gap: 2 },
  routineTap: { minHeight: 48, justifyContent: 'center' },
  semibold: { fontWeight: '600' },
});
