import { useEffect, useRef, useState, type ReactNode } from 'react';
import { AccessibilityInfo, findNodeHandle, Platform, Pressable, StyleSheet, TextInput, View, useWindowDimensions, type GestureResponderEvent } from 'react-native';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { FoodLogRow } from '@/components/dashboard/FoodLogRow';
import { MealSettingsSheet } from '@/components/dashboard/MealSettingsSheet';
import { ThemedText } from '@/components/themed-text';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { Tag } from '@/components/ui/Tag';
import { useThemeColor } from '@/hooks/use-theme-color';
import { slotCalories, sumEatenTotals, logsForSlot } from '@/lib/nutrition-totals';
import { MEAL_LIMITS, formatMealTargets, formatReminderTime, mealEditDetail } from '@/lib/meals';
import type { FoodLogWithFood, MealSlot, MealTargets } from '@/lib/types';

/** Fixed height of a card in edit mode, so rows can be dragged by index. */
export const MEAL_EDIT_CARD_HEIGHT = 112;

/** The edit card height at the current text size: the fixed rows grow with Dynamic Type, capped so a drag stays usable. */
export function useEditCardHeight(): number {
  const { fontScale } = useWindowDimensions();
  return Math.ceil(MEAL_EDIT_CARD_HEIGHT * Math.min(Math.max(fontScale, 1), 2));
}

type BaseProps = {
  slot: MealSlot;
  label: string;
  /** Logs for this slot only. */
  logs: FoodLogWithFood[];
  /** Optional per-meal targets and reminder. */
  targets?: (MealTargets & { reminder_time?: string | null }) | null;
};

type ViewProps = BaseProps & {
  mode?: 'view';
  /** True when the slot is shown as Eaten, false when Planned. */
  eaten: boolean;
  showToggle: boolean;
  /** False hides the add button (e.g. for the "Other" group). */
  allowAdd?: boolean;
  onShowNutrition?: (slot: MealSlot, focusTarget?: number | null) => void;
  onToggle: (slot: MealSlot) => void;
  onAdd: (slot: MealSlot) => void;
  onEditLog: (log: FoodLogWithFood) => void;
  onDeleteLog: (log: FoodLogWithFood) => void;
};

type EditProps = BaseProps & {
  mode: 'edit';
  /** Zero-based position in the list, used to label the name input. */
  index: number;
  nameError: string | null;
  canDelete: boolean;
  /** The drag handle element supplied by the reorderable list. */
  dragHandle: ReactNode;
  onChangeName: (name: string) => void;
  onChangeSettings: (targets: MealTargets, reminderTime: string | null) => void;
  onDelete: () => void;
};

export type MealSlotCardProps = ViewProps | EditProps;

export function MealSlotCard(props: MealSlotCardProps) {
  return props.mode === 'edit' ? <EditCard {...props} /> : <ViewCard {...props} />;
}

