import { Pressable, StyleSheet, View } from 'react-native';
import { ThemedText } from '@/components/themed-text';
import { Tag } from '@/components/ui/Tag';

type Props = {
  title: string;
  subtitle?: string;
  /** Equipment label shown on the right. */
  tag: string;
  /** Your own exercise: semibold name and a tint tag. */
  custom?: boolean;
  /** Omit for a row that is not tappable (built-ins in browse mode). */
  onPress?: () => void;
};

/** One exercise in the library list. Rows sit in a `ListGroup`, which draws the separators. */
export function ExerciseRow({ title, subtitle, tag, custom = false, onPress }: Props) {
  const content = (
    <>
      <View style={styles.main}>
        <ThemedText type="body" style={custom ? styles.custom : undefined}>{title}</ThemedText>
        {subtitle ? <ThemedText type="caption" style={styles.subtitle}>{subtitle}</ThemedText> : null}
      </View>
      <Tag label={tag} tone={custom ? 'tint' : 'neutral'} />
    </>
  );
  const rowStyle = [styles.row, subtitle ? styles.rowTall : null];

  if (!onPress) return <View style={rowStyle}>{content}</View>;
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={subtitle ? `${title}. ${subtitle}. ${tag}` : `${title}. ${tag}`}
      style={({ pressed }) => [...rowStyle, pressed && styles.pressed]}
    >
      {content}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 8, paddingHorizontal: 16, minHeight: 56 },
  rowTall: { minHeight: 64 },
  main: { flex: 1, gap: 2, minWidth: 0 },
  custom: { fontWeight: '600' },
  subtitle: { fontVariant: ['tabular-nums'] },
  pressed: { opacity: 0.85 },
});
