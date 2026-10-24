import { Shadows } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';

/** A `boxShadow` value for the current scheme: `card` for content cards, `floating` for bars and dialogs. */
export function useShadow(kind: keyof typeof Shadows.light): string {
  return Shadows[useColorScheme() ?? 'light'][kind];
}
