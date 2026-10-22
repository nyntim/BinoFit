import { Linking, Pressable, StyleSheet, Text, View } from 'react-native';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { useThemeColor } from '@/hooks/use-theme-color';
import { isValidPlaylistId, playlistLabel, playlistUrl } from '@/lib/spotify/playback';

type Props = { playlistId: string; playlistName: string | null | undefined };

/** The Spotify playlist saved on a finished workout. Opens in Spotify (or the browser). */
export function PlaylistRow({ playlistId, playlistName }: Props) {
  const card = useThemeColor({}, 'cardBackground');
  const text = useThemeColor({}, 'text');
  const muted = useThemeColor({}, 'icon');
  if (!isValidPlaylistId(playlistId)) return null;
  const label = playlistLabel(playlistName ?? null);
  return (
    <Pressable
      onPress={() => {
        Linking.openURL(playlistUrl(playlistId)).catch(() => {});
      }}
      accessibilityRole="link"
      accessibilityLabel={`Playlist ${label}, opens in Spotify`}
      style={({ pressed }) => [styles.card, { backgroundColor: card }, pressed && { opacity: 0.85 }]}
    >
      <IconSymbol name="music.note" size={18} color={muted} />
      <Text style={[styles.label, { color: muted }]}>Playlist</Text>
      <View style={styles.valueWrap}>
        <Text style={[styles.value, { color: text }]} numberOfLines={1}>
          {label}
        </Text>
      </View>
      <IconSymbol name="chevron.right" size={14} color={muted} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: { borderRadius: 18, padding: 16, flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 52 },
  label: { fontSize: 13, fontWeight: '500' },
  valueWrap: { flex: 1, minWidth: 0, alignItems: 'flex-end' },
  value: { fontSize: 15 },
});
