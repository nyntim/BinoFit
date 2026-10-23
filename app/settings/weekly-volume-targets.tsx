import { useCallback, useEffect, useRef, useState } from 'react';
import { Alert, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { router, useNavigation } from 'expo-router';
import { usePreventRemove } from 'expo-router/react-navigation';
import { SettingsPage } from '@/components/settings/SettingsPage';
import { useThemeColor } from '@/hooks/use-theme-color';
import { getUserGoals, saveWeeklyVolumeTargets } from '@/lib/storage';
import { syncToSupabase } from '@/lib/sync';
import { normalizeVolumeTargets, parseVolumeTarget, STARTER_TARGETS, TARGET_REGIONS } from '@/lib/workouts/targets';
import type { VolumeTargetRegion, WeeklyVolumeTargets } from '@/lib/types';

type Draft = Record<VolumeTargetRegion, string>;
export default function WeeklyVolumeTargetsSettings() {
  const [draft, setDraft] = useState<Draft | null>(null);
  const [baseline, setBaseline] = useState<Draft | null>(null);
  const [error, setError] = useState('');
  const [missing, setMissing] = useState(false);
  const [fields, setFields] = useState<Partial<Draft>>({});
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);
  const saving = useRef(false);
  const navigation = useNavigation();
  const text = useThemeColor({}, 'text');
  const tint = useThemeColor({}, 'tint');
  const card = useThemeColor({}, 'cardSecondary');
  const danger = useThemeColor({}, 'danger');
  const dirty = !!draft && JSON.stringify(draft) !== JSON.stringify(baseline);
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
  useEffect(() => { if (saved) router.back(); }, [saved]);
  async function save() {
    if (!draft || saving.current) return;
    const targets: WeeklyVolumeTargets = {}; const errors: Partial<Draft> = {};
    for (const region of TARGET_REGIONS) {
      try { const target = parseVolumeTarget(draft[region]); if (target !== null) targets[region] = target; }
      catch (e) { errors[region] = `${region}: ${(e as Error).message}`; }
    }
    setFields(errors); if (Object.keys(errors).length) return;
    saving.current = true; setBusy(true); setError('');
    try { await saveWeeklyVolumeTargets(targets); syncToSupabase(); setSaved(true); }
    catch { setError('Couldn’t save targets. Your changes are still here. Try again.'); }
    finally { saving.current = false; setBusy(false); }
  }
  return <SettingsPage title="Weekly volume targets">
    <Text style={{ color: text }}>Optional. Enter 1 to 40 sets. Leave blank or enter 0 to clear.</Text>
    {draft ? <>
      <Pressable accessibilityRole="button" disabled={busy} style={styles.action} onPress={() => setDraft(current => current ? Object.fromEntries(TARGET_REGIONS.map(region => [region, current[region].trim() === '' ? STARTER_TARGETS[region]?.toString() ?? '' : current[region]])) as Draft : current)}><Text style={{ color: tint }}>Use recommended</Text></Pressable>
      <Text style={{ color: text }}>Editable starting values for six regions. Other regions stay optional.</Text>
      {TARGET_REGIONS.map(region => <View key={region} style={styles.field}>
        <View style={styles.row}><Text style={[styles.label, { color: text }]}>{region}</Text><TextInput accessibilityLabel={`${region} weekly sets`} accessibilityHint="Optional whole sets from 1 to 40. Blank or zero clears." keyboardType="number-pad" editable={!busy} value={draft[region]} onChangeText={value => { setDraft({ ...draft, [region]: value }); setFields(current => ({ ...current, [region]: undefined })); }} style={[styles.input, { color: text, backgroundColor: card }]} /><Text style={{ color: text }}>sets / week</Text></View>
        {fields[region] ? <Text accessibilityRole="alert" style={{ color: danger }}>{fields[region]}</Text> : null}
      </View>)}
      <Pressable accessibilityRole="button" disabled={busy} style={styles.action} onPress={() => { void save(); }}><Text style={{ color: tint }}>{busy ? 'Saving…' : 'Save'}</Text></Pressable>
      <Pressable accessibilityRole="button" disabled={busy} style={styles.action} onPress={() => router.back()}><Text style={{ color: tint }}>Cancel</Text></Pressable>
    </> : error ? <Pressable accessibilityRole="button" style={styles.action} onPress={load}><Text style={{ color: tint }}>Retry loading targets</Text></Pressable> : <Text style={{ color: text }}>Loading targets…</Text>}
    {error ? <Text accessibilityRole="alert" style={{ color: danger }}>{error}</Text> : null}
    {missing ? <Pressable accessibilityRole="button" style={styles.action} onPress={() => router.push('/settings/nutrition')}><Text style={{ color: tint }}>Nutrition settings</Text></Pressable> : null}
  </SettingsPage>;
}
const styles = StyleSheet.create({
  action: { minHeight: 44, justifyContent: 'center' },
  field: { gap: 8 },
  row: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 8 },
  label: { flexGrow: 1, fontSize: 15 },
  input: { minHeight: 44, minWidth: 64, borderRadius: 8, padding: 8, fontSize: 15, fontVariant: ['tabular-nums'], textAlign: 'center' },
});
