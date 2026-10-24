import { Pressable, StyleSheet, View } from 'react-native';
import { format, parseISO } from 'date-fns';
import { StreakBadge } from '@/components/StreakBadge';
import { SyncIndicator } from '@/components/SyncIndicator';
import { ThemedText } from '@/components/themed-text';
import { Button } from '@/components/ui/Button';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { useThemeColor } from '@/hooks/use-theme-color';

type Props = {
  selectedDate: string;
  today: string;
  /** Re-reads the streak when this changes (the day's log count). */
  streakTrigger: unknown;
  isEditing: boolean;
  onEdit: () => void;
  onOpenSettings: () => void;
};

/** Date line with sync and streak, the large title and the Edit and settings buttons. */
export function DashboardHeader({ selectedDate, today, streakTrigger, isEditing, onEdit, onOpenSettings }: Props) {
  const icon = useThemeColor({}, 'icon');
  const cardSecondary = useThemeColor({}, 'cardSecondary');
  const date = parseISO(selectedDate);

  if (isEditing) {
    return (
      <View style={styles.editHeader}>
        <ThemedText type="largeTitle">Edit meals</ThemedText>
        <ThemedText type="caption">Rename, reorder or remove meals. Changes apply from today.</ThemedText>
      </View>
    );
  }

  return (
    <View style={styles.header}>
      <View style={styles.row}>
        <ThemedText type="label" numberOfLines={1} style={[styles.date, { color: icon }]}>
          {format(date, 'EEEE, d MMMM')}
        </ThemedText>
        <View style={styles.badges}>
          <SyncIndicator />
          <StreakBadge trigger={streakTrigger} />
        </View>
      </View>
      <View style={styles.row}>
        <ThemedText type="largeTitle" style={styles.title}>
          {selectedDate === today ? 'Today' : format(date, 'EEE d MMM')}
        </ThemedText>
        <View style={styles.actions}>
          <Button label="Edit" variant="soft" size="sm" accessibilityLabel="Edit meals" onPress={onEdit} />
          <Pressable
            onPress={onOpenSettings}
            accessibilityRole="button"
            accessibilityLabel="Nutrition settings"
            style={[styles.settings, { backgroundColor: cardSecondary }]}
          >
            <IconSymbol name="slider.horizontal.3" size={20} color={icon} />
          </Pressable>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  header: { gap: 4 },
  editHeader: { gap: 4 },
  row: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  date: { flexShrink: 1 },
  badges: { flexDirection: 'row', alignItems: 'center', gap: 8, flexShrink: 1, justifyContent: 'flex-end' },
  title: { flexShrink: 1 },
  actions: { flexDirection: 'row', alignItems: 'center', gap: 8, marginLeft: 'auto' },
  settings: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
});
