import { useEffect } from 'react';
import { AccessibilityInfo, Pressable, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { ThemedText } from '@/components/themed-text';
import { Button } from '@/components/ui/Button';
import { useThemeColor } from '@/hooks/use-theme-color';

type EditModeBarProps = {
  onCancel: () => void;
  onDone: () => void;
  /** Number of meals with a validation error; Done is disabled and the count is shown. */
  errorCount: number;
  saving: boolean;
  style?: StyleProp<ViewStyle>;
};

export const editErrorMessage = (count: number) => `Fix ${count} ${count === 1 ? 'error' : 'errors'} to save`;

/** Cancel / error count / Done above the scroll while editing meals. */
export function EditModeBar({ onCancel, onDone, errorCount, saving, style }: EditModeBarProps) {
  const background = useThemeColor({}, 'background');
  const tint = useThemeColor({}, 'tint');
  const danger = useThemeColor({}, 'danger');
  const hasErrors = errorCount > 0;
  const message = hasErrors ? editErrorMessage(errorCount) : undefined;

  // accessibilityLiveRegion is Android only; VoiceOver needs an explicit announcement
  useEffect(() => {
    if (message) AccessibilityInfo.announceForAccessibility(message);
  }, [message]);

  return (
    <View style={[styles.bar, { backgroundColor: background }, style]}>
      <Pressable
        onPress={onCancel}
        disabled={saving}
        style={[styles.cancel, saving && styles.disabled]}
        accessibilityRole="button"
        accessibilityLabel="Cancel editing"
        accessibilityState={{ disabled: saving }}
      >
        <ThemedText style={[styles.cancelText, { color: tint }]}>Cancel</ThemedText>
      </Pressable>
      <View style={styles.status} accessibilityLiveRegion="polite">
        {message ? <ThemedText type="label" style={[styles.statusText, { color: danger }]}>{message}</ThemedText> : null}
      </View>
      <Button
        label="Done"
        size="sm"
        accessibilityLabel="Done editing"
        accessibilityHint={message}
        disabled={hasErrors || saving}
        loading={saving}
        onPress={onDone}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  bar: { minHeight: 52, flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 16 },
  cancel: { minHeight: 44, justifyContent: 'center' },
  cancelText: { fontSize: 17 },
  status: { flex: 1, minWidth: 0, alignItems: 'center' },
  statusText: { textAlign: 'center' },
  disabled: { opacity: 0.5 },
});
