import { useEffect, useRef, useState, type ReactNode } from 'react';
import { AccessibilityInfo, Platform, StyleSheet, View, Text, TextInput, TouchableOpacity } from 'react-native';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import type { Colors } from '@/constants/theme';
import { FoodLogRow } from '@/components/dashboard/FoodLogRow';
import { MealTargetsSheet } from '@/components/dashboard/MealTargetsSheet';
import { slotCalories, sumEatenTotals, logsForSlot } from '@/lib/nutrition-totals';
import { MEAL_LIMITS, formatMealTargets, hasAnyTarget, mealSummary } from '@/lib/meals';
import type { FoodLogWithFood, MealSlot, MealTargets } from '@/lib/types';

/** Fixed height of a card in edit mode, so rows can be dragged by index. */
export const MEAL_EDIT_CARD_HEIGHT = 112;

type Colors_ = (typeof Colors)['light'];

type BaseProps = {
  slot: MealSlot;
  label: string;
  /** Logs for this slot only. */
  logs: FoodLogWithFood[];
  /** Optional per-meal targets. */
  targets?: MealTargets | null;
  colors: Colors_;
};

type ViewProps = BaseProps & {
  mode?: 'view';
  /** True when the slot is shown as Eaten, false when Planned. */
  eaten: boolean;
  showToggle: boolean;
  /** False hides the add button and empty prompt (e.g. for the "Other" group). */
  allowAdd?: boolean;
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
  onChangeTargets: (targets: MealTargets) => void;
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
  onAdd,
  onEditLog,
  onDeleteLog,
  colors,
}: ViewProps) {
  const slotCals = Math.round(slotCalories(logs, slot));
  const hasLogs = logs.length > 0;
  const targetText = formatMealTargets(
    targets,
    sumEatenTotals(logsForSlot(logs, slot), [])
  );
  const calText = targetText.calories ?? (slotCals > 0 ? `${slotCals} cal` : null);

  return (
    <View
      style={[
        styles.slotCard,
        { backgroundColor: colors.cardBackground },
        hasLogs &&
          !eaten && {
            opacity: 0.7,
            borderWidth: 1,
            borderStyle: 'dashed',
            borderColor: colors.icon + '40',
          },
      ]}
    >
      <View style={styles.slotHeader}>
        <View style={styles.slotHeaderLeft}>
          <Text style={[styles.slotLabel, { color: colors.text }]}>{label}</Text>
          {calText && <Text style={[styles.slotCals, { color: colors.icon }]}>{calText}</Text>}
          {targetText.macros && (
            <Text style={[styles.slotMacros, { color: colors.icon }]}>{targetText.macros}</Text>
          )}
        </View>

        <View style={styles.slotHeaderRight}>
          {showToggle && (
            <TouchableOpacity
              style={[
                styles.confirmBtn,
                {
                  backgroundColor: eaten ? colors.tint + '18' : colors.icon + '12',
                },
              ]}
              onPress={() => onToggle(slot)}
              activeOpacity={0.7}
              hitSlop={{ top: 7, bottom: 7, left: 4, right: 4 }}
              accessibilityRole="button"
              accessibilityLabel={`${label}, ${eaten ? 'Eaten' : 'Planned'}`}
              accessibilityHint="Switches between Eaten and Planned"
            >
              <MaterialIcons
                name={eaten ? 'check-circle' : 'radio-button-unchecked'}
                size={18}
                color={eaten ? colors.tint : colors.icon}
              />
              <Text style={[styles.confirmBtnText, { color: eaten ? colors.tint : colors.icon }]}>
                {eaten ? 'Eaten' : 'Planned'}
              </Text>
            </TouchableOpacity>
          )}
          {allowAdd && (
            <TouchableOpacity
              style={[styles.addBtn, { backgroundColor: colors.tint + '18' }]}
              onPress={() => onAdd(slot)}
              activeOpacity={0.7}
              hitSlop={{ top: 5, bottom: 5, left: 5, right: 5 }}
              accessibilityRole="button"
              accessibilityLabel={`Add food to ${label}`}
            >
              <MaterialIcons name="add" size={20} color={colors.tint} />
            </TouchableOpacity>
          )}
        </View>
      </View>

      {hasLogs && (
        <View style={styles.logList}>
          {logs.map((log) => (
            <FoodLogRow
              key={log.id}
              log={log}
              colors={colors}
              onEdit={onEditLog}
              onDelete={onDeleteLog}
            />
          ))}
        </View>
      )}

      {!hasLogs && allowAdd && (
        <TouchableOpacity style={styles.emptySlot} onPress={() => onAdd(slot)} activeOpacity={0.6}>
          <Text style={[styles.emptySlotText, { color: colors.icon }]}>Tap to add food</Text>
        </TouchableOpacity>
      )}
    </View>
  );
}

