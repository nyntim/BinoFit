import { createContext, useContext, useState, type ReactNode } from 'react';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

type InsetValue = { inset: number; setInset: (height: number) => void };
const TabBarInsetContext = createContext<InsetValue | null>(null);

export function TabBarInsetProvider({ children }: { children: ReactNode }) {
  const safe = useSafeAreaInsets();
  const [measured, setMeasured] = useState<number | null>(null);
  const setInset = (height: number) => setMeasured((previous) => previous === height ? previous : height);
  return <TabBarInsetContext.Provider value={{ inset: measured ?? 72 + safe.bottom, setInset }}>{children}</TabBarInsetContext.Provider>;
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
