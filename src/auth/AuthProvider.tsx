/**
 * Authentication state for the whole app.
 *
 * Behaviour:
 *  - The session is read once on mount and then kept in step with Supabase's
 *    `onAuthStateChange`, so it survives page reloads and token refreshes.
 *  - Every operation returns a translatable error KEY rather than a message;
 *    presentation belongs to the component.
 *  - When Supabase is not configured the provider still mounts, reports
 *    `isConfigured: false`, and every action returns `notConfigured`. The rest of
 *    the app keeps working, and the UI explains why saving is unavailable.
 *  - Administrator status is asked of the database (`is_admin()`), never
 *    inferred from client state. It is used only to decide what to render; real
 *    authorisation happens in RLS.
 */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import type { Session, User } from '@supabase/supabase-js';
import { getSupabaseClient, supabaseAvailable } from '../lib/supabase';
import { classifyAuthError, type AuthErrorKey } from '../lib/authErrors';
import { checkIsAdmin } from '../lib/userRepository';

export interface SignUpOutcome {
  /** True when Supabase requires the user to confirm their email first. */
  needsEmailConfirmation: boolean;
}

export interface AuthContextValue {
  user: User | null;
  session: Session | null;
  /** True while the initial session is being restored. */
  isLoading: boolean;
  /** False when the deployment has no Supabase configuration. */
  isConfigured: boolean;
  isAdmin: boolean;
  signIn: (email: string, password: string) => Promise<AuthErrorKey | null>;
  signUp: (
    email: string,
    password: string,
    displayName?: string
  ) => Promise<{ error: AuthErrorKey | null; outcome?: SignUpOutcome }>;
  signOut: () => Promise<AuthErrorKey | null>;
  requestPasswordReset: (email: string) => Promise<AuthErrorKey | null>;
  updatePassword: (password: string) => Promise<AuthErrorKey | null>;
  /** Re-read administrator status; call after a role change. */
  refreshAdmin: () => Promise<void>;
}

export const AuthContext = createContext<AuthContextValue | null>(null);

/** Where Supabase should send users back to after an email link. */
export function authRedirectTo(path: string): string | undefined {
  if (typeof window === 'undefined') return undefined;
  return `${window.location.origin}${path}`;
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(supabaseAvailable);
  const [isAdmin, setIsAdmin] = useState(false);

  const user = session?.user ?? null;

  // Restore the session once, then subscribe to changes.
  useEffect(() => {
    let active = true;
    let unsubscribe: (() => void) | null = null;

    void (async () => {
      const supabase = await getSupabaseClient();
      if (!active) return;

      if (!supabase) {
        setIsLoading(false);
        return;
      }

      const { data } = await supabase.auth.getSession();
      if (!active) return;
      setSession(data.session ?? null);
      setIsLoading(false);

      const { data: subscription } = supabase.auth.onAuthStateChange(
        (_event, nextSession) => {
          if (!active) return;
          setSession(nextSession);
          // A sign-out must not leave a stale admin flag behind.
          if (!nextSession) setIsAdmin(false);
        }
      );
      unsubscribe = () => subscription.subscription.unsubscribe();
    })();

    return () => {
      active = false;
      unsubscribe?.();
    };
  }, []);

  // Ask the database for administrator status whenever the identity changes.
  useEffect(() => {
    if (!user) {
      setIsAdmin(false);
      return;
    }

    let active = true;
    void checkIsAdmin().then((result) => {
      if (active) setIsAdmin(result);
    });

    return () => {
      active = false;
    };
  }, [user]);

  const signIn = useCallback(async (email: string, password: string) => {
    const supabase = await getSupabaseClient();
    if (!supabase) return 'notConfigured' satisfies AuthErrorKey;

    const { error } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password,
    });
    return error ? classifyAuthError(error) : null;
  }, []);

  const signUp = useCallback(
    async (email: string, password: string, displayName?: string) => {
      const supabase = await getSupabaseClient();
      if (!supabase) return { error: 'notConfigured' as AuthErrorKey };

      const { data, error } = await supabase.auth.signUp({
        email: email.trim(),
        password,
        options: {
          // Read by the handle_new_user() trigger to populate profiles.display_name.
          data: displayName?.trim() ? { display_name: displayName.trim() } : {},
          emailRedirectTo: authRedirectTo('/auth/callback'),
        },
      });

      if (error) return { error: classifyAuthError(error) };

      // With "Confirm email" enabled, Supabase returns a user but no session.
      const needsEmailConfirmation = Boolean(data.user) && !data.session;
      return { error: null, outcome: { needsEmailConfirmation } };
    },
    []
  );

  const signOut = useCallback(async () => {
    const supabase = await getSupabaseClient();
    if (!supabase) return 'notConfigured' satisfies AuthErrorKey;

    const { error } = await supabase.auth.signOut();
    return error ? classifyAuthError(error) : null;
  }, []);

  const requestPasswordReset = useCallback(async (email: string) => {
    const supabase = await getSupabaseClient();
    if (!supabase) return 'notConfigured' satisfies AuthErrorKey;

    const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
      redirectTo: authRedirectTo('/auth/reset'),
    });
    return error ? classifyAuthError(error) : null;
  }, []);

  const updatePassword = useCallback(async (password: string) => {
    const supabase = await getSupabaseClient();
    if (!supabase) return 'notConfigured' satisfies AuthErrorKey;

    const { error } = await supabase.auth.updateUser({ password });
    return error ? classifyAuthError(error) : null;
  }, []);

  const refreshAdmin = useCallback(async () => {
    setIsAdmin(await checkIsAdmin());
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      session,
      isLoading,
      isConfigured: supabaseAvailable,
      isAdmin,
      signIn,
      signUp,
      signOut,
      requestPasswordReset,
      updatePassword,
      refreshAdmin,
    }),
    [
      user,
      session,
      isLoading,
      isAdmin,
      signIn,
      signUp,
      signOut,
      requestPasswordReset,
      updatePassword,
      refreshAdmin,
    ]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

/** Access authentication state. Throws outside a provider so mistakes surface early. */
export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used inside an AuthProvider');
  }
  return context;
}