function ViewCard({
  slot,
  label,
  logs,
  targets,
  eaten,
  showToggle,
  allowAdd = true,
  onToggle,
  onShowNutrition,
  onAdd,
  onEditLog,
  onDeleteLog,
}: ViewProps) {
  const icon = useThemeColor({}, 'icon');
  const tint = useThemeColor({}, 'tint');
  const fieldBorder = useThemeColor({}, 'fieldBorder');
  const separator = useThemeColor({}, 'separator');
  const nutritionRef = useRef<View>(null);
  const totals = sumEatenTotals(logsForSlot(logs, slot), []);
  const slotCals = Math.round(slotCalories(logs, slot));
  const hasLogs = logs.length > 0;
  const targetText = formatMealTargets(targets, totals);
  const caption = targetText.calories || targetText.macros
    ? [targetText.calories, targetText.macros].filter(Boolean).join(' · ')
    : hasLogs
      ? `P ${Math.round(totals.protein)} · C ${Math.round(totals.carbs)} · F ${Math.round(totals.fat)}`
      : 'No food logged';
  const reminderText = targets?.reminder_time ? formatReminderTime(targets.reminder_time) : null;

  const openSummary = (event?: GestureResponderEvent) => {
    event?.stopPropagation();
    onShowNutrition?.(slot, findNodeHandle(nutritionRef.current));
  };

  return (
    <Pressable accessible={false} onPress={onShowNutrition ? openSummary : undefined}>
      <Card
        padding="none"
        style={hasLogs && !eaten ? { borderWidth: 1.5, borderStyle: 'dashed', borderColor: fieldBorder } : null}
      >
        <View style={styles.slotHeader}>
          <Pressable ref={nutritionRef} style={styles.slotHeaderLeft}
            accessible={!!onShowNutrition} accessibilityRole={onShowNutrition ? 'button' : undefined}
            accessibilityLabel={onShowNutrition ? `Nutrition summary for ${label}` : undefined}
            onPress={onShowNutrition ? openSummary : undefined}>
            <View style={styles.labelRow}>
              <ThemedText type="title" numberOfLines={1} style={styles.slotLabel}>{label}</ThemedText>
              {reminderText && (
                <View accessible accessibilityLabel={`Reminder at ${reminderText}`} importantForAccessibility="yes">
                  <IconSymbol name="bell" size={14} color={icon} />
                </View>
              )}
            </View>
            <ThemedText type="caption" style={styles.tabular}>{caption}</ThemedText>
          </Pressable>
          {showToggle && (
            <Pressable
              onPress={(event) => { event?.stopPropagation(); onToggle(slot); }}
              hitSlop={{ top: 11, bottom: 11, left: 6, right: 6 }}
              accessibilityRole="button"
              accessibilityLabel={`${label}, ${eaten ? 'Eaten' : 'Planned'}`}
              accessibilityHint="Switches between Eaten and Planned"
            >
              <Tag label={eaten ? 'Eaten' : 'Planned'} tone={eaten ? 'tint' : 'neutral'} />
            </Pressable>
          )}
          <ThemedText type="stat" style={styles.slotCals}>{slotCals.toLocaleString()}</ThemedText>
        </View>

        {logs.map((log) => (
          <FoodLogRow key={log.id} log={log} onEdit={onEditLog} onDelete={onDeleteLog} />
        ))}

        {allowAdd && (
          <Pressable
            style={({ pressed }) => [styles.addRow, { borderTopColor: separator }, pressed && styles.pressed]}
            onPress={(event) => { event?.stopPropagation(); onAdd(slot); }}
            accessibilityRole="button"
            accessibilityLabel={`Add food to ${label}`}
          >
            <IconSymbol name="plus" size={18} color={tint} />
            <ThemedText type="body" style={[styles.addText, { color: tint }]}>Add food</ThemedText>
          </Pressable>
        )}
      </Card>
    </Pressable>
  );
}

