import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { useThemeColor } from '@/hooks/use-theme-color';
import { getDefaultLogStatus, getUserGoals, saveUserGoals, setDefaultLogStatus } from '@/lib/storage';
import { syncToSupabase } from '@/lib/sync';
import { GOAL_FIELDS, mergeValidGoalFields, parseGoalInput, type GoalField, type GoalValues } from '@/lib/nutrition-settings';
import type { LogStatus, UserGoals } from '@/lib/types';

export type NutritionSectionHandle = { flush: () => Promise<boolean> };
type Props = { onGoalsChanged?: (goals: UserGoals) => void; onManageReminders: () => void };
const labels: Record<GoalField, string> = {
  calorie_goal: 'Calories', protein_goal: 'Protein (g)', carb_goal: 'Carbohydrates (g)', fat_goal: 'Fat (g)',
};
const toDraft = (goals: GoalValues): Record<GoalField, string> => ({
  calorie_goal: String(goals.calorie_goal), protein_goal: String(goals.protein_goal),
  carb_goal: String(goals.carb_goal), fat_goal: String(goals.fat_goal),
});

export const NutritionSection = forwardRef<NutritionSectionHandle, Props>(function NutritionSection({ onGoalsChanged, onManageReminders }, ref) {
  const text = useThemeColor({}, 'text');
  const muted = useThemeColor({}, 'icon');
  const tint = useThemeColor({}, 'tint');
  const card = useThemeColor({}, 'cardBackground');
  const subtle = useThemeColor({}, 'cardSecondary');
  const background = useThemeColor({}, 'background');
  const danger = useThemeColor({}, 'danger');
  const [draft, setDraft] = useState<Record<GoalField, string> | null>(null);
  const draftRef = useRef<Record<GoalField, string> | null>(null);
  const savedRef = useRef<GoalValues | null>(null);
  const [status, setStatus] = useState<LogStatus>('eaten');
  const statusRef = useRef<LogStatus>('eaten');
  const failedStatusRef = useRef<LogStatus | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const tail = useRef<Promise<boolean>>(Promise.resolve(true));
  const onGoalsChangedRef = useRef(onGoalsChanged);
  onGoalsChangedRef.current = onGoalsChanged;

  useEffect(() => {
    let active = true;
    Promise.all([getUserGoals(), getDefaultLogStatus()]).then(([goals, nextStatus]) => {
      if (!active) return;
      if (!goals) throw new Error('Goals unavailable');
      savedRef.current = goals;
      draftRef.current = toDraft(goals);
      setDraft(draftRef.current);
      statusRef.current = nextStatus;
      setStatus(nextStatus);
      setLoading(false);
    }).catch(() => {
      if (active) { setError('Couldn’t load settings.'); setLoading(false); }
    });
    return () => { active = false; if (timer.current) clearTimeout(timer.current); };
  }, []);

  const enqueue = (task: () => Promise<void>): Promise<boolean> => {
    const next = tail.current.catch(() => false).then(async () => {
      try { await task(); setError(''); return true; }
      catch { setError('Couldn’t save settings. Try again.'); return false; }
    });
    tail.current = next;
    return next;
  };

  const persistGoals = (): Promise<boolean> => {
    if (timer.current) { clearTimeout(timer.current); timer.current = null; }
    const current = draftRef.current;
    if (!current || !savedRef.current) return tail.current;
    const next = mergeValidGoalFields(savedRef.current, current);
    const fieldChanged = GOAL_FIELDS.some((field) => next[field] !== savedRef.current?.[field]);
    if (!fieldChanged) return tail.current.then(() => true);
    return enqueue(async () => {
      const base = savedRef.current;
      if (!base) return;
      const latest = mergeValidGoalFields(base, draftRef.current ?? current);
      if (GOAL_FIELDS.every((field) => latest[field] === base[field])) return;
      await saveUserGoals(latest);
      savedRef.current = latest;
      onGoalsChangedRef.current?.({ ...latest, updated_at: new Date().toISOString() });
      syncToSupabase();
    });
  };

  useImperativeHandle(ref, () => ({ flush: async () => {
    if (!savedRef.current) return true;
    await tail.current;
    const ok = await persistGoals();
    if (!ok && !failedStatusRef.current) return false;
    if (failedStatusRef.current) {
      const next = failedStatusRef.current;
      return enqueue(async () => {
        await setDefaultLogStatus(next);
        failedStatusRef.current = null;
        statusRef.current = next;
        setStatus(next);
      });
    }
    return ok;
  } }));

  const edit = (field: GoalField, value: string) => {
    const next = { ...(draftRef.current as Record<GoalField, string>), [field]: value };
    draftRef.current = next;
    setDraft(next);
    setError('');
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => { void persistGoals(); }, 300);
  };
  const selectStatus = (next: LogStatus) => {
    if (next === statusRef.current) return;
    statusRef.current = next;
    setStatus(next);
    void enqueue(async () => {
      try { await setDefaultLogStatus(next); failedStatusRef.current = null; }
      catch (e) {
        failedStatusRef.current = next;
        if (statusRef.current === next) {
          try { statusRef.current = await getDefaultLogStatus(); } catch { statusRef.current = next === 'eaten' ? 'planned' : 'eaten'; }
          setStatus(statusRef.current);
        }
        throw e;
      }
    });
  };

  if (loading) return <ActivityIndicator accessibilityLabel="Loading nutrition settings" color={tint} />;
  if (!draft) return <Pressable accessibilityRole="button" onPress={() => { setLoading(true); setError(''); Promise.all([getUserGoals(), getDefaultLogStatus()]).then(([goals, nextStatus]) => { if (!goals) throw new Error('Goals unavailable'); savedRef.current = goals; draftRef.current = toDraft(goals); setDraft(draftRef.current); statusRef.current = nextStatus; setStatus(nextStatus); setLoading(false); }).catch(() => { setError('Couldn’t load settings.'); setLoading(false); }); }}><Text style={{ color: danger }}>{error} Retry</Text></Pressable>;

  return <View style={styles.body}>
    <Text style={[styles.heading, { color: text }]}>Daily goals</Text>
    {GOAL_FIELDS.map((field) => {
      const invalid = parseGoalInput(draft[field]) === null;
      return <View key={field} style={styles.field}>
        <Text style={[styles.label, { color: text }]}>{labels[field]}</Text>
        <TextInput style={[styles.input, { color: text, backgroundColor: card, borderColor: invalid ? danger : subtle }]}
          value={draft[field]} onChangeText={(v) => edit(field, v)} onBlur={() => { void persistGoals(); }}
          keyboardType="number-pad" returnKeyType="done" onSubmitEditing={() => { void persistGoals(); }}
          accessibilityLabel={labels[field]} accessibilityHint={invalid ? 'Enter a positive whole number' : undefined} />
        {invalid ? <Text style={[styles.feedback, { color: danger }]}>Enter a positive whole number.</Text> : null}
      </View>;
    })}
    <Text style={[styles.heading, { color: text }]}>Default for new food</Text>
    <Text style={[styles.description, { color: muted }]}>Planned meals don’t count toward your daily totals until you mark them eaten.</Text>
    <View accessibilityRole="radiogroup" accessibilityLabel="Default for new food" style={[styles.statusRow, { backgroundColor: subtle }]}>
      {(['eaten', 'planned'] as const).map((option) => <Pressable key={option} accessibilityRole="radio" accessibilityState={{ selected: status === option }} onPress={() => selectStatus(option)} style={[styles.statusButton, status === option && { backgroundColor: tint }]}>
        <Text style={{ color: status === option ? background : text }}>{option === 'eaten' ? 'Eaten' : 'Planned'}</Text>
      </Pressable>)}
    </View>
    <Text style={[styles.heading, { color: text }]}>Meal reminders</Text>
    <Text style={[styles.description, { color: muted }]}>Set reminders in each meal’s settings.</Text>
    <Pressable accessibilityRole="button" onPress={onManageReminders} style={[styles.reminders, { backgroundColor: card }]}><Text style={{ color: tint }}>Manage meal reminders</Text></Pressable>
    {error ? <Text accessibilityRole="alert" style={[styles.feedback, { color: danger }]}>{error}</Text> : null}
  </View>;
});

const styles = StyleSheet.create({
  body: { gap: 8 }, heading: { fontSize: 18, fontWeight: '600', marginTop: 14 }, field: { gap: 4 },
  label: { fontSize: 14, fontWeight: '500' }, input: { minHeight: 44, borderWidth: 1, borderRadius: 10, paddingHorizontal: 14, fontSize: 16, fontVariant: ['tabular-nums'] },
  feedback: { fontSize: 12 }, description: { fontSize: 12, lineHeight: 17 }, statusRow: { flexDirection: 'row', alignSelf: 'flex-start', borderRadius: 20, padding: 3 },
  statusButton: { minHeight: 44, minWidth: 76, alignItems: 'center', justifyContent: 'center', borderRadius: 18 },
  reminders: { minHeight: 44, justifyContent: 'center', paddingHorizontal: 14, borderRadius: 10, marginTop: 3 },
});
