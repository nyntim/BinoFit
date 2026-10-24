import type { ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { useThemeColor } from '@/hooks/use-theme-color';

type Props = {
  step: 1 | 2 | 3;
  /** Hides Back when absent. */
  onBack?: () => void;
  backDisabled?: boolean;
  /** A Skip link. With none, the progress line sits on the right; with one it sits between Back and the slot. */
  trailing?: ReactNode;
};

const SEGMENTS = [1, 2, 3] as const;

/** Back row of the onboarding steps: Back, a three-segment progress line and an optional trailing slot. */
export function OnboardingHeader({ step, onBack, backDisabled = false, trailing }: Props) {
  const tint = useThemeColor({}, 'tint');
  const track = useThemeColor({}, 'track');

  const progress = (
    <View
      style={styles.progress}
      accessibilityRole="progressbar"
      accessibilityLabel={`Step ${step} of 3`}
      accessibilityValue={{ min: 1, max: 3, now: step }}
    >
      {SEGMENTS.map((n) => (
        <View key={n} style={[styles.segment, { backgroundColor: n <= step ? tint : track }]} />
      ))}
    </View>
  );

  return (
    <View style={styles.row}>
      {onBack ? (
        <Pressable
          onPress={onBack}
          disabled={backDisabled}
          accessibilityRole="button"
          accessibilityLabel="Back"
          accessibilityState={{ disabled: backDisabled }}
          style={({ pressed }) => [styles.back, backDisabled ? styles.disabled : pressed ? styles.pressed : null]}
        >
          <IconSymbol name="chevron.left" size={18} color={tint} />
          <Text style={[styles.backText, { color: tint }]}>Back</Text>
        </Pressable>
      ) : (
        <View style={styles.back} />
      )}
      {trailing === undefined ? (
        <>
          <View style={styles.flex} />
          {progress}
        </>
      ) : (
        <>
          <View style={styles.center}>{progress}</View>
          <View style={styles.trailing}>{trailing}</View>
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', minHeight: 44, paddingHorizontal: 16 },
  flex: { flex: 1 },
  back: { flexDirection: 'row', alignItems: 'center', gap: 2, minHeight: 44, minWidth: 64 },
  backText: { fontSize: 17, fontWeight: '400' },
  center: { flex: 1, alignItems: 'center' },
  trailing: { minWidth: 64, alignItems: 'flex-end' },
  progress: { width: 120, flexDirection: 'row', gap: 4 },
  segment: { flex: 1, height: 4, borderRadius: 2 },
  pressed: { opacity: 0.7 },
  disabled: { opacity: 0.5 },
});
