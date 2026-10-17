import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useThemeColor } from '@/hooks/use-theme-color';

type Props = {
  title: string;
  subtitle?: string;
  /** Equipment label shown on the right. */
  tag: string;
  /** Omit for a row that is not tappable (built-ins in browse mode). */
  onPress?: () => void;
  last?: boolean;
};

export function ExerciseRow({ title, subtitle, tag, onPress, last }: Props) {
  const text = useThemeColor({}, 'text');
  const muted = useThemeColor({}, 'icon');
  const separator = useThemeColor({}, 'separator');
  const rowStyle = [
    styles.row,
    !last && { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: separator },
  ];

  const content = (
    <>
      <View style={styles.main}>
        <Text style={[styles.title, { color: text }]}>{title}</Text>
        {subtitle ? <Text style={[styles.subtitle, { color: muted }]}>{subtitle}</Text> : null}
      </View>
      <Text style={[styles.tag, { color: muted }]}>{tag}</Text>
    </>
  );

  if (!onPress) return <View style={rowStyle}>{content}</View>;
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={subtitle ? `${title}. ${subtitle}. ${tag}` : `${title}. ${tag}`}
      style={rowStyle}
    >
      {content}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 10, minHeight: 44 },
  main: { flex: 1, gap: 2, minWidth: 0 },
  title: { fontSize: 15 },
  subtitle: { fontSize: 12, fontVariant: ['tabular-nums'] },
  tag: { fontSize: 12, fontWeight: '500', flexShrink: 0 },
});
