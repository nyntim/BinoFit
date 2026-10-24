import { useEffect, useState } from 'react';
import { AccessibilityInfo, Animated, Pressable, StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import { IconTile } from '@/components/ui/IconTile';
import { IconSymbol, type IconSymbolName } from '@/components/ui/icon-symbol';
import { useThemeColor } from '@/hooks/use-theme-color';
import { useReduceMotion } from '@/hooks/useReduceMotion';

type Props = {
  title: string;
  body?: string;
  icon?: IconSymbolName;
  /** Shows a dismiss button. The banner never blocks the next tap either way. */
  onDismiss?: () => void;
  style?: StyleProp<ViewStyle>;
};

/** Ember acknowledgement for a finished workout or completed setup. Fades in; static with Reduce Motion. */
export function CelebrationBanner({ title, body, icon = 'checkmark', onDismiss, style }: Props) {
  const reduceMotion = useReduceMotion();
  const emberSoft = useThemeColor({}, 'emberSoft');
  const text = useThemeColor({}, 'text');
  const muted = useThemeColor({}, 'icon');
  // Hidden for the moment before the Reduce Motion setting is known, so it never flashes in twice
  const [appear] = useState(() => new Animated.Value(0));
  const message = body ? `${title}. ${body}` : title;

  useEffect(() => {
    AccessibilityInfo.announceForAccessibility(message);
  }, [message]);

  useEffect(() => {
    if (reduceMotion === null) return;
    if (reduceMotion) {
      appear.setValue(1);
      return;
    }
    const animation = Animated.timing(appear, { toValue: 1, duration: 260, useNativeDriver: true });
    animation.start();
    return () => animation.stop();
  }, [appear, reduceMotion]);

  const motion = { opacity: appear, transform: [{ translateY: appear.interpolate({ inputRange: [0, 1], outputRange: [reduceMotion ? 0 : 8, 0] }) }] };

  return (
    <Animated.View style={[styles.banner, { backgroundColor: emberSoft }, motion, style]}>
      <View style={styles.row} accessible accessibilityLabel={message}>
        <IconTile icon={icon} tone="ember" size={40} />
        <View style={styles.copy}>
          <Text style={[styles.title, { color: text }]}>{title}</Text>
          {body ? <Text style={[styles.body, { color: muted }]}>{body}</Text> : null}
        </View>
      </View>
      {onDismiss ? (
        <Pressable onPress={onDismiss} hitSlop={10} accessibilityRole="button" accessibilityLabel="Dismiss" style={styles.dismiss}>
          <IconSymbol name="xmark" size={16} color={muted} />
        </Pressable>
      ) : null}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  banner: { flexDirection: 'row', alignItems: 'center', gap: 8, borderRadius: 22, paddingVertical: 14, paddingLeft: 16, paddingRight: 8 },
  row: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 12 },
  copy: { flex: 1, minWidth: 0, gap: 2 },
  title: { fontSize: 17, fontWeight: '600' },
  body: { fontSize: 13, lineHeight: 18 },
  dismiss: { minWidth: 24, minHeight: 24, alignItems: 'center', justifyContent: 'center' },
});
