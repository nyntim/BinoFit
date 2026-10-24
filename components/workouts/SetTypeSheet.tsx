import { useRef, useState } from 'react';
import { Modal, Platform, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { ThemedText } from '@/components/themed-text';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { useThemeColor } from '@/hooks/use-theme-color';
import type { SetType } from '@/lib/types';
import { SET_TYPE_DESCRIPTIONS, SET_TYPE_LABELS } from '@/lib/workouts/editor-state';

const ORDER: SetType[] = ['normal', 'warmup', 'drop', 'failure'];
const LETTER: Record<Exclude<SetType, 'normal'>, string> = { warmup: 'W', drop: 'D', failure: 'F' };

type Props = {
  visible: boolean;
  current: SetType;
  /** "Set 3" or "Warm-up set". */
  title: string;
  /** "Barbell bench press · 165 × 7". */
  subtitle?: string;
  /** The number the Normal row shows (the set's number if it were a working set). */
  normalBadge: string;
  /** Value of the "Rest after this exercise" row ("1:30"); the row shows only with `onRest`. */
  restLabel?: string | null;
  onRest?: () => void;
  onSelect: (type: SetType) => void;
  onDelete: () => void;
  onClose: () => void;
};

/** Set type radio list, rest after this exercise and Delete set, in one bottom sheet. */
export function SetTypeSheet({ visible, current, title, subtitle, normalBadge, restLabel, onRest, onSelect, onDelete, onClose }: Props) {
  const { bottom } = useSafeAreaInsets();
  // Keep the last title and subtitle while the Modal slides out after the set is gone
  const [kept, setKept] = useState({ title, subtitle });
  if (visible && (kept.title !== title || kept.subtitle !== subtitle)) setKept({ title, subtitle });
  const shownTitle = visible ? title : kept.title;
  const shownSubtitle = visible ? subtitle : kept.subtitle;
  const sheet = useThemeColor({}, 'sheetBackground');
  const overlay = useThemeColor({}, 'overlay');
  const nested = useThemeColor({}, 'cardSecondary');
  const card = useThemeColor({}, 'cardBackground');
  const text = useThemeColor({}, 'text');
  const muted = useThemeColor({}, 'icon');
  const tint = useThemeColor({}, 'tint');
  const tintSoft = useThemeColor({}, 'tintSoft');
  const onTint = useThemeColor({}, 'onTint');
  const danger = useThemeColor({}, 'danger');
  const grabber = useThemeColor({}, 'fieldBorder');
  const separator = useThemeColor({}, 'separator');

  // iOS cannot present another modal (the rest picker) until this one is gone (onDismiss)
  const pending = useRef<(() => void) | null>(null);
  const runPending = () => {
    const fn = pending.current;
    pending.current = null;
    fn?.();
  };
  const closeThen = (fn: () => void) => {
    pending.current = fn;
    onClose();
    if (Platform.OS !== 'ios') runPending();
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose} onDismiss={runPending}>
      <View style={[styles.overlay, { backgroundColor: overlay }]}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} accessibilityRole="button" accessibilityLabel="Close" />
        <View accessibilityViewIsModal style={[styles.sheet, { backgroundColor: sheet, paddingBottom: 16 + bottom }]}>
          <View style={[styles.grabber, { backgroundColor: grabber }]} accessible={false} importantForAccessibility="no" />
          <ScrollView bounces={false}>
            <View style={styles.head}>
              <ThemedText type="title" style={styles.title} accessibilityRole="header">{shownTitle}</ThemedText>
              {shownSubtitle ? <ThemedText type="label" style={[styles.subtitle, { color: muted }]} numberOfLines={2}>{shownSubtitle}</ThemedText> : null}
            </View>

            <View accessibilityRole="radiogroup" accessibilityLabel="Set type" style={[styles.panel, { backgroundColor: nested }]}>
              {ORDER.map((t, i) => {
                const selected = t === current;
                return (
                  <Pressable
                    key={t}
                    onPress={() => {
                      onSelect(t);
                      onClose();
                    }}
                    accessibilityRole="radio"
                    accessibilityLabel={SET_TYPE_LABELS[t]}
                    accessibilityHint={SET_TYPE_DESCRIPTIONS[t]}
                    accessibilityState={{ checked: selected }}
                    style={[
                      styles.typeRow,
                      selected && { backgroundColor: tintSoft },
                      i > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: separator },
                    ]}
                  >
                    <View style={[styles.badge, { backgroundColor: selected ? tint : card }]}>
                      <ThemedText type="body" style={[styles.badgeText, { color: selected ? onTint : t === 'normal' ? text : muted }]}>
                        {t === 'normal' ? normalBadge : LETTER[t]}
                      </ThemedText>
                    </View>
                    <View style={styles.copy}>
                      <ThemedText type="body" style={styles.name}>{SET_TYPE_LABELS[t]}</ThemedText>
                      <ThemedText type="caption">{SET_TYPE_DESCRIPTIONS[t]}</ThemedText>
                    </View>
                    {selected ? <IconSymbol name="checkmark" size={20} color={tint} /> : null}
                  </Pressable>
                );
              })}
            </View>

            <View style={[styles.panel, { backgroundColor: nested }]}>
              {onRest ? (
                <Pressable
                  onPress={() => closeThen(onRest)}
                  accessibilityRole="button"
                  accessibilityLabel={`Rest after this exercise${restLabel ? `, ${restLabel}` : ''}`}
                  style={[styles.actionRow, { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: separator }]}
                >
                  <IconSymbol name="timer" size={20} color={muted} />
                  <ThemedText type="body" style={styles.actionText}>Rest after this exercise</ThemedText>
                  {restLabel ? <ThemedText type="body" style={[styles.value, { color: muted }]}>{restLabel}</ThemedText> : null}
                  <IconSymbol name="chevron.right" size={16} color={muted} />
                </Pressable>
              ) : null}
              <Pressable
                onPress={() => {
                  onDelete();
                  onClose();
                }}
                accessibilityRole="button"
                accessibilityLabel="Delete set"
                style={styles.actionRow}
              >
                <IconSymbol name="trash" size={20} color={danger} />
                <ThemedText type="body" style={[styles.actionText, { color: danger }]}>Delete set</ThemedText>
              </Pressable>
            </View>
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: { flex: 1, justifyContent: 'flex-end' },
  sheet: { borderTopLeftRadius: 28, borderTopRightRadius: 28, paddingTop: 8, paddingHorizontal: 16, maxHeight: '90%' },
  grabber: { alignSelf: 'center', width: 36, height: 5, borderRadius: 3, marginBottom: 8 },
  head: { alignItems: 'center', gap: 2, paddingVertical: 8 },
  title: { fontSize: 20, fontWeight: '700' },
  subtitle: { textAlign: 'center', fontVariant: ['tabular-nums'] },
  panel: { borderRadius: 14, overflow: 'hidden', marginTop: 12 },
  typeRow: { minHeight: 60, flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 14, paddingVertical: 8 },
  badge: { width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  badgeText: { fontWeight: '700', fontVariant: ['tabular-nums'] },
  copy: { flex: 1, minWidth: 0, gap: 1 },
  name: { fontWeight: '600' },
  actionRow: { minHeight: 52, flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 14, paddingVertical: 8 },
  actionText: { flex: 1 },
  value: { fontVariant: ['tabular-nums'] },
});
