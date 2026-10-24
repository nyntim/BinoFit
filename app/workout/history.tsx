import { useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, SectionList, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { ThemedText } from '@/components/themed-text';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { EmptyState } from '@/components/ui/EmptyState';
import { OptionsSheet } from '@/components/workouts/OptionsSheet';
import { WorkoutNavBar } from '@/components/workouts/WorkoutNavBar';
import { WorkoutHistoryRow } from '@/components/workouts/WorkoutHistoryRow';
import { useThemeColor } from '@/hooks/use-theme-color';
import { useWorkoutHistory } from '@/hooks/useWorkoutHistory';
import type { WorkoutSummary } from '@/lib/types';
import { saveAsRoutineWithFeedback } from '@/lib/workouts/routine-flow';
import { groupByMonth } from '@/lib/workouts/summary';

/** All finished workouts, newest first, grouped by month. */
export default function WorkoutHistoryScreen() {
  const background = useThemeColor({}, 'background');
  const muted = useThemeColor({}, 'icon');
  const tint = useThemeColor({}, 'tint');

  const history = useWorkoutHistory();
  const [optionsFor, setOptionsFor] = useState<WorkoutSummary | null>(null);
  // One item per month so each month draws as a single card; a month's count shows once it is complete
  const sections = useMemo(() => {
    const groups = groupByMonth(history.items);
    return groups.map((g, i) => ({
      key: g.key,
      title: g.label,
      count: g.items.length,
      complete: i < groups.length - 1 || !history.hasMore,
      data: [g.items],
    }));
  }, [history.items, history.hasMore]);

  let empty: React.ReactNode = null;
  if (history.status === 'loading') {
    empty = <ActivityIndicator style={styles.message} color={muted} />;
  } else if (history.status === 'error') {
    empty = (
      <EmptyState
        image={false}
        title="Couldn’t load workouts."
        style={styles.message}
        actions={<Button variant="secondary" label="Retry" onPress={history.reload} />}
      />
    );
  } else {
    empty = (
      <EmptyState
        title="No workouts yet."
        body="Start one from the Training tab or log a past workout."
        style={styles.message}
      />
    );
  }

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: background }]}>
      <WorkoutNavBar label="Training" onBack={() => router.back()} />
      <SectionList
        sections={sections}
        keyExtractor={(rows) => rows[0].date.slice(0, 7)}
        stickySectionHeadersEnabled={false}
        contentContainerStyle={styles.list}
        ListHeaderComponent={
          <ThemedText type="largeTitle" accessibilityRole="header" style={styles.largeTitle}>All workouts</ThemedText>
        }
        ListEmptyComponent={empty}
        onEndReached={history.loadMore}
        onEndReachedThreshold={0.5}
        ListFooterComponent={
          history.loadMoreFailed ? (
            <Pressable
              onPress={history.loadMore}
              accessibilityRole="button"
              accessibilityLabel="Retry"
              style={({ pressed }) => [styles.footer, styles.retry, pressed && { opacity: 0.85 }]}
            >
              <Text style={[styles.retryText, { color: tint }]}>Couldn’t load more. Retry</Text>
            </Pressable>
          ) : history.loadingMore ? (
            <ActivityIndicator style={styles.footer} color={muted} />
          ) : null
        }
        renderSectionHeader={({ section }) => (
          <View style={styles.sectionHeader}>
            <ThemedText type="section" accessibilityRole="header" style={styles.sectionLabel}>{section.title}</ThemedText>
            {section.complete ? (
              <ThemedText type="caption">{section.count} {section.count === 1 ? 'workout' : 'workouts'}</ThemedText>
            ) : null}
          </View>
        )}
        renderItem={({ item: rows }) => (
          <Card padding="none">
            {rows.map((row, index) => (
              <WorkoutHistoryRow
                key={row.id}
                summary={row}
                inset
                dateBlock
                last={index === rows.length - 1}
                recordCount={history.recordCounts.get(row.id)}
                onPress={() => router.push({ pathname: '/workout/[id]', params: { id: row.id } })}
                onLongPress={() => setOptionsFor(row)}
              />
            ))}
          </Card>
        )}
      />
      <OptionsSheet
        visible={!!optionsFor}
        title={optionsFor?.title}
        onClose={() => setOptionsFor(null)}
        options={[
          {
            key: 'routine',
            label: 'Save as routine',
            onPress: () => {
              if (optionsFor) void saveAsRoutineWithFeedback(optionsFor.id);
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
  list: { paddingHorizontal: 16, paddingBottom: 24, flexGrow: 1 },
  largeTitle: { paddingTop: 4, paddingBottom: 4 },
  sectionHeader: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', paddingTop: 18, paddingBottom: 8, paddingHorizontal: 4 },
  sectionLabel: { paddingHorizontal: 0 },
  message: { paddingTop: 32 },
  retry: { minHeight: 44, justifyContent: 'center' },
  retryText: { fontSize: 15, fontWeight: '500' },
  footer: { paddingVertical: 16 },
});
