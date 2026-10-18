/**
 * @vitest-environment happy-dom
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { I18nextProvider } from 'react-i18next';
import type { i18n as I18nInstance } from 'i18next';
import PropertyMap from '../PropertyMap';
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
        'No properties have reliable coordinates yet. Browse all results in List view.'
      )
    ).toBeTruthy();
    expect(document.querySelector('.property-map')).toBeNull();
  });
});
