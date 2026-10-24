import type { ReactNode } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, useNavigation } from 'expo-router';
import { ThemedText } from '@/components/themed-text';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { useThemeColor } from '@/hooks/use-theme-color';
import { previousScreenTitle, type NavStateLike } from '@/lib/settings-screens';

type Props = {
  title: string;
  /** Overrides the back button name derived from the navigation state. */
  backLabel?: string;
  /** Right side of the back row, e.g. a Save button. */
  trailing?: ReactNode;
  titleType?: 'largeTitle' | 'heading';
  /** A `StickyFooter`, kept above the keyboard. */
  footer?: ReactNode;
  children: ReactNode;
};

type NavigationLike = { getState?: () => NavStateLike; getParent?: () => { getState?: () => NavStateLike } | undefined };

/** Push page for a Settings screen: back button named for the previous screen, large title, scrolling content. */
export function SettingsPage({ title, backLabel, trailing, titleType = 'largeTitle', footer, children }: Props) {
  const background = useThemeColor({}, 'background');
  const tint = useThemeColor({}, 'tint');
  const navigation = useNavigation() as unknown as NavigationLike | undefined;
  const label = backLabel ?? previousScreenTitle(navigation?.getState?.(), navigation?.getParent?.()?.getState?.());

  return (
    <SafeAreaView edges={footer ? ['top'] : ['top', 'bottom']} style={[styles.root, { backgroundColor: background }]}>
      <View style={styles.backRow}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={label === 'Back' ? 'Back' : `Back to ${label}`}
          hitSlop={8}
          onPress={() => router.back()}
          style={({ pressed }) => [styles.back, pressed && styles.pressed]}
        >
          <IconSymbol name="chevron.left" size={20} color={tint} />
          <Text style={[styles.backText, { color: tint }]}>{label}</Text>
        </Pressable>
        {trailing ? <View style={styles.trailing}>{trailing}</View> : null}
      </View>
      <ThemedText type={titleType} accessibilityRole="header" style={styles.title}>{title}</ThemedText>
      <KeyboardAvoidingView style={styles.root} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.content}>{children}</ScrollView>
        {footer}
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  backRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12, minHeight: 44, paddingHorizontal: 16 },
  back: { flexDirection: 'row', alignItems: 'center', gap: 2, minHeight: 44, flexShrink: 1, marginLeft: -4 },
  backText: { fontSize: 17, flexShrink: 1 },
  trailing: { flexShrink: 0 },
  pressed: { opacity: 0.6 },
  title: { paddingHorizontal: 16, paddingTop: 4, paddingBottom: 8 },
  content: { paddingHorizontal: 16, paddingTop: 8, paddingBottom: 40, gap: 12 },
});
