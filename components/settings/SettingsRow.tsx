import type { ReactNode } from 'react';
import { StyleSheet, View, type AccessibilityRole } from 'react-native';
import { ListRow } from '@/components/ui/ListGroup';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { useThemeColor } from '@/hooks/use-theme-color';
import { useShadow } from '@/hooks/useShadow';

/** A single settings row on its own list surface. Inside a `ListGroup`, use `ListRow` directly. */
export function SettingsRow({ label, value, description, onPress, disabled, children, accessibilityRole, selected }: { label: string; value?: string; description?: string; onPress?: () => void; disabled?: boolean; children?: ReactNode; accessibilityRole?: AccessibilityRole; selected?: boolean }) {
  const card = useThemeColor({}, 'cardBackground');
  const tint = useThemeColor({}, 'tint');
  const shadow = useShadow('card');
  const radio = accessibilityRole === 'radio';
  return <View style={[styles.surface, { backgroundColor: card }, shadow !== 'none' ? { boxShadow: shadow } : null]}>
    <ListRow
      title={label}
      subtitle={description}
      trailing={radio && selected ? <IconSymbol name="checkmark" size={18} color={tint} /> : value}
      onPress={onPress}
      disabled={disabled}
      chevron={!!onPress && !radio}
      accessibilityRole={onPress ? accessibilityRole ?? 'button' : undefined}
      accessibilityLabel={radio ? label : undefined}
      accessibilityState={onPress ? { selected } : undefined}
    >{children}</ListRow>
  </View>;
}

const styles = StyleSheet.create({ surface: { borderRadius: 18 } });
