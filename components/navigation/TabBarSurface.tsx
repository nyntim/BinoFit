import type { ReactNode } from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { useThemeColor } from '@/hooks/use-theme-color';

// No blur on this platform, so the shell is opaque; translucent navSurface is only for the iOS material
export function TabBarSurface({ children, style }: { children: ReactNode; style?: StyleProp<ViewStyle> }) {
  const surface = useThemeColor({}, 'navOpaque');
  const border = useThemeColor({}, 'navBorder');
  return <View style={[styles.surface, { backgroundColor: surface, borderColor: border }, style]}>{children}</View>;
}

const styles = StyleSheet.create({ surface: { borderRadius: 32, overflow: 'hidden', borderWidth: 1 } });
