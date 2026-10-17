import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { WeekSummaryCard } from '@/components/workouts/WeekSummaryCard';
import { WorkoutHistoryRow } from '@/components/workouts/WorkoutHistoryRow';
import { useThemeColor } from '@/hooks/use-theme-color';
import { useActiveWorkout } from '@/hooks/useActiveWorkout';
import { usePreferences } from '@/hooks/usePreferences';
import { useTrainingOverview } from '@/hooks/useTrainingOverview';

export default function TrainingScreen() {
  const background = useThemeColor({}, 'background');
  const text = useThemeColor({}, 'text');
  const muted = useThemeColor({}, 'icon');
  const tint = useThemeColor({}, 'tint');
  const card = useThemeColor({}, 'cardBackground');
  const separator = useThemeColor({}, 'separator');

  const { weightUnit } = usePreferences();
  const { workout: active, loaded: activeLoaded } = useActiveWorkout();
  const overview = useTrainingOverview();

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
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={[styles.title, { color: text }]} accessibilityRole="header">
          Training
        </Text>

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

        <View style={[styles.links, { backgroundColor: card }]}>
          {link('Exercises', '/workout/exercises')}
          {link('Log past workout', '/workout/log', true)}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  pressed: { opacity: 0.85 },
  content: { paddingHorizontal: 16, paddingTop: 16, paddingBottom: 24, gap: 20 },
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
});
