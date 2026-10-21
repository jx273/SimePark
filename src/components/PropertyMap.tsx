import { useEffect, useMemo, useRef, useState } from 'react';
import * as L from 'leaflet';
import { useTranslation } from 'react-i18next';
import type { PropertyWithCalculations } from '../types/property';
import { formatMYR } from '../utils/mortgage';
import 'leaflet/dist/leaflet.css';
import './PropertyMap.css';

interface PropertyMapProps {
  properties: PropertyWithCalculations[];
  onViewDetails: (property: PropertyWithCalculations) => void;
}

type MappedProperty = {
  property: PropertyWithCalculations;
  latitude: number;
  longitude: number;
};

export function hasUsableCoordinates(
  property: Pick<PropertyWithCalculations, 'latitude' | 'longitude'>
): property is Pick<PropertyWithCalculations, 'latitude' | 'longitude'> & {
  latitude: number;
  longitude: number;
} {
  return (
    typeof property.latitude === 'number' &&
    Number.isFinite(property.latitude) &&
    property.latitude >= -90 &&
    property.latitude <= 90 &&
    typeof property.longitude === 'number' &&
    Number.isFinite(property.longitude) &&
    property.longitude >= -180 &&
    property.longitude <= 180
  );
}

export default function PropertyMap({ properties, onViewDetails }: PropertyMapProps) {
  const { t } = useTranslation();
  const elementRef = useRef<HTMLDivElement>(null);
  const [tileError, setTileError] = useState(false);
  const mappedProperties = useMemo(
    () =>
      properties.flatMap((property): MappedProperty[] => {
        if (!hasUsableCoordinates(property)) {
          return [];
        }
        return [{ property, latitude: property.latitude, longitude: property.longitude }];
      }),
    [properties]
  );

  useEffect(() => {
    const element = elementRef.current;
    if (!element || mappedProperties.length === 0) return;

    // Guard against re-initializing an already initialized container
    if ((element as unknown as { _leaflet_id?: number | null })._leaflet_id) {
      (element as unknown as { _leaflet_id?: number | null })._leaflet_id = null;
    }

    setTileError(false);
    const map = L.map(element, { scrollWheelZoom: false, zoomControl: true });
    const tiles = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
    }).addTo(map);
    tiles.on('tileerror', () => setTileError(true));

    const markers: L.CircleMarker[] = [];
    for (const { property, latitude, longitude } of mappedProperties) {
      const marker = L.circleMarker([latitude, longitude], {
        radius: 8,
        color: '#C8102E',
        fillColor: '#F26522',
        fillOpacity: 0.85,
        weight: 2,
      }).addTo(map);
      marker.bindTooltip(property.propertyName);

      const content = document.createElement('div');
      content.className = 'property-map__popup';

      const title = document.createElement('h4');
      title.className = 'property-map__popup-title';
      title.textContent = property.propertyName;

      const price = document.createElement('p');
      price.className = 'property-map__popup-price';
      price.textContent = formatMYR(property.priceMYR);

      const location = document.createElement('p');
      location.className = 'property-map__popup-location';
      location.textContent = `📍 ${property.location}`;

      const meta = document.createElement('div');
      meta.className = 'property-map__popup-meta';
      const specs: string[] = [];
      if (property.propertyType) specs.push(property.propertyType);
      if (property.bedrooms !== null) specs.push(`${property.bedrooms} ${t('detail.bedrooms')}`);
      if (property.bathrooms !== null) specs.push(`${property.bathrooms} ${t('detail.bathrooms')}`);
      if (property.builtUpSqft !== null) specs.push(`${property.builtUpSqft.toLocaleString()} sqft`);
      meta.textContent = specs.join(' · ');

      const actions = document.createElement('div');
      actions.className = 'property-map__popup-actions';

      const detailsButton = document.createElement('button');
      detailsButton.type = 'button';
      detailsButton.className = 'btn btn--primary btn--sm';
      detailsButton.textContent = t('explorer.mapViewDetails');
      detailsButton.addEventListener('click', () => onViewDetails(property));

      const directions = document.createElement('a');
      directions.href = `https://www.google.com/maps/dir/?api=1&destination=${latitude},${longitude}`;
      directions.target = '_blank';
      directions.rel = 'noopener noreferrer';
      directions.className = 'btn btn--secondary btn--sm';
      directions.textContent = `${t('explorer.directions')} ↗`;

      actions.append(detailsButton, directions);
      content.append(title, price, location, meta, actions);
      marker.bindPopup(content);
      markers.push(marker);
    }

    const bounds = L.featureGroup(markers).getBounds();
    if (bounds.isValid()) {
      if (mappedProperties.length === 1) {
        map.setView(bounds.getCenter(), 14);
      } else {
        map.fitBounds(bounds, { padding: [32, 32], maxZoom: 14, animate: true });
      }
    } else {
      map.setView([4.2105, 101.9758], 6);
    }

    const frame = window.requestAnimationFrame(() => map.invalidateSize({ pan: false }));
    const t1 = window.setTimeout(() => map.invalidateSize({ pan: false }), 60);
    const t2 = window.setTimeout(() => {
      map.invalidateSize({ pan: false });
      if (bounds.isValid()) {
        if (mappedProperties.length === 1) {
          map.setView(bounds.getCenter(), 14);
        } else {
          map.fitBounds(bounds, { padding: [32, 32], maxZoom: 14 });
        }
      }
    }, 250);

    const resizeObserver = typeof ResizeObserver === 'undefined'
      ? null
      : new ResizeObserver(() => map.invalidateSize({ pan: false }));
    resizeObserver?.observe(element);

    return () => {
      window.cancelAnimationFrame(frame);
      window.clearTimeout(t1);
      window.clearTimeout(t2);
      resizeObserver?.disconnect();
      try {
        map.remove();
      } catch {
        // Safe disposal
      }
      if (element) {
        delete (element as unknown as { _leaflet_id?: number })._leaflet_id;
      }
    };
  }, [mappedProperties, onViewDetails, t]);

  if (mappedProperties.length === 0) {
    return (
      <div className="property-map__unavailable" role="status">
        <p>{properties.length === 0 ? t('explorer.mapNoResults') : t('explorer.noVerifiedLocations')}</p>
        {properties.length > 0 && (
          <p>{t('explorer.mapMissingCount', { count: properties.length })}</p>
        )}
      </div>
    );
  }

  const missingCount = properties.length - mappedProperties.length;
  return (
    <>
      <div
        ref={elementRef}
        className="property-map"
        role="region"
        aria-label={t('explorer.map')}
      />
      {tileError && (
        <p className="property-map__note" role="status">{t('explorer.mapTilesUnavailable')}</p>
      )}
      {missingCount > 0 && (
        <p className="property-map__note">{t('explorer.mapMissingCount', { count: missingCount })}</p>
      )}
      <p className="property-map__attribution">{t('explorer.mapAttribution')}</p>
    </>
  );
}
