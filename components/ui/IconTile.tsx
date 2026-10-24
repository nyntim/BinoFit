import { StyleSheet, View } from 'react-native';
import { IconSymbol, type IconSymbolName } from '@/components/ui/icon-symbol';
import { useThemeColor } from '@/hooks/use-theme-color';

export type IconTileTone = 'tint' | 'ember' | 'success' | 'neutral' | 'danger';
export type IconTileSize = 32 | 40 | 52;

const RADIUS: Record<IconTileSize, number> = { 32: 9, 40: 12, 52: 16 };
const GLYPH: Record<IconTileSize, number> = { 32: 18, 40: 22, 52: 28 };

/** Rounded square behind an icon (bf.css `.ico`). Decorative: the row or button around it carries the name. */
export function IconTile({ icon, tone = 'tint', size = 32 }: { icon: IconSymbolName; tone?: IconTileTone; size?: IconTileSize }) {
  const colors = {
    tint: [useThemeColor({}, 'tintSoft'), useThemeColor({}, 'tint')],
    ember: [useThemeColor({}, 'emberSoft'), useThemeColor({}, 'ember')],
    success: [useThemeColor({}, 'successSoft'), useThemeColor({}, 'success')],
    neutral: [useThemeColor({}, 'cardSecondary'), useThemeColor({}, 'icon')],
    danger: [useThemeColor({}, 'dangerSoft'), useThemeColor({}, 'danger')],
  };
  const [background, foreground] = colors[tone];

  return (
    <View
      testID="icon-tile"
      accessible={false}
      importantForAccessibility="no-hide-descendants"
      accessibilityElementsHidden
      style={[styles.tile, { width: size, height: size, borderRadius: RADIUS[size], backgroundColor: background }]}
    >
      <IconSymbol name={icon} size={GLYPH[size]} color={foreground} />
    </View>
  );
}

const styles = StyleSheet.create({
  tile: { alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
});
