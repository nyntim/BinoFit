import { Pressable, StyleSheet, Text, View } from 'react-native';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { useThemeColor } from '@/hooks/use-theme-color';

type Props = {
  label: string;
  value: string;
  onPress: () => void;
  last?: boolean;
};

/** One line of the builder review card: label, value, chevron. Tapping jumps to that step. */
export function ReviewRow({ label, value, onPress, last }: Props) {
  const text = useThemeColor({}, 'text');
  const muted = useThemeColor({}, 'icon');
  const separator = useThemeColor({}, 'separator');

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${label}: ${value}. Change`}
      style={[styles.row, !last && { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: separator }]}
    >
      <Text style={[styles.label, { color: muted }]}>{label}</Text>
      <Text style={[styles.value, { color: text }]}>{value}</Text>
      <View style={styles.chevron}>
        <IconSymbol name="chevron.right" size={16} color={muted} />
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'flex-start', gap: 16, paddingVertical: 12, minHeight: 44 },
  label: { width: 96, fontSize: 13, fontWeight: '500', flexShrink: 0 },
  value: { flex: 1, fontSize: 15, minWidth: 0, fontVariant: ['tabular-nums'] },
  chevron: { marginTop: 2 },
});
