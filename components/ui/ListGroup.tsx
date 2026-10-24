import { Children, Fragment, isValidElement, type ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View, type AccessibilityRole, type AccessibilityState, type StyleProp, type ViewStyle } from 'react-native';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { useThemeColor } from '@/hooks/use-theme-color';
import { useShadow } from '@/hooks/useShadow';

/** Grouped list surface (bf.css `.list`): rows separated by hairlines, 18 radius. */
export function ListGroup({ children, style }: { children: ReactNode; style?: StyleProp<ViewStyle> }) {
  const card = useThemeColor({}, 'cardBackground');
  const separator = useThemeColor({}, 'separator');
  const shadow = useShadow('card');
  const rows = Children.toArray(children).filter(isValidElement);

  return (
    // The shadow sits on an outer view so the clipping inner view cannot cut it off
    <View style={[styles.group, { backgroundColor: card }, shadow !== 'none' ? { boxShadow: shadow } : null, style]}>
      <View style={styles.clip}>
        {rows.map((row, index) => (
          <Fragment key={row.key ?? index}>
            {index > 0 ? <View style={[styles.separator, { backgroundColor: separator }]} /> : null}
            {row}
          </Fragment>
        ))}
      </View>
    </View>
  );
}

type ListRowProps = {
  title: string;
  subtitle?: string;
  /** Usually an `IconTile`. */
  leading?: ReactNode;
  /** A value string, or a node such as a `Switch`, `Button` or `Stepper`. */
  trailing?: ReactNode;
  onPress?: () => void;
  /** Defaults to shown for tappable button and link rows. */
  chevron?: boolean;
  disabled?: boolean;
  /** Title in `danger`, for destructive rows. */
  destructive?: boolean;
  /** Extra content under the row, inside the same surface. */
  children?: ReactNode;
  accessibilityRole?: AccessibilityRole;
  accessibilityLabel?: string;
  accessibilityHint?: string;
  accessibilityState?: AccessibilityState;
  testID?: string;
};

/** One row of a `ListGroup` (bf.css `.row`, `.row.tap`): min height 52. */
export function ListRow({
  title,
  subtitle,
  leading,
  trailing,
  onPress,
  chevron,
  disabled = false,
  destructive = false,
  children,
  accessibilityRole,
  accessibilityLabel,
  accessibilityHint,
  accessibilityState,
  testID,
}: ListRowProps) {
  const text = useThemeColor({}, 'text');
  const muted = useThemeColor({}, 'icon');
  const danger = useThemeColor({}, 'danger');
  const role = accessibilityRole ?? (onPress ? 'button' : undefined);
  const showChevron = chevron ?? (!!onPress && (role === 'button' || role === 'link'));

  const body = (
    <>
      <View style={styles.row}>
        {leading}
        <View style={styles.copy}>
          <Text style={[styles.title, { color: destructive ? danger : text }]}>{title}</Text>
          {subtitle ? <Text style={[styles.subtitle, { color: muted }]}>{subtitle}</Text> : null}
        </View>
        {typeof trailing === 'string' ? <Text style={[styles.value, { color: muted }]}>{trailing}</Text> : trailing}
        {showChevron ? <IconSymbol name="chevron.right" size={16} color={muted} /> : null}
      </View>
      {children}
    </>
  );

  if (!onPress) {
    return <View testID={testID} style={[styles.container, disabled && styles.disabled]}>{body}</View>;
  }
  return (
    <Pressable
      testID={testID}
      onPress={onPress}
      disabled={disabled}
      accessibilityRole={role}
      accessibilityLabel={accessibilityLabel}
      accessibilityHint={accessibilityHint}
      accessibilityState={{ ...accessibilityState, disabled }}
      style={({ pressed }) => [styles.container, disabled ? styles.disabled : pressed ? styles.pressed : null]}
    >
      {body}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  group: { borderRadius: 18 },
  clip: { borderRadius: 18, overflow: 'hidden' },
  separator: { height: StyleSheet.hairlineWidth, marginLeft: 16 },
  container: { minHeight: 52, paddingVertical: 8, paddingHorizontal: 16, justifyContent: 'center' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 36 },
  copy: { flex: 1, minWidth: 0, gap: 2 },
  title: { fontSize: 15, lineHeight: 20 },
  subtitle: { fontSize: 13, lineHeight: 18 },
  value: { fontSize: 15, flexShrink: 1, textAlign: 'right', fontVariant: ['tabular-nums'] },
  pressed: { opacity: 0.85 },
  disabled: { opacity: 0.5 },
});
