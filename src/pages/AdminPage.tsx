import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../auth/AuthProvider';
import { getSupabaseClient } from '../lib/supabase';
import {
  formToUpdate,
  missingFacts,
  propertyToInsert,
  rowToAdminForm,
  TRACKED_FACTS,
  type AdminPropertyForm,
} from '../lib/mappers';
import { navigate } from '../router/router';
import type { PropertyMediaRow, PropertyRow } from '../lib/database.types';
import type { PropertyType } from '../types/property';
import { formatMYR } from '../utils/mortgage';
import './AdminPage.css';

const PROPERTY_TYPES: PropertyType[] = [
  'Condominium',
  'Apartment',
  'Terrace House',
  'Semi-Detached',
  'Bungalow',
  'Townhouse',
  'Flat',
];

const EMPTY_FORM: AdminPropertyForm = {
  id: '',
  propertyName: '',
  location: '',
  address: null,
  priceMYR: null,
  priceMinMYR: null,
  priceMaxMYR: null,
  priceBasis: null,
  propertyType: null,
  bedrooms: null,
  bathrooms: null,
  builtUpSqft: null,
  landArea: null,
  landAreaUnit: null,
  monthlyMaintenanceMYR: null,
  sinkingFundMYR: null,
  tenure: null,
  completionDate: null,
  parkingBays: null,
  furnishingStatus: null,
  availabilityStatus: 'unknown',
  availabilityCheckedDate: null,
  latitude: null,
  longitude: null,
  locationPrecision: 'unknown',
  nearestTransit: null,
  transitDistanceKm: null,
  transitTravelTimeMin: null,
  transitMode: null,
  nearbyAmenity: null,
  amenityDistanceKm: null,
  facilities: [],
  sourceUrl: null,
  sourceType: null,
  sourceName: null,
  verifiedDate: null,
  dateAccessed: null,
  confirmedByRole: null,
  confidenceStatus: null,
  imagePermission: null,
  notes: null,
  isExample: true,
  isPublished: false,
};

type TextFormKey =
  | 'address'
  | 'priceBasis'
  | 'landAreaUnit'
  | 'tenure'
  | 'completionDate'
  | 'furnishingStatus'
  | 'availabilityCheckedDate'
  | 'nearestTransit'
  | 'transitMode'
  | 'nearbyAmenity'
  | 'sourceType'
  | 'sourceName'
  | 'dateAccessed'
  | 'confirmedByRole'
  | 'confidenceStatus'
  | 'imagePermission'
  | 'notes';

type NumberFormKey =
  | 'priceMYR'
  | 'priceMinMYR'
  | 'priceMaxMYR'
  | 'landArea'
  | 'monthlyMaintenanceMYR'
  | 'sinkingFundMYR'
  | 'parkingBays'
  | 'latitude'
  | 'longitude'
  | 'transitDistanceKm'
  | 'transitTravelTimeMin'
  | 'amenityDistanceKm';

