import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { useThemeColor } from '@/hooks/use-theme-color';
import { getUserGoals, saveUserGoals } from '@/lib/storage';
import { syncToSupabase } from '@/lib/sync';
import { GOAL_FIELDS, parseGoalInput, type GoalField, type GoalValues } from '@/lib/nutrition-settings';
import type { UserGoals } from '@/lib/types';
export type NutritionSectionHandle = { flush: () => Promise<boolean> };
type Props = { onGoalsChanged?: (goals: UserGoals) => void; onManageReminders: () => void; onDirtyChange?: (dirty: boolean) => void; onCancel?: () => void };
const labels: Record<GoalField, string> = { calorie_goal: 'Calories', protein_goal: 'Protein (g)', carb_goal: 'Carbohydrates (g)', fat_goal: 'Fat (g)' };
const toDraft = (goals: GoalValues) => Object.fromEntries(GOAL_FIELDS.map(field => [field, String(goals[field])])) as Record<GoalField, string>;
export const NutritionSection = forwardRef<NutritionSectionHandle, Props>(function NutritionSection({ onGoalsChanged, onManageReminders, onDirtyChange, onCancel }, ref) {
  const text = useThemeColor({}, 'text'); const muted = useThemeColor({}, 'icon'); const tint = useThemeColor({}, 'tint'); const card = useThemeColor({}, 'cardBackground'); const danger = useThemeColor({}, 'danger');
  const [draft, setDraft] = useState<Record<GoalField, string> | null>(null);
  const [base, setBase] = useState<Record<GoalField, string> | null>(null);
  const [error, setError] = useState(''); const [loading, setLoading] = useState(true); const [busy, setBusy] = useState(false);
  const saving = useRef(false);
  const dirty = JSON.stringify(base) !== JSON.stringify(draft);
  useEffect(() => { onDirtyChange?.(dirty); }, [dirty, onDirtyChange]);
  const load = () => { setLoading(true); setError(''); getUserGoals().then((goals) => { if (!goals) throw new Error('Goals unavailable'); const next = toDraft(goals); setBase(next); setDraft(next); }).catch(() => setError('Couldn’t load settings. Try again.')).finally(() => setLoading(false)); };
  useEffect(load, []);
  const save = async (): Promise<boolean> => {
    if (!draft || saving.current) return false;
    const entries = GOAL_FIELDS.map(field => [field, parseGoalInput(draft[field])] as const);
    if (entries.some(([, value]) => value == null)) { setError('Enter a positive whole number for every goal.'); return false; }
    saving.current = true; setBusy(true); setError('');
    try { if (dirty) { const values = Object.fromEntries(entries) as GoalValues; await saveUserGoals(values); setBase({ ...draft }); onGoalsChanged?.({ ...values, updated_at: new Date().toISOString() }); syncToSupabase(); } return true; }
    catch { setError('Couldn’t save goals. Your changes are still here. Try again.'); return false; }
    finally { saving.current = false; setBusy(false); }
  };
  useImperativeHandle(ref, () => ({ flush: save }));
  const manage = () => { if (!dirty) onManageReminders(); else Alert.alert('Unsaved goals', 'Save your goals or discard changes before opening Meals.', [{ text: 'Keep editing', style: 'cancel' }, { text: 'Discard', style: 'destructive', onPress: () => { setDraft(base); onDirtyChange?.(false); onManageReminders(); } }, { text: 'Save', onPress: () => { void save().then(ok => { if (ok) onManageReminders(); }); } }]); };
  if (loading) return <ActivityIndicator accessibilityLabel="Loading nutrition settings" color={tint} />;
  if (!draft) return <Pressable accessibilityRole="button" onPress={load} style={{ minHeight: 44 }}><Text style={{ color: danger }}>{error} Retry</Text></Pressable>;
  return <View style={styles.body}><Text accessibilityRole="header" style={[styles.heading, { color: text }]}>Daily goals</Text>{GOAL_FIELDS.map(field => <View key={field} style={{ gap: 6 }}><Text style={{ color: text }}>{labels[field]}</Text><TextInput accessibilityLabel={labels[field]} value={draft[field]} editable={!busy} keyboardType="number-pad" onChangeText={value => setDraft({ ...draft, [field]: value })} style={[styles.input, { color: text, backgroundColor: card }]} /></View>)}<Pressable accessibilityRole="button" disabled={busy} onPress={() => { void save(); }} style={styles.button}><Text style={{ color: tint }}>{busy ? 'Saving…' : 'Save'}</Text></Pressable>{onCancel ? <Pressable accessibilityRole="button" disabled={busy} onPress={onCancel} style={styles.button}><Text style={{ color: tint }}>Cancel</Text></Pressable> : null}<Text accessibilityRole="header" style={[styles.heading, { color: text }]}>Meals</Text><Text style={{ color: muted }}>Manage meals, targets and meal reminders.</Text><Pressable disabled={busy} accessibilityRole="button" onPress={manage} style={styles.button}><Text style={{ color: tint }}>Manage meals and reminders</Text></Pressable>{error ? <Text accessibilityRole="alert" style={{ color: danger }}>{error}</Text> : null}</View>;
});
const styles = StyleSheet.create({ body: { gap: 12 }, heading: { fontSize: 17, fontWeight: '600', marginTop: 8 }, input: { minHeight: 44, borderRadius: 8, padding: 12, fontSize: 15, fontVariant: ['tabular-nums'] }, button: { minHeight: 44, justifyContent: 'center' } });
