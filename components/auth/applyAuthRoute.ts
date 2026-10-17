import { router } from 'expo-router';
import { setOnboardingComplete } from '@/lib/storage';
import { homeRouteFor } from '@/lib/tracking-mode';
import type { AuthRoute } from '@/lib/auth-routing';

/** Performs the navigation chosen by `routeAfterAuth`. 'stay' does nothing. */
export async function applyAuthRoute(route: AuthRoute): Promise<void> {
  switch (route.to) {
    case 'goals':
      router.replace('/onboarding/goals' as any);
      return;
    case 'tabs':
      await setOnboardingComplete();
      router.replace(homeRouteFor());
      return;
    case 'back':
      if (router.canGoBack()) router.back();
      else router.replace(homeRouteFor());
      return;
    default:
      return;
  }
}
