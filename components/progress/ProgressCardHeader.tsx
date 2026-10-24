import type { ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';
import { ThemedText } from '@/components/themed-text';
import { useThemeColor } from '@/hooks/use-theme-color';

type Props = {
  label: string;
  /** Usually a `stat` or `hero` ThemedText. */
  value?: ReactNode;
  /** Wraps the value so a screen reader reads a sentence instead of a bare number. */
  valueAccessibilityLabel?: string;
  caption?: string;
  /** Right side: a chip or a segmented control. */
  trailing?: ReactNode;
};

/** Shared Progress card header: label, then the headline number, then a caption, with an optional control at the right. */
export function ProgressCardHeader({ label, value, valueAccessibilityLabel, caption, trailing }: Props) {
  const muted = useThemeColor({}, 'icon');
  return (
    <View style={styles.row}>
      <View style={styles.main}>
        <ThemedText type="label" accessibilityRole="header" style={[styles.label, { color: muted }]}>
          {label}
        </ThemedText>
        {value != null ? (
          <View accessible={valueAccessibilityLabel != null} accessibilityLabel={valueAccessibilityLabel}>
            {value}
          </View>
        ) : null}
        {caption ? <ThemedText type="caption">{caption}</ThemedText> : null}
      </View>
      {trailing ? <View style={styles.trailing}>{trailing}</View> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8 },
  main: { flexShrink: 1, gap: 2 },
  label: { fontWeight: '600' },
  trailing: { flexShrink: 0 },
});
