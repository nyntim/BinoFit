import { StyleSheet, View } from 'react-native';
import { requireOptionalNativeModule } from 'expo';
import * as AppleAuthentication from 'expo-apple-authentication';
import { useColorScheme } from '@/hooks/use-color-scheme';

// False in a native build made before expo-apple-authentication was added:
// rendering the button there fails with "Unimplemented component".
export const APPLE_SIGN_IN_SUPPORTED = requireOptionalNativeModule('ExpoAppleAuthentication') != null;

export type AppleButtonType = 'signIn' | 'signUp' | 'continue';

type Props = { onPress: () => void; disabled?: boolean; type?: AppleButtonType };

const BUTTON_TYPES = {
  signIn: AppleAuthentication.AppleAuthenticationButtonType.SIGN_IN,
  signUp: AppleAuthentication.AppleAuthenticationButtonType.SIGN_UP,
  continue: AppleAuthentication.AppleAuthenticationButtonType.CONTINUE,
} as const;

/** The official Apple button, as Apple's guidelines require. */
export function AppleSignInButton({ onPress, disabled, type = 'signIn' }: Props) {
  const scheme = useColorScheme();
  return (
    <View style={disabled ? styles.disabled : undefined} pointerEvents={disabled ? 'none' : 'auto'}>
      <AppleAuthentication.AppleAuthenticationButton
        buttonType={BUTTON_TYPES[type]}
        buttonStyle={
          scheme === 'dark'
            ? AppleAuthentication.AppleAuthenticationButtonStyle.WHITE
            : AppleAuthentication.AppleAuthenticationButtonStyle.BLACK
        }
        cornerRadius={18}
        style={styles.button}
        onPress={onPress}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  button: { height: 48, width: '100%' },
  disabled: { opacity: 0.5 },
});
