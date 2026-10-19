import { useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTabBarInset } from '@/context/TabBarInsetContext';
import { router } from 'expo-router';
import { ReorderableList } from '@/components/dashboard/ReorderableList';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { TrainingSettingsSheet } from '@/components/settings/TabSettingsSheet';
import { MuscleSetsCard } from '@/components/workouts/MuscleSetsCard';
import { WeekSummaryCard } from '@/components/workouts/WeekSummaryCard';
import { WorkoutHistoryRow } from '@/components/workouts/WorkoutHistoryRow';
import { useThemeColor } from '@/hooks/use-theme-color';
import { useActiveWorkout } from '@/hooks/useActiveWorkout';
import { usePreferences } from '@/hooks/usePreferences';
import { useRoutines } from '@/hooks/useRoutines';
import { useTrainingOverview } from '@/hooks/useTrainingOverview';
import { syncToSupabase } from '@/lib/sync';
import { routineDisplayName, routineSubtitle } from '@/lib/workouts/routine-plan';
import { createRoutine, reorderRoutines } from '@/lib/workouts/routines';

const ROUTINE_ROW_HEIGHT = 56;

export default function TrainingScreen() {
  const tabBarInset = useTabBarInset();
  const background = useThemeColor({}, 'background');
  const text = useThemeColor({}, 'text');
  const muted = useThemeColor({}, 'icon');
  const tint = useThemeColor({}, 'tint');
  const card = useThemeColor({}, 'cardBackground');
  const separator = useThemeColor({}, 'separator');

  const { weightUnit } = usePreferences();
  const { workout: active, loaded: activeLoaded } = useActiveWorkout();
  const overview = useTrainingOverview();
  const routines = useRoutines();
  const [reordering, setReordering] = useState(false);
  const [scrollLocked, setScrollLocked] = useState(false);
  const [creatingRoutine, setCreatingRoutine] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);

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

  const link = (label: string, path: '/workout/exercises' | '/workout/log', last?: boolean) => (
    <Pressable
      onPress={() => router.push(path)}
      accessibilityRole="button"
      accessibilityLabel={label}
      style={({ pressed }) => [
        styles.link,
        pressed && styles.pressed,
        !last && { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: separator },
      ]}
    >
      <Text style={[styles.linkLabel, { color: text }]}>{label}</Text>
      <IconSymbol name="chevron.right" size={16} color={muted} />
    </Pressable>
  );

  return (
    <SafeAreaView edges={['top']} style={[styles.container, { backgroundColor: background }]}>
      <ScrollView scrollEnabled={!scrollLocked} contentContainerStyle={[styles.content, { paddingBottom: 24 + tabBarInset }]} scrollIndicatorInsets={{ bottom: tabBarInset }}>
        <View style={styles.titleRow}>
          <Text style={[styles.title, { color: text }]} accessibilityRole="header">Training</Text>
          <Pressable onPress={() => setSettingsOpen(true)} accessibilityRole="button" accessibilityLabel="Training settings" style={({ pressed }) => [styles.gearButton, pressed && { backgroundColor: card }]}>
            <IconSymbol name="gear" size={21} color={muted} />
          </Pressable>
        </View>

        <Pressable
          onPress={() => router.push('/workout/session')}
          accessibilityRole="button"
          disabled={!activeLoaded}
          style={({ pressed }) => [styles.primary, { backgroundColor: tint }, pressed && styles.pressed]}
        >
          <Text style={[styles.primaryLabel, { color: background }]}>
            {!activeLoaded ? ' ' : active ? 'Resume workout' : 'Start empty workout'}
          </Text>
        </Pressable>

        <WeekSummaryCard week={overview.week} weekLabel={overview.weekLabel} unit={weightUnit} />

        {overview.muscleSets.length > 0 ? <MuscleSetsCard rows={overview.muscleSets} /> : null}

        <View style={[styles.section, { backgroundColor: card }]}>
          <View style={styles.sectionHeader}>
            <Text style={[styles.sectionTitle, { color: text }]} accessibilityRole="header">
              History
            </Text>
            {overview.recent.length > 0 ? (
              <Pressable
                onPress={() => router.push('/workout/history')}
                accessibilityRole="button"
                accessibilityLabel="All workouts"
                hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
                style={({ pressed }) => pressed && styles.pressed}
              >
                <Text style={[styles.sectionLink, { color: tint }]}>All workouts</Text>
              </Pressable>
            ) : null}
          </View>
          {overview.recent.length > 0 ? (
            overview.recent.map((w, i) => (
              <WorkoutHistoryRow
                key={w.id}
                summary={w}
                last={i === overview.recent.length - 1}
                onPress={() => router.push({ pathname: '/workout/[id]', params: { id: w.id } })}
              />
            ))
          ) : overview.status === 'error' ? (
            <View style={styles.empty}>
              <Text style={[styles.emptyTitle, { color: text }]}>Couldn’t load workouts.</Text>
              <Pressable onPress={overview.reload} accessibilityRole="button" accessibilityLabel="Retry" style={({ pressed }) => [styles.retry, pressed && styles.pressed]}>
                <Text style={[styles.sectionLink, { color: tint }]}>Retry</Text>
              </Pressable>
            </View>
          ) : overview.status === 'ready' ? (
            <View style={styles.empty}>
              <Text style={[styles.emptyTitle, { color: text }]}>No workouts yet.</Text>
              <Text style={[styles.emptyBody, { color: muted }]}>Start one above or log a past workout.</Text>
            </View>
          ) : (
            <View style={styles.empty} />
          )}
        </View>

        <View style={[styles.section, { backgroundColor: card }]}>
          <View style={styles.sectionHeader}>
            <Text style={[styles.sectionTitle, { color: text }]} accessibilityRole="header">
              Routines
            </Text>
            <View style={styles.headerActions}>
              {routines.routines.length >= 2 ? (
                <Pressable
                  onPress={() => setReordering((v) => !v)}
                  accessibilityRole="button"
                  accessibilityLabel={isReordering ? 'Done' : 'Reorder'}
                  hitSlop={{ top: 12, bottom: 12, left: 8, right: 8 }}
                  style={({ pressed }) => [styles.headerAction, pressed && styles.pressed]}
                >
                  <Text style={[styles.sectionLink, { color: tint }]}>
                    {isReordering ? 'Done' : 'Reorder'}
                  </Text>
                </Pressable>
              ) : null}
              <Pressable
                onPress={() => void onNewRoutine()}
                disabled={creatingRoutine}
                accessibilityRole="button"
                accessibilityLabel="New routine"
                hitSlop={{ top: 12, bottom: 12, left: 8, right: 8 }}
                style={({ pressed }) => [styles.headerAction, pressed && styles.pressed]}
              >
                <Text style={[styles.sectionLink, { color: tint }]}>New routine</Text>
              </Pressable>
            </View>
          </View>
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
                  <View
                    style={[
                      styles.routineRow,
                      styles.routineReorderRow,
                      { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: separator },
                    ]}
                  >
                    {handle}
                    <View style={styles.routineMain}>
                      <Text style={[styles.routineTitle, { color: text }]} numberOfLines={1}>
                        {routineDisplayName(r)}
                      </Text>
                      <Text style={[styles.routineSubtitle, { color: muted }]} numberOfLines={1}>
                        {routineSubtitle(r)}
                      </Text>
                    </View>
                  </View>
                )}
              />
            ) : (
              routines.routines.map((r, i) => {
                const title = routineDisplayName(r);
                const subtitle = routineSubtitle(r);
                const last = i === routines.routines.length - 1;
                return (
                  <Pressable
                    key={r.id}
                    onPress={() => router.push({ pathname: '/workout/routine', params: { id: r.id } })}
                    accessibilityRole="button"
                    accessibilityLabel={`${title}. ${subtitle}`}
                    style={({ pressed }) => [
                      styles.routineRow,
                      pressed && styles.pressed,
                      !last && {
                        borderBottomWidth: StyleSheet.hairlineWidth,
                        borderBottomColor: separator,
                      },
                    ]}
                  >
                    <View style={styles.routineMain}>
                      <Text style={[styles.routineTitle, { color: text }]} numberOfLines={1}>
                        {title}
                      </Text>
                      <Text style={[styles.routineSubtitle, { color: muted }]} numberOfLines={1}>
                        {subtitle}
                      </Text>
                    </View>
                    <IconSymbol name="chevron.right" size={16} color={muted} />
                  </Pressable>
                );
              })
            )
          ) : routines.status === 'error' ? (
            <View style={styles.empty}>
              <Text style={[styles.emptyTitle, { color: text }]}>Couldn’t load routines.</Text>
              <Pressable
                onPress={routines.reload}
                accessibilityRole="button"
                accessibilityLabel="Retry"
                style={({ pressed }) => [styles.retry, pressed && styles.pressed]}
              >
                <Text style={[styles.sectionLink, { color: tint }]}>Retry</Text>
              </Pressable>
            </View>
          ) : routines.status === 'ready' ? (
            <View style={styles.empty}>
              <Text style={[styles.emptyTitle, { color: text }]}>No routines yet.</Text>
              <Text style={[styles.emptyBody, { color: muted }]}>
                Save a workout, or create one.
              </Text>
            </View>
          ) : (
            <View style={styles.empty} />
          )}
        </View>

        <View style={[styles.links, { backgroundColor: card }]}>
          {link('Exercises', '/workout/exercises')}
          {link('Log past workout', '/workout/log', true)}
        </View>
      </ScrollView>
      <TrainingSettingsSheet visible={settingsOpen} onClose={() => setSettingsOpen(false)} />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  pressed: { opacity: 0.85 },
  content: { paddingHorizontal: 16, paddingTop: 16, paddingBottom: 24, gap: 20 },
  titleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  gearButton: { minHeight: 44, minWidth: 44, alignItems: 'center', justifyContent: 'center', borderRadius: 12 },
  title: { fontSize: 34, fontWeight: '700', lineHeight: 37, letterSpacing: -0.5 },
  primary: { minHeight: 50, borderRadius: 18, paddingVertical: 14, paddingHorizontal: 24, alignItems: 'center' },
  primaryLabel: { fontSize: 17, fontWeight: '600' },
  section: { borderRadius: 18, paddingHorizontal: 20, paddingVertical: 8 },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingTop: 12,
    paddingBottom: 4,
    minHeight: 44,
  },
  sectionTitle: { fontSize: 17, fontWeight: '600' },
  sectionLink: { fontSize: 13, fontWeight: '500' },
  empty: { paddingVertical: 12, gap: 2 },
  emptyTitle: { fontSize: 15 },
  emptyBody: { fontSize: 12 },
  retry: { minHeight: 44, justifyContent: 'center' },
  links: { borderRadius: 18, paddingHorizontal: 20 },
  link: { minHeight: 48, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  linkLabel: { fontSize: 15 },
  headerActions: { flexDirection: 'row', alignItems: 'center', gap: 16 },
  headerAction: { minHeight: 44, justifyContent: 'center' },
  routineRow: {
    minHeight: 44,
    paddingVertical: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  routineReorderRow: {
    height: ROUTINE_ROW_HEIGHT,
    paddingVertical: 0,
  },
  routineMain: { flex: 1, minWidth: 0, gap: 2 },
  routineTitle: { fontSize: 15 },
  routineSubtitle: { fontSize: 12 },
});
