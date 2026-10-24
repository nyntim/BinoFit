import type { ReactNode } from 'react';
import { ScrollView, StyleSheet, useWindowDimensions, View } from 'react-native';
import { ThemedText } from '@/components/themed-text';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Tag } from '@/components/ui/Tag';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { PlaylistRow } from '@/components/workouts/PlaylistRow';
import { useThemeColor } from '@/hooks/use-theme-color';
import { usePreferences } from '@/hooks/usePreferences';
import type { WorkoutWithExercises } from '@/lib/types';
import { exerciseDisplayName } from '@/lib/workouts/exercise-catalog';
import { setBadges } from '@/lib/workouts/editor-state';
import { formatSetValue, workoutDisplayName } from '@/lib/workouts/format';
import { formatSetRecordNote, hasBeaten, workoutRecords, type RecordValues } from '@/lib/workouts/records';
import { formatDurationShort, formatVolume, formatWorkoutMeta, workoutStats } from '@/lib/workouts/summary';

type Props = {
  workout: WorkoutWithExercises;
  /** Prior records per exercise (null when unknown: no record tags). */
  priorRecords: Map<string, RecordValues> | null;
  /** The celebration banner, shown above the title. */
  banner?: ReactNode;
  onSaveAsRoutine: () => void;
  onEdit: () => void;
};

function StatCard({ label, value, caption }: { label: string; value: string; caption: string }) {
  return (
    <Card padding="compact" style={styles.stat} accessible accessibilityLabel={`${label}, ${value} ${caption}`}>
      <ThemedText type="caption">{label}</ThemedText>
      <ThemedText type="stat">{value}</ThemedText>
      <ThemedText type="caption">{caption}</ThemedText>
    </Card>
  );
}

/** The read view of a finished workout: title, meta, three stats, each exercise with its sets and record notes. */
export function WorkoutSummaryView({ workout, priorRecords, banner, onSaveAsRoutine, onEdit }: Props) {
  const { weightUnit: unit } = usePreferences();
  const { fontScale } = useWindowDimensions();
  const text = useThemeColor({}, 'text');
  const muted = useThemeColor({}, 'icon');
  const ember = useThemeColor({}, 'ember');
  const separator = useThemeColor({}, 'separator');
  const stats = workoutStats(workout);
  const records = workoutRecords(workout, priorRecords);
  const volume = stats.volumeKg > 0 ? formatVolume(stats.volumeKg, unit) : '-';

  return (
    <ScrollView contentContainerStyle={styles.content}>
      {banner}
      <View style={styles.titles}>
        <ThemedText type="largeTitle" accessibilityRole="header">{workoutDisplayName(workout)}</ThemedText>
        <ThemedText type="label" style={[styles.meta, { color: muted }]}>{formatWorkoutMeta(workout)}</ThemedText>
      </View>

      <View style={fontScale > 1.3 ? styles.statsStacked : styles.stats}>
        <StatCard label="Volume" value={volume} caption={unit} />
        <StatCard
          label="Sets"
          value={String(stats.sets)}
          caption={stats.warmups > 0 ? `${stats.warmups} ${stats.warmups === 1 ? 'warmup' : 'warmups'}` : 'working sets'}
        />
        <StatCard label="Duration" value={formatDurationShort(stats.durationSeconds)} caption="total" />
      </View>

      {workout.playlist_id ? <PlaylistRow playlistId={workout.playlist_id} playlistName={workout.playlist_name} /> : null}

      {(workout.exercises ?? [])
        .filter((ex) => ex.sets.length > 0)
        .map((ex) => {
          const logType = ex.exercise?.log_type ?? 'weight_reps';
          const perSide = !!ex.exercise?.per_side;
          const title = ex.exercise ? exerciseDisplayName(ex.exercise) : ex.exercise_name;
          const result = records.get(ex.id);
          const badges = setBadges(ex.sets);
          return (
            <Card key={ex.id} padding="none" style={styles.exercise}>
              <View style={styles.exerciseHeader}>
                <ThemedText type="title" style={styles.exerciseTitle} accessibilityRole="header">{title}</ThemedText>
                {result && hasBeaten(result.beaten) ? <Tag label="Record" tone="ember" /> : null}
              </View>
              {ex.sets.map((s, i) => {
                const badge = badges[i];
                const value = formatSetValue(s, logType, perSide, unit) ?? '-';
                const kinds = result?.setKinds.get(s.id);
                const note = kinds && kinds.length > 0 ? formatSetRecordNote(kinds[0], s, unit, perSide) : null;
                return (
                  <View
                    key={s.id}
                    accessible
                    accessibilityLabel={`${badge.accessibilityLabel}, ${value}${note ? `, record, ${note}` : ''}`}
                    style={[styles.setRow, { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: separator }]}
                  >
                    <ThemedText type="body" style={[styles.badge, { color: badge.special ? muted : text }]}>{badge.label}</ThemedText>
                    <ThemedText type="body" style={styles.value}>{value}</ThemedText>
                    {note ? (
                      <View style={styles.note}>
                        <IconSymbol name="star.fill" size={12} color={ember} />
                        <ThemedText type="caption" style={[styles.noteText, { color: ember }]}>{note}</ThemedText>
                      </View>
                    ) : null}
                  </View>
                );
              })}
            </Card>
          );
        })}

      <View style={styles.actions}>
        <Button variant="secondary" size="lg" label="Save as routine" onPress={onSaveAsRoutine} style={styles.action} />
        <Button variant="soft" size="lg" label="Edit" onPress={onEdit} style={styles.action} />
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: { padding: 16, gap: 14, paddingBottom: 40 },
  titles: { gap: 4 },
  meta: { fontVariant: ['tabular-nums'] },
  stats: { flexDirection: 'row', gap: 10 },
  statsStacked: { gap: 10 },
  stat: { flex: 1, minWidth: 0, gap: 2 },
  exercise: { paddingTop: 4, overflow: 'hidden' },
  exerciseHeader: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 8, paddingHorizontal: 18, paddingTop: 12, paddingBottom: 8 },
  exerciseTitle: { flexShrink: 1 },
  setRow: { minHeight: 38, flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 18, paddingVertical: 6 },
  badge: { width: 28, fontWeight: '700', fontVariant: ['tabular-nums'] },
  value: { flex: 1, minWidth: 0, fontVariant: ['tabular-nums'] },
  note: { flexDirection: 'row', alignItems: 'center', gap: 4, flexShrink: 1, justifyContent: 'flex-end' },
  noteText: { fontWeight: '600', flexShrink: 1, textAlign: 'right' },
  actions: { flexDirection: 'row', gap: 10 },
  action: { flex: 1 },
});
