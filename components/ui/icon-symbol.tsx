// Fallback for using MaterialIcons on Android and web.

import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { SymbolWeight, SymbolViewProps } from 'expo-symbols';
import { ComponentProps } from 'react';
import { OpaqueColorValue, type StyleProp, type TextStyle } from 'react-native';

type IconMapping = Record<Extract<SymbolViewProps['name'], string>,ComponentProps<typeof MaterialIcons>['name']>;
export type IconSymbolName = keyof typeof MAPPING;

/**
 * Add your SF Symbols to Material Icons mappings here.
 * - see Material Icons in the [Icons Directory](https://icons.expo.fyi).
 * - see SF Symbols in the [SF Symbols](https://developer.apple.com/sf-symbols/) app.
 */
const MAPPING = {
  'music.note': 'music-note',
  'fork.knife': 'restaurant',
  'house.fill': 'home',
  'paperplane.fill': 'send',
  'chevron.left.forwardslash.chevron.right': 'code',
  'chevron.right': 'chevron-right',
  'gear': 'settings',
  'flame.fill': 'local-fire-department',
  'icloud.slash': 'cloud-off',
  'dumbbell.fill': 'fitness-center',
  'chart.bar.fill': 'bar-chart',
  'ellipsis': 'more-horiz',
  'chevron.left': 'chevron-left',
  'magnifyingglass': 'search',
  'plus': 'add',
  'checkmark': 'check',
  // Training (C7-C10)
  'chevron.down': 'keyboard-arrow-down',
  'chevron.up': 'keyboard-arrow-up',
  'xmark': 'close',
  'trash': 'delete',
  'minus': 'remove',
  'timer': 'timer',
  'clock': 'schedule',
  'calendar': 'calendar-today',
  'list.bullet': 'list',
  'clock.arrow.circlepath': 'history',
  'arrow.clockwise': 'refresh',
  'checkmark.circle': 'check-circle',
  'stopwatch': 'timer',
  // Redesign primitives
  'xmark.circle.fill': 'cancel',
  'star.fill': 'star',
  'exclamationmark.circle': 'error-outline',
  'checkmark.circle.fill': 'check-circle',
  'minus.circle.fill': 'remove-circle',
  'line.3.horizontal': 'drag-handle',
  // Settings
  'person.fill': 'person',
  'slider.horizontal.3': 'tune',
  'bell': 'notifications-none',
  'bell.fill': 'notifications',
  'bell.slash': 'notifications-off',
  'link': 'link',
  'lock.shield': 'security',
  'cylinder.split.1x2': 'storage',
  'questionmark.circle': 'help-outline',
  'info.circle': 'info-outline',
  'icloud.fill': 'cloud',
  'heart.fill': 'favorite',
  'lightbulb': 'lightbulb-outline',
  // Nutrition
  'barcode.viewfinder': 'qr-code-scanner',
  'flashlight.on.fill': 'flashlight-on',
  'drop.fill': 'water-drop',
  // Training equipment and builder
  'figure.strengthtraining.traditional': 'fitness-center',
  'figure.run': 'directions-run',
  'figure.walk': 'directions-walk',
  'scalemass': 'monitor-weight',
  'square.grid.2x2': 'grid-view',
  // Password reveal
  'eye': 'visibility',
  'eye.slash': 'visibility-off',
} as IconMapping;

/**
 * An icon component that uses native SF Symbols on iOS, and Material Icons on Android and web.
 * This ensures a consistent look across platforms, and optimal resource usage.
 * Icon `name`s are based on SF Symbols and require manual mapping to Material Icons.
 */
export function IconSymbol({
  name,
  size = 24,
  color,
  style,
}: {
  name: IconSymbolName;
  size?: number;
  color: string | OpaqueColorValue;
  style?: StyleProp<TextStyle>;
  weight?: SymbolWeight;
}) {
  return <MaterialIcons color={color} size={size} name={MAPPING[name]} style={style} />;
}
