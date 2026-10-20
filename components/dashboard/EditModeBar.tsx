import { ControlSurface } from '@/components/navigation/ControlSurface';
import { useEffect } from 'react';
import { AccessibilityInfo, StyleSheet, Text, TouchableOpacity, View, type StyleProp, type ViewStyle } from 'react-native';
import type { Colors } from '@/constants/theme';

const ERROR_TEXT = 'Fix errors to save';

type EditModeBarProps = {
  colors: Pick<typeof Colors.light, 'cardBackground' | 'icon' | 'separator' | 'tint'>;
  onCancel: () => void;
  onDone: () => void;
  /** Draft has validation errors; Done is disabled and the reason is shown. */
  hasErrors: boolean;
  saving: boolean;
  style?: StyleProp<ViewStyle>;
};

/** Nav-bar style Cancel / Done shown over the week strip while editing meals. */
export function EditModeBar({ colors, onCancel, onDone, hasErrors, saving, style }: EditModeBarProps) {
  const doneDisabled = hasErrors || saving;

  // accessibilityLiveRegion is Android only; VoiceOver needs an explicit announcement
  useEffect(() => {
    if (hasErrors) AccessibilityInfo.announceForAccessibility(ERROR_TEXT);
  }, [hasErrors]);

  return (
    <ControlSurface style={[styles.bar, { borderBottomColor: colors.separator }, style]}>
      {hasErrors && (
        <View style={styles.statusWrap} pointerEvents="none">
          <Text style={[styles.status, { color: colors.icon }]} numberOfLines={1} accessibilityLiveRegion="polite">
            {ERROR_TEXT}
          </Text>
        </View>
      )}
      <TouchableOpacity
        onPress={onCancel}
        disabled={saving}
        style={[styles.button, styles.left]}
        accessibilityRole="button"
        accessibilityLabel="Cancel editing"
        accessibilityState={{ disabled: saving }}
      >
        <Text style={[styles.cancelText, { color: colors.icon }]}>Cancel</Text>
      </TouchableOpacity>
      <TouchableOpacity
        onPress={onDone}
        disabled={doneDisabled}
        style={[styles.button, styles.right, doneDisabled && styles.disabled]}
        accessibilityRole="button"
        accessibilityLabel="Done editing"
        accessibilityHint={hasErrors ? ERROR_TEXT : undefined}
        accessibilityState={{ disabled: doneDisabled }}
      >
        <Text style={[styles.doneText, { color: colors.tint }]}>Done</Text>
      </TouchableOpacity>
    </ControlSurface>
  );
}

const BUTTON_WIDTH = 88;

const styles = StyleSheet.create({
  bar: {
    minHeight: 44,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 4,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  // Centered on the bar itself, between the fixed-width buttons
  statusWrap: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    left: 0,
    right: 0,
    justifyContent: 'center',
    paddingHorizontal: BUTTON_WIDTH + 4,
  },
  button: {
    minHeight: 44,
    width: BUTTON_WIDTH,
    paddingHorizontal: 16,
    justifyContent: 'center',
  },
  left: { alignItems: 'flex-start' },
  right: { alignItems: 'flex-end' },
  disabled: { opacity: 0.5 },
  cancelText: { fontSize: 17, fontWeight: '400' },
  doneText: { fontSize: 17, fontWeight: '600' },
  status: { textAlign: 'center', fontSize: 13, fontWeight: '500' },
});
