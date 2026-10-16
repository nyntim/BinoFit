import React from 'react';
import { Pressable, StyleSheet, Text } from 'react-native';
import { useThemeColor } from '@/hooks/use-theme-color';
import { useSyncStatus } from '@/hooks/useSyncStatus';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { syncToSupabase } from '@/lib/sync';
import { deriveIndicator, isSyncConfigured } from '@/lib/sync-status';

/** Quiet pill shown only after sync has been failing past the grace period. Tap retries. */
export const SyncIndicator: React.FC = () => {
  const { state, now } = useSyncStatus();
  const background = useThemeColor({}, 'cardBackground');
  const border = useThemeColor({}, 'separator');
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
      hitSlop={{ top: 10, bottom: 10, left: 6, right: 6 }}
      style={({ pressed }) => [
        styles.container,
        { backgroundColor: background, borderColor: border, opacity: pressed ? 0.85 : 1 },
      ]}
    >
      <IconSymbol name="icloud.slash" size={12} color={ink} />
      <Text numberOfLines={1} style={[styles.text, { color: ink }]}>{indicator.label}</Text>
    </Pressable>
  );
};

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
  },
  text: {
    flexShrink: 1,
    fontSize: 12,
    fontWeight: '600',
  },
});
