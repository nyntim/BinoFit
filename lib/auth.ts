// Public auth API. The code lives in lib/auth-*.ts; callers import from '@/lib/auth' (never an
// auth-* file) so jest.mock('@/lib/auth') keeps covering them.
export {
  markAllForResync,
  reconcileSyncedUid,
  deriveAuthState,
  methodFromUser,
  isAppleCancel,
  isTerminalTicketError,
  getSessionUserId,
  getAuthState,
} from '@/lib/auth-session';
export {
  shouldDropTicket,
  retryPendingMergeTicket,
  type InitAuthResult,
  ANON_SIGN_IN_COOLDOWN_MS,
  VALIDATE_SESSION_TIMEOUT_MS,
  resetAuthRuntimeState,
  initAuth,
  ensureSession,
  type SignInOutcome,
  type ObtainResult,
  signInWithMerge,
  retryRestore,
} from '@/lib/auth-init';
export { signInWithApple } from '@/lib/auth-apple';
export {
  type EmailSignUpOutcome,
  signUpWithEmail,
  verifyEmailCode,
  resendEmailCode,
  signInWithEmail,
  requestPasswordReset,
  verifyPasswordReset,
  changePassword,
} from '@/lib/auth-email';
export { countUnsynced, prepareSignOut, type SignOutResult, signOutAndWipe } from '@/lib/auth-sign-out';
export {
  type PendingAccountDeletion,
  getPendingAccountDeletion,
  removePendingDeletionDeviceData,
  canDeleteAccount,
  deleteAccountAndWipe,
} from '@/lib/auth-account-deletion';
