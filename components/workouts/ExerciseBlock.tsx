import type { ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { useThemeColor } from '@/hooks/use-theme-color';

type Props = {
  title: string;
  /** Setup notes under the name (e.g. "Seat 4, back pad 2"). */
  setupNotes?: string | null;
  /** "Rest 2:00"; omit when the rest is not shown (logging afterward). */
  restLabel?: string | null;
  onOptions?: () => void;
  children: ReactNode;
};

/** A card for one exercise: title, optional rest label and options button, setup notes, then the set table. */
export function ExerciseBlock({ title, setupNotes, restLabel, onOptions, children }: Props) {
  const card = useThemeColor({}, 'cardBackground');
  const tint = useThemeColor({}, 'tint');
  const muted = useThemeColor({}, 'icon');

  return (
    <View style={[styles.block, { backgroundColor: card }]}>
      <View style={styles.header}>
        <Text style={[styles.title, { color: tint }]} accessibilityRole="header">
          {title}
        </Text>
        {restLabel ? <Text style={[styles.rest, { color: muted }]}>{restLabel}</Text> : null}
        {onOptions ? (
          <Pressable
            onPress={onOptions}
            hitSlop={6}
            accessibilityRole="button"
            accessibilityLabel={`Options for ${title}`}
            style={styles.options}
          >
            <IconSymbol name="ellipsis" size={22} color={muted} />
          </Pressable>
        ) : null}
      </View>
      {setupNotes ? <Text style={[styles.notes, { color: muted }]}>{setupNotes}</Text> : null}
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  block: { borderRadius: 18, padding: 16, gap: 6 },
  header: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  title: { flex: 1, fontSize: 17, fontWeight: '600' },
  rest: { fontSize: 12, fontVariant: ['tabular-nums'] },
  options: { width: 32, height: 32, alignItems: 'center', justifyContent: 'center' },
  notes: { fontSize: 13, fontWeight: '500', marginBottom: 4 },
});
