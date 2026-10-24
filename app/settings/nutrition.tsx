import { useCallback, useMemo, useRef, useState } from 'react';
import { Alert } from 'react-native';
import { router, useNavigation } from 'expo-router';
import { usePreventRemove } from 'expo-router/react-navigation';
import { format } from 'date-fns';
import { SettingsPage } from '@/components/settings/SettingsPage';
import { NutritionSection, type NutritionFormState, type NutritionSectionHandle } from '@/components/settings/NutritionSection';
import { Button } from '@/components/ui/Button';
import { StickyFooter } from '@/components/ui/StickyFooter';
import { useMealDefinitions } from '@/hooks/useMealDefinitions';
import { mealSettingsDetail, mealSettingsRows } from '@/lib/settings-summaries';

export default function NutritionSettings() {
  const [dirty, setDirty] = useState(false);
  const [form, setForm] = useState<NutritionFormState>({ dirty: false, busy: false, invalidCount: 0, error: '' });
  const [saved, setSaved] = useState(false);
  const section = useRef<NutritionSectionHandle>(null);
  const navigation = useNavigation();
  const { defs, names } = useMealDefinitions();
  const mealRows = useMemo(
    () => mealSettingsRows(defs, names, format(new Date(), 'yyyy-MM-dd')).map(row => ({ id: row.id, name: row.name, detail: mealSettingsDetail(row) })),
    [defs, names],
  );
  usePreventRemove(dirty, ({ data }) => Alert.alert('Discard changes?', 'Your daily goals have not been saved.', [{ text: 'Keep editing', style: 'cancel' }, { text: 'Discard', style: 'destructive', onPress: () => navigation.dispatch(data.action) }]));
  const onFormStateChange = useCallback((next: NutritionFormState) => { setForm(next); if (next.dirty) setSaved(false); }, []);
  const save = async () => { if (await section.current?.flush()) setSaved(true); };
  const message = form.invalidCount > 0 ? `Fix ${form.invalidCount} ${form.invalidCount === 1 ? 'field' : 'fields'} to save` : form.error || (saved ? 'Goals saved' : null);
  const footer = (
    <StickyFooter message={message} messageTone={form.invalidCount > 0 || form.error ? 'error' : 'muted'}>
      <Button label="Save goals" loading={form.busy} disabled={form.invalidCount > 0} onPress={() => { void save(); }} />
    </StickyFooter>
  );
  return <SettingsPage title="Nutrition" footer={footer}><NutritionSection ref={section} actions="none" mealRows={mealRows} onDirtyChange={setDirty} onFormStateChange={onFormStateChange} onManageReminders={() => router.push({ pathname: '/(tabs)', params: { manageMeals: '1' } })} /></SettingsPage>;
}