function EditCard({
  label,
  targets,
  index,
  nameError,
  canDelete,
  dragHandle,
  onChangeName,
  onChangeSettings,
  onDelete,
}: EditProps) {
  const cardHeight = useEditCardHeight();
  const text = useThemeColor({}, 'text');
  const icon = useThemeColor({}, 'icon');
  const danger = useThemeColor({}, 'danger');
  const tint = useThemeColor({}, 'tint');
  const cardBackground = useThemeColor({}, 'cardBackground');
  const fieldBorder = useThemeColor({}, 'fieldBorder');
  const [focused, setFocused] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  // Announce a name error the first time it appears (live regions are not read on iOS).
  const hadError = useRef(false);
  useEffect(() => {
    if (nameError && !hadError.current && Platform.OS === 'ios') {
      AccessibilityInfo.announceForAccessibility(nameError);
    }
    hadError.current = !!nameError;
  }, [nameError]);
  const reminderTime = targets?.reminder_time ?? null;
  const detail = mealEditDetail({ reminder_time: reminderTime, calorie_target: targets?.calorie_target ?? null });
  const currentTargets: MealTargets = targets ?? {
    calorie_target: null,
    protein_target: null,
    carb_target: null,
    fat_target: null,
  };

  return (
    <Card padding="none" style={[styles.editCard, { height: cardHeight }]}>
      <View style={styles.editRow}>
        {dragHandle}
        {/* Border-only error state: the message sits on the line below so the card height stays fixed */}
        <TextInput
          style={[
            styles.nameInput,
            {
              color: text,
              backgroundColor: cardBackground,
              borderColor: nameError ? danger : focused ? tint : fieldBorder,
              borderWidth: nameError || focused ? 2 : 1,
            },
          ]}
          value={label}
          onChangeText={onChangeName}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          maxLength={MEAL_LIMITS.nameMax + 8}
          placeholder="Meal name"
          placeholderTextColor={icon}
          accessibilityLabel={`Meal ${index + 1} name`}
          accessibilityHint={nameError ?? undefined}
          returnKeyType="done"
        />
        <Pressable
          style={[styles.iconBtn, !canDelete && styles.disabled]}
          onPress={onDelete}
          disabled={!canDelete}
          accessibilityRole="button"
          accessibilityLabel={`Delete ${label.trim() || 'meal'}`}
          accessibilityHint={canDelete ? undefined : 'At least one meal is required'}
          accessibilityState={{ disabled: !canDelete }}
        >
          <MaterialIcons name="remove-circle-outline" size={22} color={danger} />
        </Pressable>
      </View>

      <View style={styles.editFooter}>
        {nameError ? (
          <View style={styles.detailRow} accessibilityLiveRegion="polite">
            <IconSymbol name="exclamationmark.circle" size={14} color={danger} />
            <ThemedText type="label" style={[styles.flex, { color: danger }]} numberOfLines={1}>{nameError}</ThemedText>
          </View>
        ) : (
          <View style={styles.detailRow}>
            <IconSymbol name="clock" size={14} color={icon} />
            <ThemedText type="caption" style={styles.flex} numberOfLines={1}>{detail}</ThemedText>
          </View>
        )}
        <Button
          label="Targets and reminder"
          variant="ghost"
          size="sm"
          accessibilityLabel={`Targets and reminder, ${label.trim() || 'meal'}`}
          onPress={() => setSettingsOpen(true)}
        />
      </View>

      <MealSettingsSheet
        visible={settingsOpen}
        mealName={label.trim() || 'Meal'}
        targets={currentTargets}
        reminderTime={reminderTime}
        onClose={() => setSettingsOpen(false)}
        onSave={(t, r) => {
          onChangeSettings(t, r);
          setSettingsOpen(false);
        }}
      />
    </Card>
  );
}

const styles = StyleSheet.create({
  slotHeader: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingTop: 14, paddingBottom: 10, paddingLeft: 18, paddingRight: 14 },
  slotHeaderLeft: { flex: 1, minWidth: 0, minHeight: 44, justifyContent: 'center', gap: 2 },
  labelRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  slotLabel: { flexShrink: 1 },
  tabular: { fontVariant: ['tabular-nums'] },
  slotCals: { fontSize: 20, lineHeight: 24 },
  addRow: { flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 48, paddingHorizontal: 18, borderTopWidth: StyleSheet.hairlineWidth },
  addText: { fontWeight: '600' },
  pressed: { opacity: 0.7 },
  disabled: { opacity: 0.5 },
  flex: { flex: 1 },
  editCard: { paddingVertical: 12, paddingHorizontal: 8, justifyContent: 'space-between' },
  editRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  nameInput: { flex: 1, height: 44, borderRadius: 12, paddingHorizontal: 12, fontSize: 16, fontWeight: '600' },
  iconBtn: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  editFooter: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingLeft: 42, gap: 8 },
  detailRow: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 6, minWidth: 0 },
});
