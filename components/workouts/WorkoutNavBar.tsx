import type { ReactNode } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { ThemedText } from '@/components/themed-text';
import { IconSymbol, type IconSymbolName } from '@/components/ui/icon-symbol';
import { useThemeColor } from '@/hooks/use-theme-color';

type Props = {
  onBack: () => void;
  /** The previous screen's name beside the chevron. The accessible name is always "Back". */
  label?: string;
  /** Centered title (push screens that have no large title). */
  title?: string;
  /** Right-hand controls, usually `NavIconButton`s. */
  trailing?: ReactNode;
};

/** Top row of the Training push screens: back with the previous screen's name, optional title, trailing actions. */
export function WorkoutNavBar({ onBack, label = 'Back', title, trailing }: Props) {
  const tint = useThemeColor({}, 'tint');
  return (
    <View style={styles.bar}>
      <View style={[styles.side, styles.start]}>
        <Pressable onPress={onBack} accessibilityRole="button" accessibilityLabel="Back" hitSlop={6} style={styles.back}>
          <IconSymbol name="chevron.left" size={22} color={tint} />
          <ThemedText type="body" style={[styles.backLabel, { color: tint }]} numberOfLines={1}>{label}</ThemedText>
        </Pressable>
      </View>
      {title ? (
        <ThemedText type="title" style={styles.title} accessibilityRole="header" numberOfLines={1}>{title}</ThemedText>
      ) : (
        <View style={styles.spacer} />
      )}
      <View style={[styles.side, styles.end]}>{trailing}</View>
    </View>
  );
}

type IconButtonProps = {
  icon: IconSymbolName;
  label: string;
  onPress: () => void;
  disabled?: boolean;
  /** `tint` draws a filled circle with an onTint glyph (the library "New exercise" button). */
  tone?: 'plain' | 'tint';
};

/** 44 pt circular icon button for `WorkoutNavBar.trailing`. */
export function NavIconButton({ icon, label, onPress, disabled = false, tone = 'plain' }: IconButtonProps) {
  const tint = useThemeColor({}, 'tint');
  const onTint = useThemeColor({}, 'onTint');
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled }}
      style={({ pressed }) => [styles.iconButton, tone === 'tint' && { backgroundColor: tint }, disabled ? styles.disabled : pressed ? styles.pressed : null]}
    >
      <IconSymbol name={icon} size={tone === 'tint' ? 20 : 22} color={tone === 'tint' ? onTint : tint} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  bar: { flexDirection: 'row', alignItems: 'center', minHeight: 44, paddingHorizontal: 8 },
  side: { flexShrink: 1, minWidth: 44 },
  start: { alignItems: 'flex-start' },
  end: { alignItems: 'flex-end' },
  spacer: { flex: 1 },
  back: { flexDirection: 'row', alignItems: 'center', minHeight: 44, paddingRight: 8 },
  backLabel: { fontSize: 17, flexShrink: 1 },
  title: { flex: 1, textAlign: 'center' },
  iconButton: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  pressed: { opacity: 0.7 },
  disabled: { opacity: 0.5 },
});
