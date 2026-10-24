import { useEffect, useState } from 'react';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  AccessibilityInfo,
  Alert,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import DateTimePicker from '@react-native-community/datetimepicker';
import { format, isToday, parseISO } from 'date-fns';
import { ThemedText } from '@/components/themed-text';
import { Button } from '@/components/ui/Button';
import { SheetHeader } from '@/components/ui/SheetHeader';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { Fonts } from '@/constants/theme';
import { useThemeColor } from '@/hooks/use-theme-color';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { usePreferences } from '@/hooks/usePreferences';
import { syncToSupabase } from '@/lib/sync';
import { formatWeight } from '@/lib/units';
import { formatShortDate } from '@/lib/workouts/format';
import {
  deleteWeightEntriesForDate,
  saveWeightEntry,
  weightInputToKg,
  weightRangeMessage,
} from '@/lib/weight';
import type { WeightEntry } from '@/lib/types';

type Props = {
  visible: boolean;
  /** The entry being edited, or null to log a new one. */
  entry: WeightEntry | null;
  onClose: () => void;
  /** Called after a save or delete so the list can reload. */
  onChanged: () => void;
};

/** Sheet for logging, editing or deleting a day's weight. */
export function WeightEntrySheet({ visible, entry, onClose, onChanged }: Props) {
  // Remount the body each time it opens so it starts from the entry's values.
  return (
    <Modal visible={visible} animationType="fade" transparent onRequestClose={onClose}>
      {visible && <SheetBody entry={entry} onClose={onClose} onChanged={onChanged} />}
    </Modal>
  );
}

