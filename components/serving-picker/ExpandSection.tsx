import type { ReactNode } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import type { Colors } from '@/constants/theme';
import { Chevron } from '@/components/serving-picker/Chevron';

export function ExpandSection({
  title, expanded, onToggle, colors, children,
}: {
  title: string;
  expanded: boolean;
  onToggle: () => void;
  colors: Pick<typeof Colors.light, 'cardBackground' | 'icon' | 'separator' | 'text'>;
  children: ReactNode;
}) {
  return (
    <View style={[styles.expandCard, { backgroundColor: colors.cardBackground }]}>
      <TouchableOpacity
        style={styles.expandHeader}
        onPress={onToggle}
        activeOpacity={0.7}
        accessibilityRole="button"
        accessibilityState={{ expanded }}
        accessibilityLabel={title}
      >
        <Text style={[styles.expandTitle, { color: colors.text }]}>{title}</Text>
        <Chevron size={14} color={colors.icon} up={expanded} />
      </TouchableOpacity>
      {expanded && (
        <View style={[styles.expandBody, { borderTopColor: colors.separator }]}>
          {children}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  // Expand sections
  expandCard: { borderRadius: 18, overflow: 'hidden' },
  expandHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
  },
  expandTitle: { fontSize: 15, fontWeight: '700' },
  expandBody: {
    borderTopWidth: StyleSheet.hairlineWidth,
    padding: 16,
    gap: 12,
  },
});
