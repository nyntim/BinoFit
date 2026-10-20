import { StyleSheet, View, type ViewProps } from 'react-native';
import { useThemeColor } from '@/hooks/use-theme-color';

/** Solid native-module-free fallback. Geometry belongs to the caller. */
export function ControlSurface({ children, style, ...props }: ViewProps) {
  const surface = useThemeColor({}, 'navOpaque');
  const border = useThemeColor({}, 'navBorder');
  return <View {...props} style={[styles.surface, style, { backgroundColor: surface, borderColor: border, opacity: 1 }]}>{children}</View>;
}
const styles = StyleSheet.create({ surface: { borderRadius: 12, overflow: 'hidden', borderWidth: StyleSheet.hairlineWidth } });
