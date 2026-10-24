import { Pressable, StyleSheet, Text, View } from 'react-native';
import { IconSymbol, type IconSymbolName } from '@/components/ui/icon-symbol';
import { useThemeColor } from '@/hooks/use-theme-color';

export type ChipTone = 'default' | 'ember';
export type ChipSize = 'sm' | 'md';

type Props = {
  label: string;
  selected?: boolean;
  /** Omit for a static chip (an ember streak or record chip). */
  onPress?: () => void;
  /** `radio` for single choice, `checkbox` for multi-select, `button` for actions. */
  role?: 'radio' | 'checkbox' | 'button';
  tone?: ChipTone;
  size?: ChipSize;
  icon?: IconSymbolName;
  accessibilityLabel?: string;
  disabled?: boolean;
};

// Chips draw 34 (md) or 26 (sm) high; the slop keeps a 44 pt target
const SLOP = { md: { top: 5, bottom: 5 }, sm: { top: 9, bottom: 9 } };

/** Pill chip (bf.css `.chip`, `.chip.on`, `.ember-chip`). */
export function Chip({ label, selected = false, onPress, role = 'checkbox', tone = 'default', size = 'md', icon, accessibilityLabel, disabled }: Props) {
  const rest = useThemeColor({}, 'cardSecondary');
  const muted = useThemeColor({}, 'icon');
  const tint = useThemeColor({}, 'tint');
  const onTint = useThemeColor({}, 'onTint');
  const ember = useThemeColor({}, 'ember');
  const emberSoft = useThemeColor({}, 'emberSoft');

  const [background, color] = tone === 'ember' ? [emberSoft, ember] : selected ? [tint, onTint] : [rest, muted];
  const body = (
    <>
      {icon ? <IconSymbol name={icon} size={size === 'sm' ? 12 : 14} color={color} /> : null}
      <Text style={[styles.label, size === 'sm' && styles.smLabel, (selected || tone === 'ember') && styles.strong, { color }]}>{label}</Text>
    </>
  );
  const chipStyle = [styles.chip, styles[size], { backgroundColor: background }];

  if (!onPress) {
    return <View style={chipStyle} accessible accessibilityLabel={accessibilityLabel ?? label}>{body}</View>;
  }
  const state = role === 'checkbox' ? { checked: selected, disabled } : { selected, disabled };
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      hitSlop={SLOP[size]}
      accessibilityRole={role}
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityState={state}
      style={({ pressed }) => [chipStyle, disabled ? styles.disabled : pressed ? styles.pressed : null]}
    >
      {body}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  chip: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, borderRadius: 999, flexShrink: 0 },
  md: { minHeight: 34, paddingHorizontal: 14 },
  sm: { minHeight: 26, paddingHorizontal: 10 },
  label: { fontSize: 13, fontWeight: '500' },
  smLabel: { fontSize: 12 },
  strong: { fontWeight: '600' },
  pressed: { opacity: 0.85 },
  disabled: { opacity: 0.5 },
});
