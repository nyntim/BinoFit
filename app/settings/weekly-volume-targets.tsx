import { useCallback, useEffect, useRef, useState } from 'react';
import { Alert, StyleSheet, Text, View } from 'react-native';
import { router, useNavigation } from 'expo-router';
import { usePreventRemove } from 'expo-router/react-navigation';
import { SettingsPage } from '@/components/settings/SettingsPage';
import { ThemedText } from '@/components/themed-text';
import { Button } from '@/components/ui/Button';
import { ListGroup, ListRow } from '@/components/ui/ListGroup';
import { StickyFooter } from '@/components/ui/StickyFooter';
import { TextField } from '@/components/ui/TextField';
import { useThemeColor } from '@/hooks/use-theme-color';
import { getUserGoals, saveWeeklyVolumeTargets } from '@/lib/storage';
import { syncToSupabase } from '@/lib/sync';
import { getDoneWorkoutsBetween } from '@/lib/workouts/history';
import { setsPerMuscle, weekRange } from '@/lib/workouts/summary';
import { normalizeVolumeTargets, parseVolumeTarget, STARTER_TARGETS, TARGET_REGIONS } from '@/lib/workouts/targets';
import type { VolumeTargetRegion, WeeklyVolumeTargets } from '@/lib/types';

type Draft = Record<VolumeTargetRegion, string>;
export default function WeeklyVolumeTargetsSettings() {
  const [draft, setDraft] = useState<Draft | null>(null);
  const [baseline, setBaseline] = useState<Draft | null>(null);
  const [error, setError] = useState('');
  const [missing, setMissing] = useState(false);
  const [weekSets, setWeekSets] = useState<Partial<Record<VolumeTargetRegion, number>> | null>(null);
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);
  const saving = useRef(false);
  const navigation = useNavigation();
  const muted = useThemeColor({}, 'icon');
  const danger = useThemeColor({}, 'danger');
  const dirty = !!draft && JSON.stringify(draft) !== JSON.stringify(baseline);
  const invalid = (region: VolumeTargetRegion) => { if (!draft) return false; try { parseVolumeTarget(draft[region]); return false; } catch { return true; } };
  const invalidCount = draft ? TARGET_REGIONS.filter(invalid).length : 0;
  usePreventRemove((dirty || busy) && !saved, ({ data }) => {
    if (saving.current) return;
    Alert.alert('Discard changes?', 'Your weekly volume targets have not been saved.', [{ text: 'Keep editing', style: 'cancel' }, { text: 'Discard', style: 'destructive', onPress: () => navigation.dispatch(data.action) }]);
  });
  const load = useCallback(() => {
    setError(''); setMissing(false);
    getUserGoals().then(goals => {
      if (!goals || ![goals.calorie_goal, goals.protein_goal, goals.carb_goal, goals.fat_goal].every(Number.isFinite)) { setMissing(true); setError('Set up your daily goals in Nutrition settings first.'); return; }
      const targets = normalizeVolumeTargets(goals.weekly_volume_targets);
      const next = Object.fromEntries(TARGET_REGIONS.map(region => [region, targets[region]?.toString() ?? ''])) as Draft;
      setBaseline(next); setDraft(next);
    }).catch(() => setError('Couldn’t load targets. Try again.'));
  }, []);
  useEffect(() => { void Promise.resolve().then(load); }, [load]);
  // This week's sets are context only: a failed read leaves the column empty and never blocks the form
  useEffect(() => {
    let active = true;
    const range = weekRange(new Date());
    getDoneWorkoutsBetween(range.start, range.end)
      .then(workouts => { if (active) setWeekSets(Object.fromEntries(setsPerMuscle(workouts).map(row => [row.region, row.sets]))); })
      .catch(() => { if (active) setWeekSets(null); });
    return () => { active = false; };
  }, []);
  useEffect(() => { if (saved) router.back(); }, [saved]);
  async function save() {
    if (!draft || saving.current) return;
    const targets: WeeklyVolumeTargets = {};
    for (const region of TARGET_REGIONS) {
      try { const target = parseVolumeTarget(draft[region]); if (target !== null) targets[region] = target; }
      catch { return; }
    }
    saving.current = true; setBusy(true); setError('');
    try { await saveWeeklyVolumeTargets(targets); syncToSupabase(); setSaved(true); }
    catch { setError('Couldn’t save targets. Your changes are still here. Try again.'); }
    finally { saving.current = false; setBusy(false); }
  }
  const footer = draft ? <StickyFooter message={invalidCount > 0 ? `Fix ${invalidCount} ${invalidCount === 1 ? 'field' : 'fields'} to save` : null}>
    <View style={styles.footerButtons}>
      <Button variant="secondary" label="Cancel" disabled={busy} onPress={() => router.back()} />
      <Button label="Save" loading={busy} disabled={invalidCount > 0} onPress={() => { void save(); }} />
    </View>
  </StickyFooter> : undefined;
  return <SettingsPage title="Weekly volume targets" titleType="heading" footer={footer}>
    <ThemedText type="body" style={{ color: muted }}>Working sets per muscle each week. Optional: enter 1 to 40, or leave blank.</ThemedText>
    {draft ? <>
      <Button variant="soft" label="Use recommended" disabled={busy} onPress={() => setDraft(current => current ? Object.fromEntries(TARGET_REGIONS.map(region => [region, current[region].trim() === '' ? STARTER_TARGETS[region]?.toString() ?? '' : current[region]])) as Draft : current)} />
      <ListGroup>
        <View style={styles.header} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
          <ThemedText type="caption" style={styles.regionHeader}>Region</ThemedText>
          <ThemedText type="caption" style={styles.weekHeader}>This week</ThemedText>
          <ThemedText type="caption" style={styles.targetHeader}>Target</ThemedText>
        </View>
        {TARGET_REGIONS.map(region => {
          const done = weekSets ? weekSets[region] ?? 0 : null;
          return <ListRow key={region} title={region} trailing={<View style={styles.trailing}>
            <Text style={[styles.week, { color: muted }]} accessibilityLabel={done === null ? 'Sets this week unavailable' : `${done} sets this week`}>{done === null ? '–' : done}</Text>
            <TextField size="mini" placeholder="–" accessibilityLabel={`${region} weekly sets`} accessibilityHint="Optional whole sets from 1 to 40. Blank or zero clears." keyboardType="number-pad" editable={!busy} value={draft[region]} onChangeText={value => setDraft({ ...draft, [region]: value })} error={invalid(region) ? 'Enter 1 to 40 sets.' : null} containerStyle={styles.field} />
          </View>} />;
        })}
      </ListGroup>
    </> : error ? <Button variant="soft" label="Retry loading targets" onPress={load} /> : <ThemedText type="body">Loading targets…</ThemedText>}
    {error ? <Text accessibilityRole="alert" style={{ color: danger }}>{error}</Text> : null}
    {missing ? <Button variant="soft" label="Nutrition settings" onPress={() => router.push('/settings/nutrition')} /> : null}
  </SettingsPage>;
}
const styles = StyleSheet.create({
  footerButtons: { flexDirection: 'row', gap: 8 },
  header: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingVertical: 8 },
  regionHeader: { flex: 1 },
  weekHeader: { width: 64, textAlign: 'center' },
  targetHeader: { width: 76, textAlign: 'right' },
  trailing: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  week: { width: 64, textAlign: 'center', fontSize: 15, fontVariant: ['tabular-nums'] },
  field: { alignItems: 'flex-end', maxWidth: 160 },
});
