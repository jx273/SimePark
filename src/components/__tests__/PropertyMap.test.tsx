/**
 * @vitest-environment happy-dom
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { I18nextProvider } from 'react-i18next';
import type { i18n as I18nInstance } from 'i18next';
import PropertyMap, { hasUsableCoordinates } from '../PropertyMap';
import { createTestI18n } from '../../test/testI18n';

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
});
