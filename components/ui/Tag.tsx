import { StyleSheet, Text, View } from 'react-native';
import { IconSymbol, type IconSymbolName } from '@/components/ui/icon-symbol';
import { useThemeColor } from '@/hooks/use-theme-color';

export type TagTone = 'neutral' | 'tint' | 'ember';

/** Small status label (bf.css `.tag`): source, Eaten / Planned, record. */
export function Tag({ label, tone = 'neutral', icon }: { label: string; tone?: TagTone; icon?: IconSymbolName }) {
  const fills = {
    neutral: [useThemeColor({}, 'cardSecondary'), useThemeColor({}, 'icon')],
    tint: [useThemeColor({}, 'tintSoft'), useThemeColor({}, 'tint')],
    ember: [useThemeColor({}, 'emberSoft'), useThemeColor({}, 'ember')],
  };
  const [background, color] = fills[tone];

  return (
    <View style={[styles.tag, { backgroundColor: background }]}>
      {icon ? <IconSymbol name={icon} size={11} color={color} /> : null}
      <Text style={[styles.label, { color }]}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  tag: { flexDirection: 'row', alignItems: 'center', alignSelf: 'flex-start', gap: 4, minHeight: 22, paddingHorizontal: 8, borderRadius: 7 },
  label: { fontSize: 11, fontWeight: '600', letterSpacing: 0.2 },
});
