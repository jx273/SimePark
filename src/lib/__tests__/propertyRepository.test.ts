import { describe, expect, it } from 'vitest';
import { bundledCatalog, filterPublicCatalogueRows, keepLoadedMedia } from '../propertyRepository';

describe('bundledCatalog', () => {
  it('reports all supplied records and counts the unknown prices', () => {
    const catalog = bundledCatalog();
    expect(catalog.properties).toHaveLength(30);
    expect(catalog.unpriced).toBe(2);
  });
});

describe('filterPublicCatalogueRows', () => {
  it('excludes demonstration rows and retains non-example property rows', () => {
    const rows = [
      { id: 'demo-001', is_example: true },
      { id: 'SP-001', is_example: false },
      { id: 'SP-005', is_example: false },
    ];

    expect(filterPublicCatalogueRows(rows)).toEqual([
      { id: 'SP-001', is_example: false },
      { id: 'SP-005', is_example: false },
    ]);
  });
});

describe('keepLoadedMedia', () => {
  it('keeps usable gallery rows when some signed URLs fail', () => {
    const rows = [
      { id: 'photo-1', url: '/media/photo-1.jpg' },
      null,
      { id: 'photo-3', url: 'https://signed.example/photo-3.jpg' },
    ];

    expect(keepLoadedMedia(rows)).toEqual([
      { id: 'photo-1', url: '/media/photo-1.jpg' },
      { id: 'photo-3', url: 'https://signed.example/photo-3.jpg' },
    ]);
  });
});
