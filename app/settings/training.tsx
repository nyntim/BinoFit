import { useCallback, useState } from 'react';
import { router, useFocusEffect } from 'expo-router';
import { Text } from 'react-native';
import { SettingsPage } from '@/components/settings/SettingsPage';
import { TrainingSection } from '@/components/settings/TrainingSection';
import { ThemedText } from '@/components/themed-text';
import { ListGroup, ListRow } from '@/components/ui/ListGroup';
import { usePreferences } from '@/hooks/usePreferences';
import { useThemeColor } from '@/hooks/use-theme-color';
import { getUserGoals } from '@/lib/storage';
import { normalizeVolumeTargets } from '@/lib/workouts/targets';

export default function TrainingSettings() {
  const danger = useThemeColor({}, 'danger');
  const { error, weightUnit } = usePreferences();
  const [targets, setTargets] = useState<string>('–');
  useFocusEffect(useCallback(() => {
    let active = true;
    getUserGoals().then((goals) => {
      if (!active) return;
      const count = Object.keys(normalizeVolumeTargets(goals?.weekly_volume_targets)).length;
      setTargets(count === 0 ? 'None' : count === 1 ? '1 target' : `${count} targets`);
    }).catch(() => { if (active) setTargets('–'); });
    return () => { active = false; };
  }, []));
  return <SettingsPage title="Training">
    <TrainingSection />
    <ListGroup>
      <ListRow title="Weekly volume targets" subtitle="Optional working sets per muscle region" trailing={targets} onPress={() => router.push('/settings/weekly-volume-targets')} />
      <ListRow title="Units" subtitle="Weight and distance display, in Preferences" trailing={weightUnit === 'lb' ? 'lb, mi' : 'kg, km'} onPress={() => router.push('/settings/preferences')} />
    </ListGroup>
    <ThemedText type="caption" style={{ paddingHorizontal: 4 }}>Set rest per exercise from its options in a workout. Choose No rest to skip it.</ThemedText>
    {error ? <Text accessibilityRole="alert" style={{ color: danger }}>{error}</Text> : null}
  </SettingsPage>;
}
