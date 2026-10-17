import { forwardRef, useState } from 'react';
import { StyleSheet, TextInput, type TextInputProps } from 'react-native';
import { useThemeColor } from '@/hooks/use-theme-color';

/**
 * Text field for the builder: cardSecondary with no border at rest; on focus it moves to
 * cardBackground with a 1.5px tint border. The border is always 1.5px (transparent at rest) so
 * focusing never shifts the layout.
 */
export const BuilderInput = forwardRef<TextInput, TextInputProps>(function BuilderInput(
  { style, onFocus, onBlur, ...rest },
  ref
) {
  const [focused, setFocused] = useState(false);
  const rest_ = useThemeColor({}, 'cardSecondary');
  const card = useThemeColor({}, 'cardBackground');
  const text = useThemeColor({}, 'text');
  const muted = useThemeColor({}, 'icon');
  const tint = useThemeColor({}, 'tint');

  return (
    <TextInput
      ref={ref}
      placeholderTextColor={muted}
      selectionColor={tint}
      {...rest}
      onFocus={(e) => {
        setFocused(true);
        onFocus?.(e);
      }}
      onBlur={(e) => {
        setFocused(false);
        onBlur?.(e);
      }}
      style={[
        styles.input,
        {
          color: text,
          backgroundColor: focused ? card : rest_,
          borderColor: focused ? tint : 'transparent',
        },
        style,
      ]}
    />
  );
});

const styles = StyleSheet.create({
  input: {
    minHeight: 48,
    borderWidth: 1.5,
    borderRadius: 8,
    paddingHorizontal: 14,
    fontSize: 17,
  },
});
