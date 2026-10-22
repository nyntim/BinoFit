import { Pressable, StyleSheet, Text, View } from 'react-native';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { useThemeColor } from '@/hooks/use-theme-color';
import type { WorkoutSummary } from '@/lib/types';

type Props = { summary: WorkoutSummary; onPress: () => void; onLongPress?: () => void; last?: boolean };

export function WorkoutHistoryRow({ summary, onPress, onLongPress, last }: Props) {
  const text = useThemeColor({}, 'text');
  const muted = useThemeColor({}, 'icon');
  const separator = useThemeColor({}, 'separator');
  const { title, subtitle, durationLabel, detailLabel, playlistLabel } = summary;

  return (
    <Pressable
      onPress={onPress}
      onLongPress={onLongPress}
      accessibilityActions={onLongPress ? [{ name: 'saveAsRoutine', label: 'Save as routine' }] : undefined}
      onAccessibilityAction={(e) => {
        if (e.nativeEvent.actionName === 'saveAsRoutine') onLongPress?.();
      }}
      accessibilityHint={onLongPress ? 'Long press for more options' : undefined}
      accessibilityRole="button"
      accessibilityLabel={[title, subtitle, durationLabel, detailLabel, playlistLabel ? `Playlist ${playlistLabel}` : null].filter(Boolean).join('. ')}
      style={({ pressed }) => [styles.row, pressed && { opacity: 0.85 }, !last && { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: separator }]}
    >
      <View style={styles.main}>
        <Text style={[styles.title, { color: text }]} numberOfLines={1}>
          {title}
        </Text>
        <Text style={[styles.subtitle, { color: muted }]} numberOfLines={1}>
          {subtitle}
        </Text>
        {playlistLabel ? (
          <View style={styles.playlist}>
            <IconSymbol name="music.note" size={11} color={muted} />
            <Text style={[styles.playlistText, { color: muted }]} numberOfLines={1}>
              {playlistLabel}
            </Text>
          </View>
        ) : null}
      </View>
      <View style={styles.side}>
        <Text style={[styles.duration, { color: text }]}>{durationLabel}</Text>
        {detailLabel ? <Text style={[styles.detail, { color: muted }]}>{detailLabel}</Text> : null}
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 16, paddingVertical: 12, minHeight: 44 },
  main: { flex: 1, minWidth: 0, gap: 2 },
  title: { fontSize: 15 },
  subtitle: { fontSize: 12, fontVariant: ['tabular-nums'] },
  playlist: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  playlistText: { flexShrink: 1, fontSize: 12 },
  side: { alignItems: 'flex-end', gap: 2, flexShrink: 0, maxWidth: '45%' },
  duration: { fontSize: 13, fontWeight: '700', fontVariant: ['tabular-nums'] },
  detail: { fontSize: 12, fontVariant: ['tabular-nums'] },
});
