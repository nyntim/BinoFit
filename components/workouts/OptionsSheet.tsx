import { useRef } from 'react';
import { Modal, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { useThemeColor } from '@/hooks/use-theme-color';

export type SheetOption = {
  key: string;
  label: string;
  /** Shows a check mark (the current choice). */
  selected?: boolean;
  onPress: () => void;
};

type Props = {
  visible: boolean;
  title?: string;
  options: SheetOption[];
  onClose: () => void;
};

/**
 * A bottom sheet of choices. Used instead of Alert because Android alerts allow only three buttons.
 * Choosing an option closes the sheet first, then runs it once the sheet is gone.
 */
export function OptionsSheet({ visible, title, options, onClose }: Props) {
  const { bottom } = useSafeAreaInsets();
  const pending = useRef<(() => void) | null>(null);
  const runPending = () => {
    const fn = pending.current;
    pending.current = null;
    fn?.();
  };
  const overlay = useThemeColor({}, 'overlay');
  const card = useThemeColor({}, 'cardBackground');
  const text = useThemeColor({}, 'text');
  const muted = useThemeColor({}, 'icon');
  const tint = useThemeColor({}, 'tint');
  const separator = useThemeColor({}, 'separator');

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose} onDismiss={runPending}>
      <View style={[styles.overlay, { backgroundColor: overlay }]}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} accessibilityRole="button" accessibilityLabel="Close" />
        <View style={[styles.sheet, { backgroundColor: card, paddingBottom: 12 + bottom }]}>
          {title ? (
            <Text style={[styles.title, { color: muted }]} accessibilityRole="header">
              {title}
            </Text>
          ) : null}
          {options.map((o, i) => (
            <Pressable
              key={o.key}
              onPress={() => {
                // iOS can't present another modal or alert until this one is gone (onDismiss).
                pending.current = o.onPress;
                onClose();
                if (Platform.OS !== 'ios') runPending();
              }}
              accessibilityRole="button"
              accessibilityState={{ selected: !!o.selected }}
              style={[
                styles.option,
                i < options.length - 1 && { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: separator },
              ]}
            >
              <Text style={[styles.optionText, { color: text }]}>{o.label}</Text>
              {o.selected ? <IconSymbol name="checkmark" size={20} color={tint} /> : null}
            </Pressable>
          ))}
          <Pressable onPress={onClose} accessibilityRole="button" style={styles.cancel}>
            <Text style={[styles.cancelText, { color: tint }]}>Cancel</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: { flex: 1, justifyContent: 'flex-end' },
  sheet: { borderTopLeftRadius: 20, borderTopRightRadius: 20, paddingTop: 12, paddingHorizontal: 20 },
  title: { fontSize: 13, fontWeight: '500', textAlign: 'center', paddingVertical: 8 },
  option: {
    minHeight: 52,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  optionText: { fontSize: 17 },
  cancel: { minHeight: 52, alignItems: 'center', justifyContent: 'center', marginTop: 4 },
  cancelText: { fontSize: 17, fontWeight: '600' },
});
