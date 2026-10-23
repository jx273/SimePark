/**
 * @vitest-environment happy-dom
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { I18nextProvider } from 'react-i18next';
import PropertyDetailPage from '../PropertyDetailPage';
import { createTestI18n } from '../../test/testI18n';
import { buildBundledCatalog } from '../../lib/propertyAdapter';
import { toUncalculatedCatalog } from '../../lib/propertyRepository';
import { SelectionProvider } from '../../state/SelectionProvider';
import { AuthProvider } from '../../auth/AuthProvider';

describe('PropertyDetailPage — Bug 1 Direct URL access and refresh', () => {
  const catalog = buildBundledCatalog();
  const uncalculated = toUncalculatedCatalog(catalog);
  const target = uncalculated[0];

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    cleanup();
  });

  it('renders without crashing when isLoading transitions from true to false (Bug 1 hook order violation)', async () => {
    const i18n = await createTestI18n('en');

    // 1. Initial direct load: isLoading is true (waiting for fetchCatalog)
    const { rerender } = render(
      <I18nextProvider i18n={i18n}>
        <AuthProvider>
          <SelectionProvider>
            <PropertyDetailPage
              propertyId={target.id}
              property={null}
              rawProperty={null}
              isLoading={true}
              affordabilityInputs={null}
              affordabilityResult={null}
              properties={[]}
              comparisonProperties={[]}
            />
          </SelectionProvider>
        </AuthProvider>
      </I18nextProvider>
    );

    // Initial loading indicator is visible
    expect(screen.getByRole('status')).toBeTruthy();
    expect(screen.getByText(/loading/i)).toBeTruthy();

    // 2. Catalog loaded: isLoading becomes false, property is provided
    rerender(
      <I18nextProvider i18n={i18n}>
        <AuthProvider>
          <SelectionProvider>
            <PropertyDetailPage
              propertyId={target.id}
              property={target}
              rawProperty={target}
              isLoading={false}
              affordabilityInputs={null}
              affordabilityResult={null}
              properties={uncalculated}
              comparisonProperties={[]}
            />
          </SelectionProvider>
        </AuthProvider>
      </I18nextProvider>
    );

    // Property page renders properly without hook errors or white screen
    expect(screen.getByText(target.propertyName)).toBeTruthy();
    expect(screen.getByText(/back to properties/i)).toBeTruthy();
  });
});
