import { useEffect, useState, type ReactNode } from 'react';
import { AccessibilityInfo, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { BlurView } from 'expo-blur';
import { GlassView, isGlassEffectAPIAvailable, isLiquidGlassAvailable } from 'expo-glass-effect';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { useThemeColor } from '@/hooks/use-theme-color';

export function TabBarSurface({ children, style }: { children: ReactNode; style?: StyleProp<ViewStyle> }) {
  const [reduceTransparency, setReduceTransparency] = useState<boolean | null>(null);
  const scheme = useColorScheme() ?? 'light';
  const surface = useThemeColor({}, 'navSurface');
  const opaque = useThemeColor({}, 'navOpaque');
  const border = useThemeColor({}, 'navBorder');
  useEffect(() => {
    let mounted = true;
    AccessibilityInfo.isReduceTransparencyEnabled().then((enabled) => { if (mounted) setReduceTransparency(enabled); });
    const subscription = AccessibilityInfo.addEventListener('reduceTransparencyChanged', setReduceTransparency);
    return () => { mounted = false; subscription.remove(); };
  }, []);
  const visual = reduceTransparency === false && isLiquidGlassAvailable() && isGlassEffectAPIAvailable()
    ? <GlassView pointerEvents="none" style={StyleSheet.absoluteFill} glassEffectStyle="regular" colorScheme={scheme} tintColor={surface} />
    : reduceTransparency === false
      ? <BlurView pointerEvents="none" style={StyleSheet.absoluteFill} tint={scheme} intensity={45} />
      : null;
  return (
    <View style={[styles.surface, { backgroundColor: reduceTransparency === false ? surface : opaque, borderColor: border }, style]}>
      {visual}
      {children}
    </View>
  );
}

const styles = StyleSheet.create({ surface: { borderRadius: 32, overflow: 'hidden', borderWidth: 1 } });
