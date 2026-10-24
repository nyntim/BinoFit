import type { ReactNode } from 'react';
import { Image, StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import { Card } from '@/components/ui/Card';
import { Fonts } from '@/constants/theme';
import { useThemeColor } from '@/hooks/use-theme-color';

const dinosaur = require('@/assets/images/icon.png');

type Props = {
  title: string;
  body?: string;
  /** Buttons, stacked full width. */
  actions?: ReactNode;
  /** The dinosaur; set false for a text-only empty state. */
  image?: boolean;
  /** `card` draws on a Card; `plain` sits on the page. */
  variant?: 'card' | 'plain';
  style?: StyleProp<ViewStyle>;
};

/** Empty and first-run state: dinosaur, title, a sentence and the next useful action. */
export function EmptyState({ title, body, actions, image = true, variant = 'plain', style }: Props) {
  const text = useThemeColor({}, 'text');
  const muted = useThemeColor({}, 'icon');

  const content = (
    <View style={styles.content}>
      {image ? <Image source={dinosaur} style={styles.image} accessible={false} accessibilityIgnoresInvertColors /> : null}
      <Text accessibilityRole="header" style={[styles.title, { color: text }]}>{title}</Text>
      {body ? <Text style={[styles.body, { color: muted }]}>{body}</Text> : null}
      {actions ? <View style={styles.actions}>{actions}</View> : null}
    </View>
  );

  if (variant === 'card') return <Card style={style}>{content}</Card>;
  return <View style={style}>{content}</View>;
}

const styles = StyleSheet.create({
  content: { alignItems: 'center', gap: 8, paddingVertical: 12 },
  image: { width: 96, height: 96, borderRadius: 24, marginBottom: 4 },
  title: { fontFamily: Fonts.rounded, fontSize: 22, lineHeight: 27, fontWeight: '800', textAlign: 'center' },
  body: { fontSize: 15, lineHeight: 22, textAlign: 'center' },
  actions: { alignSelf: 'stretch', gap: 10, marginTop: 8 },
});
