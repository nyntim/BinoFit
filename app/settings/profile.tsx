import { useCallback, useEffect, useRef, useState } from 'react';
import { Alert, StyleSheet, Text, View } from 'react-native';
import { router, useNavigation } from 'expo-router';
import { usePreventRemove } from 'expo-router/react-navigation';
import { SettingsPage } from '@/components/settings/SettingsPage';
import { ThemedText } from '@/components/themed-text';
import { Button } from '@/components/ui/Button';
import { ListGroup, ListRow } from '@/components/ui/ListGroup';
import { TextField } from '@/components/ui/TextField';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { useThemeColor } from '@/hooks/use-theme-color';
import { usePreferences } from '@/hooks/usePreferences';
import { getUserProfile, saveUserProfile } from '@/lib/storage';
import { getLatestWeightEntry, saveWeightEntry } from '@/lib/weight';
import { ACTIVITY_DESCRIPTIONS, ACTIVITY_LABELS, ACTIVITY_OPTIONS, profileDraft, validateProfileDraft, type ProfileDraft } from '@/lib/profile-settings';
import { syncToSupabase } from '@/lib/sync';
export default function ProfileSettings() {
  const { weightUnit } = usePreferences();
  const [unit] = useState(weightUnit);
  const [draft, setDraft] = useState<ProfileDraft | null>(null);
  const [baseline, setBaseline] = useState<ProfileDraft | null>(null);
  const base = useRef<ProfileDraft | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const saving = useRef(false);
  const [saved, setSaved] = useState(false);
  const navigation = useNavigation();
  const tint = useThemeColor({}, 'tint'); const danger = useThemeColor({}, 'danger');
  const dirty = !!draft && JSON.stringify(draft) !== JSON.stringify(baseline);
  usePreventRemove((dirty || busy) && !saved, ({ data }) => {
    if (saving.current) return;
    Alert.alert('Discard changes?', 'Your personal stats have not been saved.', [{ text: 'Keep editing', style: 'cancel' }, { text: 'Discard', style: 'destructive', onPress: () => navigation.dispatch(data.action) }]);
  });
  const load = useCallback(() => { setError(''); Promise.all([getUserProfile(), getLatestWeightEntry()]).then(([profile, entry]) => { const next = profileDraft(profile, entry?.weight_kg ?? profile?.weight ?? null, unit); base.current = next; setBaseline(next); setDraft(next); }).catch(() => setError('Couldn’t load profile. Try again.')); }, [unit]);
  useEffect(() => { void Promise.resolve().then(load); }, [load]);
  useEffect(() => { if (saved) router.back(); }, [saved]);
  async function save() {
    if (!draft || !base.current || saving.current) return;
    let values: ReturnType<typeof validateProfileDraft>;
    try { values = validateProfileDraft(draft, base.current, unit); } catch (e) { setError((e as Error).message); return; }
    saving.current = true; setBusy(true); setError('');
    try {
      if (values.weightChanged && values.weightKg != null) {
        await saveWeightEntry({ weight_kg: values.weightKg });
        // Do not repeat a completed weigh-in if a subsequent profile write fails.
        base.current = { ...base.current, weight: draft.weight };
        setBaseline(base.current);
      }
      const [current, entry] = await Promise.all([getUserProfile(), getLatestWeightEntry()]);
      await saveUserProfile({ weight: entry?.weight_kg ?? (values.weightChanged && values.weightKg == null ? null : current?.weight ?? null), height: values.heightChanged ? values.heightCm : current?.height ?? null, activity_level: draft.activity === base.current.activity ? current?.activity_level ?? null : values.activity });
      syncToSupabase(); setSaved(true);
    } catch { setError('Couldn’t save profile. Your changes are still here. Try again.'); }
    finally { saving.current = false; setBusy(false); }
  }
  function field(key: 'weight' | 'height' | 'feet' | 'inches', label: string, suffix: string) { return <TextField size="mini" suffix={suffix} accessibilityLabel={label} value={draft?.[key] ?? ''} editable={!busy} keyboardType="decimal-pad" onChangeText={value => setDraft(current => current ? { ...current, [key]: value } : current)} />; }
  const heightFields = unit === 'kg' ? field('height', 'Height (cm)', 'cm') : <>{field('feet', 'Height (feet)', 'ft')}{field('inches', 'Height (inches)', 'in')}</>;
  const saveButton = draft ? <Button variant="ghost" size="sm" label={busy ? 'Saving…' : 'Save'} disabled={busy} onPress={() => { void save(); }} /> : null;
  return <SettingsPage title="Profile" trailing={saveButton}>{draft ? <>
    <ThemedText type="section" accessibilityRole="header">Body</ThemedText>
    <ListGroup>
      <ListRow title="Weight" trailing={<View style={styles.fields}>{field('weight', `Weight (${unit})`, unit)}</View>} />
      <ListRow title="Height" trailing={<View style={styles.fields}>{heightFields}</View>} />
    </ListGroup>
    <ThemedText type="caption" style={styles.caption}>Weight comes from your latest entry. Changing it here logs today&apos;s weight.</ThemedText>
    <ThemedText type="section" accessibilityRole="header">Activity level</ThemedText>
    <View accessibilityRole="radiogroup" accessibilityLabel="Activity level">
      <ListGroup>
        {ACTIVITY_OPTIONS.map(activity => {
          const selected = draft.activity === activity;
          return <ListRow key={activity} title={ACTIVITY_LABELS[activity]} subtitle={ACTIVITY_DESCRIPTIONS[activity]} chevron={false} disabled={busy} accessibilityRole="radio" accessibilityState={{ selected, checked: selected }} onPress={() => setDraft({ ...draft, activity })} trailing={selected ? <IconSymbol name="checkmark" size={18} color={tint} /> : undefined} />;
        })}
      </ListGroup>
    </View>
  </> : error ? <Button variant="soft" label="Retry loading profile" onPress={load} /> : <ThemedText type="body">Loading profile…</ThemedText>}{error ? <Text accessibilityRole="alert" style={{ color: danger }}>{error}</Text> : null}</SettingsPage>;
}
const styles = StyleSheet.create({ fields: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'flex-end', gap: 8, flexShrink: 1 }, caption: { paddingHorizontal: 4 } });
