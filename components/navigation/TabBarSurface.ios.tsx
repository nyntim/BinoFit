import type { ReactNode } from 'react';
import { StyleSheet, type StyleProp, type ViewStyle } from 'react-native';
import { ControlSurface } from '@/components/navigation/ControlSurface.ios';

export function TabBarSurface({ children, style }: { children: ReactNode; style?: StyleProp<ViewStyle> }) {
  return <ControlSurface style={[styles.surface, style]}>{children}</ControlSurface>;
}
const styles = StyleSheet.create({ surface: { borderRadius: 32, borderWidth: 1 } });
