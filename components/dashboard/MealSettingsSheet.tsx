import { useState } from 'react';
import {
  InputAccessoryView,
  Linking,
  Keyboard,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import type { Colors } from '@/constants/theme';
import { TimePickerSheet } from '@/components/time-picker-sheet';
import { formatReminderTime, parseReminderTime, parseTarget, toReminderTime } from '@/lib/meals';
import { requestReminderPermission } from '@/lib/reminders';
import type { MealTargets } from '@/lib/types';

type Props = {
  visible: boolean;
  mealName: string;
  targets: MealTargets;
  /** 'HH:mm' (24h) or null when no reminder is set. */
  reminderTime: string | null;
  colors: (typeof Colors)['light'];
  onSave: (targets: MealTargets, reminderTime: string | null) => void;
  onClose: () => void;
};

const DEFAULT_REMINDER = '12:00';

const FIELDS: { key: keyof MealTargets; label: string; unit: string }[] = [
  { key: 'calorie_target', label: 'Calories', unit: 'cal' },
  { key: 'protein_target', label: 'Protein', unit: 'g' },
  { key: 'carb_target', label: 'Carbs', unit: 'g' },
  { key: 'fat_target', label: 'Fat', unit: 'g' },
];

const ACCESSORY_ID = 'meal-targets-done';

const toText = (n: number | null) => (n == null ? '' : String(n));

/** Compact sheet for a meal's optional targets and daily reminder. Targets never change the daily goals. */
export function MealSettingsSheet(props: Props) {
  // Remount the body each time it opens so the inputs start from the current targets.
  return (
    <Modal visible={props.visible} animationType="fade" transparent onRequestClose={props.onClose}>
      {props.visible && <SheetBody {...props} />}
    </Modal>
  );
}

function SheetBody({ mealName, targets, reminderTime, colors, onSave, onClose }: Props) {
  const [text, setText] = useState<Record<keyof MealTargets, string>>({
    calorie_target: toText(targets.calorie_target),
    protein_target: toText(targets.protein_target),
    carb_target: toText(targets.carb_target),
    fat_target: toText(targets.fat_target),
  });
  const [focused, setFocused] = useState<keyof MealTargets | null>(null);
  const [reminder, setReminder] = useState<string | null>(reminderTime);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [denied, setDenied] = useState(false);

  // Permission is requested only when the user turns a reminder on.
  const toggleReminder = async (on: boolean) => {
    if (!on) {
      setReminder(null);
      setDenied(false);
      return;
    }
    const granted = await requestReminderPermission();
    setDenied(!granted);
    if (granted) setReminder(DEFAULT_REMINDER);
  };

  const pickerValue = (() => {
    const p = parseReminderTime(reminder ?? DEFAULT_REMINDER)!;
    return new Date(2000, 0, 1, p.hour, p.minute);
  })();

  const invalid = FIELDS.some((f) => parseTarget(text[f.key]) === undefined);

  const save = () => {
    if (invalid) return;
    onSave(
      {
        calorie_target: parseTarget(text.calorie_target) ?? null,
        protein_target: parseTarget(text.protein_target) ?? null,
        carb_target: parseTarget(text.carb_target) ?? null,
        fat_target: parseTarget(text.fat_target) ?? null,
      },
      reminder
    );
  };

  // A tap outside closes the sheet, but with the keyboard open it only dismisses the keyboard
  // so typed values are not silently discarded.
  const onOverlayPress = () => {
    if (Keyboard.isVisible()) Keyboard.dismiss();
    else onClose();
  };

  return (
    <KeyboardAvoidingView style={styles.overlay} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <Pressable
        style={StyleSheet.absoluteFill}
        onPress={onOverlayPress}
        accessibilityLabel="Close targets"
        accessibilityRole="button"
      />
      <View style={[styles.sheet, { backgroundColor: colors.background }]}>
        <Text style={[styles.title, { color: colors.text }]} numberOfLines={1}>
          {mealName} settings
        </Text>
        <Text style={[styles.note, { color: colors.icon }]}>
          Targets are optional. Leave a field blank for no target. Targets do not change your daily goals.
        </Text>

        <ScrollView
          style={styles.fields}
          contentContainerStyle={styles.fieldsContent}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
        {FIELDS.map((f) => {
          const bad = parseTarget(text[f.key]) === undefined;
          const isFocused = focused === f.key;
          return (
            <View key={f.key} style={styles.fieldRow}>
              <Text style={[styles.fieldLabel, { color: colors.text }]}>{f.label}</Text>
              <TextInput
                style={[
                  styles.input,
                  {
                    color: colors.text,
                    backgroundColor: isFocused ? colors.cardBackground : colors.cardSecondary,
                    borderColor: bad ? colors.danger : isFocused ? colors.tint : colors.fieldBorder,
                  },
                ]}
                value={text[f.key]}
                onChangeText={(v) => setText((t) => ({ ...t, [f.key]: v }))}
                onFocus={() => setFocused(f.key)}
                onBlur={() => setFocused(null)}
                keyboardType="decimal-pad"
                returnKeyType="done"
                blurOnSubmit
                onSubmitEditing={() => Keyboard.dismiss()}
                inputAccessoryViewID={ACCESSORY_ID}
                placeholder="None"
                placeholderTextColor={colors.icon}
                accessibilityLabel={`${mealName} ${f.label.toLowerCase()} target`}
                maxLength={7}
              />
              <Text style={[styles.unit, { color: colors.icon }]}>{f.unit}</Text>
            </View>
          );
        })}

        <View style={[styles.reminderSection, { borderTopColor: colors.separator }]}>
          <View style={styles.reminderRow}>
            <Text style={[styles.fieldLabel, styles.reminderLabel, { color: colors.text }]}>Reminder</Text>
            {reminder != null && (
              <TouchableOpacity
                style={[styles.timeBtn, { backgroundColor: colors.cardSecondary, borderColor: colors.fieldBorder }]}
                onPress={() => setPickerOpen(true)}
                accessibilityRole="button"
                accessibilityLabel={`Reminder time, ${formatReminderTime(reminder)}`}
              >
                <Text style={[styles.timeText, { color: colors.text }]}>{formatReminderTime(reminder)}</Text>
              </TouchableOpacity>
            )}
            <View style={styles.switchWrap}>
              <Switch
                value={reminder != null}
                onValueChange={toggleReminder}
                trackColor={{ true: colors.tint }}
                accessibilityLabel={`${mealName} daily reminder`}
              />
            </View>
          </View>
          <Text style={[styles.note, { color: colors.icon }]}>
            A notification each day at this time. Off by default.
          </Text>
          {denied && (
            <View style={styles.deniedRow}>
              <Text style={[styles.note, styles.deniedText, { color: colors.text }]}>
                Notifications are turned off for BinoFit.
              </Text>
              <TouchableOpacity
                onPress={() => Linking.openSettings()}
                style={styles.settingsBtn}
                accessibilityRole="button"
                accessibilityLabel="Open system settings"
              >
                <Text style={[styles.settingsLink, { color: colors.tint }]}>Open settings</Text>
              </TouchableOpacity>
            </View>
          )}
        </View>
        </ScrollView>

        <View style={styles.buttons}>
          <TouchableOpacity
            style={[styles.btn, { backgroundColor: colors.cardSecondary }]}
            onPress={onClose}
            accessibilityRole="button"
          >
            <Text style={[styles.btnText, { color: colors.text }]}>Cancel</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.btn, { backgroundColor: colors.tint, opacity: invalid ? 0.5 : 1 }]}
            onPress={save}
            disabled={invalid}
            accessibilityRole="button"
            accessibilityState={{ disabled: invalid }}
          >
            <Text style={[styles.btnText, styles.btnTextPrimary, { color: colors.background }]}>Save</Text>
          </TouchableOpacity>
        </View>
      </View>
      <TimePickerSheet
        visible={pickerOpen}
        value={pickerValue}
        onChange={(d) => setReminder(toReminderTime(d))}
        onClose={() => setPickerOpen(false)}
        colors={colors}
      />
      {Platform.OS === 'ios' && (
        <InputAccessoryView nativeID={ACCESSORY_ID}>
          <View style={[styles.accessory, { backgroundColor: colors.cardSecondary, borderTopColor: colors.separator }]}>
            <TouchableOpacity
              onPress={() => Keyboard.dismiss()}
              style={styles.accessoryBtn}
              accessibilityRole="button"
              accessibilityLabel="Done"
            >
              <Text style={[styles.accessoryText, { color: colors.tint }]}>Done</Text>
            </TouchableOpacity>
          </View>
        </InputAccessoryView>
      )}
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  sheet: {
    width: '100%',
    maxHeight: '90%',
    borderTopLeftRadius: 18,
    borderTopRightRadius: 18,
    padding: 20,
    paddingBottom: 28,
    gap: 12,
  },
  fields: { flexShrink: 1 },
  fieldsContent: { gap: 12 },
  accessory: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  accessoryBtn: { minHeight: 44, minWidth: 64, paddingHorizontal: 16, justifyContent: 'center' },
  accessoryText: { fontSize: 16, fontWeight: '600' },
  title: { fontSize: 17, fontWeight: '600' },
  note: { fontSize: 12, lineHeight: 17 },
  fieldRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  fieldLabel: { width: 72, fontSize: 15 },
  input: {
    flex: 1,
    height: 44,
    borderRadius: 8,
    borderWidth: 1.5,
    paddingHorizontal: 12,
    fontSize: 15,
    fontVariant: ['tabular-nums'],
  },
  unit: { width: 28, fontSize: 13 },
  reminderSection: { borderTopWidth: StyleSheet.hairlineWidth, paddingTop: 12, gap: 6 },
  reminderRow: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 44 },
  reminderLabel: { flex: 1 },
  timeBtn: {
    height: 44,
    minWidth: 96,
    borderRadius: 8,
    borderWidth: 1.5,
    paddingHorizontal: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  timeText: { fontSize: 15, fontVariant: ['tabular-nums'] },
  switchWrap: { minWidth: 52, minHeight: 44, alignItems: 'flex-end', justifyContent: 'center' },
  deniedRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  deniedText: { flex: 1 },
  settingsBtn: { minHeight: 44, justifyContent: 'center' },
  settingsLink: { fontSize: 13, fontWeight: '600' },
  buttons: { flexDirection: 'row', gap: 12, marginTop: 4 },
  btn: { flex: 1, height: 48, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  btnText: { fontSize: 16, fontWeight: '400' },
  btnTextPrimary: { fontWeight: '600' },
});
