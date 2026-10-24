import { useEffect, useRef, useState } from 'react';
import {
  AccessibilityInfo,
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { ThemedText } from '@/components/themed-text';
import { Button } from '@/components/ui/Button';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { TextField } from '@/components/ui/TextField';
import { useThemeColor } from '@/hooks/use-theme-color';
import {
  changePassword,
  requestPasswordReset,
  resendEmailCode,
  retryRestore,
  signInWithApple,
  signInWithEmail,
  signUpWithEmail,
  verifyEmailCode,
  verifyPasswordReset,
  type SignInOutcome,
} from '@/lib/auth';
import { routeAfterAuth, type AuthContext, type AuthRoute } from '@/lib/auth-routing';
import { codeError, emailError, normalizeEmail, passwordError } from '@/lib/auth-validation';
import { describeProgress, type RestoreProgress } from '@/lib/restore';
import { APPLE_SIGN_IN_SUPPORTED, AppleSignInButton } from '@/components/settings/AppleSignInButton';

export type AuthFormMode =
  | 'signUp'
  | 'signIn'
  | 'resetRequest'
  | 'resetVerify'
  | 'changePassword'
  | 'confirmEmail';

export const AUTH_FORM_MODES: AuthFormMode[] = [
  'signUp',
  'signIn',
  'resetRequest',
  'resetVerify',
  'changePassword',
  'confirmEmail',
];

export function isAuthFormMode(value: unknown): value is AuthFormMode {
  return typeof value === 'string' && (AUTH_FORM_MODES as string[]).includes(value);
}

type Props = {
  initialMode: AuthFormMode;
  context: AuthContext;
  onRoute: (route: AuthRoute) => void;
  /** Called when a request starts or ends, so the screen can lock Back / swipe-down. */
  onBusyChange?: (busy: boolean) => void;
};

const TITLES: Record<AuthFormMode, string> = {
  signUp: 'Back up your log',
  signIn: 'Welcome back',
  resetRequest: 'Reset password',
  resetVerify: 'Enter the code',
  changePassword: 'Change password',
  confirmEmail: 'Confirm your email',
};

const SUBTITLES: Partial<Record<AuthFormMode, string>> = {
  signUp: 'Your data lives on this phone either way. An account keeps a copy safe and moves it to a new phone.',
  signIn: "Sign in to restore your log. Anything you've logged on this phone is kept and merged.",
  resetRequest: "Enter your email and we'll send a 6-digit code.",
  resetVerify: 'Enter the code from the email and choose a new password.',
  confirmEmail: 'Enter the 6-digit code sent to your email.',
};

const SUBMIT_LABELS: Record<AuthFormMode, string> = {
  signUp: 'Create account',
  signIn: 'Sign in',
  resetRequest: 'Send code',
  resetVerify: 'Reset password',
  changePassword: 'Change password',
  confirmEmail: 'Confirm',
};

const PASSWORD_HINT = 'At least 8 characters.';

type FieldName = 'email' | 'password' | 'code';

/** A muted question with a tint action, read as one button (bf.css "Already have an account?" lines). */
function QuestionLink({ question, action, label, onPress, disabled }: { question: string; action: string; label: string; onPress: () => void; disabled: boolean }) {
  const icon = useThemeColor({}, 'icon');
  const tint = useThemeColor({}, 'tint');
  return (
    <Pressable
      style={styles.question}
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled }}
    >
      <Text style={[styles.questionText, { color: icon }]}>
        {question} <Text style={[styles.questionAction, { color: tint }]}>{action}</Text>
      </Text>
    </Pressable>
  );
}

