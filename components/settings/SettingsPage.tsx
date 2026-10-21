import type { ReactNode } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { useThemeColor } from '@/hooks/use-theme-color';
export { SettingsRow } from '@/components/settings/SettingsRow';

export function SettingsPage({ title, children }: { title: string; children: ReactNode }) {
  const background = useThemeColor({}, 'background');
  const text = useThemeColor({}, 'text');
  const tint = useThemeColor({}, 'tint');
  return <SafeAreaView style={{ flex: 1, backgroundColor: background }}>
    <View style={styles.header}>
      <Pressable accessibilityRole="button" accessibilityLabel="Back" onPress={() => router.back()} style={styles.back}><Text style={{ color: tint, fontSize: 16 }}>Back</Text></Pressable>
      <Text accessibilityRole="header" style={[styles.title, { color: text }]}>{title}</Text>
    </View>
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.content}>{children}</ScrollView>
    </KeyboardAvoidingView>
  </SafeAreaView>;
}
const styles = StyleSheet.create({ header: { paddingHorizontal: 20, gap: 8, flexDirection: 'row', alignItems: 'center' }, back: { minHeight: 44, minWidth: 44, justifyContent: 'center' }, title: { fontSize: 22, fontWeight: '600', flex: 1 }, content: { padding: 20, gap: 16, paddingBottom: 40 } });