function EditCard({
  slot,
  label,
  logs,
  targets,
  colors,
  index,
  nameError,
  canDelete,
  dragHandle,
  onChangeName,
  onChangeTargets,
  onDelete,
}: EditProps) {
  const [focused, setFocused] = useState(false);
  const [targetsOpen, setTargetsOpen] = useState(false);
  // Announce a name error the first time it appears (live regions are not read on iOS).
  const hadError = useRef(false);
  useEffect(() => {
    if (nameError && !hadError.current && Platform.OS === 'ios') {
      AccessibilityInfo.announceForAccessibility(nameError);
    }
    hadError.current = !!nameError;
  }, [nameError]);
  const slotLogs = logsForSlot(logs, slot);
  const summary = mealSummary(slotLogs.length, slotCalories(logs, slot));
  const currentTargets: MealTargets = targets ?? {
    calorie_target: null,
    protein_target: null,
    carb_target: null,
    fat_target: null,
  };

  return (
    <View
      style={[
        styles.slotCard,
        styles.editCard,
        { backgroundColor: colors.cardBackground, height: MEAL_EDIT_CARD_HEIGHT },
      ]}
    >
      <View style={styles.editRow}>
        {dragHandle}
        <TextInput
          style={[
            styles.nameInput,
            {
              color: colors.text,
              backgroundColor: focused ? colors.cardBackground : colors.cardSecondary,
              borderColor: nameError ? colors.danger : focused ? colors.tint : colors.fieldBorder,
            },
          ]}
          value={label}
          onChangeText={onChangeName}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          maxLength={MEAL_LIMITS.nameMax + 8}
          placeholder="Meal name"
          placeholderTextColor={colors.icon}
          accessibilityLabel={`Meal ${index + 1} name`}
          accessibilityHint={nameError ?? undefined}
          returnKeyType="done"
        />
        <TouchableOpacity
          style={[styles.iconBtn, !canDelete && { opacity: 0.5 }]}
          onPress={onDelete}
          disabled={!canDelete}
          accessibilityRole="button"
          accessibilityLabel={`Delete ${label.trim() || 'meal'}`}
          accessibilityHint={canDelete ? undefined : 'At least one meal is required'}
          accessibilityState={{ disabled: !canDelete }}
        >
          <MaterialIcons name="delete-outline" size={22} color={colors.icon} />
        </TouchableOpacity>
      </View>

      <View style={styles.editFooter}>
        {nameError ? (
          <View style={styles.errorRow} accessibilityLiveRegion="polite">
            <MaterialIcons name="error-outline" size={14} color={colors.danger} />
            <Text style={[styles.errorText, { color: colors.text }]} numberOfLines={1}>
              {nameError}
            </Text>
          </View>
        ) : (
          <Text style={[styles.editCaption, { color: colors.icon }]} numberOfLines={1}>
            {summary}
          </Text>
        )}
        <TouchableOpacity
          onPress={() => setTargetsOpen(true)}
          style={styles.targetsBtn}
          hitSlop={{ top: 4, bottom: 4, left: 8, right: 8 }}
          accessibilityRole="button"
          accessibilityLabel={`${hasAnyTarget(targets) ? 'Edit' : 'Set'} targets for ${label.trim() || 'meal'}`}
        >
          <Text style={[styles.targetsLink, { color: colors.tint }]}>
            {hasAnyTarget(targets) ? 'Edit targets' : 'Set targets'}
          </Text>
        </TouchableOpacity>
      </View>

      <MealTargetsSheet
        visible={targetsOpen}
        mealName={label.trim() || 'Meal'}
        targets={currentTargets}
        colors={colors}
        onClose={() => setTargetsOpen(false)}
        onSave={(t) => {
          onChangeTargets(t);
          setTargetsOpen(false);
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  slotCard: { borderRadius: 18, padding: 16, marginBottom: 14 },
  editCard: { marginBottom: 0, paddingVertical: 12, paddingHorizontal: 8, justifyContent: 'space-between' },
  slotHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  slotHeaderLeft: { flex: 1 },
  slotHeaderRight: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  confirmBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 20,
  },
  confirmBtnText: { fontSize: 13, fontWeight: '600' },
  slotLabel: { fontSize: 16, fontWeight: '600' },
  slotCals: { fontSize: 13, marginTop: 2, fontVariant: ['tabular-nums'] },
  slotMacros: { fontSize: 12, marginTop: 2, fontVariant: ['tabular-nums'] },
  addBtn: { width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center' },
  logList: { marginTop: 12, gap: 2 },
  emptySlot: { marginTop: 10, paddingVertical: 8, alignItems: 'center' },
  emptySlotText: { fontSize: 14 },
  editRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  nameInput: {
    flex: 1,
    height: 44,
    borderRadius: 8,
    borderWidth: 1.5,
    paddingHorizontal: 12,
    fontSize: 16,
    fontWeight: '600',
  },
  iconBtn: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  editFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 12,
    gap: 12,
  },
  editCaption: { flex: 1, fontSize: 12, fontVariant: ['tabular-nums'] },
  errorRow: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 4 },
  errorText: { flex: 1, fontSize: 12 },
  targetsBtn: { minHeight: 44, justifyContent: 'center' },
  targetsLink: { fontSize: 13, fontWeight: '600' },
});
