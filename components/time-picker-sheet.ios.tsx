import { useState } from 'react';
import { Modal, Pressable, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import DateTimePicker from '@react-native-community/datetimepicker';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { useThemeColor } from '@/hooks/use-theme-color';
import type { TimePickerSheetProps } from '@/components/time-picker-sheet.types';

// Native iOS time or date wheel in a bottom sheet; the time applies on Done
export function TimePickerSheet({ visible, value, onChange, onClose, colors, mode = 'time', maximumDate, title }: TimePickerSheetProps) {
  const overlay = useThemeColor({}, 'overlay');
  const { bottom } = useSafeAreaInsets();
  const scheme = useColorScheme() ?? 'light';
  const [draft, setDraft] = useState(value);

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onShow={() => setDraft(value)}
      onRequestClose={onClose}
    >
      <View style={[styles.overlay, { backgroundColor: overlay }]}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} accessibilityLabel={mode === 'date' ? 'Close date picker' : 'Close time picker'} />
        <View style={[styles.sheet, { backgroundColor: colors.cardBackground, paddingBottom: 24 + bottom }]}>
          <Text style={[styles.title, { color: colors.text }]}>{title ?? (mode === 'date' ? 'Date' : 'Time')}</Text>
          <DateTimePicker
            value={draft}
            mode={mode}
            maximumDate={maximumDate}
            display="spinner"
            themeVariant={scheme}
            textColor={colors.text}
            onChange={(_, d) => {
              if (d) setDraft(d);
            }}
          />
          <TouchableOpacity
            style={[styles.doneBtn, { backgroundColor: colors.tint }]}
            onPress={() => {
              onChange(draft);
              onClose();
            }}
            accessibilityRole="button"
          >
            <Text style={[styles.doneText, { color: colors.background }]}>Done</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: { flex: 1, justifyContent: 'flex-end' },
  sheet: { padding: 20, borderTopLeftRadius: 20, borderTopRightRadius: 20 },
  title: { fontSize: 16, fontWeight: '600', textAlign: 'center', marginBottom: 4 },
  doneBtn: { borderRadius: 12, paddingVertical: 15, alignItems: 'center', marginTop: 8 },
  doneText: { fontSize: 16, fontWeight: '600' },
});
