/**
 * @vitest-environment happy-dom
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { I18nextProvider } from 'react-i18next';
import type { i18n as I18nInstance } from 'i18next';
import PropertyCard from '../PropertyCard';
import CompareTray from '../CompareTray';
import { createTestI18n } from '../../test/testI18n';
import { buildBundledCatalog } from '../../lib/propertyAdapter';
import { toUncalculatedProperties } from '../../utils/propertyFilter';
import { getLocalizedProperty, localizeProperties } from '../../utils/propertyLocalization';
import type { PropertyWithCalculations } from '../../types/property';

let i18nEn: I18nInstance;
let i18nMs: I18nInstance;
let i18nZh: I18nInstance;

beforeEach(async () => {
  i18nEn = await createTestI18n('en');
  i18nMs = await createTestI18n('ms');
  i18nZh = await createTestI18n('zh');
});

afterEach(() => {
  cleanup();
});

describe('Multilingual Component Display and Language Switching', () => {
  const catalog = buildBundledCatalog();
  const uncalculatedCatalog = toUncalculatedProperties(catalog);
  const sp1 = uncalculatedCatalog.find((p) => p.id === 'SP-001')!;

  it('renders PropertyCard in English with English propertyType (Apartment)', () => {
    const localized = getLocalizedProperty(sp1, 'en') as PropertyWithCalculations;
    render(
      <I18nextProvider i18n={i18nEn}>
        <PropertyCard
          property={localized}
          onViewDetails={vi.fn()}
          isSaved={false}
          isCompared={false}
          onToggleSaved={vi.fn()}
          onToggleCompared={vi.fn()}
          comparisonFull={false}
        />
      </I18nextProvider>
    );

    expect(screen.getByText('Apartment')).toBeTruthy();
  });

  it('renders PropertyCard in Malay with Malay propertyType (Pangsapuri)', () => {
    const localized = getLocalizedProperty(sp1, 'ms') as PropertyWithCalculations;
    render(
      <I18nextProvider i18n={i18nMs}>
        <PropertyCard
          property={localized}
          onViewDetails={vi.fn()}
          isSaved={false}
          isCompared={false}
          onToggleSaved={vi.fn()}
          onToggleCompared={vi.fn()}
          comparisonFull={false}
        />
      </I18nextProvider>
    );

    expect(screen.getByText('Pangsapuri')).toBeTruthy();
  });

  it('renders PropertyCard in Chinese with Chinese propertyType (公寓)', () => {
    const localized = getLocalizedProperty(sp1, 'zh') as PropertyWithCalculations;
    render(
      <I18nextProvider i18n={i18nZh}>
        <PropertyCard
          property={localized}
          onViewDetails={vi.fn()}
          isSaved={false}
          isCompared={false}
          onToggleSaved={vi.fn()}
          onToggleCompared={vi.fn()}
          comparisonFull={false}
        />
      </I18nextProvider>
    );

    expect(screen.getByText('公寓')).toBeTruthy();
  });

  it('renders CompareTray with localized fields in Chinese', () => {
    const localizedCatalog = localizeProperties(uncalculatedCatalog.slice(0, 2), 'zh') as PropertyWithCalculations[];
    render(
      <I18nextProvider i18n={i18nZh}>
        <CompareTray
          properties={localizedCatalog}
          onRemove={vi.fn()}
          onClear={vi.fn()}
        />
      </I18nextProvider>
    );

    // SP-001 is Apartment -> 公寓, SP-002 is Bungalow -> 独立式洋房
    expect(screen.getByText('公寓')).toBeTruthy();
    expect(screen.getByText('独立式洋房')).toBeTruthy();
    // Tenure in Chinese: 租赁地契, 永久地契
    expect(screen.getByText('租赁地契')).toBeTruthy();
    expect(screen.getByText('永久地契')).toBeTruthy();
  });

  it('renders CompareTray with localized fields in Malay', () => {
    const localizedCatalog = localizeProperties(uncalculatedCatalog.slice(0, 2), 'ms') as PropertyWithCalculations[];
    render(
      <I18nextProvider i18n={i18nMs}>
        <CompareTray
          properties={localizedCatalog}
          onRemove={vi.fn()}
          onClear={vi.fn()}
        />
      </I18nextProvider>
    );

    // SP-001 is Pangsapuri, SP-002 is Banglo
    expect(screen.getByText('Pangsapuri')).toBeTruthy();
    expect(screen.getByText('Banglo')).toBeTruthy();
    // Tenure in Malay: Pegangan Pajakan, Pegangan Bebas
    expect(screen.getByText('Pegangan Pajakan')).toBeTruthy();
    expect(screen.getByText('Pegangan Bebas')).toBeTruthy();
  });
});
