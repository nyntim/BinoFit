import { useEffect, useRef, useState } from 'react';
import { StyleSheet, TextInput, type KeyboardTypeOptions } from 'react-native';
import { useThemeColor } from '@/hooks/use-theme-color';
import { registerPendingEdit } from '@/lib/workouts/pending-edits';

export const CELL_DEBOUNCE_MS = 300;

type Props = {
  /** The stored value as text. */
  value: string;
  /** Shown when empty (the Previous value). */
  placeholder?: string;
  /** Called with the typed text 300 ms after typing stops and on blur. */
  onCommit: (text: string) => void;
  accessibilityLabel: string;
  keyboardType?: KeyboardTypeOptions;
};

/**
 * A 36pt number cell. Typing commits after a 300 ms pause and on blur; while focused the cell keeps
 * what was typed, and on blur it shows the stored value again (so "2730" becomes "27:30" and an
 * invalid entry reverts).
 */
export function NumericCell({ value, placeholder, onCommit, accessibilityLabel, keyboardType = 'decimal-pad' }: Props) {
  const [text, setText] = useState(value);
  const [focused, setFocused] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const committed = useRef(value);
  const onCommitRef = useRef(onCommit);
  useEffect(() => {
    onCommitRef.current = onCommit;
  });

  const subtle = useThemeColor({}, 'cardSecondary');
  const card = useThemeColor({}, 'cardBackground');
  const textColor = useThemeColor({}, 'text');
  const muted = useThemeColor({}, 'icon');
  const tint = useThemeColor({}, 'tint');

  useEffect(() => {
    if (!focused) {
      setText(value);
      committed.current = value;
    }
  }, [value, focused]);

  const textRef = useRef(text);
  useEffect(() => {
    textRef.current = text;
  }, [text]);

  const commit = (next: string) => {
    if (timer.current) {
      clearTimeout(timer.current);
      timer.current = null;
    }
    if (next === committed.current) return;
    committed.current = next;
    onCommitRef.current(next);
  };

  // Commit what is pending when the editor flushes and when the cell goes away.
  const commitRef = useRef(commit);
  useEffect(() => {
    commitRef.current = commit;
  });
  useEffect(() => {
    const flushPending = () => {
      if (textRef.current !== committed.current) commitRef.current(textRef.current);
    };
    const unregister = registerPendingEdit(flushPending);
    return () => {
      unregister();
      flushPending();
      if (timer.current) clearTimeout(timer.current);
    };
  }, []);

  return (
    <TextInput
      value={text}
      hitSlop={{ top: 4, bottom: 4 }}
      maxFontSizeMultiplier={1.3}
      placeholder={placeholder}
      placeholderTextColor={muted}
      selectionColor={tint}
      keyboardType={keyboardType}
      returnKeyType="done"
      selectTextOnFocus
      accessibilityLabel={accessibilityLabel}
      onChangeText={(t) => {
        textRef.current = t;
        setText(t);
        if (timer.current) clearTimeout(timer.current);
        timer.current = setTimeout(() => commit(t), CELL_DEBOUNCE_MS);
      }}
      onFocus={() => setFocused(true)}
      onBlur={() => {
        commit(text);
        setFocused(false);
      }}
      style={[
        styles.cell,
        {
          color: textColor,
          backgroundColor: focused ? card : subtle,
          borderColor: focused ? tint : 'transparent',
        },
      ]}
    />
  );
}

const styles = StyleSheet.create({
  cell: {
    height: 36,
    borderWidth: 1.5,
    borderRadius: 8,
    paddingHorizontal: 4,
    paddingVertical: 0,
    fontSize: 15,
    textAlign: 'center',
    fontVariant: ['tabular-nums'],
  },
});
