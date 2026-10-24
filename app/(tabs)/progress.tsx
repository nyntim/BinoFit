import { useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTabBarInset, useTabBarInsetMode } from '@/context/TabBarInsetContext';
import { useRouter } from 'expo-router';
import { AveragesCard } from '@/components/progress/AveragesCard';
import { CalorieTrendChart } from '@/components/progress/CalorieTrendChart';
import { ConsistencyCard } from '@/components/progress/ConsistencyCard';
import { ExpenditureCard } from '@/components/progress/ExpenditureCard';
import { RangeChips } from '@/components/progress/RangeChips';
import { RecentRecordsCard } from '@/components/progress/RecentRecordsCard';
import { WeightCard } from '@/components/progress/WeightCard';
import { WorkoutsChart } from '@/components/progress/WorkoutsChart';
import { ThemedText } from '@/components/themed-text';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { EmptyState } from '@/components/ui/EmptyState';
import { useThemeColor } from '@/hooks/use-theme-color';
import { useProgress } from '@/hooks/useProgress';
import type { ProgressRange } from '@/lib/progress';
import { homeRouteFor } from '@/lib/tracking-mode';

// Decorative bar heights (percent) for the first-run preview; not data
const PREVIEW_BARS = [45, 70, 55, 85, 60, 75, 50];

export default function ProgressScreen() {
  const tabBarInset = useTabBarInset();
  const nativeTabInsets = useTabBarInsetMode() === 'automatic';
  const router = useRouter();
  const background = useThemeColor({}, 'background');
  const track = useThemeColor({}, 'track');
  const [range, setRange] = useState<ProgressRange>('7d');
  const [showWeight, setShowWeight] = useState(false);
  const progress = useProgress(range);

  const openDay = (date: string) => router.push({ pathname: '/day-detail', params: { date } });
  const calorieGoal = progress.goals?.calorie_goal ?? null;

  return (
    <SafeAreaView edges={['top']} style={[styles.container, { backgroundColor: background }]}>
      <ScrollView contentContainerStyle={[styles.scroll, { paddingBottom: 32 + tabBarInset }]} contentInsetAdjustmentBehavior={nativeTabInsets ? 'automatic' : undefined} scrollIndicatorInsets={nativeTabInsets ? undefined : { bottom: tabBarInset }} showsVerticalScrollIndicator={false}>
        <ThemedText type="largeTitle" accessibilityRole="header">
          Progress
        </ThemedText>
        {progress.nothingEver && !progress.loading ? (
          <>
            <EmptyState
              variant="card"
              title="Your trends start here"
              body="Log a few days of food or a workout and this page fills in. Weekly patterns show after 7 days."
              actions={
                <>
                  <Button size="lg" variant="primary" label="Log food" onPress={() => router.navigate(homeRouteFor())} />
                  <Button size="lg" variant="secondary" label="Start a workout" onPress={() => router.push('/workout/session')} />
                </>
              }
            />
            <Card style={styles.preview} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
              <ThemedText type="label" style={styles.previewLabel}>
                Calories, daily average
              </ThemedText>
              <View style={styles.previewBars}>
                {PREVIEW_BARS.map((h, i) => (
                  <View key={i} style={[styles.previewBar, { height: `${h}%`, backgroundColor: track }]} />
                ))}
              </View>
              <ThemedText type="caption">No average yet</ThemedText>
            </Card>
          </>
        ) : (
          <>
            <RangeChips value={range} onChange={setRange} />
            <CalorieTrendChart
              key={range}
              range={progress.loadedRange ?? range}
              unit={progress.unit}
              buckets={progress.buckets}
              summary={progress.summary}
              calorieGoal={calorieGoal}
              rangeStart={progress.bounds.start}
              onOpenDay={openDay}
              showWeight={showWeight}
              onToggleWeight={setShowWeight}
              trend={progress.trend}
              weeklyRateKg={progress.weeklyRateKg}
            />
            <AveragesCard avg={progress.summary.avg} goals={progress.goals} />
            <ConsistencyCard
              summary={progress.summary}
              streaks={progress.streaks}
              loggedDates={progress.loggedDates}
              trainedDates={progress.trainedDates}
              today={progress.today}
              rangeStart={progress.bounds.start}
              onDayPress={openDay}
            />
            <ExpenditureCard />
            <WeightCard range={range} today={progress.today} />
            <WorkoutsChart
              key={`workouts-${range}`}
              range={progress.loadedRange ?? range}
              unit={progress.trainingUnit}
              buckets={progress.workoutBuckets}
              averages={progress.workoutAverages}
              rangeStart={progress.trainingBounds.start}
            />
            <RecentRecordsCard
              records={progress.records}
              onPressRecord={(id) => router.push({ pathname: '/workout/[id]', params: { id } })}
            />
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  scroll: { paddingHorizontal: 16, paddingTop: 8, paddingBottom: 32, gap: 14, flexGrow: 1 },
  preview: { opacity: 0.55, gap: 10 },
  previewLabel: { fontWeight: '600' },
  previewBars: { height: 80, flexDirection: 'row', alignItems: 'flex-end', gap: 8 },
  previewBar: { flex: 1, borderRadius: 4 },
});
