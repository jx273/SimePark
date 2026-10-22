/**
 * @vitest-environment happy-dom
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { I18nextProvider } from 'react-i18next';
import type { i18n as I18nInstance } from 'i18next';
import PropertyMap, { hasUsableCoordinates } from '../PropertyMap';
import { createTestI18n } from '../../test/testI18n';
import { buildBundledCatalog } from '../../lib/propertyAdapter';
import { toUncalculatedCatalog } from '../../lib/propertyRepository';

let i18n: I18nInstance;

beforeEach(async () => {
  i18n = await createTestI18n('en');
});

afterEach(cleanup);

describe('PropertyMap', () => {
  it('shows an unavailable state instead of inventing coordinates', () => {
    render(
      <I18nextProvider i18n={i18n}>
        <PropertyMap properties={[]} onViewDetails={() => undefined} />
      </I18nextProvider>
    );

    expect(
      screen.getByText(
        'No properties match the current filters. Adjust the filters to see map markers.'
      )
    ).toBeTruthy();
    expect(document.querySelector('.property-map')).toBeNull();
  });

  it('accepts only complete, finite, in-range coordinate pairs for markers', () => {
    expect(
      hasUsableCoordinates({
        latitude: 3.139,
        longitude: 101.6869,
      })
    ).toBe(true);
    expect(
      hasUsableCoordinates({
        latitude: 3.139,
        longitude: 101.6869,
      })
    ).toBe(true);
    expect(
      hasUsableCoordinates({
        latitude: 91,
        longitude: 101.6869,
      })
    ).toBe(false);
    expect(hasUsableCoordinates({ latitude: 3.139, longitude: null })).toBe(false);
    expect(hasUsableCoordinates({ latitude: Number.NaN, longitude: 101.6869 })).toBe(false);
    expect(hasUsableCoordinates({ latitude: 3.139, longitude: Number.POSITIVE_INFINITY })).toBe(false);
    expect(hasUsableCoordinates({ latitude: -90, longitude: 180 })).toBe(true);
  });

  it('verifies coordinate readiness for all 30 source properties (29 mapped, 1 without coordinates)', () => {
    const rawProperties = buildBundledCatalog();
    expect(rawProperties).toHaveLength(30);

    const properties = toUncalculatedCatalog(rawProperties);
    const withCoords = properties.filter(hasUsableCoordinates);
    const withoutCoords = properties.filter((p) => !hasUsableCoordinates(p));

    // Exactly 29 properties have valid coordinates in Malaysia
    expect(withCoords).toHaveLength(29);
    // SP-003 is the only property without coordinates in the source dataset
    expect(withoutCoords).toHaveLength(1);
    expect(withoutCoords[0].id).toBe('SP-003');
    expect(withoutCoords[0].propertyName).toBe('Bandar Putra Mak Lagam Kemaman');

    render(
      <I18nextProvider i18n={i18n}>
        <PropertyMap properties={properties} onViewDetails={() => undefined} />
      </I18nextProvider>
    );

    // Map container must be rendered
    expect(document.querySelector('.property-map')).toBeTruthy();
    // Missing count note informs users about the 1 unmapped property
    expect(screen.getByText(/1 property omitted because one or both source coordinates are missing or invalid/i)).toBeTruthy();
  });
});
