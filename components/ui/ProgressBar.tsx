import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { useThemeColor } from '@/hooks/use-theme-color';

export type ProgressBarHeight = 6 | 8 | 12;

type Props = {
  value: number;
  max: number;
  /** Fill color; defaults to `tint`. Macro bars pass their macro color. */
  color?: string;
  /** Amount about to be added, drawn as a pale segment after the fill (serving picker). */
  preview?: number;
  previewColor?: string;
  height?: ProgressBarHeight;
  trackColor?: string;
  /** Text summary for screen readers, e.g. "Protein 112 of 160 grams". Without it the bar is decorative. */
  accessibilityLabel?: string;
  style?: StyleProp<ViewStyle>;
};

const fraction = (part: number, whole: number) => (whole > 0 ? Math.min(Math.max(part / whole, 0), 1) : 0);

/** Horizontal progress bar (bf.css `.bar`). Over max stays a full bar in the same color: color never judges. */
export function ProgressBar({ value, max, color, preview, previewColor, height = 8, trackColor, accessibilityLabel, style }: Props) {
  const tint = useThemeColor({}, 'tint');
  const track = useThemeColor({}, 'track');
  const fill = fraction(value, max);
  const withPreview = preview ? fraction(value + preview, max) : fill;
  const radius = height / 2;

  return (
    <View
      accessible={!!accessibilityLabel}
      accessibilityLabel={accessibilityLabel}
      accessibilityRole={accessibilityLabel ? 'progressbar' : undefined}
      accessibilityValue={accessibilityLabel ? { min: 0, max: Math.max(max, 0), now: Math.min(Math.max(value, 0), Math.max(max, 0)) } : undefined}
      importantForAccessibility={accessibilityLabel ? 'yes' : 'no-hide-descendants'}
      style={[styles.track, { height, borderRadius: radius, backgroundColor: trackColor ?? track }, style]}
    >
      {withPreview > fill ? (
        <View
          testID="progress-preview"
          style={[styles.segment, { left: 0, width: `${withPreview * 100}%`, borderRadius: radius, backgroundColor: previewColor ?? color ?? tint, opacity: previewColor ? 1 : 0.35 }]}
        />
      ) : null}
      <View testID="progress-fill" style={[styles.segment, { left: 0, width: `${fill * 100}%`, borderRadius: radius, backgroundColor: color ?? tint }]} />
    </View>
  );
}

const styles = StyleSheet.create({
  track: { overflow: 'hidden', alignSelf: 'stretch' },
  segment: { position: 'absolute', top: 0, bottom: 0 },
});
