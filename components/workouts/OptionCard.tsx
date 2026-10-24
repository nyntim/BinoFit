import { Pressable, StyleSheet, Text, View } from 'react-native';
import { IconSymbol, type IconSymbolName } from '@/components/ui/icon-symbol';
import { useThemeColor } from '@/hooks/use-theme-color';
import { useShadow } from '@/hooks/useShadow';

type Props = {
  label: string;
  description?: string;
  selected: boolean;
  onPress: () => void;
  /** `row` is a full-width card; `tile` is a 96 pt grid tile with a glyph (equipment). */
  layout?: 'row' | 'tile';
  icon?: IconSymbolName;
};

/** A single-choice card (radio): selected draws a tintSoft fill and a 2 px tint border. */
export function OptionCard({ label, description, selected, onPress, layout = 'row', icon }: Props) {
  const card = useThemeColor({}, 'cardBackground');
  const tintSoft = useThemeColor({}, 'tintSoft');
  const text = useThemeColor({}, 'text');
  const muted = useThemeColor({}, 'icon');
  const tint = useThemeColor({}, 'tint');
  const shadow = useShadow('card');
  const tile = layout === 'tile';

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="radio"
      accessibilityState={{ checked: selected }}
      accessibilityLabel={description ? `${label}. ${description}` : label}
      style={({ pressed }) => [
        styles.card,
        tile ? styles.tile : styles.row,
        { backgroundColor: selected ? tintSoft : card, borderColor: selected ? tint : 'transparent' },
        !selected && shadow !== 'none' ? { boxShadow: shadow } : null,
        pressed && styles.pressed,
      ]}
    >
      {tile && icon ? <IconSymbol name={icon} size={26} color={selected ? tint : muted} /> : null}
      <View style={tile ? undefined : styles.copy}>
        <Text style={[styles.label, { color: text }]}>{label}</Text>
        {description ? <Text style={[styles.desc, { color: muted }]}>{description}</Text> : null}
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: { borderRadius: 18, borderWidth: 2 },
  row: { minHeight: 56, paddingHorizontal: 16, paddingVertical: 12, justifyContent: 'center' },
  tile: { height: 96, flex: 1, paddingHorizontal: 16, paddingVertical: 14, justifyContent: 'space-between', alignItems: 'flex-start' },
  copy: { gap: 2 },
  label: { fontSize: 15, fontWeight: '600' },
  desc: { fontSize: 13 },
  pressed: { opacity: 0.85 },
});
