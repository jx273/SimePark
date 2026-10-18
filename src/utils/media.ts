import type { Property, PropertyMedia } from '../types/property';

export function coverPhoto(property: Pick<Property, 'media'>): PropertyMedia | null {
  const photos = (property.media ?? []).filter((item) => item.kind === 'photo');
  return photos.find((item) => item.isCover) ?? photos[0] ?? null;
}

export function imageSourceLabel(media: PropertyMedia | null | undefined): string {
  return media?.attribution?.trim() || 'Property agent';
}
