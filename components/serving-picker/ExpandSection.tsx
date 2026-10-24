import type { ReactNode } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { ThemedText } from '@/components/themed-text';
import { Card } from '@/components/ui/Card';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { useThemeColor } from '@/hooks/use-theme-color';

export function ExpandSection({
  title, expanded, onToggle, children,
}: {
  title: string;
  expanded: boolean;
  onToggle: () => void;
  children: ReactNode;
}) {
  const icon = useThemeColor({}, 'icon');
  const separator = useThemeColor({}, 'separator');
  return (
    <Card padding="none" style={styles.card}>
      <Pressable
        style={({ pressed }) => [styles.header, pressed && styles.pressed]}
        onPress={onToggle}
        accessibilityRole="button"
        accessibilityState={{ expanded }}
        accessibilityLabel={title}
      >
        <ThemedText type="title" style={styles.title}>{title}</ThemedText>
        <IconSymbol name={expanded ? 'chevron.up' : 'chevron.down'} size={20} color={icon} />
      </Pressable>
      {expanded && <View style={[styles.body, { borderTopColor: separator }]}>{children}</View>}
    </Card>
  );
}

const styles = StyleSheet.create({
  card: { overflow: 'hidden' },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', minHeight: 52, paddingHorizontal: 18, paddingVertical: 8 },
  title: { flex: 1 },
  pressed: { opacity: 0.85 },
  body: { borderTopWidth: StyleSheet.hairlineWidth, paddingHorizontal: 18, paddingVertical: 14, gap: 12 },
});
