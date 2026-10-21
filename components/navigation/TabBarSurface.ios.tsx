import { useEffect, useState } from 'react';
import { AccessibilityInfo, StyleSheet, View, type ViewProps } from 'react-native';
import { BlurView } from 'expo-blur';
import { GlassView, isGlassEffectAPIAvailable, isLiquidGlassAvailable } from 'expo-glass-effect';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { useThemeColor } from '@/hooks/use-theme-color';

/** Material is reserved for the fallback bottom tab shell. */
export function TabBarSurface({ children, style, ...props }: ViewProps) {
  const [reduceTransparency, setReduceTransparency] = useState<boolean | null>(null);
  const scheme = useColorScheme() ?? 'light';
  const fallback = useThemeColor({}, 'navSurface');
  const opaque = useThemeColor({}, 'navOpaque');
  const border = useThemeColor({}, 'navBorder');
  useEffect(() => {
    let mounted = true;
    let preferenceChanged = false;
    const subscription = AccessibilityInfo.addEventListener('reduceTransparencyChanged', (enabled) => {
      preferenceChanged = true;
      if (mounted) setReduceTransparency(enabled);
    });
    AccessibilityInfo.isReduceTransparencyEnabled().then((enabled) => {
      if (mounted && !preferenceChanged) setReduceTransparency(enabled);
    }).catch(() => { /* Fail closed: retain the opaque initial surface. */ });
    return () => { mounted = false; subscription.remove(); };
  }, []);
  let glass = false;
  if (reduceTransparency === false) {
    try { glass = isLiquidGlassAvailable() && isGlassEffectAPIAvailable(); } catch { /* Older runtime: blur fallback. */ }
  }
  const decorative = { pointerEvents: 'none' as const, accessible: false, accessibilityElementsHidden: true, importantForAccessibility: 'no-hide-descendants' as const };
  return (
    <View {...props} style={[styles.surface, style, { backgroundColor: glass ? 'transparent' : reduceTransparency === false ? fallback : opaque, borderColor: border, opacity: 1 }]}>
      {glass ? <GlassView {...decorative} style={StyleSheet.absoluteFill} glassEffectStyle="regular" colorScheme={scheme} />
        : reduceTransparency === false ? <BlurView {...decorative} style={StyleSheet.absoluteFill} tint={scheme} intensity={45} /> : null}
      {children}
    </View>
  );
}
const styles = StyleSheet.create({ surface: { borderRadius: 32, overflow: 'hidden', borderWidth: 1 } });
