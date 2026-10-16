// Sign in with Apple exists on iOS only; see AppleSignInButton.ios.tsx.
export const APPLE_SIGN_IN_SUPPORTED = false;

type Props = { onPress: () => void; disabled?: boolean };

export function AppleSignInButton(_props: Props) {
  return null;
}
