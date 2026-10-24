import { useEffect, type ReactNode } from 'react';
import { AccessibilityInfo, StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { useThemeColor } from '@/hooks/use-theme-color';
import { useShadow } from '@/hooks/useShadow';

type Props = {
  /** The primary action, usually a `Button`. */
  children: ReactNode;
  /** Status on the left, e.g. "Fix 1 field to save". An error is announced and drawn in `danger`. */
  message?: string | null;
  messageTone?: 'error' | 'muted';
  /** Pad for the home indicator; off when the footer already sits above other chrome. */
  safeArea?: boolean;
  style?: StyleProp<ViewStyle>;
};

/** Solid bottom bar for forms with an explicit save: message left, action right. */
export function StickyFooter({ children, message, messageTone = 'error', safeArea = true, style }: Props) {
  const insets = useSafeAreaInsets();
  const surface = useThemeColor({}, 'cardBackground');
  const separator = useThemeColor({}, 'separator');
  const muted = useThemeColor({}, 'icon');
  const danger = useThemeColor({}, 'danger');
  const shadow = useShadow('floating');
  const isError = !!message && messageTone === 'error';

  // accessibilityLiveRegion is Android only; VoiceOver needs an explicit announcement
  useEffect(() => {
    if (isError && message) AccessibilityInfo.announceForAccessibility(message);
  }, [isError, message]);

  return (
    <View
      style={[
        styles.footer,
        { backgroundColor: surface, borderTopColor: separator, boxShadow: shadow, paddingBottom: 12 + (safeArea ? insets.bottom : 0) },
        style,
      ]}
    >
      <View style={styles.message} accessibilityLiveRegion="polite">
        {message ? (
          <>
            {isError ? <IconSymbol name="exclamationmark.circle" size={16} color={danger} /> : null}
            <Text style={[styles.messageText, { color: isError ? danger : muted }]}>{message}</Text>
          </>
        ) : null}
      </View>
      <View style={styles.action}>{children}</View>
    </View>
  );
}

const styles = StyleSheet.create({
  footer: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 12, paddingTop: 12, paddingHorizontal: 16, borderTopWidth: StyleSheet.hairlineWidth },
  message: { flex: 1, minWidth: 120, flexDirection: 'row', alignItems: 'center', gap: 6 },
  messageText: { flexShrink: 1, fontSize: 13, fontWeight: '500' },
  action: { flexShrink: 0, marginLeft: 'auto' },
});
