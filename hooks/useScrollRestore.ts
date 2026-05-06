import { useRef, useCallback } from 'react';
import { ScrollView, NativeSyntheticEvent, NativeScrollEvent } from 'react-native';

// Module-level store survives re-renders and tab switches (but not hot reload)
const positions = new Map<string, number>();

export function useScrollRestore(key: string) {
  const scrollRef = useRef<ScrollView>(null);
  // Prevent multiple restoration attempts per mount
  const restoredRef = useRef(false);

  const onScroll = useCallback(
    (event: NativeSyntheticEvent<NativeScrollEvent>) => {
      positions.set(key, event.nativeEvent.contentOffset.y);
    },
    [key]
  );

  // Restore once after content is laid out (fires when content dimensions change)
  const onContentSizeChange = useCallback(() => {
    if (restoredRef.current) return;
    const saved = positions.get(key);
    if (saved && saved > 0) {
      scrollRef.current?.scrollTo({ y: saved, animated: false });
      restoredRef.current = true;
    }
  }, [key]);

  return { scrollRef, onScroll, onContentSizeChange };
}
