import React from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { ThemedText } from '@/components/themed-text';
import { useThemeColor } from '@/hooks/use-theme-color';
import { useSyncStatus } from '@/hooks/useSyncStatus';
import { syncToSupabase } from '@/lib/sync';
import { deriveIndicator, isSyncConfigured } from '@/lib/sync-status';

/** Dot and label shown only after sync has been failing past the grace period. Tap retries. */
export const SyncIndicator: React.FC = () => {
  const { state, now } = useSyncStatus();
  const ink = useThemeColor({}, 'icon');

  const indicator = deriveIndicator(state, now, isSyncConfigured());
  if (!indicator.visible) return null;

  return (
    <Pressable
      onPress={() => {
        syncToSupabase();
      }}
      accessibilityRole="button"
      accessibilityLabel={`${indicator.label}. Tap to retry.`}
      hitSlop={{ left: 6, right: 6 }}
      style={({ pressed }) => [styles.container, { opacity: pressed ? 0.85 : 1 }]}
    >
      <View style={[styles.dot, { backgroundColor: ink }]} />
      <ThemedText type="caption" numberOfLines={1} style={styles.text}>{indicator.label}</ThemedText>
    </Pressable>
  );
};

const styles = StyleSheet.create({
  container: { flexDirection: 'row', flexShrink: 1, minWidth: 0, minHeight: 44, alignItems: 'center', gap: 6 },
  dot: { width: 8, height: 8, borderRadius: 4 },
  text: { flexShrink: 1 },
});
