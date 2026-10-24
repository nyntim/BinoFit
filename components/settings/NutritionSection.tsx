import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, StyleSheet, Text, View } from 'react-native';
import { ThemedText } from '@/components/themed-text';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { ListGroup, ListRow } from '@/components/ui/ListGroup';
import { TextField } from '@/components/ui/TextField';
import { MacroColors } from '@/constants/theme';
import { useThemeColor } from '@/hooks/use-theme-color';
import { getUserGoals, saveUserGoals } from '@/lib/storage';
import { syncToSupabase } from '@/lib/sync';
import { GOAL_FIELDS, parseGoalInput, type GoalField, type GoalValues } from '@/lib/nutrition-settings';
import { macroEnergyShares } from '@/lib/settings-summaries';
import type { UserGoals } from '@/lib/types';

export type NutritionSectionHandle = { flush: () => Promise<boolean> };
export type NutritionFormState = { dirty: boolean; busy: boolean; invalidCount: number; error: string };
export type NutritionMealRow = { id: string; name: string; detail: string };

type Props = {
  onGoalsChanged?: (goals: UserGoals) => void;
  onManageReminders: () => void;
  onDirtyChange?: (dirty: boolean) => void;
  /** `none` leaves saving to the caller, which calls `flush()` (the route's sticky footer). */
  actions?: 'inline' | 'none';
  onFormStateChange?: (state: NutritionFormState) => void;
  /** Active meals with a one-line detail, shown above "Manage meals and reminders". */
  mealRows?: NutritionMealRow[];
};

const MACROS = [
  { field: 'protein_goal', name: 'Protein', color: MacroColors.protein },
  { field: 'carb_goal', name: 'Carbs', color: MacroColors.carbs },
  { field: 'fat_goal', name: 'Fat', color: MacroColors.fat },
] as const;

const toDraft = (goals: GoalValues) => Object.fromEntries(GOAL_FIELDS.map(field => [field, String(goals[field])])) as Record<GoalField, string>;
const fieldError = (field: GoalField, value: string) => parseGoalInput(value) !== null ? null : `Enter a whole number, like ${field === 'calorie_goal' ? '2000' : '250'}.`;

