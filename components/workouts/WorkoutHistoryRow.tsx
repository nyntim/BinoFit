import { format, parseISO } from 'date-fns';
import { Pressable, StyleSheet, View } from 'react-native';
import { ThemedText } from '@/components/themed-text';
import { Tag } from '@/components/ui/Tag';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { Fonts } from '@/constants/theme';
import { useThemeColor } from '@/hooks/use-theme-color';
import type { WorkoutSummary } from '@/lib/types';
import { formatRecordCount } from '@/lib/workouts/records';
import { subtitleWithoutDate } from '@/lib/workouts/summary';

type Props = {
  summary: WorkoutSummary;
  onPress: () => void;
  onLongPress?: () => void;
  last?: boolean;
  /** Exercises that set a record; shows an ember tag and extends the spoken label. */
  recordCount?: number;
  /** Leads with a weekday / day number block and drops the date from the detail line (history list). */
  dateBlock?: boolean;
  /** Pads the row for a full-width list surface (a card without its own padding). */
  inset?: boolean;
};

export function WorkoutHistoryRow({ summary, onPress, onLongPress, last, recordCount, dateBlock = false, inset = false }: Props) {
  const text = useThemeColor({}, 'text');
  const muted = useThemeColor({}, 'icon');
  const separator = useThemeColor({}, 'separator');
  const { title, subtitle, durationLabel, detailLabel, playlistLabel } = summary;
  const recordTag = recordCount ? formatRecordCount(recordCount) : null;
  const detail = dateBlock ? subtitleWithoutDate(summary) : subtitle;
  const date = dateBlock ? parseISO(summary.date) : null;

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
      accessibilityLabel={[title, subtitle, durationLabel, detailLabel, playlistLabel ? `Playlist ${playlistLabel}` : null, recordTag]
        .filter(Boolean)
        .join('. ')}
      style={({ pressed }) => [styles.row, inset && styles.inset, pressed && { opacity: 0.85 }, !last && { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: separator }]}
    >
      {date ? (
        <View style={styles.dateBlock} accessible={false} importantForAccessibility="no-hide-descendants">
          <ThemedText type="caption">{format(date, 'EEE')}</ThemedText>
          <ThemedText style={[styles.day, { color: text }]}>{format(date, 'd')}</ThemedText>
        </View>
      ) : null}
      <View style={styles.main}>
        <View style={styles.nameRow}>
          <ThemedText type="body" style={styles.title} numberOfLines={1}>{title}</ThemedText>
          {recordTag ? <Tag label={recordTag} tone="ember" /> : null}
        </View>
        {detail ? <ThemedText type="caption" style={styles.detailLine} numberOfLines={1}>{detail}</ThemedText> : null}
        {playlistLabel ? (
          <View style={styles.playlist}>
            <IconSymbol name="music.note" size={11} color={muted} />
            <ThemedText type="caption" style={styles.playlistText} numberOfLines={1}>{playlistLabel}</ThemedText>
          </View>
        ) : null}
      </View>
      <View style={styles.side}>
        <ThemedText type="label" style={[styles.duration, { color: text }]}>{durationLabel}</ThemedText>
        {detailLabel ? <ThemedText type="caption" style={styles.detail}>{detailLabel}</ThemedText> : null}
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 8, minHeight: 44 },
  inset: { paddingHorizontal: 18, minHeight: 64 },
  dateBlock: { width: 38, alignItems: 'center' },
  day: { fontFamily: Fonts.rounded, fontSize: 18, lineHeight: 22, fontWeight: '800', fontVariant: ['tabular-nums'] },
  main: { flex: 1, minWidth: 0, gap: 2 },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  title: { fontWeight: '600', flexShrink: 1 },
  detailLine: { fontVariant: ['tabular-nums'] },
  playlist: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  playlistText: { flexShrink: 1 },
  side: { alignItems: 'flex-end', gap: 2, flexShrink: 0, maxWidth: '40%' },
  duration: { fontWeight: '700', fontVariant: ['tabular-nums'] },
  detail: { fontVariant: ['tabular-nums'] },
});
