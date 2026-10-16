/**
 * Map Supabase auth errors onto stable, translatable keys.
 *
 * Why not show the upstream message: it is untranslated English, it can change
 * without notice, and it sometimes reveals whether an email address exists. The
 * UI translates these keys, and a genuine signup confirmation flow is described
 * separately from an error.
 *
 * Unrecognised errors fall back to `generic` rather than echoing the provider.
 */

export type AuthErrorKey =
  | 'invalidCredentials'
  | 'passwordMismatch'
  | 'emailInUse'
  | 'weakPassword'
  | 'invalidEmail'
  | 'emailNotConfirmed'
  | 'rateLimited'
  | 'samePassword'
  | 'network'
  | 'notConfigured'
  | 'generic';

/** Message shapes Supabase returns, matched loosely but deterministically. */
export function classifyAuthError(error: { message?: string; status?: number; code?: string } | null | undefined): AuthErrorKey {
  if (!error) return 'generic';

  const message = (error.message ?? '').toLowerCase();
  const code = (error.code ?? '').toLowerCase();

  if (code === 'invalid_credentials' || message.includes('invalid login credentials')) {
    return 'invalidCredentials';
  }
  if (code === 'email_not_confirmed' || message.includes('email not confirmed')) {
    return 'emailNotConfirmed';
  }
  if (
    code === 'user_already_exists' ||
    message.includes('already registered') ||
    message.includes('already been registered') ||
    message.includes('user already exists')
  ) {
    return 'emailInUse';
  }
  if (code === 'weak_password' || message.includes('password should be at least')) {
    return 'weakPassword';
  }
  if (code === 'same_password' || message.includes('should be different from the old password')) {
    return 'samePassword';
  }
  if (message.includes('unable to validate email') || message.includes('invalid email')) {
    return 'invalidEmail';
  }
  if (error.status === 429 || message.includes('rate limit') || message.includes('too many requests')) {
    return 'rateLimited';
  }
  if (message.includes('failed to fetch') || message.includes('networkerror')) {
    return 'network';
  }

  return 'generic';
}

/**
 * Validate credentials in the browser before calling the provider.
 *
 * This is user-experience only. Supabase enforces the real password policy
 * server-side; a client check can always be bypassed, so nothing here is treated
 * as a security control.
 */
export function validateEmail(email: string): AuthErrorKey | null {
  const trimmed = email.trim();
  if (!trimmed) return 'invalidEmail';
  // Deliberately permissive: the authoritative check is the confirmation email.
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) return 'invalidEmail';
  return null;
}

export function validatePassword(password: string): AuthErrorKey | null {
  return password.length >= 8 ? null : 'weakPassword';
}
