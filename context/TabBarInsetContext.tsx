import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

type InsetMode = 'measured' | 'automatic';
type InsetValue = { inset: number; mode: InsetMode; setInset: (height: number) => void };
const TabBarInsetContext = createContext<InsetValue | null>(null);

export function TabBarInsetProvider({ children, mode = 'measured' }: { children: ReactNode; mode?: InsetMode }) {
  const safe = useSafeAreaInsets();
  const [measured, setMeasured] = useState<number | null>(null);
  const setInset = useCallback((height: number) => setMeasured((previous) => previous === height ? previous : height), []);
  const value = useMemo(() => ({
    inset: mode === 'automatic' ? 0 : measured ?? 72 + safe.bottom,
    mode,
    setInset,
  }), [mode, measured, safe.bottom, setInset]);
  return <TabBarInsetContext.Provider value={value}>{children}</TabBarInsetContext.Provider>;
}

export function useTabBarInset() {
  const value = useContext(TabBarInsetContext);
  if (!value) throw new Error('useTabBarInset must be used within TabBarInsetProvider');
  return value.inset;
}

export function useSetTabBarInset() {
  const value = useContext(TabBarInsetContext);
  if (!value) throw new Error('useSetTabBarInset must be used within TabBarInsetProvider');
  return value.setInset;
}

export function useTabBarInsetMode() {
  const value = useContext(TabBarInsetContext);
  if (!value) throw new Error('useTabBarInsetMode must be used within TabBarInsetProvider');
  return value.mode;
}
