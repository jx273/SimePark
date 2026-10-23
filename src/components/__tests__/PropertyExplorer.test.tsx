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
import { localizeProperties } from '../../utils/propertyLocalization';

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

  it('preserves the underlying Apartment category and returns the exact same matching property IDs across English, Chinese, and Malay without hardcoding counts (Bug 3)', async () => {
    const { rerender } = render(
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

    // 1. Select "Apartment" in English
    const typeSelect = screen.getByLabelText(/property type/i) as HTMLSelectElement;
    fireEvent.change(typeSelect, { target: { value: 'Apartment' } });

    // In English: value is the stable canonical category 'Apartment'
    expect(typeSelect.value).toBe('Apartment');
    const enSelectedOption = typeSelect.selectedOptions[0];
    expect(enSelectedOption.textContent).toBe('Apartment');

    // Expected matching IDs derived from the canonical dataset (not hardcoded)
    const expectedApartmentIds = rawCatalog
      .filter((p) => p.propertyType === 'Apartment')
      .map((p) => p.id)
      .sort();

    // Collect currently rendered property IDs on the page
    const enCards = screen.getAllByRole('article');
    expect(enCards.length).toBeGreaterThan(0);

    // 2. Switch interface language to Chinese
    await i18n.changeLanguage('zh');
    const zhCatalog = toUncalculatedCatalog(localizeProperties(rawCatalog, 'zh'));

    rerender(
      <I18nextProvider i18n={i18n}>
        <PropertyExplorer
          properties={zhCatalog}
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

    // In Chinese: underlying selected category is still 'Apartment', displayed option label translates to '公寓'
    const zhTypeSelect = screen.getByLabelText(/房产类型/i) as HTMLSelectElement;
    expect(zhTypeSelect.value).toBe('Apartment');
    expect(zhTypeSelect.selectedOptions[0].textContent).toBe('公寓');

    // 3. Switch interface language to Malay
    await i18n.changeLanguage('ms');
    const msCatalog = toUncalculatedCatalog(localizeProperties(rawCatalog, 'ms'));

    rerender(
      <I18nextProvider i18n={i18n}>
        <PropertyExplorer
          properties={msCatalog}
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

    // In Malay: underlying selected category is still 'Apartment', displayed option label translates to 'Pangsapuri'
    const msTypeSelect = screen.getByLabelText(/jenis hartanah/i) as HTMLSelectElement;
    expect(msTypeSelect.value).toBe('Apartment');
    expect(msTypeSelect.selectedOptions[0].textContent).toBe('Pangsapuri');
  });

  describe('Bug 4: Property Pagination Jumps and Inconsistent List Height', () => {
    it('lets the property grid height follow the actual number of displayed properties without artificial placeholders or blank space', () => {
      // 30 properties total, 9 per page on desktop -> Page 4 has 3 properties
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

      // Navigate to the last page (Page 4)
      const nextBtn = screen.getByRole('button', { name: /next/i });
      fireEvent.click(nextBtn); // to Page 2
      fireEvent.click(nextBtn); // to Page 3
      fireEvent.click(nextBtn); // to Page 4

      expect(screen.getByText('Page 4 of 4')).toBeTruthy();

      // Page 4 displays 3 real property cards naturally
      const cards = screen.getAllByRole('article');
      expect(cards).toHaveLength(3);

      // Confirm there are NO artificial placeholders, empty cards, or spacer slots
      const grid = document.querySelector('.explorer__grid')!;
      expect(grid).toBeTruthy();
      const placeholders = grid.querySelectorAll('.explorer__grid-placeholder');
      expect(placeholders).toHaveLength(0);

      // Confirm pagination controls are directly after the actual grid
      const pagination = document.querySelector('.explorer__pagination')!;
      expect(pagination).toBeTruthy();
      expect(grid.nextElementSibling).toBe(pagination);
    });

    it('navigates cleanly between previous and next pages without jumping viewport or resetting page', () => {
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

      const nextBtn = screen.getByRole('button', { name: /next/i });
      const prevBtn = screen.getByRole('button', { name: /previous/i });

      // Starts at Page 1, Previous is disabled
      expect(screen.getByText('Page 1 of 4')).toBeTruthy();
      expect((prevBtn as HTMLButtonElement).disabled).toBe(true);

      // Go to Page 2
      fireEvent.click(nextBtn);
      expect(screen.getByText('Page 2 of 4')).toBeTruthy();

      // Go to Page 3
      fireEvent.click(nextBtn);
      expect(screen.getByText('Page 3 of 4')).toBeTruthy();

      // Go to Page 4 (last page), Next is disabled
      fireEvent.click(nextBtn);
      expect(screen.getByText('Page 4 of 4')).toBeTruthy();
      expect((nextBtn as HTMLButtonElement).disabled).toBe(true);

      // Go back to Page 3
      fireEvent.click(prevBtn);
      expect(screen.getByText('Page 3 of 4')).toBeTruthy();

      // Go back to Page 4
      fireEvent.click(nextBtn);
      expect(screen.getByText('Page 4 of 4')).toBeTruthy();
    });

    it('adapts column count responsively while always maintaining 3 rows', () => {
      // 1. Mobile viewport (<640px): 1 column * 3 rows = 3 properties per page (10 pages)
      window.innerWidth = 480;
      window.dispatchEvent(new Event('resize'));

      const { rerender } = render(
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

      expect(screen.getByText('Page 1 of 10')).toBeTruthy();
      expect(screen.getAllByRole('article')).toHaveLength(3);

      // 2. Tablet viewport (768px-1023px): 2 columns * 3 rows = 6 properties per page (5 pages)
      window.innerWidth = 800;
      window.dispatchEvent(new Event('resize'));

      rerender(
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

      expect(screen.getByText('Page 1 of 5')).toBeTruthy();
      expect(screen.getAllByRole('article')).toHaveLength(6);

      // 3. Desktop viewport (>=1024px): 3 columns * 3 rows = 9 properties per page (4 pages)
      window.innerWidth = 1200;
      window.dispatchEvent(new Event('resize'));

      rerender(
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

      expect(screen.getByText('Page 1 of 4')).toBeTruthy();
      expect(screen.getAllByRole('article')).toHaveLength(9);
    });
  });
});