function SheetBody({ entry, onClose, onChanged }: Omit<Props, 'visible'>) {
  const overlay = useThemeColor({}, 'overlay');
  const sheetBackground = useThemeColor({}, 'sheetBackground');
  const text = useThemeColor({}, 'text');
  const icon = useThemeColor({}, 'icon');
  const tint = useThemeColor({}, 'tint');
  const tintSoft = useThemeColor({}, 'tintSoft');
  const cardSecondary = useThemeColor({}, 'cardSecondary');
  const danger = useThemeColor({}, 'danger');
  const dangerSoft = useThemeColor({}, 'dangerSoft');
  const { bottom } = useSafeAreaInsets();
  const scheme = useColorScheme() ?? 'light';
  const { weightUnit: unit } = usePreferences();

  const editing = entry !== null;
  const [input, setInput] = useState(entry ? formatWeight(entry.weight_kg, unit) : '');
  const [date, setDate] = useState(() => (entry ? parseISO(entry.date) : new Date()));
  const [pickerOpen, setPickerOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  const kg = weightInputToKg(input, unit);
  const invalid = kg === null;
  const showError = invalid && input.trim().length > 0;

  useEffect(() => {
    if (showError && Platform.OS === 'ios') AccessibilityInfo.announceForAccessibility(weightRangeMessage(unit));
  }, [showError, unit]);

  const save = async () => {
    if (kg === null || busy) return;
    setBusy(true);
    try {
      await saveWeightEntry({ date: format(date, 'yyyy-MM-dd'), weight_kg: kg });
      syncToSupabase();
      onChanged();
      onClose();
    } catch {
      setBusy(false);
      Alert.alert("Couldn't save weight", 'Your entry was not saved. Try again.');
    }
  };

  const confirmDelete = () => {
    if (!entry || busy) return;
    Alert.alert('Delete this entry?', undefined, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          setBusy(true);
          try {
            await deleteWeightEntriesForDate(entry.date);
            syncToSupabase();
            onChanged();
            onClose();
          } catch {
            setBusy(false);
            Alert.alert("Couldn't delete entry", 'Try again.');
          }
        },
      },
    ]);
  };

  const dateLabel = isToday(date) ? 'Today' : format(date, 'EEE d MMM');
  const valueSize = editing ? 56 : 60;

  return (
    <KeyboardAvoidingView
      style={[styles.overlay, { backgroundColor: overlay }]}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <Pressable
        style={StyleSheet.absoluteFill}
        onPress={onClose}
        accessibilityLabel="Close weight entry"
        accessibilityRole="button"
      />
      <View
        style={[styles.sheet, { backgroundColor: sheetBackground, paddingBottom: bottom + 20 }]}
        accessibilityViewIsModal
      >
        <SheetHeader
          grabber
          title={entry ? formatShortDate(entry.date) : 'Log weight'}
          onCancel={onClose}
          action={{ label: 'Save', onPress: save, disabled: invalid, loading: busy }}
        />
        <View style={styles.content}>
          <View style={styles.valueBlock}>
            <TextInput
              style={[
                styles.input,
                { color: text, fontSize: valueSize, lineHeight: valueSize + 8 },
                editing && { borderBottomWidth: 2, borderBottomColor: tint },
              ]}
              value={input}
              onChangeText={setInput}
              keyboardType="decimal-pad"
              autoFocus
              placeholder="0"
              placeholderTextColor={icon}
              accessibilityLabel={`Weight in ${unit}`}
            />
            <ThemedText type="body" style={[styles.unitLine, { color: icon }]}>
              {entry ? `${unit} · logged at ${format(parseISO(entry.measured_at), 'h:mm a')}` : unit}
            </ThemedText>
          </View>

          {showError && (
            <ThemedText type="label" style={[styles.error, { color: danger }]} accessibilityLiveRegion="polite">
              {weightRangeMessage(unit)}
            </ThemedText>
          )}

          {!editing && (
            <View style={[styles.dateRow, { backgroundColor: cardSecondary }]}>
              <ThemedText type="body">Date</ThemedText>
              {Platform.OS === 'ios' ? (
                <DateTimePicker
                  value={date}
                  mode="date"
                  display="compact"
                  maximumDate={new Date()}
                  themeVariant={scheme}
                  onChange={(_, d) => {
                    if (d) setDate(d);
                  }}
                />
              ) : (
                <TouchableOpacity
                  onPress={() => setPickerOpen(true)}
                  style={styles.dateButton}
                  accessibilityRole="button"
                  accessibilityLabel={`Date, ${dateLabel}`}
                >
                  <ThemedText type="body" style={{ color: tint }}>
                    {dateLabel}
                  </ThemedText>
                </TouchableOpacity>
              )}
            </View>
          )}
          {pickerOpen && !editing && Platform.OS !== 'ios' && (
            <DateTimePicker
              value={date}
              mode="date"
              maximumDate={new Date()}
              onChange={(event, d) => {
                setPickerOpen(false);
                if (event.type === 'set' && d) setDate(d);
              }}
            />
          )}

          {!editing && Platform.OS === 'ios' && (
            <View style={[styles.notice, { backgroundColor: tintSoft }]}>
              <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
                <IconSymbol name="heart.fill" size={16} color={tint} />
              </View>
              <ThemedText type="label" style={styles.noticeText}>
                Apple Health readings import on their own. A weight you log here wins for that day.
              </ThemedText>
            </View>
          )}

          {editing && (
            <>
              <Button
                variant="danger"
                size="lg"
                icon="trash"
                label="Delete entry"
                disabled={busy}
                onPress={confirmDelete}
                style={{ backgroundColor: dangerSoft }}
              />
              <ThemedText type="caption" style={styles.footnote}>
                Your profile weight follows the latest entry.
              </ThemedText>
            </>
          )}
        </View>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  overlay: { flex: 1, justifyContent: 'flex-end' },
  sheet: {
    width: '100%',
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
  },
  content: { paddingHorizontal: 20, paddingTop: 8, gap: 16 },
  valueBlock: { alignItems: 'center', gap: 2 },
  input: {
    alignSelf: 'stretch',
    textAlign: 'center',
    fontFamily: Fonts.rounded,
    fontWeight: '800',
    fontVariant: ['tabular-nums'],
    paddingVertical: 4,
  },
  unitLine: { textAlign: 'center' },
  error: { textAlign: 'center' },
  dateRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderRadius: 14,
    paddingHorizontal: 16,
    minHeight: 52,
  },
  dateButton: { minHeight: 44, justifyContent: 'center' },
  notice: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    borderRadius: 14,
    paddingVertical: 12,
    paddingHorizontal: 14,
  },
  noticeText: { flex: 1 },
  footnote: { textAlign: 'center' },
});
