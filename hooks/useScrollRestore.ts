import { useRef, useCallback, useEffect } from 'react';
import { ScrollView, NativeSyntheticEvent, NativeScrollEvent, LayoutChangeEvent } from 'react-native';

// Module-level store survives re-renders and tab switches (but not hot reload)
const positions = new Map<string, number>();

// Return false when the imperative list handle is not available yet.
type RestoreOffset = (offset: number) => boolean;

export function useScrollRestore(key: string, restoreOffset?: RestoreOffset, enabled = true) {
  const scrollRef = useRef<ScrollView>(null);
  const restoredRef = useRef(false);
  const savedOffset = useRef(positions.get(key));
  const viewportHeight = useRef(0);
  const contentHeight = useRef(0);

  useEffect(() => {
    restoredRef.current = false;
    savedOffset.current = positions.get(key);
    viewportHeight.current = 0;
    contentHeight.current = 0;
  }, [key, enabled]);

  const restore = useCallback(() => {
    if (!enabled || restoredRef.current) return;
    const saved = savedOffset.current;
    if (!saved || saved <= 0) return;
    if (restoreOffset) {
      // Wait until the estimated content can accommodate the saved viewport.
      // FlatList supplies estimates for unmounted cells; no full render is needed.
      if (!viewportHeight.current || contentHeight.current < saved + viewportHeight.current) return;
      if (!restoreOffset(saved)) return;
    } else {
      if (!scrollRef.current) return;
      scrollRef.current.scrollTo({ y: saved, animated: false });
    }
    restoredRef.current = true;
  }, [key, restoreOffset, enabled]);

  const onScroll = useCallback(
    (event: NativeSyntheticEvent<NativeScrollEvent>) => {
      // Layout can emit offset zero before a pending virtualized restore.
      const offset = event.nativeEvent.contentOffset.y;
      if (restoreOffset && !restoredRef.current && (savedOffset.current ?? 0) > 0) {
        if (offset === 0) return;
        // A user scroll takes precedence if a new result set is too short.
        restoredRef.current = true;
      }
      positions.set(key, offset);
    },
    [key, restoreOffset]
  );
  const onLayout = useCallback((event: LayoutChangeEvent) => {
    viewportHeight.current = event.nativeEvent.layout.height;
    restore();
  }, [restore]);
  const onContentSizeChange = useCallback((_width?: number, height?: number) => {
    contentHeight.current = height ?? 0;
    restore();
  }, [restore]);

  return { scrollRef, onScroll, onLayout, onContentSizeChange };
}