function nullableNumber(value: string): number | null {
  if (value.trim() === '') return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

/**
 * Administrator property management.
 *
 * Authorisation is enforced by the database, not by this screen. The RLS policies
 * on `public.properties` permit writes only when `is_admin()` returns true for the
 * caller's JWT, so a non-administrator who reaches this page — or who replays the
 * request by hand — is rejected by Postgres. The client-side gate below exists to
 * avoid showing a useless form, not to provide security.
 */
export default function AdminPage() {
  const { t } = useTranslation();
  const { user, isConfigured, isAdmin } = useAuth();

  const [rows, setRows] = useState<PropertyRow[]>([]);
  const [media, setMedia] = useState<PropertyMediaRow[]>([]);
  const [form, setForm] = useState<AdminPropertyForm>(EMPTY_FORM);
  const [mediaFile, setMediaFile] = useState<File | null>(null);
  const [mediaKind, setMediaKind] = useState<'photo' | 'floorplan'>('photo');
  const [mediaCaption, setMediaCaption] = useState('');
  const [mediaAltText, setMediaAltText] = useState('');
  const [mediaAttribution, setMediaAttribution] = useState('');
  const [mediaPermission, setMediaPermission] = useState('unknown');
  const [mediaBusy, setMediaBusy] = useState(false);
  const [editing, setEditing] = useState(false);
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState<{ tone: 'ok' | 'error'; text: string } | null>(null);

  const textField = (key: TextFormKey, label: string, inputType = 'text') => (
    <label className="form-group">
      <span className="form-label">{label}</span>
      <input
        type={inputType}
        className="form-input"
        value={form[key] ?? ''}
        onChange={(event) =>
          setForm((previous) => ({ ...previous, [key]: event.target.value || null }))
        }
      />
    </label>
  );

  const numberField = (
    key: NumberFormKey,
    label: string,
    step = 'any',
    min = '0'
  ) => (
    <label className="form-group">
      <span className="form-label">{label}</span>
      <input
        type="number"
        className="form-input"
        min={min}
        step={step}
        value={form[key] ?? ''}
        onChange={(event) =>
          setForm((previous) => ({ ...previous, [key]: nullableNumber(event.target.value) }))
        }
      />
    </label>
  );

  const loadRows = useCallback(async () => {
    setLoading(true);
    const client = await getSupabaseClient();

    if (!client) {
      setLoading(false);
      return;
    }

    // Administrators see unpublished rows as well; the RLS policy allows it.
    const { data, error } = await client
      .from('properties')
      .select('*')
      .order('updated_at', { ascending: false });

    setLoading(false);

    if (error) {
      setStatus({ tone: 'error', text: t('admin.loadError') });
      return;
    }

    setRows((data ?? []) as PropertyRow[]);
  }, [t]);

  const loadMedia = useCallback(async (propertyId: string) => {
    const client = await getSupabaseClient();
    if (!client) return;
    const { data, error } = await client
      .from('property_media')
      .select('*')
      .eq('property_id', propertyId)
      .order('sort_order', { ascending: true });
    if (error) {
      setStatus({ tone: 'error', text: t('admin.mediaLoadError') });
      setMedia([]);
      return;
    }
    const mediaRows = (data ?? []) as PropertyMediaRow[];
    const signedRows = await Promise.all(
      mediaRows.map(async (item) => {
        if (!item.storage_path) return item;
        const { data: signed, error: signedError } = await client.storage
          .from('property-media')
          .createSignedUrl(item.storage_path, 60 * 15);
        if (signedError || !signed) return null;
        return { ...item, url: signed.signedUrl };
      })
    );
    if (signedRows.some((item) => item === null)) {
      setStatus({ tone: 'error', text: t('admin.mediaLoadError') });
    }
    setMedia(signedRows.filter((item): item is PropertyMediaRow => item !== null));
  }, [t]);

  const uploadMedia = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!editing || !form.id || !mediaFile) return;
    if (mediaPermission !== 'granted') {
      setStatus({ tone: 'error', text: t('admin.mediaPermissionRequired') });
      return;
    }
    if (!mediaFile.type.startsWith('image/') || mediaFile.size > 20 * 1024 * 1024) {
      setStatus({ tone: 'error', text: t('admin.mediaFileInvalid') });
      return;
    }
    const extension = mediaFile.name.split('.').pop()?.toLowerCase();
    if (!extension || !['jpg', 'jpeg', 'png', 'webp', 'avif'].includes(extension)) {
      setStatus({ tone: 'error', text: t('admin.mediaFileInvalid') });
      return;
    }

    setMediaBusy(true);
    const client = await getSupabaseClient();
    if (!client) {
      setMediaBusy(false);
      return;
    }
    const storagePath = `${form.id}/${crypto.randomUUID()}.${extension}`;
    const { error: uploadError } = await client.storage
      .from('property-media')
      .upload(storagePath, mediaFile, { contentType: mediaFile.type, upsert: false });
    if (uploadError) {
      setMediaBusy(false);
      setStatus({ tone: 'error', text: t('admin.mediaUploadError') });
      return;
    }

    const { error: insertError } = await client.from('property_media').insert({
      property_id: form.id,
      url: `storage://${storagePath}`,
      kind: mediaKind,
      caption: mediaCaption.trim() || null,
      alt_text: mediaAltText.trim() || null,
      attribution: mediaAttribution.trim() || null,
      permission_status: mediaPermission,
      original_url: `storage://${storagePath}`,
      storage_path: storagePath,
      sort_order: media.length + 1,
      is_cover: mediaKind === 'photo' && media.filter((item) => item.kind === 'photo').length === 0,
    });
    if (insertError) {
      const { error: cleanupError } = await client.storage
        .from('property-media')
        .remove([storagePath]);
      setMediaBusy(false);
      setStatus({
        tone: 'error',
        text: t(cleanupError ? 'admin.mediaOrphanError' : 'admin.mediaSaveError'),
      });
      return;
    }

    setMediaFile(null);
    setMediaCaption('');
    setMediaAltText('');
    setMediaAttribution('');
    setMediaBusy(false);
    setStatus({ tone: 'ok', text: t('admin.mediaSaved') });
    await loadMedia(form.id);
  };

  const setCover = async (selected: PropertyMediaRow) => {
    const client = await getSupabaseClient();
    if (!client) return;
    const { error: clearError } = await client
      .from('property_media')
      .update({ is_cover: false })
      .eq('property_id', selected.property_id)
      .eq('kind', 'photo');
    if (clearError) {
      setStatus({ tone: 'error', text: t('admin.mediaSaveError') });
      return;
    }
    const { error } = await client
      .from('property_media')
      .update({ is_cover: true })
      .eq('id', selected.id);
    if (error) {
      setStatus({ tone: 'error', text: t('admin.mediaSaveError') });
      return;
    }
    await loadMedia(selected.property_id);
  };

  const saveMediaDetails = async (item: PropertyMediaRow) => {
    const client = await getSupabaseClient();
    if (!client) return;
    const { error } = await client
      .from('property_media')
      .update({
        caption: item.caption,
        alt_text: item.alt_text,
        attribution: item.attribution,
        permission_status: item.permission_status,
        sort_order: item.sort_order,
      })
      .eq('id', item.id);
    if (error) {
      setStatus({ tone: 'error', text: t('admin.mediaSaveError') });
      return;
    }
    setStatus({ tone: 'ok', text: t('admin.mediaSaved') });
    await loadMedia(item.property_id);
  };

  const removeMedia = async (item: PropertyMediaRow) => {
    if (!window.confirm(t('admin.confirmRemoveMedia'))) return;
    const client = await getSupabaseClient();
    if (!client) return;
    const { error } = await client.from('property_media').delete().eq('id', item.id);
    if (error) {
      setStatus({ tone: 'error', text: t('admin.mediaSaveError') });
      return;
    }
    if (item.storage_path) {
      const { error: storageError } = await client.storage
        .from('property-media')
        .remove([item.storage_path]);
      if (storageError) {
        setStatus({ tone: 'error', text: t('admin.mediaOrphanError') });
      }
    }
    await loadMedia(item.property_id);
  };

  useEffect(() => {
    if (isAdmin) void loadRows();
  }, [isAdmin, loadRows]);

  const valid = useMemo(() => {
    const errors: string[] = [];
    if (!form.propertyName.trim()) errors.push(t('admin.validation.nameRequired'));
    if (!form.location.trim()) errors.push(t('admin.validation.locationRequired'));
    if (!editing && !/^[A-Za-z0-9-]{1,64}$/.test(form.id.trim())) {
      errors.push(t('admin.validation.idInvalid'));
    }
    if (form.priceMYR !== null && form.priceMYR <= 0) {
      errors.push(t('admin.validation.priceInvalid'));
    }
    if (form.priceMinMYR !== null && form.priceMaxMYR !== null && form.priceMinMYR > form.priceMaxMYR) {
      errors.push(t('admin.validation.priceRangeInvalid'));
    }
    if ((form.latitude === null) !== (form.longitude === null)) {
      errors.push(t('admin.validation.coordinatePair'));
    }
    if (form.latitude !== null && (form.latitude < -90 || form.latitude > 90)) {
      errors.push(t('admin.validation.latitudeInvalid'));
    }
    if (form.longitude !== null && (form.longitude < -180 || form.longitude > 180)) {
      errors.push(t('admin.validation.longitudeInvalid'));
    }
    if (form.locationPrecision === 'verified' && form.latitude === null) {
      errors.push(t('admin.validation.verifiedCoordinatesRequired'));
    }
    if (form.sourceUrl && !/^https:\/\//i.test(form.sourceUrl)) {
      errors.push(t('admin.validation.sourceUrlInvalid'));
    }
    if (form.verifiedDate && !/^\d{4}-\d{2}-\d{2}$/.test(form.verifiedDate)) {
      errors.push(t('admin.validation.verifiedDateInvalid'));
    }
    // The database enforces this too; surfacing it here avoids a round trip.
    if (form.isExample && form.verifiedDate) {
      errors.push(t('admin.fields.verifiedDateHelp'));
    }
    return { errors, isValid: errors.length === 0 };
  }, [form, t]);

  if (!isConfigured) {
    return (
      <div className="container admin">
        <h1 className="section__title">{t('admin.title')}</h1>
        <div className="notice notice--warning" role="status">
          {t('admin.notConfigured')}
        </div>
      </div>
    );
  }

  // Client-side gate for presentation only. The database is the real boundary.
  if (!isAdmin) {
    return (
      <div className="container admin">
        <h1 className="section__title">{t('admin.accessDenied')}</h1>
        <div className="notice notice--warning" role="status">
          {t('admin.accessDeniedText')}
        </div>
        <button
          type="button"
          className="btn btn--secondary mt-lg"
          onClick={() => navigate({ name: 'home' })}
        >
          {t('nav.home')}
        </button>
      </div>
    );
  }

  const save = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!valid.isValid) {
      setStatus({ tone: 'error', text: valid.errors[0] });
      return;
    }

    const client = await getSupabaseClient();
    if (!client) return;

    const payload = formToUpdate(form);

    const result = editing
      ? await client.from('properties').update(payload).eq('id', form.id).select('id')
      : await client
          .from('properties')
          .insert(propertyToInsert(form, user?.id ?? null))
          .select('id');

    if (result.error) {
      // RLS rejections land here. The message is deliberately generic so policy
      // and column names are not disclosed.
      setStatus({ tone: 'error', text: t('admin.operationError') });
      return;
    }

    setStatus({ tone: 'ok', text: t('admin.saved') });
    const { data: savedRow } = await client
      .from('properties')
      .select('*')
      .eq('id', form.id)
      .maybeSingle();
    setForm(savedRow ? rowToAdminForm(savedRow as PropertyRow) : form);
    setEditing(true);
    await loadRows();
    await loadMedia(form.id);
  };

  const togglePublished = async (row: PropertyRow) => {
    const client = await getSupabaseClient();
    if (!client) return;

    const { error } = await client
      .from('properties')
      .update({ is_published: !row.is_published })
      .eq('id', row.id);

    if (error) {
      setStatus({ tone: 'error', text: t('admin.operationError') });
      return;
    }
    await loadRows();
  };

  const remove = async (row: PropertyRow) => {
    if (!window.confirm(t('admin.confirmRemove'))) return;

    const client = await getSupabaseClient();
    if (!client) return;

    const { data: relatedMedia, error: mediaReadError } = await client
      .from('property_media')
      .select('storage_path')
      .eq('property_id', row.id);
    if (mediaReadError) {
      setStatus({ tone: 'error', text: t('admin.mediaLoadError') });
      return;
    }

    const { error } = await client.from('properties').delete().eq('id', row.id);
    if (error) {
      setStatus({
        tone: 'error',
        text: t(error.code === '23503' ? 'admin.deleteHasReferences' : 'admin.operationError'),
      });
      return;
    }

    const storagePaths = (relatedMedia ?? [])
      .map((item) => item.storage_path)
      .filter((path): path is string => typeof path === 'string' && path.length > 0);
    if (storagePaths.length > 0) {
      const { error: storageError } = await client.storage
        .from('property-media')
        .remove(storagePaths);
      if (storageError) {
        setStatus({ tone: 'error', text: t('admin.propertyRemovedMediaCleanupError') });
        await loadRows();
        return;
      }
    }
    setStatus({ tone: 'ok', text: t('admin.removed') });
    await loadRows();
  };

  return (
    <div className="container admin">
      <h1 className="section__title">{t('admin.title')}</h1>
      <p className="section__subtitle">{t('admin.subtitle')}</p>

      {status && (
        <div
          className={`notice ${status.tone === 'ok' ? 'notice--info' : 'notice--warning'}`}
          role="status"
        >
          {status.text}
        </div>
      )}

      {/* ---------------- Editor ---------------- */}
      <form className="admin__form surface" onSubmit={save}>
        <h2 className="admin__form-title">
          {editing ? t('admin.editProperty') : t('admin.newProperty')}
        </h2>

        <div className="admin__grid">
          <label className="form-group">
            <span className="form-label">{t('admin.fields.id')}</span>
            <input
              type="text"
              className="form-input"
              required={!editing}
              disabled={editing}
              pattern="[A-Za-z0-9-]{1,64}"
              maxLength={64}
              value={form.id}
              onChange={(event) =>
                setForm((previous) => ({ ...previous, id: event.target.value }))
              }
            />
            <span className="form-helper">{t('admin.fields.idHelp')}</span>
          </label>

          <label className="form-group">
            <span className="form-label">{t('admin.fields.propertyName')}</span>
            <input
              type="text"
              className="form-input"
              required
              maxLength={160}
              value={form.propertyName}
              onChange={(event) =>
                setForm((previous) => ({ ...previous, propertyName: event.target.value }))
              }
            />
          </label>

          <label className="form-group">
            <span className="form-label">{t('admin.fields.location')}</span>
            <input
              type="text"
              className="form-input"
              required
              maxLength={200}
              value={form.location}
              onChange={(event) =>
                setForm((previous) => ({ ...previous, location: event.target.value }))
              }
            />
          </label>

          <label className="form-group">
            <span className="form-label">{t('admin.fields.priceMYR')}</span>
            <input
              type="number"
              className="form-input"
              min="1"
              step="1000"
              value={form.priceMYR ?? ''}
              onChange={(event) =>
                setForm((previous) => ({
                  ...previous,
                  priceMYR: nullableNumber(event.target.value),
                }))
              }
            />
          </label>

          {textField('address', t('admin.fields.address'))}
          {numberField('priceMinMYR', t('admin.fields.priceMinMYR'), '1', '0')}
          {numberField('priceMaxMYR', t('admin.fields.priceMaxMYR'), '1', '0')}
          {textField('priceBasis', t('admin.fields.priceBasis'))}

          <label className="form-group">
            <span className="form-label">{t('admin.fields.propertyType')}</span>
            <select
              className="form-select"
              value={form.propertyType ?? ''}
              onChange={(event) =>
                setForm((previous) => ({
                  ...previous,
                  propertyType: (event.target.value || null) as PropertyType | null,
                }))
              }
            >
              {/* Blank means "not recorded" and is stored as NULL. */}
              <option value="">{t('common.unknown')}</option>
              {PROPERTY_TYPES.map((type) => (
                <option key={type} value={type}>
                  {type}
                </option>
              ))}
            </select>
          </label>

          <label className="form-group">
            <span className="form-label">{t('admin.fields.bedrooms')}</span>
            <input
              type="number"
              className="form-input"
              min="0"
              max="50"
              value={form.bedrooms ?? ''}
              onChange={(event) =>
                setForm((previous) => ({ ...previous, bedrooms: nullableNumber(event.target.value) }))
              }
            />
          </label>

          <label className="form-group">
            <span className="form-label">{t('admin.fields.bathrooms')}</span>
            <input
              type="number"
              className="form-input"
              min="0"
              max="50"
              value={form.bathrooms ?? ''}
              onChange={(event) =>
                setForm((previous) => ({ ...previous, bathrooms: nullableNumber(event.target.value) }))
              }
            />
          </label>

          <label className="form-group">
            <span className="form-label">{t('admin.fields.builtUpSqft')}</span>
            <input
              type="number"
              className="form-input"
              min="1"
              value={form.builtUpSqft ?? ''}
              onChange={(event) =>
                setForm((previous) => ({
                  ...previous,
                  builtUpSqft: nullableNumber(event.target.value),
                }))
              }
            />
          </label>

          {textField('tenure', t('admin.fields.tenure'))}
          {textField('completionDate', t('admin.fields.completionDate'))}
          {numberField('landArea', t('admin.fields.landArea'), 'any', '0.0001')}
          {textField('landAreaUnit', t('admin.fields.landAreaUnit'))}
          {numberField('parkingBays', t('admin.fields.parkingBays'), '1')}
          {textField('furnishingStatus', t('admin.fields.furnishingStatus'))}
          {numberField('monthlyMaintenanceMYR', t('admin.fields.monthlyMaintenanceMYR'), '0.01')}
          {numberField('sinkingFundMYR', t('admin.fields.sinkingFundMYR'), '0.01')}

          <label className="form-group">
            <span className="form-label">{t('admin.fields.availabilityStatus')}</span>
            <select
              className="form-select"
              value={form.availabilityStatus}
              onChange={(event) =>
                setForm((previous) => ({ ...previous, availabilityStatus: event.target.value }))
              }
            >
              {['unknown', 'available', 'unavailable', 'sold', 'under_offer'].map((value) => (
                <option key={value} value={value}>
                  {t(`admin.options.${value}`)}
                </option>
              ))}
            </select>
          </label>
          {textField('availabilityCheckedDate', t('admin.fields.availabilityCheckedDate'), 'date')}
          {numberField('latitude', t('admin.fields.latitude'), 'any', '-90')}
          {numberField('longitude', t('admin.fields.longitude'), 'any', '-180')}
          <label className="form-group">
            <span className="form-label">{t('admin.fields.locationPrecision')}</span>
            <select
              className="form-select"
              value={form.locationPrecision}
              onChange={(event) =>
                setForm((previous) => ({ ...previous, locationPrecision: event.target.value }))
              }
            >
              {['unknown', 'approximate', 'verified'].map((value) => (
                <option key={value} value={value}>
                  {t(`admin.options.${value}`)}
                </option>
              ))}
            </select>
          </label>
          {textField('nearestTransit', t('admin.fields.nearestTransit'))}
          {numberField('transitDistanceKm', t('admin.fields.transitDistanceKm'), 'any')}
          {numberField('transitTravelTimeMin', t('admin.fields.transitTravelTimeMin'), '1')}
          {textField('transitMode', t('admin.fields.transitMode'))}
          {textField('nearbyAmenity', t('admin.fields.nearbyAmenity'))}
          {numberField('amenityDistanceKm', t('admin.fields.amenityDistanceKm'), 'any')}

          <label className="form-group admin__grid-wide">
            <span className="form-label">{t('admin.fields.facilities')}</span>
            <textarea
              className="form-input"
              rows={3}
              value={form.facilities.join('; ')}
              onChange={(event) =>
                setForm((previous) => ({
                  ...previous,
                  facilities: [...new Set(event.target.value.split(/[;\n]/).map((item) => item.trim()).filter(Boolean))],
                }))
              }
            />
            <span className="form-helper">{t('admin.fields.facilitiesHelp')}</span>
          </label>

          <label className="form-group admin__grid-wide">
            <span className="form-label">{t('admin.fields.sourceUrl')}</span>
            <input
              type="url"
              className="form-input"
              placeholder="https://"
              value={form.sourceUrl ?? ''}
              onChange={(event) =>
                setForm((previous) => ({
                  ...previous,
                  sourceUrl: event.target.value.trim() === '' ? null : event.target.value,
                }))
              }
            />
            <span className="form-helper">{t('admin.fields.sourceUrlHelp')}</span>
          </label>

          {textField('sourceType', t('admin.fields.sourceType'))}
          {textField('sourceName', t('admin.fields.sourceName'))}
          {textField('dateAccessed', t('admin.fields.dateAccessed'), 'date')}
          {textField('confirmedByRole', t('admin.fields.confirmedByRole'))}
          {textField('confidenceStatus', t('admin.fields.confidenceStatus'))}
          {textField('imagePermission', t('admin.fields.imagePermission'))}

          <label className="form-group admin__grid-wide">
            <span className="form-label">{t('admin.fields.notes')}</span>
            <textarea
              className="form-input"
              rows={5}
              value={form.notes ?? ''}
              onChange={(event) =>
                setForm((previous) => ({
                  ...previous,
                  notes: event.target.value || null,
                }))
              }
            />
          </label>

          <label className="form-group">
            <span className="form-label">{t('admin.fields.verifiedDate')}</span>
            <input
              type="date"
              className="form-input"
              value={form.verifiedDate ?? ''}
              onChange={(event) =>
                setForm((previous) => ({
                  ...previous,
                  verifiedDate: event.target.value === '' ? null : event.target.value,
                }))
              }
            />
            <span className="form-helper">{t('admin.fields.verifiedDateHelp')}</span>
          </label>

          <div className="form-group admin__checkboxes">
            <label className="admin__checkbox">
              <input
                type="checkbox"
                checked={form.isExample}
                onChange={(event) =>
                  setForm((previous) => ({ ...previous, isExample: event.target.checked }))
                }
              />
              <span>{t('admin.fields.isExample')}</span>
            </label>
            <span className="form-helper">{t('admin.fields.isExampleHelp')}</span>

            <label className="admin__checkbox">
              <input
                type="checkbox"
                checked={form.isPublished}
                onChange={(event) =>
                  setForm((previous) => ({ ...previous, isPublished: event.target.checked }))
                }
              />
              <span>{t('admin.fields.isPublished')}</span>
            </label>
            <span className="form-helper">{t('admin.fields.isPublishedHelp')}</span>
          </div>
        </div>

        {!valid.isValid && (
          <ul className="admin__errors">
            {valid.errors.map((error) => (
              <li key={error}>
                <span aria-hidden="true">⚠ </span>
                {error}
              </li>
            ))}
          </ul>
        )}

        <div className="admin__form-actions">
          <button type="submit" className="btn btn--primary" disabled={!valid.isValid}>
            {editing ? t('admin.update') : t('admin.create')}
          </button>
          {editing && (
            <button
              type="button"
              className="btn btn--ghost"
              onClick={() => {
                setForm(EMPTY_FORM);
                setEditing(false);
                setMedia([]);
              }}
            >
              {t('common.cancel')}
            </button>
          )}
        </div>
      </form>

      {editing && (
        <section className="admin__media surface" aria-labelledby="admin-media-title">
          <h2 id="admin-media-title" className="admin__form-title">
            {t('admin.mediaTitle', { property: form.propertyName })}
          </h2>
          <p className="form-helper">{t('admin.mediaPermissionNotice')}</p>
          <form className="admin__media-upload" onSubmit={(event) => void uploadMedia(event)}>
            <label className="form-group">
              <span className="form-label">{t('admin.mediaFile')}</span>
              <input
                type="file"
                className="form-input"
                accept="image/jpeg,image/png,image/webp,image/avif"
                onChange={(event) => setMediaFile(event.target.files?.[0] ?? null)}
              />
            </label>
            <label className="form-group">
              <span className="form-label">{t('admin.mediaKind')}</span>
              <select
                className="form-select"
                value={mediaKind}
                onChange={(event) =>
                  setMediaKind(event.target.value === 'floorplan' ? 'floorplan' : 'photo')
                }
              >
                <option value="photo">{t('admin.mediaPhoto')}</option>
                <option value="floorplan">{t('admin.mediaFloorplan')}</option>
              </select>
            </label>
            <label className="form-group">
              <span className="form-label">{t('admin.mediaPermission')}</span>
              <select
                className="form-select"
                value={mediaPermission}
                onChange={(event) => setMediaPermission(event.target.value)}
              >
                <option value="unknown">{t('admin.mediaPermissionUnknown')}</option>
                <option value="granted">{t('admin.mediaPermissionGranted')}</option>
                <option value="restricted">{t('admin.mediaPermissionRestricted')}</option>
              </select>
            </label>
            <label className="form-group">
              <span className="form-label">{t('admin.mediaCaption')}</span>
              <input
                className="form-input"
                value={mediaCaption}
                onChange={(event) => setMediaCaption(event.target.value)}
              />
            </label>
            <label className="form-group">
              <span className="form-label">{t('admin.mediaAltText')}</span>
              <input
                className="form-input"
                value={mediaAltText}
                onChange={(event) => setMediaAltText(event.target.value)}
              />
            </label>
            <label className="form-group">
              <span className="form-label">{t('admin.mediaAttribution')}</span>
              <input
                className="form-input"
                value={mediaAttribution}
                onChange={(event) => setMediaAttribution(event.target.value)}
              />
            </label>
            <button
              type="submit"
              className="btn btn--primary"
              disabled={!mediaFile || mediaBusy || mediaPermission !== 'granted'}
            >
              {mediaBusy ? t('admin.saving') : t('admin.mediaUpload')}
            </button>
          </form>

          {media.length === 0 ? (
            <p className="admin__empty">{t('admin.mediaEmpty')}</p>
          ) : (
            <ul className="admin__media-list">
              {media.map((item) => (
                <li key={item.id} className="admin__media-item">
                  <img
                    src={item.watermarked_url ?? item.url}
                    alt={item.alt_text ?? item.caption ?? t('admin.mediaPreview')}
                    loading="lazy"
                  />
                  <div className="admin__media-details">
                    <label>
                      <span>{t('admin.mediaCaption')}</span>
                      <input
                        className="form-input"
                        value={item.caption ?? ''}
                        onChange={(event) =>
                          setMedia((previous) =>
                            previous.map((mediaItem) =>
                              mediaItem.id === item.id
                                ? { ...mediaItem, caption: event.target.value || null }
                                : mediaItem
                            )
                          )
                        }
                      />
                    </label>
                    <span>{item.kind === 'photo' ? t('admin.mediaPhoto') : t('admin.mediaFloorplan')}</span>
                    <label>
                      <span>{t('admin.mediaAltText')}</span>
                      <input
                        className="form-input"
                        value={item.alt_text ?? ''}
                        onChange={(event) =>
                          setMedia((previous) =>
                            previous.map((mediaItem) =>
                              mediaItem.id === item.id
                                ? { ...mediaItem, alt_text: event.target.value || null }
                                : mediaItem
                            )
                          )
                        }
                      />
                    </label>
                    <label>
                      <span>{t('admin.mediaAttribution')}</span>
                      <input
                        className="form-input"
                        value={item.attribution ?? ''}
                        onChange={(event) =>
                          setMedia((previous) =>
                            previous.map((mediaItem) =>
                              mediaItem.id === item.id
                                ? { ...mediaItem, attribution: event.target.value || null }
                                : mediaItem
                            )
                          )
                        }
                      />
                    </label>
                    <label>
                      <span>{t('admin.mediaPermission')}</span>
                      <select
                        className="form-select"
                        value={item.permission_status ?? 'unknown'}
                        onChange={(event) =>
                          setMedia((previous) =>
                            previous.map((mediaItem) =>
                              mediaItem.id === item.id
                                ? { ...mediaItem, permission_status: event.target.value }
                                : mediaItem
                            )
                          )
                        }
                      >
                        <option value="unknown">{t('admin.mediaPermissionUnknown')}</option>
                        <option value="granted">{t('admin.mediaPermissionGranted')}</option>
                        <option value="restricted">{t('admin.mediaPermissionRestricted')}</option>
                      </select>
                    </label>
                    <label>
                      <span>{t('admin.mediaSortOrder')}</span>
                      <input
                        className="form-input"
                        type="number"
                        min="0"
                        step="1"
                        value={item.sort_order}
                        onChange={(event) =>
                          setMedia((previous) =>
                            previous.map((mediaItem) =>
                              mediaItem.id === item.id
                                ? { ...mediaItem, sort_order: Number(event.target.value) || 0 }
                                : mediaItem
                            )
                          )
                        }
                      />
                    </label>
                  </div>
                  <div className="admin__row-actions">
                    <button
                      type="button"
                      className="btn btn--ghost btn--sm"
                      onClick={() => void saveMediaDetails(item)}
                    >
                      {t('admin.mediaSaveDetails')}
                    </button>
                    {item.kind === 'photo' && !item.is_cover && (
                      <button
                        type="button"
                        className="btn btn--ghost btn--sm"
                        onClick={() => void setCover(item)}
                      >
                        {t('admin.mediaSetCover')}
                      </button>
                    )}
                    {item.is_cover && <span>{t('admin.mediaCover')}</span>}
                    <button
                      type="button"
                      className="btn btn--ghost btn--sm admin__remove"
                      onClick={() => void removeMedia(item)}
                    >
                      {t('admin.remove')}
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}

      {/* ---------------- Table ---------------- */}
      <h2 className="admin__table-title">{t('admin.properties')}</h2>

      {loading ? (
        <p role="status">{t('common.loading')}</p>
      ) : rows.length === 0 ? (
        <p className="admin__empty">{t('admin.empty')}</p>
      ) : (
        <div className="admin__scroll" tabIndex={0} role="region" aria-label={t('admin.properties')}>
          <table className="admin__table">
            <thead>
              <tr>
                <th scope="col">{t('admin.columns.name')}</th>
                <th scope="col">{t('admin.columns.location')}</th>
                <th scope="col">{t('admin.columns.price')}</th>
                <th scope="col">{t('admin.columns.status')}</th>
                <th scope="col">{t('admin.columns.published')}</th>
                <th scope="col">{t('admin.columns.verified')}</th>
                <th scope="col">{t('admin.columns.actions')}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => {
                const adminForm = rowToAdminForm(row);
                const missing = missingFacts(adminForm);

                return (
                  <tr key={row.id}>
                    <th scope="row">
                      {row.property_name}
                      <span className="admin__row-id">{row.id}</span>
                      {missing.length > 0 && (
                        <span className="admin__missing">
                          {t('admin.missingFields')}:{' '}
                          {missing
                            .map((fact) =>
                              t('admin.missingField', {
                                field: t(
                                  `admin.fields.${
                                    fact === 'priceMYR'
                                      ? 'priceMYR'
                                      : fact === 'propertyType'
                                        ? 'propertyType'
                                        : fact
                                  }`
                                ),
                              })
                            )
                            .join(', ')}
                        </span>
                      )}
                    </th>
                    <td>{row.location}</td>
                    <td>{row.price_myr === null ? t('common.unknown') : formatMYR(Number(row.price_myr))}</td>
                    <td>
                      {row.is_example ? t('status.exampleListing') : t('status.sourceProvided')}
                    </td>
                    <td>{row.is_published ? t('common.yes') : t('common.no')}</td>
                    <td>{row.verified_date ?? t('status.notVerified')}</td>
                    <td className="admin__row-actions">
                      <button
                        type="button"
                        className="btn btn--ghost btn--sm"
                        onClick={() => {
                          setForm(adminForm);
                          setEditing(true);
                          void loadMedia(row.id);
                          window.scrollTo({ top: 0, behavior: 'smooth' });
                        }}
                      >
                        {t('common.edit')}
                      </button>
                      <button
                        type="button"
                        className="btn btn--ghost btn--sm"
                        onClick={() => void togglePublished(row)}
                      >
                        {row.is_published ? t('admin.unpublish') : t('admin.publish')}
                      </button>
                      <button
                        type="button"
                        className="btn btn--ghost btn--sm admin__remove"
                        onClick={() => void remove(row)}
                      >
                        {t('admin.remove')}
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <p className="admin__footnote">
        {TRACKED_FACTS.length} {t('admin.missingFields')} · {t('admin.accessDeniedText')}
      </p>
    </div>
  );
}
