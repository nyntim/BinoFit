import { useMemo } from 'react';
import { ActivityIndicator, Pressable, SectionList, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { WorkoutHistoryRow } from '@/components/workouts/WorkoutHistoryRow';
import { useThemeColor } from '@/hooks/use-theme-color';
import { useWorkoutHistory } from '@/hooks/useWorkoutHistory';
import { groupByMonth } from '@/lib/workouts/summary';

/** All finished workouts, newest first, grouped by month. */
export default function WorkoutHistoryScreen() {
  const background = useThemeColor({}, 'background');
  const text = useThemeColor({}, 'text');
  const muted = useThemeColor({}, 'icon');
  const tint = useThemeColor({}, 'tint');
  const card = useThemeColor({}, 'cardBackground');

  const history = useWorkoutHistory();
  const sections = useMemo(
    () => groupByMonth(history.items).map((g) => ({ key: g.key, title: g.label, data: g.items })),
    [history.items]
  );

  let empty: React.ReactNode = null;
  if (history.status === 'loading') {
    empty = <ActivityIndicator style={styles.message} color={muted} />;
  } else if (history.status === 'error') {
    empty = (
      <View style={styles.message}>
        <Text style={[styles.messageText, { color: muted }]}>Couldn’t load workouts.</Text>
        <Pressable onPress={history.reload} accessibilityRole="button" accessibilityLabel="Retry" style={({ pressed }) => [styles.retry, pressed && { opacity: 0.85 }]}>
          <Text style={[styles.retryText, { color: tint }]}>Retry</Text>
        </Pressable>
      </View>
    );
  } else {
    empty = (
      <View style={styles.message}>
        <Text style={[styles.messageText, { color: text }]}>No workouts yet.</Text>
        <Text style={[styles.messageBody, { color: muted }]}>Start one from the Training tab or log a past workout.</Text>
      </View>
    );
  }

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: background }]}>
      <View style={styles.header}>
        <Pressable
          onPress={() => router.back()}
          accessibilityRole="button"
          accessibilityLabel="Back"
          style={styles.iconButton}
        >
          <IconSymbol name="chevron.left" size={22} color={tint} />
        </Pressable>
        <Text style={[styles.title, { color: text }]} accessibilityRole="header">
          All workouts
        </Text>
      </View>
      <SectionList
        sections={sections}
        keyExtractor={(w) => w.id}
        stickySectionHeadersEnabled={false}
        contentContainerStyle={styles.list}
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
          <Text style={[styles.sectionLabel, { color: muted }]} accessibilityRole="header">
            {section.title}
          </Text>
        )}
        renderItem={({ item, index, section }) => (
          <View
            style={[
              styles.rowWrap,
              { backgroundColor: card },
              index === 0 && styles.rowFirst,
              index === section.data.length - 1 && styles.rowLast,
            ]}
          >
            <WorkoutHistoryRow
              summary={item}
              last={index === section.data.length - 1}
              onPress={() => router.push({ pathname: '/workout/[id]', params: { id: item.id } })}
            />
          </View>
        )}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingLeft: 4, paddingRight: 8, paddingTop: 4 },
  iconButton: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  title: { flex: 1, fontSize: 22, fontWeight: '700' },
  list: { paddingHorizontal: 16, paddingBottom: 24, flexGrow: 1 },
  sectionLabel: { fontSize: 13, fontWeight: '500', paddingTop: 20, paddingBottom: 8 },
  rowWrap: { paddingHorizontal: 20 },
  rowFirst: { borderTopLeftRadius: 18, borderTopRightRadius: 18, paddingTop: 4 },
  rowLast: { borderBottomLeftRadius: 18, borderBottomRightRadius: 18, paddingBottom: 4 },
  message: { paddingTop: 48, alignItems: 'center', gap: 4 },
  messageText: { fontSize: 15 },
  messageBody: { fontSize: 12 },
  retry: { minHeight: 44, justifyContent: 'center' },
  retryText: { fontSize: 15, fontWeight: '500' },
  footer: { paddingVertical: 16 },
});
