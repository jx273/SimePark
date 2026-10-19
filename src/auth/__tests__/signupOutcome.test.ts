import { describe, expect, it } from 'vitest';
import { signupRequiresEmailConfirmation } from '../signupOutcome';

describe('signupRequiresEmailConfirmation', () => {
  it('returns true when Supabase creates a user without a session', () => {
    expect(signupRequiresEmailConfirmation({ user: { id: 'user-id' }, session: null })).toBe(true);
  });

  it('returns false when signup provides a session', () => {
    expect(
      signupRequiresEmailConfirmation({
        user: { id: 'user-id' },
        session: { access_token: 'test-token' },
      })
    ).toBe(false);
  });

  it('returns false when Supabase creates no user', () => {
    expect(signupRequiresEmailConfirmation({ user: null, session: null })).toBe(false);
  });
});
