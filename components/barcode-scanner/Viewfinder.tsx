import { useEffect, useState } from 'react';
import { Animated, Easing, StyleSheet, View, useWindowDimensions } from 'react-native';
import Svg, { Path } from 'react-native-svg';
import { useReduceMotion } from '@/hooks/useReduceMotion';

const FRAME_HEIGHT = 220;
const FRAME_RADIUS = 24;
const BRACKET = 30;
const SCAN_SECONDS = 1.6;

type Props = {
  /** Mask outside the frame. */
  maskColor: string;
  bracketColor: string;
  lineColor: string;
};

/** Camera mask with a rounded cutout, corner brackets and a scan line. Decorative: hidden from accessibility. */
export function Viewfinder({ maskColor, bracketColor, lineColor }: Props) {
  const { width, height } = useWindowDimensions();
  const reduceMotion = useReduceMotion();
  const [progress] = useState(() => new Animated.Value(0.5));

  const frameWidth = Math.min(310, width - 40);
  const x = (width - frameWidth) / 2;
  // Centered a little above the middle, clear of the bottom controls
  const y = (height - FRAME_HEIGHT) / 2 - 40;
  const r = FRAME_RADIUS;

  useEffect(() => {
    // Static at the center until Reduce Motion is known, and when it is on
    if (reduceMotion !== false) {
      progress.setValue(0.5);
      return;
    }
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(progress, { toValue: 1, duration: SCAN_SECONDS * 1000, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
        Animated.timing(progress, { toValue: 0, duration: SCAN_SECONDS * 1000, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [reduceMotion, progress]);

  const cutout =
    `M${x + r} ${y}H${x + frameWidth - r}A${r} ${r} 0 0 1 ${x + frameWidth} ${y + r}V${y + FRAME_HEIGHT - r}` +
    `A${r} ${r} 0 0 1 ${x + frameWidth - r} ${y + FRAME_HEIGHT}H${x + r}A${r} ${r} 0 0 1 ${x} ${y + FRAME_HEIGHT - r}` +
    `V${y + r}A${r} ${r} 0 0 1 ${x + r} ${y}Z`;
  const mask = `M0 0H${width}V${height}H0Z${cutout}`;

  const corner = (cx: number, cy: number, dx: 1 | -1, dy: 1 | -1) =>
    `M${cx} ${cy + dy * BRACKET}V${cy + dy * r}A${r} ${r} 0 0 ${dx === dy ? 1 : 0} ${cx + dx * r} ${cy}H${cx + dx * BRACKET}`;
  const brackets = [
    corner(x, y, 1, 1),
    corner(x + frameWidth, y, -1, 1),
    corner(x, y + FRAME_HEIGHT, 1, -1),
    corner(x + frameWidth, y + FRAME_HEIGHT, -1, -1),
  ];

  const travel = FRAME_HEIGHT - 40;
  const translateY = progress.interpolate({ inputRange: [0, 1], outputRange: [-travel / 2, travel / 2] });

  return (
    <View
      style={StyleSheet.absoluteFill}
      pointerEvents="none"
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    >
      <Svg width={width} height={height} style={StyleSheet.absoluteFill}>
        <Path d={mask} fill={maskColor} fillRule="evenodd" />
        {brackets.map((d) => (
          <Path key={d} d={d} stroke={bracketColor} strokeWidth={4} strokeLinecap="round" strokeLinejoin="round" fill="none" />
        ))}
      </Svg>
      <Animated.View
        testID="scan-line"
        style={[
          styles.line,
          { left: x + 20, width: frameWidth - 40, top: y + FRAME_HEIGHT / 2 - 1.5, backgroundColor: lineColor, transform: [{ translateY }] },
        ]}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  line: { position: 'absolute', height: 3, borderRadius: 2 },
});