export const NutritionSection = forwardRef<NutritionSectionHandle, Props>(function NutritionSection({ onGoalsChanged, onManageReminders, onDirtyChange, actions = 'inline', onFormStateChange, mealRows }, ref) {
  const tint = useThemeColor({}, 'tint');
  const danger = useThemeColor({}, 'danger');
  const separator = useThemeColor({}, 'separator');
  const [draft, setDraft] = useState<Record<GoalField, string> | null>(null);
  const [base, setBase] = useState<Record<GoalField, string> | null>(null);
  const [error, setError] = useState(''); const [loading, setLoading] = useState(true); const [busy, setBusy] = useState(false);
  const saving = useRef(false);
  const dirty = JSON.stringify(base) !== JSON.stringify(draft);
  const invalidCount = draft ? GOAL_FIELDS.filter(field => fieldError(field, draft[field])).length : 0;
  useEffect(() => { onDirtyChange?.(dirty); }, [dirty, onDirtyChange]);
  const formState = useRef(onFormStateChange);
  formState.current = onFormStateChange;
  useEffect(() => { formState.current?.({ dirty, busy, invalidCount, error }); }, [dirty, busy, invalidCount, error]);
  const load = () => { setLoading(true); setError(''); getUserGoals().then((goals) => { if (!goals) throw new Error('Goals unavailable'); const next = toDraft(goals); setBase(next); setDraft(next); }).catch(() => setError('Couldn’t load settings. Try again.')).finally(() => setLoading(false)); };
  useEffect(load, []);
  const save = async (): Promise<boolean> => {
    if (!draft || saving.current) return false;
    const entries = GOAL_FIELDS.map(field => [field, parseGoalInput(draft[field])] as const);
    if (entries.some(([, value]) => value == null)) { if (actions === 'inline') setError('Fix the highlighted fields to save.'); return false; }
    saving.current = true; setBusy(true); setError('');
    try { if (dirty) { const values = Object.fromEntries(entries) as GoalValues; await saveUserGoals(values); setBase({ ...draft }); onGoalsChanged?.({ ...values, updated_at: new Date().toISOString() }); syncToSupabase(); } return true; }
    catch { setError('Couldn’t save goals. Your changes are still here. Try again.'); return false; }
    finally { saving.current = false; setBusy(false); }
  };
  useImperativeHandle(ref, () => ({ flush: save }));
  const manage = () => { if (!dirty) onManageReminders(); else Alert.alert('Unsaved goals', 'Save your goals or discard changes before opening Meals.', [{ text: 'Keep editing', style: 'cancel' }, { text: 'Discard', style: 'destructive', onPress: () => { setDraft(base); onDirtyChange?.(false); onManageReminders(); } }, { text: 'Save', onPress: () => { void save().then(ok => { if (ok) onManageReminders(); }); } }]); };
  if (loading) return <ActivityIndicator accessibilityLabel="Loading nutrition settings" color={tint} />;
  if (!draft) return <Pressable accessibilityRole="button" onPress={load} style={styles.retry}><Text style={{ color: danger }}>{error} Retry</Text></Pressable>;

  const shares = macroEnergyShares(draft);
  const segments = MACROS.filter(({ field }) => shares[field].kcal !== null);
  const splitLabel = segments.some(({ field }) => shares[field].percent !== null)
    ? `Energy split: ${segments.filter(({ field }) => shares[field].percent !== null).map(({ field, name }) => `${name} ${shares[field].percent}%`).join(', ')} of calories`
    : null;
  const set = (field: GoalField) => (value: string) => setDraft(current => current ? { ...current, [field]: value } : current);

  return <View style={styles.body}>
    <ThemedText type="section" accessibilityRole="header">Daily goals</ThemedText>
    <Card style={styles.card}>
      <TextField size="big" label="Calories" suffix="cal" value={draft.calorie_goal} editable={!busy} keyboardType="number-pad" onChangeText={set('calorie_goal')} error={fieldError('calorie_goal', draft.calorie_goal)} />
      <View style={[styles.separator, { backgroundColor: separator }]} />
      {MACROS.map(({ field, name, color }) => {
        const percent = shares[field].percent;
        return <View key={field} style={styles.macro}>
          <View style={styles.macroLabel}>
            <View style={[styles.dot, { backgroundColor: color }]} />
            <ThemedText type="title">{name}</ThemedText>
            <ThemedText type="caption" style={styles.tabular}>{percent === null ? '–' : `${percent}%`}</ThemedText>
          </View>
          <TextField size="mini" suffix="g" accessibilityLabel={`${name} (g)`} value={draft[field]} editable={!busy} keyboardType="number-pad" onChangeText={set(field)} error={fieldError(field, draft[field])} containerStyle={styles.macroField} />
        </View>;
      })}
      {splitLabel ? <View accessible accessibilityRole="image" accessibilityLabel={splitLabel} style={styles.split}>
        {segments.map(({ field, color }) => <View key={field} style={{ flex: shares[field].kcal ?? 0, backgroundColor: color, borderRadius: 4 }} />)}
      </View> : null}
    </Card>
    {actions === 'inline' ? <Button label="Save goals" size="lg" loading={busy} disabled={invalidCount > 0} onPress={() => { void save(); }} /> : null}
    {error && actions === 'inline' ? <Text accessibilityRole="alert" style={{ color: danger }}>{error}</Text> : null}
    <ThemedText type="section" accessibilityRole="header">Meals</ThemedText>
    <ListGroup>
      {(mealRows ?? []).map(row => <ListRow key={row.id} title={row.name} trailing={row.detail} />)}
      <ListRow title="Manage meals and reminders" onPress={manage} disabled={busy} />
    </ListGroup>
    <ThemedText type="caption" style={styles.caption}>Rename, reorder and set per-meal targets. The default for new food lives on the Nutrition tab.</ThemedText>
  </View>;
});
const styles = StyleSheet.create({
  body: { gap: 12 },
  card: { gap: 14 },
  separator: { height: StyleSheet.hairlineWidth },
  macro: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  macroLabel: { flexDirection: 'row', alignItems: 'center', gap: 8, flexShrink: 1 },
  macroField: { alignItems: 'flex-end', maxWidth: 220, marginLeft: 'auto' },
  dot: { width: 10, height: 10, borderRadius: 5 },
  tabular: { fontVariant: ['tabular-nums'] },
  split: { flexDirection: 'row', height: 8, gap: 3 },
  caption: { paddingHorizontal: 4 },
  retry: { minHeight: 44, justifyContent: 'center' },
});
