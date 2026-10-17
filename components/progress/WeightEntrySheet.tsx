import { useState } from 'react';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  Alert,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import DateTimePicker from '@react-native-community/datetimepicker';
import { format, parseISO } from 'date-fns';
import { useThemeColor } from '@/hooks/use-theme-color';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { usePreferences } from '@/hooks/usePreferences';
import { syncToSupabase } from '@/lib/sync';
import { formatWeight } from '@/lib/units';
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
  const background = useThemeColor({}, 'background');
  const text = useThemeColor({}, 'text');
  const icon = useThemeColor({}, 'icon');
  const tint = useThemeColor({}, 'tint');
  const cardSecondary = useThemeColor({}, 'cardSecondary');
  const danger = useThemeColor({}, 'danger');
  const { bottom } = useSafeAreaInsets();
  const scheme = useColorScheme() ?? 'light';
  const { weightUnit: unit } = usePreferences();

  const editing = entry !== null;
  const [input, setInput] = useState(entry ? formatWeight(entry.weight_kg, unit) : '');
  const [focused, setFocused] = useState(false);
  const [date, setDate] = useState(() => (entry ? parseISO(entry.date) : new Date()));
  const [pickerOpen, setPickerOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  const kg = weightInputToKg(input, unit);
  const invalid = kg === null;
  const showError = invalid && input.trim().length > 0;
  const disabled = invalid || busy;

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

  const dateLabel = format(date, 'EEE d MMM yyyy');

  return (
    <KeyboardAvoidingView
      style={styles.overlay}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <Pressable
        style={StyleSheet.absoluteFill}
        onPress={onClose}
        accessibilityLabel="Close weight entry"
        accessibilityRole="button"
      />
      <View style={[styles.sheet, { backgroundColor: background, paddingBottom: bottom + 12 }]}>
        <Text style={[styles.title, { color: text }]}>{editing ? 'Edit weight' : 'Log weight'}</Text>

        <View
          style={[
            styles.field,
            {
              backgroundColor: cardSecondary,
              borderColor: showError ? danger : focused ? tint : 'transparent',
            },
          ]}
        >
          <TextInput
            style={[styles.input, { color: text }]}
            value={input}
            onChangeText={setInput}
            onFocus={() => setFocused(true)}
            onBlur={() => setFocused(false)}
            keyboardType="decimal-pad"
            autoFocus
            placeholder="0"
            placeholderTextColor={icon}
            accessibilityLabel={`Weight in ${unit}`}
          />
          <Text style={[styles.suffix, { color: icon }]}>{unit}</Text>
        </View>

        {showError && (
          <Text style={[styles.error, { color: icon }]} accessibilityLiveRegion="polite">
            {weightRangeMessage(unit)}
          </Text>
        )}

        <View style={[styles.dateRow, { backgroundColor: cardSecondary }]}>
          <Text style={[styles.dateKey, { color: text }]}>Date</Text>
          {editing ? (
            <Text style={[styles.dateValue, { color: icon }]}>{dateLabel}</Text>
          ) : Platform.OS === 'ios' ? (
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
              <Text style={[styles.dateValue, { color: tint }]}>{dateLabel}</Text>
            </TouchableOpacity>
          )}
        </View>
        {pickerOpen && Platform.OS !== 'ios' && (
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

        <TouchableOpacity
          style={[styles.button, { backgroundColor: tint, opacity: disabled ? 0.5 : 1 }]}
          onPress={save}
          disabled={disabled}
          accessibilityRole="button"
          accessibilityLabel="Save"
          accessibilityState={{ disabled }}
        >
          <Text style={[styles.buttonText, { color: background }]}>Save</Text>
        </TouchableOpacity>

        {editing && (
          <TouchableOpacity
            style={styles.ghost}
            onPress={confirmDelete}
            disabled={busy}
            accessibilityRole="button"
            accessibilityLabel="Delete entry"
          >
            <Text style={[styles.ghostText, { color: text }]}>Delete entry</Text>
          </TouchableOpacity>
        )}
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  sheet: {
    width: '100%',
    borderTopLeftRadius: 18,
    borderTopRightRadius: 18,
    padding: 20,
    gap: 12,
  },
  title: { fontSize: 17, fontWeight: '600' },
  field: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 8,
    borderWidth: 1.5,
    paddingHorizontal: 16,
    minHeight: 56,
  },
  input: { flex: 1, fontSize: 28, fontWeight: '700', fontVariant: ['tabular-nums'], paddingVertical: 8 },
  suffix: { fontSize: 17, fontWeight: '500', marginLeft: 8 },
  error: { fontSize: 13, lineHeight: 18 },
  dateRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderRadius: 12,
    paddingHorizontal: 16,
    minHeight: 48,
  },
  dateKey: { fontSize: 15 },
  dateValue: { fontSize: 15, fontVariant: ['tabular-nums'] },
  dateButton: { minHeight: 44, justifyContent: 'center' },
  button: {
    minHeight: 48,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 4,
  },
  buttonText: { fontSize: 17, fontWeight: '600' },
  ghost: { minHeight: 44, alignItems: 'center', justifyContent: 'center' },
  ghostText: { fontSize: 15, fontWeight: '600' },
});