export function AuthForm({ initialMode, context, onRoute, onBusyChange }: Props) {
  const icon = useThemeColor({}, 'icon');
  const tint = useThemeColor({}, 'tint');
  const separator = useThemeColor({}, 'separator');

  const [mode, setMode] = useState<AuthFormMode>(initialMode);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [code, setCode] = useState('');
  const [errors, setErrors] = useState<Partial<Record<FieldName, string>>>({});
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<RestoreProgress | null>(null);
  const [needsRetry, setNeedsRetry] = useState(false);
  const [reveal, setReveal] = useState(false);

  const inFlight = useRef(false);
  const mounted = useRef(true);
  const emailRef = useRef<TextInput>(null);
  const passwordRef = useRef<TextInput>(null);
  const codeRef = useRef<TextInput>(null);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  useEffect(() => {
    onBusyChange?.(busy);
  }, [busy, onBusyChange]);

  // accessibilityLiveRegion is Android-only; VoiceOver needs an explicit announcement.
  useEffect(() => {
    if (message) AccessibilityInfo.announceForAccessibility(message);
  }, [message]);

  const showEmail = mode === 'signUp' || mode === 'signIn' || mode === 'resetRequest' || mode === 'resetVerify';
  const showPassword = mode !== 'resetRequest' && mode !== 'confirmEmail';
  const showCode = mode === 'resetVerify' || mode === 'confirmEmail';
  const newPassword = mode === 'signUp' || mode === 'resetVerify' || mode === 'changePassword';
  // The email is fixed once a code has been sent to it.
  const emailLocked = mode === 'resetVerify' || mode === 'confirmEmail';

  function switchMode(next: AuthFormMode) {
    setMode(next);
    setErrors({});
    setMessage(null);
    setNeedsRetry(false);
    setPassword('');
    setCode('');
    setReveal(false);
  }

  function validate(): boolean {
    const next: Partial<Record<FieldName, string>> = {};
    if (showEmail) {
      const e = emailError(email);
      if (e) next.email = e;
    }
    if (showPassword) {
      const p = newPassword ? passwordError(password) : password ? null : 'Enter your password.';
      if (p) next.password = p;
    }
    if (showCode) {
      const c = codeError(code);
      if (c) next.code = c;
    }
    setErrors(next);
    const first = next.email ?? next.password ?? next.code;
    if (first) AccessibilityInfo.announceForAccessibility(first);
    return !first;
  }

  function finish(outcome: Parameters<typeof routeAfterAuth>[0]) {
    if (!mounted.current) return;
    const route = routeAfterAuth(outcome, context);
    if (route.to === 'stay') {
      setNeedsRetry(Boolean(route.retryRestore));
      setMessage(route.message ?? null);
      return;
    }
    onRoute(route);
  }

  function finishSignIn(outcome: SignInOutcome) {
    if (outcome.status === 'signedIn' && outcome.warning) {
      const warning = outcome.warning;
      Alert.alert('Password not changed', warning, [{ text: 'OK', onPress: () => finish(outcome) }]);
      return;
    }
    finish(outcome);
  }

  async function run(task: () => Promise<void>) {
    // A ref, not state: two taps in one frame must not start two requests.
    if (inFlight.current) return;
    inFlight.current = true;
    setBusy(true);
    setMessage(null);
    setProgress(null);
    try {
      await task();
    } catch {
      setMessage('Something went wrong. Try again.');
    } finally {
      inFlight.current = false;
      if (mounted.current) setBusy(false);
    }
  }

  async function handleSubmit() {
    if (inFlight.current || !validate()) return;
    await run(async () => {
      switch (mode) {
        case 'signUp': {
          const outcome = await signUpWithEmail(email, password);
          if (outcome.status === 'confirmEmail') {
            setMode('confirmEmail');
            setPassword('');
            setCode('');
            setMessage(`We sent a code to ${outcome.email}.`);
          } else finish(outcome);
          return;
        }
        case 'signIn':
          finishSignIn(await signInWithEmail(email, password, setProgress));
          return;
        case 'resetRequest': {
          const result = await requestPasswordReset(email);
          if (result.ok) {
            setMode('resetVerify');
            setMessage(`We sent a code to ${normalizeEmail(email)}.`);
          } else setMessage(result.message);
          return;
        }
        case 'resetVerify':
          finishSignIn(await verifyPasswordReset(email, code, password, setProgress));
          return;
        case 'changePassword': {
          const result = await changePassword(password);
          if (!mounted.current) return;
          if (result.ok) onRoute({ to: 'back' });
          else setMessage(result.message);
          return;
        }
        case 'confirmEmail':
          finish(await verifyEmailCode(email, code));
          return;
      }
    });
  }

  async function handleResend() {
    await run(async () => {
      const result = await resendEmailCode(email);
      setMessage(result.ok ? `We sent a new code to ${normalizeEmail(email)}.` : result.message);
    });
  }

  function handleDifferentEmail() {
    switchMode('signUp');
    setEmail('');
  }

  async function handleApple() {
    if (inFlight.current) return;
    await run(async () => {
      const outcome = await signInWithApple(setProgress);
      if (outcome.status !== 'cancelled') finishSignIn(outcome);
    });
  }

  async function handleRetryRestore() {
    await run(async () => {
      const restore = await retryRestore(setProgress);
      finish({ status: 'signedIn', restore });
    });
  }

  function focusAfterEmail() {
    (showPassword ? passwordRef : codeRef).current?.focus();
  }
  function submitAfterCode() {
    if (showPassword) passwordRef.current?.focus();
    else handleSubmit();
  }

  function clearError(name: FieldName) {
    if (errors[name]) setErrors((prev) => ({ ...prev, [name]: undefined }));
  }

  const passwordLabel = mode === 'signUp' ? 'Password' : newPassword ? 'New password' : 'Password';
  const appleType = mode === 'signUp' ? 'continue' : 'signIn';
  const showApple = (mode === 'signUp' || mode === 'signIn') && APPLE_SIGN_IN_SUPPORTED;

  return (
    <KeyboardAvoidingView
      style={styles.flex}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
      >
        <View style={styles.titleBlock}>
          <ThemedText type="heading" accessibilityRole="header">
            {TITLES[mode]}
          </ThemedText>
          {SUBTITLES[mode] && <ThemedText style={[styles.subtitle, { color: icon }]}>{SUBTITLES[mode]}</ThemedText>}
        </View>

        {showEmail && (
          <TextField
            ref={emailRef}
            label="Email"
            value={email}
            onChangeText={(v) => {
              setEmail(v);
              clearError('email');
            }}
            error={errors.email}
            editable={!emailLocked && !busy}
            keyboardType="email-address"
            autoCapitalize="none"
            autoCorrect={false}
            textContentType="emailAddress"
            autoComplete="email"
            returnKeyType="next"
            onSubmitEditing={focusAfterEmail}
            submitBehavior="submit"
          />
        )}
        {showCode && (
          <TextField
            ref={codeRef}
            label="6-digit code"
            value={code}
            onChangeText={(v) => {
              setCode(v);
              clearError('code');
            }}
            error={errors.code}
            editable={!busy}
            keyboardType="number-pad"
            maxLength={6}
            textContentType="oneTimeCode"
            autoComplete="one-time-code"
            returnKeyType={showPassword ? 'next' : 'done'}
            onSubmitEditing={submitAfterCode}
            submitBehavior="submit"
          />
        )}
        {showPassword && (
          <View style={styles.passwordField}>
            <View style={styles.labelRow}>
              <Text style={[styles.label, { color: icon }]} accessible={false} importantForAccessibility="no">
                {passwordLabel}
              </Text>
              {mode === 'signIn' && (
                <Pressable
                  onPress={() => switchMode('resetRequest')}
                  disabled={busy}
                  hitSlop={{ top: 14, bottom: 14, left: 8, right: 8 }}
                  accessibilityRole="button"
                  accessibilityState={{ disabled: busy }}
                >
                  <Text style={[styles.forgot, { color: tint }]}>Forgot password?</Text>
                </Pressable>
              )}
            </View>
            <TextField
              ref={passwordRef}
              accessibilityLabel={passwordLabel}
              value={password}
              onChangeText={(v) => {
                setPassword(v);
                clearError('password');
              }}
              error={errors.password}
              hint={newPassword ? PASSWORD_HINT : undefined}
              accessibilityHint={newPassword ? PASSWORD_HINT : undefined}
              editable={!busy}
              secureTextEntry={!reveal}
              autoCapitalize="none"
              autoCorrect={false}
              textContentType={newPassword ? 'newPassword' : 'password'}
              autoComplete={newPassword ? 'new-password' : 'current-password'}
              returnKeyType="done"
              onSubmitEditing={handleSubmit}
              trailing={
                <Pressable
                  onPress={() => setReveal((r) => !r)}
                  style={styles.reveal}
                  accessibilityRole="button"
                  accessibilityLabel={reveal ? 'Hide password' : 'Show password'}
                >
                  <IconSymbol name={reveal ? 'eye.slash' : 'eye'} size={20} color={icon} />
                </Pressable>
              }
            />
          </View>
        )}

        <Button label={SUBMIT_LABELS[mode]} size="lg" loading={busy} onPress={handleSubmit} />

        {showApple && (
          <>
            <View style={styles.divider} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
              <View style={[styles.rule, { backgroundColor: separator }]} />
              <ThemedText type="caption">or</ThemedText>
              <View style={[styles.rule, { backgroundColor: separator }]} />
            </View>
            <AppleSignInButton type={appleType} onPress={handleApple} disabled={busy} />
          </>
        )}

        {busy && progress && (
          <Text style={[styles.statusText, { color: icon }]} accessibilityLiveRegion="polite">
            {describeProgress(progress)}
          </Text>
        )}
        {!busy && message && (
          <Text style={[styles.statusText, { color: icon }]} accessibilityLiveRegion="polite">
            {message}
          </Text>
        )}
        {!busy && needsRetry && (
          <Button label="Retry restore" variant="ghost" style={styles.link} onPress={handleRetryRestore} />
        )}

        {mode === 'confirmEmail' && (
          <>
            <Button label="Resend code" variant="ghost" style={styles.link} onPress={handleResend} disabled={busy} />
            <Button label="Use a different email" variant="ghost" style={styles.link} onPress={handleDifferentEmail} disabled={busy} />
          </>
        )}
        {mode === 'signIn' && (
          <QuestionLink
            question="New here?"
            action="Create an account"
            label="New here? Create an account"
            onPress={() => switchMode('signUp')}
            disabled={busy}
          />
        )}
        {mode === 'signUp' && (
          <QuestionLink
            question="Already have an account?"
            action="Sign in"
            label="Already have an account? Sign in"
            onPress={() => switchMode('signIn')}
            disabled={busy}
          />
        )}
        {(mode === 'resetRequest' || mode === 'resetVerify') && (
          <Button label="Back to sign in" variant="ghost" style={styles.link} onPress={() => switchMode('signIn')} disabled={busy} />
        )}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  content: { paddingHorizontal: 20, paddingTop: 12, paddingBottom: 32, gap: 16 },
  titleBlock: { gap: 8, marginBottom: 6 },
  subtitle: { fontSize: 17, lineHeight: 24 },
  passwordField: { gap: 6 },
  labelRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  label: { fontSize: 13, fontWeight: '500' },
  forgot: { fontSize: 13, fontWeight: '600' },
  reveal: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  divider: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  rule: { flex: 1, height: StyleSheet.hairlineWidth },
  statusText: { fontSize: 13, lineHeight: 18, textAlign: 'center' },
  link: { alignSelf: 'center' },
  question: { minHeight: 44, alignItems: 'center', justifyContent: 'center' },
  questionText: { fontSize: 15, fontWeight: '500' },
  questionAction: { fontWeight: '600' },
});
