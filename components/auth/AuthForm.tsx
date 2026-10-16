import { useEffect, useRef, useState } from 'react';
import {
  AccessibilityInfo,
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
  type TextInputProps,
} from 'react-native';
import { useColorScheme } from '@/hooks/use-color-scheme';
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
  signUp: 'Sign up with email',
  signIn: 'Sign in',
  resetRequest: 'Reset password',
  resetVerify: 'Enter the code',
  changePassword: 'Change password',
  confirmEmail: 'Confirm your email',
};

const SUBTITLES: Partial<Record<AuthFormMode, string>> = {
  signUp: 'Back up your log and restore it on a new phone.',
  signIn: "Sign in to restore your data. Data on this device is added to the account.",
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

type Palette = {
  text: string;
  icon: string;
  tint: string;
  danger: string;
  subtle: string;
  surface: string;
  fieldBorder: string;
  errorText: string;
  dark: boolean;
};

type FieldViewProps = {
  label: string;
  value: string;
  onChange: (v: string) => void;
  error?: string;
  focused: boolean;
  onFocus: () => void;
  onBlur: () => void;
  onClearError: () => void;
  busy: boolean;
  editable?: boolean;
  bindRef?: (el: TextInput | null) => void;
  hint?: string;
  secure?: boolean;
  reveal: boolean;
  onToggleReveal: () => void;
  palette: Palette;
  inputProps: TextInputProps;
};

function FieldView({ bindRef, ...p }: FieldViewProps) {
  const editable = (p.editable ?? true) && !p.busy;
  const { palette: c } = p;
  return (
    <View style={styles.field}>
      <Text style={[styles.label, { color: c.icon }]}>{p.label}</Text>
      <View style={styles.inputRow}>
        <TextInput
          ref={bindRef}
          style={[
            styles.input,
            p.secure && styles.inputWithToggle,
            {
              backgroundColor: p.focused ? c.surface : c.subtle,
              color: c.text,
              borderColor: p.error ? c.danger : p.focused ? c.tint : c.dark ? c.fieldBorder : 'transparent',
            },
            !editable && styles.disabled,
          ]}
          value={p.value}
          onChangeText={(v) => {
            p.onChange(v);
            p.onClearError();
          }}
          onFocus={p.onFocus}
          onBlur={p.onBlur}
          placeholderTextColor={c.icon}
          editable={editable}
          accessibilityLabel={p.label}
          accessibilityHint={p.error ?? p.hint}
          {...p.inputProps}
        />
        {p.secure && (
          <TouchableOpacity
            style={styles.toggle}
            onPress={p.onToggleReveal}
            accessibilityRole="button"
            accessibilityLabel={p.reveal ? 'Hide password' : 'Show password'}
          >
            <Text style={[styles.toggleText, { color: c.tint }]}>{p.reveal ? 'Hide' : 'Show'}</Text>
          </TouchableOpacity>
        )}
      </View>
      {p.error && (
        <Text style={[styles.error, { color: c.errorText }]} accessibilityLiveRegion="polite">
          {p.error}
        </Text>
      )}
    </View>
  );
}

export function AuthForm({ initialMode, context, onRoute, onBusyChange }: Props) {
  const text = useThemeColor({}, 'text');
  const icon = useThemeColor({}, 'icon');
  const tint = useThemeColor({}, 'tint');
  const onTint = useThemeColor({}, 'background');
  const danger = useThemeColor({}, 'danger');
  const subtle = useThemeColor({}, 'cardSecondary');
  const surface = useThemeColor({}, 'cardBackground');
  const fieldBorder = useThemeColor({}, 'fieldBorder');
  const dark = useColorScheme() === 'dark';
  // Danger red on warm paper is about 3.4:1: keep it for the border, use ink for the text.
  const errorText = dark ? danger : text;

  const [mode, setMode] = useState<AuthFormMode>(initialMode);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [code, setCode] = useState('');
  const [errors, setErrors] = useState<Partial<Record<FieldName, string>>>({});
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<RestoreProgress | null>(null);
  const [needsRetry, setNeedsRetry] = useState(false);
  const [focused, setFocused] = useState<FieldName | null>(null);
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

  function bindEmail(el: TextInput | null) {
    emailRef.current = el;
  }
  function bindCode(el: TextInput | null) {
    codeRef.current = el;
  }
  function bindPassword(el: TextInput | null) {
    passwordRef.current = el;
  }
  function focusAfterEmail() {
    (showPassword ? passwordRef : codeRef).current?.focus();
  }
  function submitAfterCode() {
    if (showPassword) passwordRef.current?.focus();
    else handleSubmit();
  }

  const palette = { text, icon, tint, danger, subtle, surface, fieldBorder, errorText, dark };

  function fieldState(name: FieldName) {
    return {
      error: errors[name],
      focused: focused === name,
      onFocus: () => setFocused(name),
      onBlur: () => setFocused((f: FieldName | null) => (f === name ? null : f)),
      onClearError: () => {
        if (errors[name]) setErrors((prev) => ({ ...prev, [name]: undefined }));
      },
      reveal,
      onToggleReveal: () => setReveal((r) => !r),
      palette,
      busy,
    };
  }

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
        <Text style={[styles.title, { color: text }]} accessibilityRole="header">
          {TITLES[mode]}
        </Text>
        {SUBTITLES[mode] && <Text style={[styles.subtitle, { color: icon }]}>{SUBTITLES[mode]}</Text>}

        {mode === 'signIn' && APPLE_SIGN_IN_SUPPORTED && (
          <View style={styles.apple}>
            <AppleSignInButton type="signIn" onPress={handleApple} disabled={busy} />
            <Text style={[styles.or, { color: icon }]}>or</Text>
          </View>
        )}

        {showEmail && (
          <FieldView
            {...fieldState('email')}
            label="Email"
            value={email}
            onChange={setEmail}
            editable={!emailLocked}
            bindRef={bindEmail}
            inputProps={{
              keyboardType: 'email-address',
              autoCapitalize: 'none',
              autoCorrect: false,
              textContentType: 'emailAddress',
              autoComplete: 'email',
              returnKeyType: 'next',
              onSubmitEditing: focusAfterEmail,
              submitBehavior: 'submit',
            }}
          />
        )}
        {showCode && (
          <FieldView
            {...fieldState('code')}
            label="6-digit code"
            value={code}
            onChange={setCode}
            bindRef={bindCode}
            inputProps={{
              keyboardType: 'number-pad',
              maxLength: 6,
              textContentType: 'oneTimeCode',
              autoComplete: 'one-time-code',
              returnKeyType: showPassword ? 'next' : 'done',
              onSubmitEditing: submitAfterCode,
              submitBehavior: 'submit',
            }}
          />
        )}
        {showPassword && (
          <FieldView
            {...fieldState('password')}
            label={mode === 'signUp' ? 'Password' : newPassword ? 'New password' : 'Password'}
            value={password}
            onChange={setPassword}
            bindRef={bindPassword}
            secure
            hint={newPassword ? PASSWORD_HINT : undefined}
            inputProps={{
              secureTextEntry: !reveal,
              autoCapitalize: 'none',
              autoCorrect: false,
              textContentType: newPassword ? 'newPassword' : 'password',
              autoComplete: newPassword ? 'new-password' : 'current-password',
              returnKeyType: 'done',
              onSubmitEditing: handleSubmit,
            }}
          />
        )}
        {newPassword && !errors.password && (
          <Text style={[styles.hint, { color: icon }]}>{PASSWORD_HINT}</Text>
        )}

        <TouchableOpacity
          style={[styles.button, { backgroundColor: tint }, busy && styles.disabled]}
          onPress={handleSubmit}
          disabled={busy}
          accessibilityRole="button"
          accessibilityLabel={SUBMIT_LABELS[mode]}
          accessibilityState={{ busy, disabled: busy }}
        >
          {busy ? (
            <ActivityIndicator color={onTint} />
          ) : (
            <Text style={[styles.buttonText, { color: onTint }]}>{SUBMIT_LABELS[mode]}</Text>
          )}
        </TouchableOpacity>

        {busy && progress && (
          <Text style={[styles.statusText, styles.message, { color: icon }]} accessibilityLiveRegion="polite">
            {describeProgress(progress)}
          </Text>
        )}
        {!busy && message && (
          <Text style={[styles.statusText, styles.message, { color: icon }]} accessibilityLiveRegion="polite">
            {message}
          </Text>
        )}
        {!busy && needsRetry && (
          <TouchableOpacity style={styles.link} onPress={handleRetryRestore} accessibilityRole="button">
            <Text style={[styles.linkText, { color: tint }]}>Retry restore</Text>
          </TouchableOpacity>
        )}

        {mode === 'confirmEmail' && (
          <>
            <TouchableOpacity style={styles.link} onPress={handleResend} disabled={busy} accessibilityRole="button">
              <Text style={[styles.linkText, { color: tint }]}>Resend code</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.link}
              onPress={handleDifferentEmail}
              disabled={busy}
              accessibilityRole="button"
            >
              <Text style={[styles.linkText, { color: tint }]}>Use a different email</Text>
            </TouchableOpacity>
          </>
        )}
        {mode === 'signIn' && (
          <>
            <TouchableOpacity
              style={styles.link}
              onPress={() => switchMode('resetRequest')}
              disabled={busy}
              accessibilityRole="button"
            >
              <Text style={[styles.linkText, { color: tint }]}>Forgot password?</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.link}
              onPress={() => switchMode('signUp')}
              disabled={busy}
              accessibilityRole="button"
            >
              <Text style={[styles.linkText, { color: tint }]}>Sign up with email</Text>
            </TouchableOpacity>
          </>
        )}
        {mode === 'signUp' && (
          <TouchableOpacity
            style={styles.link}
            onPress={() => switchMode('signIn')}
            disabled={busy}
            accessibilityRole="button"
          >
            <Text style={[styles.linkText, { color: tint }]}>Already have an account? Sign in</Text>
          </TouchableOpacity>
        )}
        {(mode === 'resetRequest' || mode === 'resetVerify') && (
          <TouchableOpacity
            style={styles.link}
            onPress={() => switchMode('signIn')}
            disabled={busy}
            accessibilityRole="button"
          >
            <Text style={[styles.linkText, { color: tint }]}>Back to sign in</Text>
          </TouchableOpacity>
        )}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  content: { padding: 24, paddingBottom: 40 },
  title: { fontSize: 22, fontWeight: '700', lineHeight: 26, marginBottom: 8 },
  subtitle: { fontSize: 15, lineHeight: 22, marginBottom: 20 },
  apple: { marginBottom: 8 },
  or: { fontSize: 13, textAlign: 'center', marginTop: 12 },
  field: { marginBottom: 12 },
  label: { fontSize: 13, fontWeight: '500', marginBottom: 4 },
  inputRow: { justifyContent: 'center' },
  input: {
    minHeight: 48,
    borderRadius: 8,
    borderWidth: 1.5,
    paddingHorizontal: 16,
    fontSize: 15,
  },
  inputWithToggle: { paddingRight: 64 },
  toggle: {
    position: 'absolute',
    right: 0,
    minHeight: 44,
    minWidth: 56,
    alignItems: 'center',
    justifyContent: 'center',
  },
  toggleText: { fontSize: 15, fontWeight: '600' },
  error: { fontSize: 12, lineHeight: 17, marginTop: 4 },
  hint: { fontSize: 12, lineHeight: 17, marginBottom: 12 },
  button: {
    minHeight: 48,
    borderRadius: 18,
    paddingHorizontal: 24,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 8,
  },
  buttonText: { fontSize: 17, fontWeight: '600' },
  disabled: { opacity: 0.5 },
  statusText: { fontSize: 13, lineHeight: 18 },
  message: { textAlign: 'center', marginTop: 12 },
  link: { minHeight: 44, alignItems: 'center', justifyContent: 'center', marginTop: 4 },
  linkText: { fontSize: 15, fontWeight: '600' },
});
