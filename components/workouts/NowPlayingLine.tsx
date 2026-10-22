import { StyleSheet, Text, View } from 'react-native';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { useThemeColor } from '@/hooks/use-theme-color';
import { playlistLabel } from '@/lib/spotify/playback';
import type { NowPlayingResult } from '@/lib/spotify/now-playing';

/** Read-only "what is playing" line for the live session. Never controls playback. */
export function NowPlayingLine({ nowPlaying }: { nowPlaying: NowPlayingResult }) {
  const card = useThemeColor({}, 'cardBackground');
  const text = useThemeColor({}, 'text');
  const muted = useThemeColor({}, 'icon');
  const separator = useThemeColor({}, 'separator');
  const track = [nowPlaying.trackName, nowPlaying.artistName].filter(Boolean).join(' · ');
  const playlist = nowPlaying.playlistId ? playlistLabel(nowPlaying.playlistName) : null;
  const primary = nowPlaying.isPlaying ? track : `Paused · ${track}`;
  const spoken = [
    `${nowPlaying.isPlaying ? 'Now playing' : 'Paused'}: ${nowPlaying.trackName}${nowPlaying.artistName ? ` by ${nowPlaying.artistName}` : ''}`,
    playlist ? `playlist ${playlist}` : null,
  ]
    .filter(Boolean)
    .join(', ');
  return (
    <View
      accessibilityRole="text"
      accessibilityLabel={spoken}
      style={[styles.row, { backgroundColor: card, borderBottomColor: separator }]}
    >
      <IconSymbol name="music.note" size={14} color={muted} />
      <Text style={[styles.primary, { color: text }]} numberOfLines={1} ellipsizeMode="tail">
        {primary}
      </Text>
      {playlist ? (
        <Text style={[styles.secondary, { color: muted }]} numberOfLines={1} ellipsizeMode="tail">
          {playlist}
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    minHeight: 36,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 16,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  primary: { flexShrink: 1, flexGrow: 1, fontSize: 13 },
  secondary: { maxWidth: '45%', fontSize: 12 },
});
