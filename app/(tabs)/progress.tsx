import { useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { AveragesCard } from '@/components/progress/AveragesCard';
import { CalorieTrendChart } from '@/components/progress/CalorieTrendChart';
import { ConsistencyCard } from '@/components/progress/ConsistencyCard';
import { ExpenditureCard } from '@/components/progress/ExpenditureCard';
import { RangeChips } from '@/components/progress/RangeChips';
import { RecentRecordsCard } from '@/components/progress/RecentRecordsCard';
import { WeightCard } from '@/components/progress/WeightCard';
import { WorkoutsChart } from '@/components/progress/WorkoutsChart';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { useThemeColor } from '@/hooks/use-theme-color';
import { useProgress } from '@/hooks/useProgress';
import type { ProgressRange } from '@/lib/progress';

export default function ProgressScreen() {
  const router = useRouter();
  const background = useThemeColor({}, 'background');
  const text = useThemeColor({}, 'text');
  const icon = useThemeColor({}, 'icon');
  const [range, setRange] = useState<ProgressRange>('7d');
  const [showWeight, setShowWeight] = useState(false);
  const progress = useProgress(range);

  const openDay = (date: string) => router.push({ pathname: '/day-detail', params: { date } });
  const calorieGoal = progress.goals?.calorie_goal ?? null;

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: background }]}>
      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        <Text style={[styles.title, { color: text }]} accessibilityRole="header">
          Progress
        </Text>
        {progress.nothingEver && !progress.loading ? (
          <View style={styles.firstRun}>
            <IconSymbol name="chart.bar.fill" size={32} color={icon} />
            <Text style={[styles.firstRunTitle, { color: text }]}>Nothing logged yet</Text>
            <Text style={[styles.firstRunBody, { color: icon }]}>
              Calorie, macro, weight and workout trends show here after your first log.
            </Text>
          </View>
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
            <WeightCard range={range} today={progress.today} />
            <ExpenditureCard />
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
            <ConsistencyCard
              summary={progress.summary}
              streaks={progress.streaks}
              loggedDates={progress.loggedDates}
              trainedDates={progress.trainedDates}
              today={progress.today}
              onDayPress={openDay}
            />
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  scroll: { paddingHorizontal: 16, paddingTop: 24, paddingBottom: 32, gap: 14, flexGrow: 1 },
  title: { fontSize: 22, fontWeight: '700', lineHeight: 26 },
  firstRun: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 8, paddingHorizontal: 24 },
  firstRunTitle: { fontSize: 17, fontWeight: '600', lineHeight: 22, textAlign: 'center' },
  firstRunBody: { fontSize: 15, lineHeight: 22, textAlign: 'center' },
});
