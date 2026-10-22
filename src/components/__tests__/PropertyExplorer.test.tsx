/**
 * @vitest-environment happy-dom
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { I18nextProvider } from 'react-i18next';
import type { i18n as I18nInstance } from 'i18next';
import PropertyExplorer from '../PropertyExplorer';
import { createTestI18n } from '../../test/testI18n';
import { buildBundledCatalog } from '../../lib/propertyAdapter';
import { toUncalculatedCatalog } from '../../lib/propertyRepository';

let i18n: I18nInstance;

beforeEach(async () => {
  sessionStorage.clear();
  i18n = await createTestI18n('en');
});

afterEach(() => {
  cleanup();
  sessionStorage.clear();
});

describe('PropertyExplorer pagination and scroll preservation', () => {
  const rawCatalog = buildBundledCatalog();
  const properties = toUncalculatedCatalog(rawCatalog);

  it('exposes all 30 properties across pagination with 9 items per page (4 pages)', () => {
    expect(properties).toHaveLength(30);

    render(
      <I18nextProvider i18n={i18n}>
        <PropertyExplorer
          properties={properties}
          totalCount={30}
          hasPersonalisedEstimate={false}
          onGoToAffordability={vi.fn()}
          onViewDetails={vi.fn()}
          isSaved={() => false}
          isCompared={() => false}
          onToggleSaved={vi.fn()}
          onToggleCompared={vi.fn()}
          comparisonFull={false}
        />
      </I18nextProvider>
    );

    // Initial page shows 9 cards
    expect(screen.getByText('Page 1 of 4')).toBeTruthy();
    expect(screen.getByText(/30 matching properties/i)).toBeTruthy();

    // Navigate to page 2
    const nextBtn = screen.getByRole('button', { name: /next/i });
    fireEvent.click(nextBtn);
    expect(screen.getByText('Page 2 of 4')).toBeTruthy();

    // Navigate to page 4
    fireEvent.click(nextBtn);
    expect(screen.getByText('Page 3 of 4')).toBeTruthy();
    fireEvent.click(nextBtn);
    expect(screen.getByText('Page 4 of 4')).toBeTruthy();
  });

  it('preserves filters and pagination state in sessionStorage', () => {
    const { unmount } = render(
      <I18nextProvider i18n={i18n}>
        <PropertyExplorer
          properties={properties}
          totalCount={30}
          hasPersonalisedEstimate={false}
          onGoToAffordability={vi.fn()}
          onViewDetails={vi.fn()}
          isSaved={() => false}
          isCompared={() => false}
          onToggleSaved={vi.fn()}
          onToggleCompared={vi.fn()}
          comparisonFull={false}
        />
      </I18nextProvider>
    );

    // Go to page 2
    const nextBtn = screen.getByRole('button', { name: /next/i });
    fireEvent.click(nextBtn);
    expect(screen.getByText('Page 2 of 4')).toBeTruthy();

    // Verify sessionStorage has page = 2
    const savedState = JSON.parse(sessionStorage.getItem('simepark_explorer_state') || '{}');
    expect(savedState.page).toBe(2);

    unmount();

    // Re-mount should restore page 2
    render(
      <I18nextProvider i18n={i18n}>
        <PropertyExplorer
          properties={properties}
          totalCount={30}
          hasPersonalisedEstimate={false}
          onGoToAffordability={vi.fn()}
          onViewDetails={vi.fn()}
          isSaved={() => false}
          isCompared={() => false}
          onToggleSaved={vi.fn()}
          onToggleCompared={vi.fn()}
          comparisonFull={false}
        />
      </I18nextProvider>
    );

    expect(screen.getByText('Page 2 of 4')).toBeTruthy();
  });

  it('saves scroll position when clicking a property to view details', () => {
    const handleViewDetails = vi.fn();
    window.scrollY = 450;

    render(
      <I18nextProvider i18n={i18n}>
        <PropertyExplorer
          properties={properties}
          totalCount={30}
          hasPersonalisedEstimate={false}
          onGoToAffordability={vi.fn()}
          onViewDetails={handleViewDetails}
          isSaved={() => false}
          isCompared={() => false}
          onToggleSaved={vi.fn()}
          onToggleCompared={vi.fn()}
          comparisonFull={false}
        />
      </I18nextProvider>
    );

    // Click the first property card title/button
    const viewButtons = screen.getAllByRole('button', { name: /view details/i });
    expect(viewButtons.length).toBeGreaterThan(0);
    fireEvent.click(viewButtons[0]);

    expect(handleViewDetails).toHaveBeenCalledTimes(1);
    expect(sessionStorage.getItem('simepark_explorer_scroll_y')).toBe('450');
  });
});
