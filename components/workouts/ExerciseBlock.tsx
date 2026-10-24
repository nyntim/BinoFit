import type { ReactNode } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { Card } from '@/components/ui/Card';
import { Tag } from '@/components/ui/Tag';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { ThemedText } from '@/components/themed-text';
import { useThemeColor } from '@/hooks/use-theme-color';

type Props = {
  title: string;
  /** Setup notes under the name (e.g. "Seat 4, back pad 2"). */
  setupNotes?: string | null;
  /** "Rest 2:00"; omit when the rest is not shown (logging afterward). */
  restLabel?: string | null;
  /** Neutral tag beside the name for non-strength log types ("Cardio", "Time"). */
  tag?: string | null;
  onOptions?: () => void;
  children: ReactNode;
};

/**
 * A card for one exercise: name, optional tag, rest label and options button, setup notes, then the
 * set table. The card has no horizontal padding so a set row can tint edge to edge.
 */
export function ExerciseBlock({ title, setupNotes, restLabel, tag, onOptions, children }: Props) {
  const muted = useThemeColor({}, 'icon');

  return (
    <Card padding="none" style={styles.block}>
      <View style={styles.header}>
        <View style={styles.titles}>
          <View style={styles.nameRow}>
            <ThemedText type="title" style={styles.title} accessibilityRole="header">
              {title}
            </ThemedText>
            {tag ? <Tag label={tag} /> : null}
          </View>
          {setupNotes ? <ThemedText type="caption">{setupNotes}</ThemedText> : null}
        </View>
        {restLabel ? <ThemedText type="caption" style={styles.rest}>{restLabel}</ThemedText> : null}
        {onOptions ? (
          <Pressable
            onPress={onOptions}
            accessibilityRole="button"
            accessibilityLabel={`Options for ${title}`}
            style={styles.options}
          >
            <IconSymbol name="ellipsis" size={22} color={muted} />
          </Pressable>
        ) : null}
      </View>
      {children}
    </Card>
  );
}

const styles = StyleSheet.create({
  block: { paddingTop: 14, paddingBottom: 6, overflow: 'hidden' },
  header: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingLeft: 18, paddingRight: 8, paddingBottom: 8 },
  titles: { flex: 1, minWidth: 0, gap: 4 },
  nameRow: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 8 },
  title: { flexShrink: 1 },
  rest: { fontVariant: ['tabular-nums'] },
  options: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
});
