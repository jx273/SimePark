import { useEffect, useMemo, useRef } from 'react';
import * as L from 'leaflet';
import { useTranslation } from 'react-i18next';
import type { PropertyWithCalculations } from '../types/property';
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

export default function PropertyMap({ properties, onViewDetails }: PropertyMapProps) {
  const { t } = useTranslation();
  const elementRef = useRef<HTMLDivElement>(null);
  const mappedProperties = useMemo(
    () =>
      properties.flatMap((property): MappedProperty[] => {
        const { latitude, longitude } = property;
        if (
          property.locationPrecision === 'unknown' ||
          typeof latitude !== 'number' ||
          !Number.isFinite(latitude) ||
          typeof longitude !== 'number' ||
          !Number.isFinite(longitude)
        ) {
          return [];
        }
        return [{ property, latitude, longitude }];
      }),
    [properties]
  );

  useEffect(() => {
    const element = elementRef.current;
    if (!element || mappedProperties.length === 0) return;

    const map = L.map(element, { scrollWheelZoom: false, zoomControl: true });
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
    }).addTo(map);

    const markers: L.CircleMarker[] = [];
    for (const { property, latitude, longitude } of mappedProperties) {
      const approximate = property.locationPrecision === 'approximate';
      const marker = L.circleMarker([latitude, longitude], {
        radius: approximate ? 11 : 7,
        color: approximate ? '#a86100' : '#176b87',
        fillColor: approximate ? '#ffd18a' : '#42a4c7',
        fillOpacity: approximate ? 0.42 : 0.8,
        weight: 2,
        dashArray: approximate ? '4 3' : undefined,
      }).addTo(map);

      const content = document.createElement('div');
      const title = document.createElement('strong');
      title.textContent = property.propertyName;
      const location = document.createElement('p');
      location.textContent = approximate
        ? t('explorer.approximateLocation')
        : property.location;
      const detailsButton = document.createElement('button');
      detailsButton.type = 'button';
      detailsButton.textContent = t('explorer.mapViewDetails');
      detailsButton.addEventListener('click', () => onViewDetails(property));
      content.append(title, location, detailsButton);
      if (property.locationPrecision === 'verified') {
        const directions = document.createElement('a');
        directions.href = `https://www.google.com/maps/dir/?api=1&destination=${latitude},${longitude}`;
        directions.target = '_blank';
        directions.rel = 'noopener noreferrer';
        directions.textContent = t('explorer.directions');
        directions.style.display = 'block';
        content.append(directions);
      }
      marker.bindPopup(content);
      markers.push(marker);
    }

    const bounds = L.featureGroup(markers).getBounds();
    if (mappedProperties.length === 1) {
      map.setView(bounds.getCenter(), 14);
    } else {
      map.fitBounds(bounds, { padding: [28, 28], maxZoom: 14, animate: true });
    }

    return () => {
      map.remove();
    };
  }, [mappedProperties, onViewDetails, t]);

  if (mappedProperties.length === 0) {
    return (
      <div className="property-map__unavailable" role="status">
        <p>{t('explorer.noVerifiedLocations')}</p>
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
      {missingCount > 0 && (
        <p className="property-map__note">{t('explorer.mapMissingCount', { count: missingCount })}</p>
      )}
      <p className="property-map__attribution">{t('explorer.mapAttribution')}</p>
    </>
  );
}
