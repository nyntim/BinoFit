import type { ReactNode } from 'react';
import { Pressable, Text, View, type AccessibilityRole } from 'react-native';
import { useThemeColor } from '@/hooks/use-theme-color';
export function SettingsRow({ label, value, description, onPress, disabled, children, accessibilityRole, selected }: { label: string; value?: string; description?: string; onPress?: () => void; disabled?: boolean; children?: ReactNode; accessibilityRole?: AccessibilityRole; selected?: boolean }) {
  const text = useThemeColor({}, 'text');
  const muted = useThemeColor({}, 'icon');
  const card = useThemeColor({}, 'cardBackground');
  const style = { padding: 16, minHeight: 52, borderRadius: 12, backgroundColor: card, opacity: disabled ? 0.5 : 1 };
  const content = <>
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}><View style={{ flex: 1, gap: 4 }}><Text style={{ color: text, fontSize: 15 }}>{label}</Text>{description ? <Text style={{ color: muted, fontSize: 13, lineHeight: 18 }}>{description}</Text> : null}{value ? <Text style={{ color: muted, fontSize: 13 }}>{value}</Text> : null}</View>{onPress && accessibilityRole !== 'radio' ? <Text style={{ color: muted }} accessibilityElementsHidden>›</Text> : null}</View>{children}
  </>;
  if (!onPress) return <View style={style}>{content}</View>;
  return <Pressable onPress={onPress} disabled={disabled} accessibilityRole={accessibilityRole ?? 'button'} accessibilityLabel={accessibilityRole === 'radio' ? label : undefined} accessibilityState={{ disabled: !!disabled, selected }} style={style}>{content}</Pressable>;
}
