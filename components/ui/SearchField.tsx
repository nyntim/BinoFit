import { forwardRef, useState } from 'react';
import { Pressable, StyleSheet, TextInput, View, type StyleProp, type TextInputProps, type ViewStyle } from 'react-native';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { useThemeColor } from '@/hooks/use-theme-color';

type Props = Omit<TextInputProps, 'value' | 'onChangeText'> & {
  value: string;
  onChangeText: (text: string) => void;
  /** Called after the clear button empties the field. */
  onClear?: () => void;
  clearLabel?: string;
  containerStyle?: StyleProp<ViewStyle>;
};

/** Search input on a nested fill (bf.css `.search`) with a clear button; focus draws a 2 pt tint border. */
export const SearchField = forwardRef<TextInput, Props>(function SearchField(
  { value, onChangeText, onClear, clearLabel = 'Clear search', containerStyle, style, onFocus, onBlur, accessibilityLabel = 'Search', ...rest },
  ref,
) {
  const [focused, setFocused] = useState(false);
  const fill = useThemeColor({}, 'cardSecondary');
  const card = useThemeColor({}, 'cardBackground');
  const text = useThemeColor({}, 'text');
  const muted = useThemeColor({}, 'icon');
  const tint = useThemeColor({}, 'tint');

  return (
    <View
      style={[
        styles.search,
        focused ? { backgroundColor: card, borderColor: tint, borderWidth: 2, paddingHorizontal: 10 } : { backgroundColor: fill },
        containerStyle,
      ]}
    >
      <IconSymbol name="magnifyingglass" size={18} color={muted} />
      <TextInput
        ref={ref}
        value={value}
        onChangeText={onChangeText}
        placeholderTextColor={muted}
        returnKeyType="search"
        autoCorrect={false}
        accessibilityLabel={accessibilityLabel}
        onFocus={(event) => { setFocused(true); onFocus?.(event); }}
        onBlur={(event) => { setFocused(false); onBlur?.(event); }}
        style={[styles.input, { color: text }, style]}
        {...rest}
      />
      {value.length > 0 ? (
        <Pressable
          onPress={() => { onChangeText(''); onClear?.(); }}
          hitSlop={10}
          accessibilityRole="button"
          accessibilityLabel={clearLabel}
          style={styles.clear}
        >
          <IconSymbol name="xmark.circle.fill" size={18} color={muted} />
        </Pressable>
      ) : null}
    </View>
  );
});

const styles = StyleSheet.create({
  search: { flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 44, paddingHorizontal: 12, borderRadius: 14 },
  input: { flex: 1, minWidth: 0, paddingVertical: 10, fontSize: 15 },
  clear: { minWidth: 24, minHeight: 24, alignItems: 'center', justifyContent: 'center' },
});
