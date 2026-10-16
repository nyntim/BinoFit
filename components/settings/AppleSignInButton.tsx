// Sign in with Apple exists on iOS only; see AppleSignInButton.ios.tsx.
export const APPLE_SIGN_IN_SUPPORTED = false;

export type AppleButtonType = 'signIn' | 'signUp' | 'continue';

type Props = { onPress: () => void; disabled?: boolean; type?: AppleButtonType };

export function AppleSignInButton(_props: Props) {
  return null;
}
