import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../auth/AuthProvider';
import {
  classifyAuthError,
  validateEmail,
  validatePassword,
  type AuthErrorKey,
} from '../lib/authErrors';
import { navigate, type AuthMode } from '../router/router';
import './AuthPage.css';

interface AuthPageProps {
  mode: AuthMode;
}

/**
 * Sign-in, sign-up, password-reset, and the email-link callback.
 *
 * All four live in one page because they share the same layout and error
 * plumbing. Validation runs in the browser for feedback only; Supabase enforces
 * the real policy server-side. Errors are translated from stable keys rather than
 * echoing provider text, which can leak whether an email address exists.
 */
export default function AuthPage({ mode }: AuthPageProps) {
  const { t } = useTranslation();
  const {
    user,
    signIn,
    signUp,
    requestPasswordReset,
    updatePassword,
    isLoading,
    isConfigured,
  } = useAuth();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [error, setError] = useState<AuthErrorKey | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  // Already signed in: send them to the dashboard rather than showing a form.
  useEffect(() => {
    if (user && (mode === 'signin' || mode === 'signup')) {
      navigate({ name: 'dashboard' });
    }
  }, [user, mode]);

  const errorMessage = (key: AuthErrorKey) => t(`auth.errors.${key}`);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);
    setNotice(null);

    if (!isConfigured) {
      setError('notConfigured');
      return;
    }

    setPending(true);

    try {
      if (mode === 'signin') {
        const emailError = validateEmail(email);
        if (emailError) {
          setError(emailError);
          return;
        }
        const result = await signIn(email, password);
        if (result) setError(result);
        else navigate({ name: 'dashboard' });
        return;
      }

      if (mode === 'signup') {
        const emailError = validateEmail(email);
        if (emailError) {
          setError(emailError);
          return;
        }
        const passwordError = validatePassword(password);
        if (passwordError) {
          setError(passwordError);
          return;
        }
        if (password !== confirmPassword) {
          setError('passwordMismatch');
          return;
        }

        const { error: signUpError, outcome } = await signUp(email, password, displayName);
        if (signUpError) {
          setError(signUpError);
          return;
        }
        if (outcome?.needsEmailConfirmation) {
          // Supabase project settings are managed in its dashboard, not here.
          setNotice(t('auth.confirmEmailText', { email: email.trim() }));
          return;
        }
        navigate({ name: 'dashboard' });
        return;
      }

      if (mode === 'reset') {
        const emailError = validateEmail(email);
        if (emailError) {
          setError(emailError);
          return;
        }
        const result = await requestPasswordReset(email);
        if (result) setError(result);
        else setNotice(t('auth.resetSent'));
        return;
      }

      if (mode === 'callback') {
        // Reached from the emailed link, where Supabase has already established a
        // session. The user now chooses a new password.
        const passwordError = validatePassword(password);
        if (passwordError) {
          setError(passwordError);
          return;
        }
        if (password !== confirmPassword) {
          setError('passwordMismatch');
          return;
        }
        const result = await updatePassword(password);
        if (result) setError(result);
        else {
          setNotice(t('auth.passwordUpdated'));
          window.setTimeout(() => navigate({ name: 'dashboard' }), 1200);
        }
      }
    } catch (cause) {
      setError(
        cause instanceof Error
          ? classifyAuthError({ message: cause.message })
          : 'generic'
      );
    } finally {
      setPending(false);
    }
  };

  const titles: Record<AuthMode, { title: string; subtitle: string }> = {
    signin: { title: t('auth.signInTitle'), subtitle: t('auth.signInSubtitle') },
    signup: { title: t('auth.signUpTitle'), subtitle: t('auth.signUpSubtitle') },
    reset: { title: t('auth.resetTitle'), subtitle: t('auth.resetSubtitle') },
    callback: { title: t('auth.resetTitle'), subtitle: t('auth.newPassword') },
  };

  const showPassword = mode !== 'reset';
  const showConfirm = mode === 'signup' || mode === 'callback';

  return (
    <div className="container auth-page">
      <div className="auth-page__card surface">
        <h1 className="auth-page__title">{titles[mode].title}</h1>
        <p className="auth-page__subtitle">{titles[mode].subtitle}</p>

        {!isConfigured && (
          <div className="notice notice--warning" role="status">
            {t('auth.errors.notConfigured')}
          </div>
        )}

        {isLoading && <p className="auth-page__loading">{t('common.loading')}</p>}

        <form onSubmit={submit} noValidate>
          {mode === 'signup' && (
            <div className="form-group">
              <label className="form-label" htmlFor="displayName">
                {t('auth.displayName')} <span className="form-optional">({t('common.optional')})</span>
              </label>
              <input
                id="displayName"
                type="text"
                className="form-input"
                autoComplete="name"
                maxLength={80}
                value={displayName}
                placeholder={t('auth.displayNamePlaceholder')}
                onChange={(event) => setDisplayName(event.target.value)}
              />
            </div>
          )}

          {mode !== 'callback' && (
            <div className="form-group">
              <label className="form-label" htmlFor="email">
                {t('auth.email')}
              </label>
              <input
                id="email"
                type="email"
                className="form-input"
                autoComplete="email"
                required
                value={email}
                placeholder={t('auth.emailPlaceholder')}
                onChange={(event) => setEmail(event.target.value)}
                aria-invalid={error === 'invalidEmail'}
              />
            </div>
          )}

          {showPassword && (
            <div className="form-group">
              <label className="form-label" htmlFor="password">
                {mode === 'callback' ? t('auth.newPassword') : t('auth.password')}
              </label>
              <input
                id="password"
                type="password"
                className="form-input"
                autoComplete={mode === 'signin' ? 'current-password' : 'new-password'}
                required
                minLength={8}
                value={password}
                placeholder={t('auth.passwordPlaceholder')}
                onChange={(event) => setPassword(event.target.value)}
                aria-invalid={error === 'weakPassword'}
              />
            </div>
          )}

          {showConfirm && (
            <div className="form-group">
              <label className="form-label" htmlFor="confirmPassword">
                {t('auth.confirmPassword')}
              </label>
              <input
                id="confirmPassword"
                type="password"
                className="form-input"
                autoComplete="new-password"
                required
                minLength={8}
                value={confirmPassword}
                onChange={(event) => setConfirmPassword(event.target.value)}
                aria-invalid={error === 'passwordMismatch'}
              />
            </div>
          )}

          {/* Errors carry a glyph and are announced, so they are never conveyed
              by colour alone. */}
          {error && (
            <p className="form-error auth-page__error" role="alert">
              <span aria-hidden="true">⚠ </span>
              {errorMessage(error)}
            </p>
          )}

          {notice && (
            <p className="auth-page__notice" role="status">
              {notice}
            </p>
          )}

          <button
            type="submit"
            className="btn btn--primary btn--large auth-page__submit"
            disabled={pending || !isConfigured}
          >
            {pending
              ? mode === 'signup'
                ? t('auth.signingUp')
                : t('auth.signingIn')
              : mode === 'signin'
                ? t('auth.signIn')
                : mode === 'signup'
                  ? t('auth.signUp')
                  : mode === 'reset'
                    ? t('auth.resetPassword')
                    : t('auth.updatePassword')}
          </button>
        </form>

        <div className="auth-page__links">
          {mode === 'signin' && (
            <>
              <button
                type="button"
                className="auth-page__link"
                onClick={() => navigate({ name: 'auth', mode: 'reset' })}
              >
                {t('auth.forgotPassword')}
              </button>
              <span className="auth-page__links-sep">
                {t('auth.noAccount')}{' '}
                <button
                  type="button"
                  className="auth-page__link"
                  onClick={() => navigate({ name: 'auth', mode: 'signup' })}
                >
                  {t('auth.signUp')}
                </button>
              </span>
            </>
          )}

          {mode === 'signup' && (
            <span className="auth-page__links-sep">
              {t('auth.haveAccount')}{' '}
              <button
                type="button"
                className="auth-page__link"
                onClick={() => navigate({ name: 'auth', mode: 'signin' })}
              >
                {t('auth.signIn')}
              </button>
            </span>
          )}

          {mode === 'reset' && (
            <button
              type="button"
              className="auth-page__link"
              onClick={() => navigate({ name: 'auth', mode: 'signin' })}
            >
              {t('auth.backToSignIn')}
            </button>
          )}
        </div>

        {/* Signing up is never required for the core product. */}
        <button
          type="button"
          className="btn btn--ghost auth-page__guest"
          onClick={() => navigate({ name: 'home' })}
        >
          {t('auth.continueAsGuest')}
        </button>
      </div>
    </div>
  );
}
