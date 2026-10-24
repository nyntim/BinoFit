import { ActivityIndicator, Pressable, StyleSheet, Text, View, type PressableProps, type StyleProp, type ViewStyle } from 'react-native';
import { IconSymbol, type IconSymbolName } from '@/components/ui/icon-symbol';
import { useThemeColor } from '@/hooks/use-theme-color';

/** `inverse` sits on a tint surface: `onTint` fill with a tint label. */
export type ButtonVariant = 'primary' | 'secondary' | 'soft' | 'ghost' | 'danger' | 'ink' | 'inverse';
export type ButtonSize = 'sm' | 'md' | 'lg';

type Props = Omit<PressableProps, 'children' | 'style'> & {
  label: string;
  variant?: ButtonVariant;
  size?: ButtonSize;
  icon?: IconSymbolName;
  loading?: boolean;
  /** `lg` is full width by default; set false to size to the label. */
  fullWidth?: boolean;
  style?: StyleProp<ViewStyle>;
};

// sm draws 36 pt but keeps a 44 pt target
const SMALL_SLOP = { top: 4, bottom: 4 };

/** Text button (bf.css `.btn-*`). Danger is for destructive actions only. */
export function Button({
  label,
  variant = 'primary',
  size = 'md',
  icon,
  loading = false,
  disabled = false,
  fullWidth,
  style,
  accessibilityLabel,
  accessibilityState,
  ...rest
}: Props) {
  const tint = useThemeColor({}, 'tint');
  const tintSoft = useThemeColor({}, 'tintSoft');
  const onTint = useThemeColor({}, 'onTint');
  const fieldBorder = useThemeColor({}, 'fieldBorder');
  const danger = useThemeColor({}, 'danger');
  const ink = useThemeColor({}, 'text');
  const background = useThemeColor({}, 'background');

  const look = {
    primary: { fill: tint, color: onTint, border: undefined },
    secondary: { fill: 'transparent', color: tint, border: fieldBorder },
    soft: { fill: tintSoft, color: tint, border: undefined },
    ghost: { fill: 'transparent', color: tint, border: undefined },
    danger: { fill: 'transparent', color: danger, border: undefined },
    ink: { fill: ink, color: background, border: undefined },
    inverse: { fill: onTint, color: tint, border: undefined },
  }[variant];
  const inactive = disabled || loading;
  const stretch = fullWidth ?? size === 'lg';

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityState={{ ...accessibilityState, disabled: inactive, busy: loading }}
      disabled={inactive}
      hitSlop={size === 'sm' ? SMALL_SLOP : undefined}
      style={({ pressed }) => [
        styles.base,
        styles[size],
        stretch && styles.full,
        { backgroundColor: look.fill },
        look.border ? { borderWidth: 1, borderColor: look.border } : null,
        inactive ? styles.disabled : pressed ? styles.pressed : null,
        style,
      ]}
      {...rest}
    >
      {loading ? (
        <ActivityIndicator testID="button-loading" color={look.color} />
      ) : (
        <View style={styles.content}>
          {icon ? <IconSymbol name={icon} size={size === 'sm' ? 15 : 18} color={look.color} /> : null}
          <Text style={[styles.label, size === 'sm' ? styles.smLabel : size === 'lg' ? styles.lgLabel : null, { color: look.color }]}>{label}</Text>
        </View>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: { alignItems: 'center', justifyContent: 'center', alignSelf: 'flex-start' },
  sm: { minHeight: 36, borderRadius: 11, paddingHorizontal: 12 },
  md: { minHeight: 44, borderRadius: 14, paddingHorizontal: 18 },
  lg: { minHeight: 52, borderRadius: 16, paddingHorizontal: 18 },
  full: { alignSelf: 'stretch' },
  content: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 8 },
  label: { fontSize: 15, fontWeight: '600', textAlign: 'center', flexShrink: 1 },
  smLabel: { fontSize: 13 },
  lgLabel: { fontSize: 16 },
  pressed: { opacity: 0.85 },
  disabled: { opacity: 0.5 },
});
