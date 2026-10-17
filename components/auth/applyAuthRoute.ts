import { router } from 'expo-router';
import { getPreferences, loadPreferences } from '@/lib/app-preferences';
import { setOnboardingComplete } from '@/lib/storage';
import { homeRouteFor } from '@/lib/tracking-mode';
import type { AuthRoute } from '@/lib/auth-routing';

/** Performs the navigation chosen by `routeAfterAuth`. 'stay' does nothing. */
export async function applyAuthRoute(route: AuthRoute): Promise<void> {
  switch (route.to) {
    case 'mode':
      router.replace('/onboarding/mode' as any);
      return;
    case 'tabs':
      await setOnboardingComplete();
      await loadPreferences();
      router.replace(homeRouteFor(getPreferences().trackingMode));
      return;
    case 'back':
      if (router.canGoBack()) router.back();
      else router.replace(homeRouteFor(getPreferences().trackingMode));
      return;
    default:
      return;
  }
}
