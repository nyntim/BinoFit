import { useState } from 'react';
import {
  AccessibilityInfo,
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
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { MacroColors } from '@/constants/theme';
import { ThemedText } from '@/components/themed-text';
import { Button } from '@/components/ui/Button';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { SheetHeader } from '@/components/ui/SheetHeader';
import { useThemeColor } from '@/hooks/use-theme-color';
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
  onSave: (targets: MealTargets, reminderTime: string | null) => void;
  onClose: () => void;
};

const DEFAULT_REMINDER = '12:00';
const DENIED_NOTE = 'Notifications are off for BinoFit.';

const FIELDS: { key: keyof MealTargets; label: string; unit: string; dot: 'tint' | keyof typeof MacroColors }[] = [
  { key: 'calorie_target', label: 'Calories', unit: 'cal', dot: 'tint' },
  { key: 'protein_target', label: 'Protein', unit: 'g', dot: 'protein' },
  { key: 'carb_target', label: 'Carbs', unit: 'g', dot: 'carbs' },
  { key: 'fat_target', label: 'Fat', unit: 'g', dot: 'fat' },
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

function SheetBody({ mealName, targets, reminderTime, onSave, onClose }: Props) {
  const overlay = useThemeColor({}, 'overlay');
  const sheetBackground = useThemeColor({}, 'sheetBackground');
  const cardSecondary = useThemeColor({}, 'cardSecondary');
  const cardBackground = useThemeColor({}, 'cardBackground');
  const background = useThemeColor({}, 'background');
  const separator = useThemeColor({}, 'separator');
  const fieldBorder = useThemeColor({}, 'fieldBorder');
  const danger = useThemeColor({}, 'danger');
  const icon = useThemeColor({}, 'icon');
  const tint = useThemeColor({}, 'tint');
  const textColor = useThemeColor({}, 'text');
  const colors = { background, cardBackground, text: textColor, icon, tint };
  const insets = useSafeAreaInsets();
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
  const [asking, setAsking] = useState(false);

  // Permission is requested only when the user turns a reminder on.
  const toggleReminder = async (on: boolean) => {
    if (asking) return;
    if (!on) {
      setReminder(null);
      setDenied(false);
      return;
    }
    setAsking(true);
    let granted = false;
    try {
      granted = await requestReminderPermission();
    } finally {
      setAsking(false);
    }
    setDenied(!granted);
    if (granted) setReminder(DEFAULT_REMINDER);
    else AccessibilityInfo.announceForAccessibility(DENIED_NOTE);
  };

  const openPicker = () => {
    Keyboard.dismiss();
    setPickerOpen(true);
  };

  // Fall back to the default if a stored time is malformed, so the sheet still opens.
  const pickerValue = (() => {
    const p = parseReminderTime(reminder ?? '') ?? parseReminderTime(DEFAULT_REMINDER)!;
    return new Date(2000, 0, 1, p.hour, p.minute);
  })();

  const invalid = FIELDS.some((f) => parseTarget(text[f.key]) === undefined);
  const saveDisabled = invalid || asking;

  const save = () => {
    if (saveDisabled) return;
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
    <KeyboardAvoidingView style={[styles.overlay, { backgroundColor: overlay }]} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <Pressable
        style={StyleSheet.absoluteFill}
        onPress={onOverlayPress}
        accessibilityLabel="Close settings"
        accessibilityRole="button"
      />
      <View
        accessibilityViewIsModal
        accessibilityLabel={`${mealName} targets and reminder`}
        style={[styles.sheet, { backgroundColor: sheetBackground, paddingBottom: 34 + insets.bottom }]}
      >
        <SheetHeader
          grabber
          title={mealName}
          onCancel={onClose}
          action={{ label: 'Save', onPress: save, disabled: saveDisabled }}
        />

        <ScrollView
          style={styles.fields}
          contentContainerStyle={styles.fieldsContent}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <ThemedText type="section">Targets for this meal</ThemedText>
          <View style={[styles.panel, { backgroundColor: cardSecondary }]}>
            {FIELDS.map((f, index) => {
              const bad = parseTarget(text[f.key]) === undefined;
              const isFocused = focused === f.key;
              const dot = f.dot === 'tint' ? tint : MacroColors[f.dot];
              return (
                <View key={f.key} style={[styles.fieldRow, index > 0 && { borderTopColor: separator, borderTopWidth: StyleSheet.hairlineWidth }]}>
                  <View style={[styles.dot, { backgroundColor: dot }]} />
                  <ThemedText type="body" style={styles.fieldLabel}>{f.label}</ThemedText>
                  <TextInput
                    style={[
                      styles.input,
                      {
                        color: textColor,
                        backgroundColor: cardBackground,
                        borderColor: bad ? danger : isFocused ? tint : fieldBorder,
                        borderWidth: bad || isFocused ? 2 : 1,
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
                    placeholderTextColor={icon}
                    accessibilityLabel={`${mealName} ${f.label.toLowerCase()} target`}
                    maxLength={7}
                  />
                  <ThemedText type="label" style={[styles.unit, { color: icon }]}>{f.unit}</ThemedText>
                </View>
              );
            })}
          </View>
          <ThemedText type="caption">Leave a target blank to skip it. Meal targets show on the meal summary.</ThemedText>

          <ThemedText type="section">Reminder</ThemedText>
          <View style={[styles.panel, { backgroundColor: cardSecondary }]}>
            <View style={styles.fieldRow}>
              <ThemedText type="body" style={styles.reminderLabel}>Remind me daily</ThemedText>
              <Switch
                value={reminder != null}
                onValueChange={toggleReminder}
                trackColor={{ true: tint }}
                accessibilityLabel={`${mealName} daily reminder`}
              />
            </View>
            {reminder != null && (
              <View style={[styles.fieldRow, { borderTopColor: separator, borderTopWidth: StyleSheet.hairlineWidth }]}>
                <ThemedText type="body" style={styles.reminderLabel}>Time</ThemedText>
                <Button
                  label={formatReminderTime(reminder)}
                  variant="soft"
                  size="sm"
                  accessibilityLabel={`Reminder time, ${formatReminderTime(reminder)}`}
                  onPress={openPicker}
                />
              </View>
            )}
          </View>
          <ThemedText type="caption">A notification each day at this time. Off by default.</ThemedText>
          {denied && (
            <View style={[styles.denied, { backgroundColor: cardSecondary }]}>
              <IconSymbol name="bell.slash" size={20} color={icon} />
              <ThemedText type="label" style={styles.reminderLabel}>{DENIED_NOTE}</ThemedText>
              <Button label="Open settings" variant="ghost" size="sm" onPress={() => Linking.openSettings()} />
            </View>
          )}
        </ScrollView>
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
          <View style={[styles.accessory, { backgroundColor: cardSecondary, borderTopColor: separator }]}>
            <TouchableOpacity
              onPress={() => Keyboard.dismiss()}
              style={styles.accessoryBtn}
              accessibilityRole="button"
              accessibilityLabel="Done"
            >
              <ThemedText style={[styles.accessoryText, { color: tint }]}>Done</ThemedText>
            </TouchableOpacity>
          </View>
        </InputAccessoryView>
      )}
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  overlay: { flex: 1, justifyContent: 'flex-end' },
  sheet: { width: '100%', maxHeight: '90%', borderTopLeftRadius: 28, borderTopRightRadius: 28, paddingHorizontal: 8, paddingTop: 0, paddingBottom: 34 },
  fields: { flexShrink: 1 },
  fieldsContent: { gap: 8, paddingHorizontal: 12, paddingTop: 8 },
  accessory: { flexDirection: 'row', justifyContent: 'flex-end', borderTopWidth: StyleSheet.hairlineWidth },
  accessoryBtn: { minHeight: 44, minWidth: 64, paddingHorizontal: 16, justifyContent: 'center' },
  accessoryText: { fontSize: 16, fontWeight: '600' },
  panel: { borderRadius: 14, overflow: 'hidden' },
  fieldRow: { flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 52, paddingHorizontal: 14, paddingVertical: 6 },
  dot: { width: 10, height: 10, borderRadius: 5 },
  fieldLabel: { flex: 1 },
  input: { width: 84, height: 40, borderRadius: 12, paddingHorizontal: 10, fontSize: 15, fontWeight: '600', textAlign: 'right', fontVariant: ['tabular-nums'] },
  unit: { width: 28 },
  reminderLabel: { flex: 1 },
  denied: { flexDirection: 'row', alignItems: 'center', gap: 10, borderRadius: 14, paddingLeft: 14, paddingRight: 6, paddingVertical: 6, minHeight: 52 },
});
