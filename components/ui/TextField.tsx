import { forwardRef, useEffect, useState } from 'react';
import { AccessibilityInfo, StyleSheet, Text, TextInput, View, type StyleProp, type TextInputProps, type ViewStyle } from 'react-native';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { Fonts } from '@/constants/theme';
import { useThemeColor } from '@/hooks/use-theme-color';

export type TextFieldSize = 'md' | 'big' | 'mini';

type Props = TextInputProps & {
  /** Visible label above the field; also its accessible name unless `accessibilityLabel` is set. */
  label?: string;
  /** Inline message under the field; turns the border danger and is read in the hint. */
  error?: string | null;
  /** Helper caption under the field when there is no error. */
  hint?: string;
  size?: TextFieldSize;
  /** Unit shown inside the field on the right ("g", "kg"). */
  suffix?: string;
  containerStyle?: StyleProp<ViewStyle>;
};

/** Outlined text input (bf.css `.field`, `.focus`, `.error`, `.big`, `.mini`). */
export const TextField = forwardRef<TextInput, Props>(function TextField(
  { label, error, hint, size = 'md', suffix, containerStyle, style, onFocus, onBlur, accessibilityLabel, accessibilityHint, editable = true, ...rest },
  ref,
) {
  const [focused, setFocused] = useState(false);
  const text = useThemeColor({}, 'text');
  const muted = useThemeColor({}, 'icon');
  const card = useThemeColor({}, 'cardBackground');
  const border = useThemeColor({}, 'fieldBorder');
  const tint = useThemeColor({}, 'tint');
  const danger = useThemeColor({}, 'danger');

  // accessibilityLiveRegion is Android only; VoiceOver needs an explicit announcement
  useEffect(() => {
    if (error) AccessibilityInfo.announceForAccessibility(error);
  }, [error]);

  const active = error ? danger : focused ? tint : null;
  const hintText = [error, accessibilityHint].filter(Boolean).join(' ') || undefined;

  return (
    <View style={[size === 'mini' ? styles.miniWrap : styles.wrap, containerStyle]}>
      {label ? <Text style={[styles.label, { color: muted }]} accessible={false} importantForAccessibility="no">{label}</Text> : null}
      <View
        style={[
          styles.field,
          styles[size],
          { backgroundColor: card, borderColor: active ?? border, borderWidth: active ? 2 : 1 },
          !editable && styles.disabled,
        ]}
      >
        <TextInput
          ref={ref}
          editable={editable}
          placeholderTextColor={muted}
          accessibilityLabel={accessibilityLabel ?? label}
          accessibilityHint={hintText}
          accessibilityState={{ disabled: !editable }}
          onFocus={(event) => { setFocused(true); onFocus?.(event); }}
          onBlur={(event) => { setFocused(false); onBlur?.(event); }}
          style={[styles.input, size === 'big' && styles.bigInput, size === 'mini' && styles.miniInput, { color: text }, style]}
          {...rest}
        />
        {suffix ? <Text style={[styles.suffix, { color: muted }]} accessible={false}>{suffix}</Text> : null}
      </View>
      {error ? (
        <View style={styles.message} accessibilityLiveRegion="polite">
          <IconSymbol name="exclamationmark.circle" size={14} color={danger} />
          <Text style={[styles.messageText, { color: danger }]}>{error}</Text>
        </View>
      ) : hint ? (
        <Text style={[styles.messageText, { color: muted }]}>{hint}</Text>
      ) : null}
    </View>
  );
});

const styles = StyleSheet.create({
  wrap: { gap: 6, alignSelf: 'stretch' },
  miniWrap: { gap: 4 },
  label: { fontSize: 13, fontWeight: '500' },
  field: { flexDirection: 'row', alignItems: 'center', borderRadius: 12, paddingHorizontal: 14 },
  md: { minHeight: 48 },
  big: { minHeight: 56 },
  mini: { width: 76, minHeight: 40, paddingHorizontal: 10 },
  input: { flex: 1, minWidth: 0, paddingVertical: 10, fontSize: 15, fontWeight: '500' },
  bigInput: { fontFamily: Fonts.rounded, fontSize: 24, fontWeight: '800', fontVariant: ['tabular-nums'] },
  miniInput: { textAlign: 'right', fontWeight: '600', fontVariant: ['tabular-nums'], paddingVertical: 6 },
  suffix: { marginLeft: 6, fontSize: 15, fontWeight: '500' },
  message: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  messageText: { flexShrink: 1, fontSize: 13 },
  disabled: { opacity: 0.5 },
});
