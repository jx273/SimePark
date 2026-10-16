import { describe, it, expect } from 'vitest';
import { classifyAuthError, validateEmail, validatePassword } from '../authErrors';

/**
 * Provider messages are mapped to stable keys so the interface can translate them
 * and so provider wording can change without breaking the UI.
 */
describe('classifyAuthError', () => {
  it.each([
    ['Invalid login credentials', 'invalidCredentials'],
    ['Email not confirmed', 'emailNotConfirmed'],
    ['User already registered', 'emailInUse'],
    ['Password should be at least 6 characters', 'weakPassword'],
    ['New password should be different from the old password', 'samePassword'],
    ['Unable to validate email address: invalid format', 'invalidEmail'],
    ['Too many requests', 'rateLimited'],
    ['Failed to fetch', 'network'],
    ['Something nobody predicted', 'generic'],
  ])('maps %s', (message, expected) => {
    expect(classifyAuthError({ message })).toBe(expected);
  });

  it('uses the error code when one is provided', () => {
    expect(classifyAuthError({ code: 'invalid_credentials' })).toBe('invalidCredentials');
    expect(classifyAuthError({ code: 'email_not_confirmed' })).toBe('emailNotConfirmed');
    expect(classifyAuthError({ code: 'weak_password' })).toBe('weakPassword');
  });

  it('treats HTTP 429 as rate limiting even without a matching message', () => {
    expect(classifyAuthError({ status: 429, message: 'slow down' })).toBe('rateLimited');
  });

  it('falls back to generic rather than echoing an unknown provider message', () => {
    const result = classifyAuthError({ message: 'relation "profiles" does not exist' });
    expect(result).toBe('generic');
  });

  it('handles a missing error object', () => {
    expect(classifyAuthError(null)).toBe('generic');
    expect(classifyAuthError(undefined)).toBe('generic');
  });
});

describe('browser-side validation', () => {
  it('rejects blank and malformed emails', () => {
    expect(validateEmail('')).toBe('invalidEmail');
    expect(validateEmail('   ')).toBe('invalidEmail');
    expect(validateEmail('not-an-email')).toBe('invalidEmail');
    expect(validateEmail('a@b')).toBe('invalidEmail');
  });

  it('accepts plausible addresses', () => {
    expect(validateEmail('buyer@example.com')).toBeNull();
    expect(validateEmail('  buyer@example.com  ')).toBeNull();
  });

  it('requires at least eight characters for a password', () => {
    expect(validatePassword('short')).toBe('weakPassword');
    expect(validatePassword('1234567')).toBe('weakPassword');
    expect(validatePassword('12345678')).toBeNull();
  });
});
