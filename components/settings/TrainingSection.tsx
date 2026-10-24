import { Switch, View } from 'react-native';
import { Card } from '@/components/ui/Card';
import { ListGroup, ListRow } from '@/components/ui/ListGroup';
import { SegmentedControl } from '@/components/ui/SegmentedControl';
import { Stepper } from '@/components/ui/Stepper';
import { ThemedText } from '@/components/themed-text';
import { useThemeColor } from '@/hooks/use-theme-color';
import { usePreferences } from '@/hooks/usePreferences';
import {
  getPreferences,
  setDefaultSetCount,
  setEffortMode,
  type EffortMode,
  setRestTimerEnabled,
} from '@/lib/app-preferences';
import { stopRestTimer } from '@/lib/workouts/rest-timer-store';
import { MAX_DEFAULT_SET_COUNT, MIN_DEFAULT_SET_COUNT } from '@/lib/workouts/prefill';

const SCALES: { value: EffortMode; label: string }[] = [
  { value: 'none', label: 'None' },
  { value: 'rir', label: 'RIR' },
  { value: 'rpe', label: 'RPE' },
];

const EFFORT_CAPTIONS: Record<EffortMode, string> = {
  none: 'Turn it on to add an effort column to each set.',
  rir: 'Adds a reps-in-reserve column to each set. Switching keeps the values you logged.',
  rpe: 'Adds a rate of perceived exertion column to each set. Switching keeps the values you logged.',
};

export function TrainingSection() {
  const { showEffort, effortMetric, restTimerEnabled, defaultSetCount } = usePreferences();
  const tint = useThemeColor({}, 'tint');
  const mode: EffortMode = showEffort ? effortMetric : 'none';

  return (
    <View style={{ gap: 12 }}>
      <Card style={{ gap: 12 }}>
        <ThemedText type="title">Effort per set</ThemedText>
        <SegmentedControl
          value={mode}
          options={SCALES}
          onChange={(next) => { void setEffortMode(next).catch(() => undefined); }}
          accessibilityLabel="Effort per set"
        />
        <ThemedText type="caption">{EFFORT_CAPTIONS[mode]}</ThemedText>
      </Card>

      <ListGroup>
        <ListRow
          title="Rest timer"
          subtitle="Counts down after each completed set and lets you know when rest is over."
          trailing={
            <Switch
              value={restTimerEnabled}
              onValueChange={(v) => {
                void setRestTimerEnabled(v)
                  .then(() => (v ? undefined : stopRestTimer()))
                  .catch(() => undefined);
              }}
              trackColor={{ true: tint }}
              accessibilityLabel="Rest timer"
            />
          }
        />
        <ListRow
          title="Default sets"
          subtitle="Added when an exercise has no previous sets."
          trailing={
            <Stepper
              value={defaultSetCount}
              valueLabel={`Default sets, ${defaultSetCount}`}
              decrementLabel="Fewer default sets"
              incrementLabel="More default sets"
              decrementDisabled={defaultSetCount <= MIN_DEFAULT_SET_COUNT}
              incrementDisabled={defaultSetCount >= MAX_DEFAULT_SET_COUNT}
              onDecrement={() => {
                const current = getPreferences().defaultSetCount;
                if (current > MIN_DEFAULT_SET_COUNT) void setDefaultSetCount(current - 1).catch(() => undefined);
              }}
              onIncrement={() => {
                const current = getPreferences().defaultSetCount;
                if (current < MAX_DEFAULT_SET_COUNT) void setDefaultSetCount(current + 1).catch(() => undefined);
              }}
            />
          }
        />
      </ListGroup>
    </View>
  );
}
