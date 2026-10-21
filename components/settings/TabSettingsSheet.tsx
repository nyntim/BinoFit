// Legacy compatibility exports. Production entry points use the shared /settings routes.
import { useRef, useState } from 'react';
import { Keyboard, KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useThemeColor } from '@/hooks/use-theme-color';
import { NutritionSection, type NutritionSectionHandle } from '@/components/settings/NutritionSection';
import { TrainingSection } from '@/components/settings/TrainingSection';
import type { UserGoals } from '@/lib/types';

type BaseProps = { visible: boolean; onClose: () => void };
type NutritionProps = BaseProps & { onGoalsChanged?: (goals: UserGoals) => void; onManageReminders: () => void };

function TabSettingsSheet({ visible, title, onClose, onBeforeClose, children }: BaseProps & { title: string; onBeforeClose?: () => Promise<boolean>; children: React.ReactNode }) {
  const background = useThemeColor({}, 'background');
  const text = useThemeColor({}, 'text');
  const tint = useThemeColor({}, 'tint');
  const backdrop = useThemeColor({}, 'text');
  const insets = useSafeAreaInsets();
  const [closing, setClosing] = useState(false);
  const requestClose = async () => {
    if (closing) return;
    Keyboard.dismiss();
    setClosing(true);
    try { if (!onBeforeClose || await onBeforeClose()) onClose(); }
    finally { setClosing(false); }
  };
  return <Modal visible={visible} transparent animationType="fade" onRequestClose={() => { void requestClose(); }}>
    {visible ? <View style={styles.overlay}>
      <Pressable accessibilityLabel="Dismiss settings" style={[StyleSheet.absoluteFill, { backgroundColor: backdrop, opacity: 0.45 }]} onPress={() => { if (Keyboard.isVisible()) Keyboard.dismiss(); else void requestClose(); }} />
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.avoider}>
        <View style={[styles.sheet, { backgroundColor: background, paddingBottom: Math.max(insets.bottom, 16) }]} accessibilityViewIsModal>
          <View style={styles.header}>
            <Text accessibilityRole="header" style={[styles.title, { color: text }]}>{title}</Text>
            <Pressable accessibilityRole="button" accessibilityLabel="Done" onPress={() => { void requestClose(); }} style={styles.close}>
              <Text style={[styles.done, { color: tint }]}>{closing ? 'Saving…' : 'Done'}</Text>
            </Pressable>
          </View>
          <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false} contentContainerStyle={styles.content}>{children}</ScrollView>
        </View>
      </KeyboardAvoidingView>
    </View> : null}
  </Modal>;
}

export function NutritionSettingsSheet({ visible, onClose, onGoalsChanged, onManageReminders }: NutritionProps) {
  const section = useRef<NutritionSectionHandle>(null);
  const manageReminders = async () => {
    Keyboard.dismiss();
    if (await section.current?.flush()) { onClose(); setTimeout(onManageReminders, 350); }
  };
  return <TabSettingsSheet visible={visible} title="Nutrition settings" onClose={onClose} onBeforeClose={() => section.current?.flush() ?? Promise.resolve(false)}>
    {visible ? <NutritionSection ref={section} onGoalsChanged={onGoalsChanged} onManageReminders={() => { void manageReminders(); }} /> : null}
  </TabSettingsSheet>;
}

export function TrainingSettingsSheet({ visible, onClose }: BaseProps) {
  const muted = useThemeColor({}, 'icon');
  return <TabSettingsSheet visible={visible} title="Training settings" onClose={onClose}>
    {visible ? <><TrainingSection /><Text style={[styles.rest, { color: muted }]}>Set rest time in each exercise’s options. Choose Off to disable it.</Text></> : null}
  </TabSettingsSheet>;
}

const styles = StyleSheet.create({
  overlay: { flex: 1, justifyContent: 'flex-end' }, avoider: { maxHeight: '90%' },
  sheet: { borderTopLeftRadius: 18, borderTopRightRadius: 18, paddingHorizontal: 20, paddingTop: 20, maxHeight: '100%' },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  title: { fontSize: 20, fontWeight: '600', flex: 1, flexShrink: 1, minWidth: 0 }, close: { minWidth: 44, minHeight: 44, flexShrink: 0, alignItems: 'center', justifyContent: 'center' },
  done: { fontSize: 16, fontWeight: '600' }, content: { paddingBottom: 16 }, rest: { fontSize: 13, lineHeight: 18 },
});
