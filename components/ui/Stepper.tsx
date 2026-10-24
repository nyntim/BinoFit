import type { ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useThemeColor } from '@/hooks/use-theme-color';

type Props = {
  /** Shown between the buttons. Pass `children` instead for an inline editable value. */
  value?: string | number;
  children?: ReactNode;
  onDecrement: () => void;
  onIncrement: () => void;
  decrementLabel: string;
  incrementLabel: string;
  decrementDisabled?: boolean;
  incrementDisabled?: boolean;
  /** Spoken for a plain `value`, e.g. "3 default sets". */
  valueLabel?: string;
};

// Buttons draw 38 pt; the slop keeps a 44 pt target
const SLOP = { top: 3, bottom: 3, left: 3, right: 3 };

/** Minus / value / plus control (bf.css `.stepper`). */
export function Stepper({ value, children, onDecrement, onIncrement, decrementLabel, incrementLabel, decrementDisabled, incrementDisabled, valueLabel }: Props) {
  const track = useThemeColor({}, 'cardSecondary');
  const raised = useThemeColor({}, 'raised');
  const text = useThemeColor({}, 'text');

  const button = (glyph: string, label: string, onPress: () => void, disabled?: boolean) => (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      hitSlop={SLOP}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: !!disabled }}
      style={({ pressed }) => [styles.button, { backgroundColor: raised }, disabled ? styles.disabled : pressed ? styles.pressed : null]}
    >
      {/* The glyph sits in a fixed 38 pt button and is decorative (the button has a label), so its scaling is capped */}
      <Text style={[styles.glyph, { color: text }]} accessible={false} maxFontSizeMultiplier={1.4}>{glyph}</Text>
    </Pressable>
  );

  return (
    <View style={[styles.stepper, { backgroundColor: track }]}>
      {button('−', decrementLabel, onDecrement, decrementDisabled)}
      {children ?? (
        <Text style={[styles.value, { color: text }]} accessibilityLabel={valueLabel}>{value}</Text>
      )}
      {button('+', incrementLabel, onIncrement, incrementDisabled)}
    </View>
  );
}

const styles = StyleSheet.create({
  stepper: { flexDirection: 'row', alignItems: 'center', alignSelf: 'flex-start', gap: 4, padding: 3, borderRadius: 12 },
  button: { width: 38, height: 38, borderRadius: 9, alignItems: 'center', justifyContent: 'center' },
  glyph: { fontSize: 18, fontWeight: '600' },
  value: { minWidth: 34, textAlign: 'center', fontSize: 15, fontWeight: '700', fontVariant: ['tabular-nums'] },
  pressed: { opacity: 0.7 },
  disabled: { opacity: 0.4 },
});
