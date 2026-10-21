import { useCallback, useEffect, useRef, useState } from 'react';
import { Alert, Pressable, Text, TextInput, View } from 'react-native';
import { router, useNavigation } from 'expo-router';
import { usePreventRemove } from 'expo-router/react-navigation';
import { SettingsPage } from '@/components/settings/SettingsPage';
import { useThemeColor } from '@/hooks/use-theme-color';
import { usePreferences } from '@/hooks/usePreferences';
import { getUserProfile, saveUserProfile } from '@/lib/storage';
import { getLatestWeightEntry, saveWeightEntry } from '@/lib/weight';
import { ACTIVITY_OPTIONS, profileDraft, validateProfileDraft, type ProfileDraft } from '@/lib/profile-settings';
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
  const text = useThemeColor({}, 'text'); const card = useThemeColor({}, 'cardBackground'); const tint = useThemeColor({}, 'tint'); const danger = useThemeColor({}, 'danger');
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
  function field(key: 'weight' | 'height' | 'feet' | 'inches', label: string) { return <View style={{ gap: 6 }}><Text style={{ color: text }}>{label}</Text><TextInput accessibilityLabel={label} value={draft?.[key] ?? ''} editable={!busy} keyboardType="decimal-pad" onChangeText={value => setDraft(current => current ? { ...current, [key]: value } : current)} style={{ minHeight: 44, padding: 12, borderRadius: 8, color: text, backgroundColor: card, fontSize: 15 }} /></View>; }
  return <SettingsPage title="Profile">{draft ? <>{field('weight', `Weight (${unit})`)}{unit === 'kg' ? field('height', 'Height (cm)') : <>{field('feet', 'Height (feet)')}{field('inches', 'Height (inches)')}</>}<Text style={{ color: text }}>Activity level</Text><View accessibilityRole="radiogroup" accessibilityLabel="Activity level" style={{ gap: 8 }}>{ACTIVITY_OPTIONS.map(activity => <Pressable key={activity} disabled={busy} accessibilityRole="radio" accessibilityState={{ selected: draft.activity === activity }} onPress={() => setDraft({ ...draft, activity })} style={{ minHeight: 44, padding: 12, borderRadius: 8, backgroundColor: card }}><Text style={{ color: draft.activity === activity ? tint : text }}>{activity === 'very_active' ? 'Very active' : activity.charAt(0).toUpperCase() + activity.slice(1)}{draft.activity === activity ? ' · Selected' : ''}</Text></Pressable>)}</View><Pressable disabled={busy} accessibilityRole="button" onPress={() => { void save(); }} style={{ minHeight: 44, justifyContent: 'center' }}><Text style={{ color: tint }}>{busy ? 'Saving…' : 'Save'}</Text></Pressable><Pressable disabled={busy} accessibilityRole="button" onPress={() => router.back()} style={{ minHeight: 44, justifyContent: 'center' }}><Text style={{ color: tint }}>Cancel</Text></Pressable></> : <Pressable onPress={load} style={{ minHeight: 44 }}><Text style={{ color: tint }}>{error ? 'Retry loading profile' : 'Loading profile…'}</Text></Pressable>}{error ? <Text accessibilityRole="alert" style={{ color: danger }}>{error}</Text> : null}</SettingsPage>;
}
