import { useState } from 'react';
import { Modal, Pressable, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { TimePickerSheetProps } from '@/components/time-picker-sheet.types';

// Web fallback: the native time picker module has no web implementation
export function TimePickerSheet({ visible, value, onChange, onClose, colors, title }: TimePickerSheetProps) {
  const { bottom } = useSafeAreaInsets();
  const [hour, setHour] = useState(value.getHours() % 12 || 12);
  const [minute, setMinute] = useState(value.getMinutes());
  const [isPM, setIsPM] = useState(value.getHours() >= 12);

  const reset = () => {
    setHour(value.getHours() % 12 || 12);
    setMinute(value.getMinutes());
    setIsPM(value.getHours() >= 12);
  };

  const apply = () => {
    const h24 = isPM ? (hour === 12 ? 12 : hour + 12) : hour === 12 ? 0 : hour;
    const d = new Date(value);
    d.setHours(h24, minute, 0, 0);
    onChange(d);
    onClose();
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onShow={reset} onRequestClose={onClose}>
      <View style={styles.overlay}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
        <View style={[styles.sheet, { backgroundColor: colors.cardBackground, paddingBottom: 24 + bottom }]}>
          <Text style={[styles.title, { color: colors.text }]}>{title ?? 'Time'}</Text>

          <View style={styles.row}>
            <View style={styles.column}>
              <TouchableOpacity onPress={() => setHour((h) => (h % 12) + 1)} hitSlop={8} accessibilityLabel="Next hour">
                <Text style={[styles.arrow, { color: colors.tint }]}>▲</Text>
              </TouchableOpacity>
              <Text style={[styles.number, { color: colors.text }]}>{String(hour).padStart(2, '0')}</Text>
              <TouchableOpacity onPress={() => setHour((h) => (h === 1 ? 12 : h - 1))} hitSlop={8} accessibilityLabel="Previous hour">
                <Text style={[styles.arrow, { color: colors.tint }]}>▼</Text>
              </TouchableOpacity>
            </View>

            <Text style={[styles.colon, { color: colors.text }]}>:</Text>

            <View style={styles.column}>
              <TouchableOpacity onPress={() => setMinute((m) => (m + 5) % 60)} hitSlop={8} accessibilityLabel="Later minute">
                <Text style={[styles.arrow, { color: colors.tint }]}>▲</Text>
              </TouchableOpacity>
              <Text style={[styles.number, { color: colors.text }]}>{String(minute).padStart(2, '0')}</Text>
              <TouchableOpacity onPress={() => setMinute((m) => (m - 5 + 60) % 60)} hitSlop={8} accessibilityLabel="Earlier minute">
                <Text style={[styles.arrow, { color: colors.tint }]}>▼</Text>
              </TouchableOpacity>
            </View>

            <View style={styles.ampmColumn}>
              <TouchableOpacity onPress={() => setIsPM(false)} style={[styles.ampmBtn, !isPM && { backgroundColor: colors.tint }]}>
                <Text style={[styles.ampmText, { color: !isPM ? colors.background : colors.icon }]}>AM</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={() => setIsPM(true)} style={[styles.ampmBtn, isPM && { backgroundColor: colors.tint }]}>
                <Text style={[styles.ampmText, { color: isPM ? colors.background : colors.icon }]}>PM</Text>
              </TouchableOpacity>
            </View>
          </View>

          <TouchableOpacity style={[styles.doneBtn, { backgroundColor: colors.tint }]} onPress={apply} accessibilityRole="button">
            <Text style={[styles.doneText, { color: colors.background }]}>Done</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(26,26,34,0.45)', justifyContent: 'flex-end' },
  sheet: { padding: 24, borderTopLeftRadius: 20, borderTopRightRadius: 20 },
  title: { fontSize: 16, fontWeight: '600', textAlign: 'center', marginBottom: 24 },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, marginBottom: 28 },
  column: { alignItems: 'center', gap: 10 },
  arrow: { fontSize: 18, paddingHorizontal: 12, paddingVertical: 2 },
  number: { fontSize: 40, fontWeight: '700', minWidth: 64, textAlign: 'center' },
  colon: { fontSize: 36, fontWeight: '700', marginBottom: 10 },
  ampmColumn: { gap: 8, marginLeft: 12 },
  ampmBtn: { paddingHorizontal: 14, paddingVertical: 9, borderRadius: 8 },
  ampmText: { fontSize: 14, fontWeight: '600' },
  doneBtn: { borderRadius: 12, paddingVertical: 15, alignItems: 'center' },
  doneText: { fontSize: 16, fontWeight: '600' },
});
