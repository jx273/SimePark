/**
 * Decide whether a Supabase signUp response still requires email confirmation.
 *
 * When Confirm email is OFF, signUp returns a session and the user can continue.
 * When it is ON, a user row exists but session is null. Client code cannot turn
 * that project setting off.
 */
export function signupRequiresEmailConfirmation(data: {
  user: unknown;
  session: unknown;
}): boolean {
  return Boolean(data.user) && !data.session;
}
