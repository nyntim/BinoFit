import { useState } from 'react';
import { Alert } from 'react-native';
import { router, useNavigation } from 'expo-router';
import { usePreventRemove } from 'expo-router/react-navigation';
import { SettingsPage } from '@/components/settings/SettingsPage';
import { NutritionSection } from '@/components/settings/NutritionSection';
export default function NutritionSettings() {
  const [dirty, setDirty] = useState(false);
  const navigation = useNavigation();
  usePreventRemove(dirty, ({ data }) => Alert.alert('Discard changes?', 'Your daily goals have not been saved.', [{ text: 'Keep editing', style: 'cancel' }, { text: 'Discard', style: 'destructive', onPress: () => navigation.dispatch(data.action) }]));
  return <SettingsPage title="Nutrition"><NutritionSection onDirtyChange={setDirty} onCancel={() => router.back()} onManageReminders={() => router.push({ pathname: '/(tabs)', params: { manageMeals: '1' } })} /></SettingsPage>;
}
