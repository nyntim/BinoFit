import { StyleSheet, View, type ViewProps } from 'react-native';
import { useThemeColor } from '@/hooks/use-theme-color';
import { useShadow } from '@/hooks/useShadow';

export type CardPadding = 'default' | 'compact' | 'none';
export type CardTone = 'default' | 'tint' | 'ember' | 'ink';

type Props = ViewProps & {
  padding?: CardPadding;
  /** `tint` and `ember` sit on their soft fills; `ink` inverts to a text-colored surface. */
  tone?: CardTone;
};

/** Lifted content surface (bf.css `.card`): 22 radius, soft shadow in light mode only. */
export function Card({ padding = 'default', tone = 'default', style, children, ...rest }: Props) {
  const card = useThemeColor({}, 'cardBackground');
  const tintSoft = useThemeColor({}, 'tintSoft');
  const emberSoft = useThemeColor({}, 'emberSoft');
  const ink = useThemeColor({}, 'text');
  const shadow = useShadow('card');
  const backgroundColor = { default: card, tint: tintSoft, ember: emberSoft, ink }[tone];

  return (
    <View
      style={[
        styles.card,
        styles[padding],
        { backgroundColor },
        tone === 'default' && shadow !== 'none' ? { boxShadow: shadow } : null,
        style,
      ]}
      {...rest}
    >
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { borderRadius: 22 },
  default: { paddingVertical: 18, paddingHorizontal: 20 },
  compact: { paddingVertical: 14, paddingHorizontal: 16 },
  none: {},
});
