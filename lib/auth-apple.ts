import * as Crypto from 'expo-crypto';
import { supabase } from '@/lib/supabase';
import type { RestoreProgress } from '@/lib/restore';
import { reportAuthIssue } from '@/lib/auth-debug';
import { isAppleCancel } from '@/lib/auth-session';
import { type SignInOutcome, SIGN_IN_FAILED, signInWithMerge } from '@/lib/auth-init';

const sha256 = (value: string) =>
  Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, value);

/** Signs in with Apple from the anonymous session. One Apple prompt. */
export async function signInWithApple(
  onProgress?: (p: RestoreProgress) => void
): Promise<SignInOutcome> {
  return signInWithMerge(async () => {
    const rawNonce = `${Crypto.randomUUID()}${Crypto.randomUUID()}`;
    const hashedNonce = await sha256(rawNonce);

    // Loaded lazily: the native module only exists on iOS.
    const AppleAuthentication = await import('expo-apple-authentication');
    let identityToken: string | null;
    try {
      const credential = await AppleAuthentication.signInAsync({
        requestedScopes: [
          AppleAuthentication.AppleAuthenticationScope.FULL_NAME,
          AppleAuthentication.AppleAuthenticationScope.EMAIL,
        ],
        nonce: hashedNonce,
      });
      identityToken = credential.identityToken;
    } catch (e) {
      if (isAppleCancel(e)) return { cancelled: true };
      throw e;
    }
    if (!identityToken) return { error: 'Apple did not return a sign-in token.' };

    const { data, error } = await supabase.auth.signInWithIdToken({
      provider: 'apple',
      token: identityToken,
      nonce: rawNonce,
    });
    if (error || !data.session) {
      if (error) reportAuthIssue('signInWithIdToken', error);
      return { error: SIGN_IN_FAILED };
    }
    return { session: data.session };
  }, onProgress);
}

