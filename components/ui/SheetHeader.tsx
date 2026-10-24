import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { useThemeColor } from '@/hooks/use-theme-color';

type Action = { label: string; onPress: () => void; disabled?: boolean; loading?: boolean; accessibilityLabel?: string };

type Props = {
  title: string;
  subtitle?: string;
  /** Left action; omit to leave the slot empty. */
  onCancel?: () => void;
  cancelLabel?: string;
  /** Right action (Save, Done, Add). */
  action?: Action;
  /** Grabber for bottom sheets; modals presented by the system draw their own. */
  grabber?: boolean;
};

/** Sheet and modal top row: Cancel / title / action, with an optional grabber. */
export function SheetHeader({ title, subtitle, onCancel, cancelLabel = 'Cancel', action, grabber = false }: Props) {
  const text = useThemeColor({}, 'text');
  const muted = useThemeColor({}, 'icon');
  const tint = useThemeColor({}, 'tint');
  const grabberColor = useThemeColor({}, 'fieldBorder');
  const actionDisabled = !!action?.disabled || !!action?.loading;

  return (
    <View style={styles.wrap}>
      {grabber ? <View style={[styles.grabber, { backgroundColor: grabberColor }]} accessible={false} importantForAccessibility="no" /> : null}
      <View style={styles.row}>
        <View style={[styles.side, styles.start]}>
          {onCancel ? (
            <Pressable onPress={onCancel} accessibilityRole="button" accessibilityLabel={cancelLabel} style={styles.button}>
              <Text style={[styles.cancel, { color: tint }]}>{cancelLabel}</Text>
            </Pressable>
          ) : null}
        </View>
        <View style={styles.titleWrap}>
          <Text accessibilityRole="header" style={[styles.title, { color: text }]}>{title}</Text>
          {subtitle ? <Text style={[styles.subtitle, { color: muted }]}>{subtitle}</Text> : null}
        </View>
        <View style={[styles.side, styles.end]}>
          {action ? (
            <Pressable
              onPress={action.onPress}
              disabled={actionDisabled}
              accessibilityRole="button"
              accessibilityLabel={action.accessibilityLabel ?? action.label}
              accessibilityState={{ disabled: actionDisabled, busy: !!action.loading }}
              style={[styles.button, actionDisabled && styles.disabled]}
            >
              {action.loading ? <ActivityIndicator color={tint} /> : <Text style={[styles.action, { color: tint }]}>{action.label}</Text>}
            </Pressable>
          ) : null}
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { paddingTop: 8 },
  grabber: { alignSelf: 'center', width: 36, height: 5, borderRadius: 3, marginBottom: 4 },
  row: { flexDirection: 'row', alignItems: 'center', minHeight: 56, paddingHorizontal: 12 },
  side: { width: 96 },
  start: { alignItems: 'flex-start' },
  end: { alignItems: 'flex-end' },
  titleWrap: { flex: 1, minWidth: 0, alignItems: 'center' },
  title: { fontSize: 17, fontWeight: '600', textAlign: 'center' },
  subtitle: { fontSize: 12, textAlign: 'center' },
  button: { minHeight: 44, minWidth: 44, justifyContent: 'center', paddingHorizontal: 6 },
  cancel: { fontSize: 17 },
  action: { fontSize: 17, fontWeight: '600' },
  disabled: { opacity: 0.5 },
});
