import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../auth/AuthProvider';
import { getSupabaseClient } from '../lib/supabase';
import {
  formToUpdate,
  missingFacts,
  propertyToInsert,
  propertyToRow,
  rowToAdminForm,
  TRACKED_FACTS,
  type AdminPropertyForm,
} from '../lib/mappers';
import { navigate } from '../router/router';
import type { PropertyMediaRow, PropertyRow } from '../lib/database.types';
import type { Property, PropertyType } from '../types/property';
import { buildBundledCatalog, isSafeMediaUrl } from '../lib/propertyAdapter';
import { getDisplayName, updateDisplayName } from '../lib/userRepository';
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
  const { user, isConfigured, isAdmin, isLoading: authLoading } = useAuth();

  const [rows, setRows] = useState<PropertyRow[]>([]);
  const [media, setMedia] = useState<PropertyMediaRow[]>([]);
  const [form, setForm] = useState<AdminPropertyForm>(EMPTY_FORM);
  const [mediaFile, setMediaFile] = useState<File | null>(null);
  const [mediaKind, setMediaKind] = useState<'photo' | 'floorplan' | 'video'>('photo');
  const [mediaCaption, setMediaCaption] = useState('');
  const [mediaAltText, setMediaAltText] = useState('');
  const [mediaAttribution, setMediaAttribution] = useState('');
  const [mediaExternalUrl, setMediaExternalUrl] = useState('');
  const [mediaVisibility, setMediaVisibility] = useState<'public' | 'internal'>('internal');
  const [mediaPermission, setMediaPermission] = useState('unknown');
  const [mediaBusy, setMediaBusy] = useState(false);
  const [editing, setEditing] = useState(false);
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState<{ tone: 'ok' | 'error'; text: string } | null>(null);
  const [displayName, setDisplayName] = useState('');
  const [displayNameLoading, setDisplayNameLoading] = useState(false);
  const [displayNameSaving, setDisplayNameSaving] = useState(false);
  const [activeTab, setActiveTab] = useState<'overview' | 'catalogue' | 'editor' | 'media' | 'account'>('catalogue');
  const [catalogueSearch, setCatalogueSearch] = useState('');
  const [catalogueFilter, setCatalogueFilter] = useState<'all' | 'published' | 'draft' | 'needsChecking'>('all');
  const [mediaTabFilter, setMediaTabFilter] = useState<'all' | 'photo' | 'floorplan' | 'video'>('all');

  const textField = (
    key: TextFormKey,
    label: string,
    placeholder = '',
    helper = '',
    inputType = 'text',
    required = false
  ) => (
    <label className="form-group">
      <span className="form-label">
        {label}{' '}
        <span className={required ? 'form-required' : 'form-optional'}>
          ({required ? t('common.required') : t('common.optional')})
        </span>
      </span>
      <input
        type={inputType}
        className="form-input"
        placeholder={placeholder}
        required={required}
        value={form[key] ?? ''}
        onChange={(event) =>
          setForm((previous) => ({ ...previous, [key]: event.target.value || null }))
        }
      />
      {helper && <span className="form-helper">{helper}</span>}
    </label>
  );

  const numberField = (
    key: NumberFormKey,
    label: string,
    placeholder = '',
    helper = '',
    step = 'any',
    min = '0',
    required = false
  ) => (
    <label className="form-group">
      <span className="form-label">
        {label}{' '}
        <span className={required ? 'form-required' : 'form-optional'}>
          ({required ? t('common.required') : t('common.optional')})
        </span>
      </span>
      <input
        type="number"
        className="form-input"
        placeholder={placeholder}
        min={min}
        step={step}
        required={required}
        value={form[key] ?? ''}
        onChange={(event) =>
          setForm((previous) => ({ ...previous, [key]: nullableNumber(event.target.value) }))
        }
      />
      {helper && <span className="form-helper">{helper}</span>}
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

    const dbRows = (data ?? []) as PropertyRow[];
    const dbIds = new Set(dbRows.map((r) => r.id));
    const bundled = buildBundledCatalog();
    const missingRows: PropertyRow[] = bundled
      .filter((p: Property) => !dbIds.has(p.id))
      .map((p: Property) => propertyToRow(p));

    setRows([...dbRows, ...missingRows]);
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

    if (mediaRows.length === 0) {
      const bundled = buildBundledCatalog().find((p) => p.id === propertyId);
      if (bundled && bundled.media && bundled.media.length > 0) {
        const bundledMediaRows: PropertyMediaRow[] = bundled.media.map((m) => ({
          id: m.id,
          property_id: m.propertyId,
          url: m.url,
          kind: m.kind,
          source_kind: m.sourceKind,
          external_url: m.externalUrl,
          source_url: m.sourceUrl,
          storage_path: m.storagePath,
          visibility: m.visibility,
          caption: m.caption,
          alt_text: m.altText,
          is_cover: m.isCover,
          sort_order: m.sortOrder,
          attribution: m.attribution,
          permission_status: m.permissionStatus,
          watermark_permission: 'unknown',
          watermark_status: m.watermarkStatus,
          admin_notes: m.adminNotes,
          watermarked_url: m.watermarkedUrl,
          original_url: m.originalUrl,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        }));
        setMedia(bundledMediaRows);
        return;
      }
    }

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
    if (mediaPermission !== 'confirmed') {
      setStatus({ tone: 'error', text: t('admin.mediaPermissionRequired') });
      return;
    }
    const allowedFiles: Record<string, string[]> = mediaKind === 'video'
      ? { 'video/mp4': ['mp4'], 'video/webm': ['webm'], 'video/ogg': ['ogg'] }
      : {
          'image/jpeg': ['jpg', 'jpeg'],
          'image/png': ['png'],
          'image/webp': ['webp'],
          'image/avif': ['avif'],
        };
    const maximumBytes = mediaKind === 'video' ? 50 * 1024 * 1024 : 20 * 1024 * 1024;
    const extension = mediaFile.name.split('.').pop()?.toLowerCase();
    if (
      !allowedFiles[mediaFile.type]?.includes(extension ?? '') ||
      !extension ||
      mediaFile.size > maximumBytes
    ) {
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
      source_kind: 'upload',
      external_url: null,
      source_url: form.sourceUrl,
      visibility: mediaVisibility,
      caption: mediaCaption.trim() || null,
      alt_text: mediaAltText.trim() || null,
      attribution: mediaAttribution.trim() || null,
      permission_status: mediaPermission,
      watermark_permission: 'unknown',
      watermark_status: 'not_applied',
      admin_notes: null,
      original_url: null,
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

  const addExternalMedia = async () => {
    if (!editing || !form.id || !isSafeMediaUrl(mediaExternalUrl.trim())) {
      setStatus({ tone: 'error', text: t('admin.mediaExternalUrlInvalid') });
      return;
    }
    if (mediaVisibility === 'public' && !['confirmed', 'granted'].includes(mediaPermission)) {
      setStatus({ tone: 'error', text: t('admin.mediaPublicPermissionRequired') });
      return;
    }
    setMediaBusy(true);
    const client = await getSupabaseClient();
    if (!client) {
      setMediaBusy(false);
      return;
    }
    const { error } = await client.from('property_media').insert({
      property_id: form.id,
      url: mediaExternalUrl.trim(),
      kind: mediaKind,
      source_kind: 'external',
      external_url: mediaExternalUrl.trim(),
      source_url: form.sourceUrl,
      storage_path: null,
      visibility: mediaVisibility,
      permission_status: mediaPermission,
      caption: mediaCaption.trim() || null,
      alt_text: mediaAltText.trim() || null,
      attribution: mediaAttribution.trim() || null,
      watermark_permission: 'unknown',
      watermark_status: 'not_applied',
      admin_notes: null,
      original_url: mediaExternalUrl.trim(),
      sort_order: media.length + 1,
      is_cover: false,
    });
    setMediaBusy(false);
    if (error) {
      setStatus({ tone: 'error', text: t('admin.mediaSaveError') });
      return;
    }
    setMediaExternalUrl('');
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
    if (
      item.visibility === 'public' &&
      !['confirmed', 'granted'].includes(item.permission_status ?? '')
    ) {
      setStatus({ tone: 'error', text: t('admin.mediaPublicPermissionRequired') });
      return;
    }
    if (
      item.source_kind === 'external' &&
      !isSafeMediaUrl(item.external_url)
    ) {
      setStatus({ tone: 'error', text: t('admin.mediaExternalUrlInvalid') });
      return;
    }
    if (item.source_url && !isSafeMediaUrl(item.source_url)) {
      setStatus({ tone: 'error', text: t('admin.validation.sourceUrlInvalid') });
      return;
    }
    const client = await getSupabaseClient();
    if (!client) return;
    const { error } = await client
      .from('property_media')
      .update({
        ...(item.source_kind === 'external' ? { url: item.external_url ?? item.url } : {}),
        caption: item.caption,
        alt_text: item.alt_text,
        attribution: item.attribution,
        permission_status: item.permission_status,
        sort_order: item.sort_order,
        external_url: item.external_url,
        source_url: item.source_url,
        visibility: item.visibility,
        watermark_permission: item.watermark_permission,
        admin_notes: item.admin_notes,
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

  useEffect(() => {
    if (!isAdmin || !user) return;
    let active = true;
    setDisplayNameLoading(true);
    void getDisplayName(user.id).then((result) => {
      if (!active) return;
      setDisplayName(result.data ?? user.user_metadata?.display_name ?? '');
      setDisplayNameLoading(false);
      if (result.error) setStatus({ tone: 'error', text: t('admin.accountLoadError') });
    });
    return () => {
      active = false;
    };
  }, [isAdmin, user, t]);

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

  const filteredRows = useMemo(() => {
    return rows.filter((row) => {
      if (catalogueSearch.trim()) {
        const query = catalogueSearch.toLowerCase();
        const matchesName = row.property_name.toLowerCase().includes(query);
        const matchesId = row.id.toLowerCase().includes(query);
        const matchesLoc = row.location.toLowerCase().includes(query);
        if (!matchesName && !matchesId && !matchesLoc) return false;
      }
      if (catalogueFilter === 'published') return row.is_published;
      if (catalogueFilter === 'draft') return !row.is_published;
      if (catalogueFilter === 'needsChecking') {
        const missing = missingFacts(rowToAdminForm(row));
        return missing.length > 0;
      }
      return true;
    });
  }, [rows, catalogueSearch, catalogueFilter]);

  const publishedCount = useMemo(() => rows.filter((r) => r.is_published).length, [rows]);
  const draftCount = useMemo(() => rows.filter((r) => !r.is_published).length, [rows]);
  const needsDataCount = useMemo(
    () => rows.filter((r) => missingFacts(rowToAdminForm(r)).length > 0).length,
    [rows]
  );

  const filteredMedia = useMemo(() => {
    if (mediaTabFilter === 'all') return media;
    return media.filter((item) => item.kind === mediaTabFilter);
  }, [media, mediaTabFilter]);

  const photoCount = useMemo(() => media.filter((m) => m.kind === 'photo').length, [media]);
  const floorplanCount = useMemo(() => media.filter((m) => m.kind === 'floorplan').length, [media]);
  const videoCount = useMemo(() => media.filter((m) => m.kind === 'video').length, [media]);

  if (!isConfigured) {
    return (
      <div className="container admin" id="admin-overview">
        <h1 className="section__title">{t('admin.title')}</h1>
        <div className="notice notice--warning" role="status">
          {t('admin.notConfigured')}
        </div>
      </div>
    );
  }

  if (authLoading) {
    return (
      <div className="container admin">
        <h1 className="section__title">{t('admin.title')}</h1>
        <p role="status">{t('common.loading')}</p>
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

  const selectPropertyForMedia = (propertyId: string) => {
    const row = rows.find((r) => r.id === propertyId);
    if (row) {
      setForm(rowToAdminForm(row));
      setEditing(true);
      void loadMedia(row.id);
    }
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

      {/* Workspace Tabs Navigation */}
      <nav className="admin__tabs-bar" aria-label={t('admin.workspaceNavigation')}>
        <button
          type="button"
          className={`admin__tab-btn ${activeTab === 'overview' ? 'is-active' : ''}`}
          onClick={() => setActiveTab('overview')}
        >
          📊 {t('admin.workspaceOverview')}
        </button>
        <button
          type="button"
          className={`admin__tab-btn ${activeTab === 'catalogue' ? 'is-active' : ''}`}
          onClick={() => setActiveTab('catalogue')}
        >
          📑 {t('admin.workspaceCatalogue')} ({rows.length})
        </button>
        <button
          type="button"
          className={`admin__tab-btn ${activeTab === 'editor' ? 'is-active' : ''}`}
          onClick={() => setActiveTab('editor')}
        >
          ✏️ {editing ? t('admin.editProperty') : t('admin.newProperty')}
        </button>
        <button
          type="button"
          className={`admin__tab-btn ${activeTab === 'media' ? 'is-active' : ''}`}
          onClick={() => setActiveTab('media')}
        >
          🖼️ {t('admin.workspaceMedia')} {editing ? `(${media.length})` : ''}
        </button>
        <button
          type="button"
          className={`admin__tab-btn ${activeTab === 'account' ? 'is-active' : ''}`}
          onClick={() => setActiveTab('account')}
        >
          👤 {t('admin.workspaceAccount')}
        </button>
      </nav>

      {/* ---------------- Tab 1: Overview ---------------- */}
      {activeTab === 'overview' && (
        <section aria-labelledby="admin-overview-title">
          <h2 id="admin-overview-title" className="visually-hidden">{t('admin.workspaceOverview')}</h2>
          <div className="admin__overview-grid">
            <div className="admin__kpi-card">
              <p className="admin__kpi-label">{t('admin.properties')}</p>
              <p className="admin__kpi-value">{rows.length}</p>
              <p className="admin__kpi-note">{t('explorer.showing', { shown: rows.length, total: rows.length })}</p>
            </div>
            <div className="admin__kpi-card">
              <p className="admin__kpi-label">{t('admin.columns.published')}</p>
              <p className="admin__kpi-value" style={{ color: 'var(--color-primary)' }}>{publishedCount}</p>
              <p className="admin__kpi-note">{t('admin.fields.isPublished')}</p>
            </div>
            <div className="admin__kpi-card">
              <p className="admin__kpi-label">Drafts</p>
              <p className="admin__kpi-value">{draftCount}</p>
              <p className="admin__kpi-note">{t('admin.fields.isPublishedHelp')}</p>
            </div>
            <div className="admin__kpi-card">
              <p className="admin__kpi-label">{t('admin.missingFields')}</p>
              <p className="admin__kpi-value" style={{ color: needsDataCount > 0 ? 'var(--brand-red)' : 'inherit' }}>
                {needsDataCount}
              </p>
              <p className="admin__kpi-note">{needsDataCount > 0 ? `${needsDataCount} need review` : t('admin.allFieldsKnown')}</p>
            </div>
          </div>

          <div className="admin__overview-actions">
            <button
              type="button"
              className="btn btn--primary"
              onClick={() => {
                setForm(EMPTY_FORM);
                setEditing(false);
                setMedia([]);
                setActiveTab('editor');
              }}
            >
              + {t('admin.newProperty')}
            </button>
            <button
              type="button"
              className="btn btn--secondary"
              onClick={() => setActiveTab('catalogue')}
            >
              📑 {t('admin.workspaceCatalogue')}
            </button>
            <button
              type="button"
              className="btn btn--ghost"
              onClick={() => setActiveTab('account')}
            >
              👤 {t('admin.workspaceAccount')}
            </button>
          </div>

          <h3 className="admin__table-title">Recent Properties</h3>
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
                    <th scope="col">{t('admin.columns.published')}</th>
                    <th scope="col">{t('admin.columns.actions')}</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.slice(0, 5).map((row) => {
                    const adminForm = rowToAdminForm(row);
                    return (
                      <tr key={row.id}>
                        <th scope="row">
                          {row.property_name}
                          <span className="admin__row-id">{row.id}</span>
                        </th>
                        <td>{row.location}</td>
                        <td>{row.price_myr === null ? t('common.unknown') : formatMYR(Number(row.price_myr))}</td>
                        <td>
                          <span className={`admin__badge ${row.is_published ? 'admin__badge--published' : 'admin__badge--draft'}`}>
                            {row.is_published ? t('common.yes') : t('common.no')}
                          </span>
                        </td>
                        <td className="admin__row-actions">
                          <button
                            type="button"
                            className="btn btn--ghost btn--sm"
                            onClick={() => {
                              setForm(adminForm);
                              setEditing(true);
                              void loadMedia(row.id);
                              setActiveTab('editor');
                            }}
                          >
                            {t('common.edit')}
                          </button>
                          <button
                            type="button"
                            className="btn btn--ghost btn--sm"
                            onClick={() => {
                              setForm(adminForm);
                              setEditing(true);
                              void loadMedia(row.id);
                              setActiveTab('media');
                            }}
                          >
                            {t('admin.workspaceMedia')}
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </section>
      )}

      {/* ---------------- Tab 2: Catalogue ---------------- */}
      {activeTab === 'catalogue' && (
        <section aria-labelledby="admin-catalogue-title">
          <div className="admin__catalogue-header">
            <h2 id="admin-catalogue-title" className="admin__table-title" style={{ margin: 0 }}>
              {t('admin.properties')} ({filteredRows.length})
            </h2>
            <button
              type="button"
              className="btn btn--primary"
              onClick={() => {
                setForm(EMPTY_FORM);
                setEditing(false);
                setMedia([]);
                setActiveTab('editor');
              }}
            >
              + {t('admin.newProperty')}
            </button>
          </div>

          <div className="admin__catalogue-controls">
            <input
              type="search"
              className="form-input admin__search-input"
              placeholder={`${t('explorer.search')} (Name, ID, Location)…`}
              value={catalogueSearch}
              onChange={(e) => setCatalogueSearch(e.target.value)}
              aria-label={t('explorer.search')}
            />
            <div className="admin__filter-pills" role="toolbar" aria-label="Catalogue filters">
              <button
                type="button"
                className={`admin__filter-pill ${catalogueFilter === 'all' ? 'is-active' : ''}`}
                onClick={() => setCatalogueFilter('all')}
              >
                All ({rows.length})
              </button>
              <button
                type="button"
                className={`admin__filter-pill ${catalogueFilter === 'published' ? 'is-active' : ''}`}
                onClick={() => setCatalogueFilter('published')}
              >
                {t('admin.columns.published')} ({publishedCount})
              </button>
              <button
                type="button"
                className={`admin__filter-pill ${catalogueFilter === 'draft' ? 'is-active' : ''}`}
                onClick={() => setCatalogueFilter('draft')}
              >
                Drafts ({draftCount})
              </button>
              <button
                type="button"
                className={`admin__filter-pill ${catalogueFilter === 'needsChecking' ? 'is-active' : ''}`}
                onClick={() => setCatalogueFilter('needsChecking')}
              >
                Needs Review ({needsDataCount})
              </button>
            </div>
          </div>

          {loading ? (
            <p role="status">{t('common.loading')}</p>
          ) : filteredRows.length === 0 ? (
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
                  {filteredRows.map((row) => {
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
                        <td>
                          <span className={`admin__badge ${row.is_published ? 'admin__badge--published' : 'admin__badge--draft'}`}>
                            {row.is_published ? t('common.yes') : t('common.no')}
                          </span>
                        </td>
                        <td>{row.verified_date ?? t('status.notVerified')}</td>
                        <td className="admin__row-actions">
                          <button
                            type="button"
                            className="btn btn--ghost btn--sm"
                            onClick={() => {
                              setForm(adminForm);
                              setEditing(true);
                              void loadMedia(row.id);
                              setActiveTab('editor');
                              window.scrollTo({ top: 0, behavior: 'smooth' });
                            }}
                          >
                            {t('common.edit')}
                          </button>
                          <button
                            type="button"
                            className="btn btn--ghost btn--sm"
                            onClick={() => {
                              setForm(adminForm);
                              setEditing(true);
                              void loadMedia(row.id);
                              setActiveTab('media');
                              window.scrollTo({ top: 0, behavior: 'smooth' });
                            }}
                          >
                            {t('admin.workspaceMedia')}
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
        </section>
      )}

      {/* ---------------- Tab 3: Editor ---------------- */}
      {activeTab === 'editor' && (
        <form className="admin__form surface" id="admin-editor" onSubmit={save}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 'var(--space-lg)' }}>
            <h2 className="admin__form-title" style={{ margin: 0 }}>
              {editing ? t('admin.editProperty') : t('admin.newProperty')}
              {editing && <span className="admin__row-id" style={{ marginLeft: 'var(--space-sm)' }}>{form.id}</span>}
            </h2>
            {editing && (
              <button
                type="button"
                className="btn btn--secondary btn--sm"
                onClick={() => setActiveTab('media')}
              >
                🖼️ {t('admin.workspaceMedia')} ({media.length})
              </button>
            )}
          </div>

          <div className="admin__editor-section">
            <div className="admin__editor-section-header">
              <h3 className="admin__editor-section-title">1. {t('admin.sectionIdentity')}</h3>
            </div>
            <div className="admin__grid">
              <label className="form-group">
                <span className="form-label">
                  {t('admin.fields.id')} <span className="form-required">({t('common.required')})</span>
                </span>
                <input
                  type="text"
                  className="form-input"
                  required={!editing}
                  disabled={editing}
                  pattern="[A-Za-z0-9-]{1,64}"
                  maxLength={64}
                  placeholder="e.g. SP-031"
                  value={form.id}
                  onChange={(event) =>
                    setForm((previous) => ({ ...previous, id: event.target.value }))
                  }
                />
                <span className="form-helper">{t('admin.fields.idHelp')}</span>
              </label>

              <label className="form-group">
                <span className="form-label">
                  {t('admin.fields.propertyName')} <span className="form-required">({t('common.required')})</span>
                </span>
                <input
                  type="text"
                  className="form-input"
                  required
                  maxLength={160}
                  placeholder="e.g. Vogue Suites One"
                  value={form.propertyName}
                  onChange={(event) =>
                    setForm((previous) => ({ ...previous, propertyName: event.target.value }))
                  }
                />
              </label>

              <label className="form-group">
                <span className="form-label">
                  {t('admin.fields.location')} <span className="form-required">({t('common.required')})</span>
                </span>
                <input
                  type="text"
                  className="form-input"
                  required
                  maxLength={200}
                  placeholder="e.g. KL Eco City, Kuala Lumpur"
                  value={form.location}
                  onChange={(event) =>
                    setForm((previous) => ({ ...previous, location: event.target.value }))
                  }
                />
              </label>

              <label className="form-group">
                <span className="form-label">
                  {t('admin.fields.priceMYR')} <span className="form-optional">({t('common.optional')})</span>
                </span>
                <input
                  type="number"
                  className="form-input"
                  min="1"
                  step="1000"
                  placeholder="e.g. 850000"
                  value={form.priceMYR ?? ''}
                  onChange={(event) =>
                    setForm((previous) => ({
                      ...previous,
                      priceMYR: nullableNumber(event.target.value),
                    }))
                  }
                />
                <span className="form-helper">Full asking price in Ringgit Malaysia (RM).</span>
              </label>

              {textField('address', t('admin.fields.address'), 'e.g. Jalan Bangsar, KL Eco City, 59200 Kuala Lumpur', 'Full street address if recorded.')}
              {numberField('priceMinMYR', t('admin.fields.priceMinMYR'), 'e.g. 800000', 'Lowest price in recorded range', '1000', '0')}
              {numberField('priceMaxMYR', t('admin.fields.priceMaxMYR'), 'e.g. 900000', 'Highest price in recorded range', '1000', '0')}
              {textField('priceBasis', t('admin.fields.priceBasis'), 'e.g. Asking price, Guide price, or Starting from')}

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
                  <option value="">{t('common.unknown')}</option>
                  {PROPERTY_TYPES.map((type) => (
                    <option key={type} value={type}>
                      {type}
                    </option>
                  ))}
                </select>
              </label>
            </div>
          </div>

          <div className="admin__editor-section">
            <div className="admin__editor-section-header">
              <h3 className="admin__editor-section-title">2. {t('admin.sectionProperty')}</h3>
            </div>
            <div className="admin__grid">
              <label className="form-group">
                <span className="form-label">
                  {t('admin.fields.bedrooms')} <span className="form-optional">({t('common.optional')})</span>
                </span>
                <input
                  type="number"
                  className="form-input"
                  min="0"
                  max="50"
                  placeholder="e.g. 2"
                  value={form.bedrooms ?? ''}
                  onChange={(event) =>
                    setForm((previous) => ({ ...previous, bedrooms: nullableNumber(event.target.value) }))
                  }
                />
              </label>

              <label className="form-group">
                <span className="form-label">
                  {t('admin.fields.bathrooms')} <span className="form-optional">({t('common.optional')})</span>
                </span>
                <input
                  type="number"
                  className="form-input"
                  min="0"
                  max="50"
                  placeholder="e.g. 2"
                  value={form.bathrooms ?? ''}
                  onChange={(event) =>
                    setForm((previous) => ({ ...previous, bathrooms: nullableNumber(event.target.value) }))
                  }
                />
              </label>

              <label className="form-group">
                <span className="form-label">
                  {t('admin.fields.builtUpSqft')} <span className="form-optional">({t('common.optional')})</span>
                </span>
                <input
                  type="number"
                  className="form-input"
                  min="1"
                  placeholder="e.g. 915"
                  value={form.builtUpSqft ?? ''}
                  onChange={(event) =>
                    setForm((previous) => ({
                      ...previous,
                      builtUpSqft: nullableNumber(event.target.value),
                    }))
                  }
                />
                <span className="form-helper">Built-up floor area in square feet.</span>
              </label>

              {textField('tenure', t('admin.fields.tenure'), 'e.g. Freehold or Leasehold (99 years)')}
              {textField('completionDate', t('admin.fields.completionDate'), 'e.g. 2024 or Q4 2025')}
              {numberField('landArea', t('admin.fields.landArea'), 'e.g. 1800', 'Land area where applicable', 'any', '0.0001')}
              {textField('landAreaUnit', t('admin.fields.landAreaUnit'), 'e.g. sq ft or acres')}
              {numberField('parkingBays', t('admin.fields.parkingBays'), 'e.g. 2', 'Car park bays', '1', '0')}
              {textField('furnishingStatus', t('admin.fields.furnishingStatus'), 'e.g. Fully Furnished, Partially Furnished, Unfurnished')}
              {numberField('monthlyMaintenanceMYR', t('admin.fields.monthlyMaintenanceMYR'), 'e.g. 350.00', 'Monthly maintenance fee in RM', '0.01', '0')}
              {numberField('sinkingFundMYR', t('admin.fields.sinkingFundMYR'), 'e.g. 35.00', 'Monthly sinking fund in RM', '0.01', '0')}
            </div>
          </div>

          <div className="admin__editor-section">
            <div className="admin__editor-section-header">
              <h3 className="admin__editor-section-title">3. {t('admin.sectionLocation')}</h3>
            </div>
            <div className="admin__grid">
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
              {textField('availabilityCheckedDate', t('admin.fields.availabilityCheckedDate'), '', 'Date availability was checked', 'date')}
              {numberField('latitude', t('admin.fields.latitude'), 'e.g. 3.1189', 'WGS84 latitude between -90 and 90', 'any', '-90')}
              {numberField('longitude', t('admin.fields.longitude'), 'e.g. 101.6744', 'WGS84 longitude between -180 and 180', 'any', '-180')}
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
              {textField('nearestTransit', t('admin.fields.nearestTransit'), 'e.g. Abdullah Hukum LRT Station')}
              {numberField('transitDistanceKm', t('admin.fields.transitDistanceKm'), 'e.g. 0.35', 'Distance in kilometres', 'any', '0')}
              {numberField('transitTravelTimeMin', t('admin.fields.transitTravelTimeMin'), 'e.g. 5', 'Reported minutes', '1', '0')}
              {textField('transitMode', t('admin.fields.transitMode'), 'e.g. Walking or Transit Shuttle Bus')}
              {textField('nearbyAmenity', t('admin.fields.nearbyAmenity'), 'e.g. Mid Valley Megamall (0.5km)', 'Key amenities from listing')}
              {numberField('amenityDistanceKm', t('admin.fields.amenityDistanceKm'), 'e.g. 0.5', 'Distance in kilometres', 'any', '0')}
            </div>
          </div>

          <div className="admin__editor-section">
            <div className="admin__editor-section-header">
              <h3 className="admin__editor-section-title">4. {t('admin.sectionAmenities')}</h3>
            </div>
            <label className="form-group admin__grid-wide">
              <span className="form-label">{t('admin.fields.facilities')}</span>
              <textarea
                className="form-input"
                rows={3}
                placeholder="e.g. Swimming Pool; Gymnasium; 24-Hour Security; Playground; BBQ Pit; Tennis Court"
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
          </div>

          <div className="admin__editor-section">
            <div className="admin__editor-section-header">
              <h3 className="admin__editor-section-title">5. {t('admin.sectionSource')}</h3>
            </div>
            <div className="admin__grid">
              <label className="form-group admin__grid-wide">
                <span className="form-label">{t('admin.fields.sourceUrl')}</span>
                <input
                  type="url"
                  className="form-input"
                  placeholder="https://www.iproperty.com.my/property/..."
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

              {textField('sourceType', t('admin.fields.sourceType'), 'e.g. iProperty, PropertyGuru, Developer Brochure')}
              {textField('sourceName', t('admin.fields.sourceName'), 'e.g. iProperty Malaysia')}
              {textField('dateAccessed', t('admin.fields.dateAccessed'), '', 'Date record was accessed from source', 'date')}
              {textField('confirmedByRole', t('admin.fields.confirmedByRole'), 'e.g. Senior Property Specialist')}
              {textField('confidenceStatus', t('admin.fields.confidenceStatus'), 'e.g. high, verified, preliminary')}
              {textField('imagePermission', t('admin.fields.imagePermission'), 'e.g. confirmed, unknown, restricted')}

              <label className="form-group admin__grid-wide">
                <span className="form-label">{t('admin.fields.notes')}</span>
                <textarea
                  className="form-input"
                  rows={4}
                  placeholder="e.g. Address extracted from listing body: Jalan Perusahaan Maju 9. Completion year recorded as 2024."
                  value={form.notes ?? ''}
                  onChange={(event) =>
                    setForm((previous) => ({
                      ...previous,
                      notes: event.target.value || null,
                    }))
                  }
                />
                <span className="form-helper">Internal source notes, discrepancy details, or caveats.</span>
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
            <button
              type="button"
              className="btn btn--ghost"
              onClick={() => {
                setForm(EMPTY_FORM);
                setEditing(false);
                setMedia([]);
                setActiveTab('catalogue');
              }}
            >
              {t('common.cancel')}
            </button>
          </div>
        </form>
      )}

      {/* ---------------- Tab 4: Media ---------------- */}
      {activeTab === 'media' && (
        <section className="admin__media surface" id="admin-media" aria-labelledby="admin-media-title">
          <div className="admin__media-selector">
            <label className="form-group" style={{ margin: 0, flex: 1, minWidth: '240px' }}>
              <span className="form-label">{t('admin.workspaceProperties')}</span>
              <select
                className="form-select"
                value={editing && form.id ? form.id : ''}
                onChange={(e) => {
                  if (e.target.value) {
                    selectPropertyForMedia(e.target.value);
                  }
                }}
              >
                <option value="">-- {t('explorer.search')} --</option>
                {rows.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.property_name} ({r.id})
                  </option>
                ))}
              </select>
            </label>
            {editing && form.id && (
              <button
                type="button"
                className="btn btn--secondary btn--sm"
                onClick={() => setActiveTab('editor')}
              >
                ✏️ {t('admin.editProperty')}
              </button>
            )}
          </div>

          {!editing || !form.id ? (
            <div className="admin__empty" style={{ padding: 'var(--space-2xl) var(--space-md)' }}>
              <p>Please select a property from the dropdown above or from the Catalogue to view and manage its media.</p>
              <button
                type="button"
                className="btn btn--secondary mt-md"
                onClick={() => setActiveTab('catalogue')}
              >
                📑 Browse Catalogue
              </button>
            </div>
          ) : (
            <>
              <h2 id="admin-media-title" className="admin__form-title">
                {t('admin.mediaTitle', { property: form.propertyName })}
              </h2>
              <p className="form-helper">{t('admin.mediaPermissionNotice')}</p>

              <div className="admin__filter-pills" role="toolbar" aria-label="Media kind filter" style={{ marginBottom: 'var(--space-lg)' }}>
                <button
                  type="button"
                  className={`admin__filter-pill ${mediaTabFilter === 'all' ? 'is-active' : ''}`}
                  onClick={() => setMediaTabFilter('all')}
                >
                  All ({media.length})
                </button>
                <button
                  type="button"
                  className={`admin__filter-pill ${mediaTabFilter === 'photo' ? 'is-active' : ''}`}
                  onClick={() => setMediaTabFilter('photo')}
                >
                  {t('admin.mediaPhoto')} ({photoCount})
                </button>
                <button
                  type="button"
                  className={`admin__filter-pill ${mediaTabFilter === 'floorplan' ? 'is-active' : ''}`}
                  onClick={() => setMediaTabFilter('floorplan')}
                >
                  {t('admin.mediaFloorplan')} ({floorplanCount})
                </button>
                <button
                  type="button"
                  className={`admin__filter-pill ${mediaTabFilter === 'video' ? 'is-active' : ''}`}
                  onClick={() => setMediaTabFilter('video')}
                >
                  {t('admin.mediaVideo')} ({videoCount})
                </button>
              </div>

              <form className="admin__media-upload" onSubmit={(event) => void uploadMedia(event)}>
                <label className="form-group">
                  <span className="form-label">{t('admin.mediaFile')}</span>
                  <input
                    type="file"
                    className="form-input"
                    accept={mediaKind === 'video'
                      ? 'video/mp4,video/webm,video/ogg'
                      : 'image/jpeg,image/png,image/webp,image/avif'}
                    onChange={(event) => setMediaFile(event.target.files?.[0] ?? null)}
                  />
                </label>
                <label className="form-group">
                  <span className="form-label">{t('admin.mediaKind')}</span>
                  <select
                    className="form-select"
                    value={mediaKind}
                    onChange={(event) =>
                      setMediaKind(
                        event.target.value === 'floorplan' || event.target.value === 'video'
                          ? event.target.value
                          : 'photo'
                      )
                    }
                  >
                    <option value="photo">{t('admin.mediaPhoto')}</option>
                    <option value="floorplan">{t('admin.mediaFloorplan')}</option>
                    <option value="video">{t('admin.mediaVideo')}</option>
                  </select>
                </label>
                <label className="form-group">
                  <span className="form-label">{t('admin.mediaExternalUrl')}</span>
                  <input
                    className="form-input"
                    type="url"
                    value={mediaExternalUrl}
                    placeholder="https://"
                    onChange={(event) => setMediaExternalUrl(event.target.value)}
                  />
                </label>
                <label className="form-group">
                  <span className="form-label">{t('admin.mediaPermission')}</span>
                  <select
                    className="form-select"
                    value={mediaPermission}
                    onChange={(event) => setMediaPermission(event.target.value)}
                  >
                    <option value="unknown">{t('admin.mediaPermissionUnknown')}</option>
                    <option value="confirmed">{t('admin.mediaPermissionConfirmed')}</option>
                    <option value="restricted">{t('admin.mediaPermissionRestricted')}</option>
                  </select>
                </label>
                <label className="form-group">
                  <span className="form-label">{t('admin.mediaVisibility')}</span>
                  <select
                    className="form-select"
                    value={mediaVisibility}
                    onChange={(event) => setMediaVisibility(event.target.value === 'public' ? 'public' : 'internal')}
                  >
                    <option value="internal">{t('admin.mediaInternal')}</option>
                    <option value="public">{t('admin.mediaPublic')}</option>
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
                  type="button"
                  className="btn btn--secondary"
                  disabled={!mediaExternalUrl.trim() || mediaBusy}
                  onClick={() => void addExternalMedia()}
                >
                  {mediaBusy ? t('admin.saving') : t('admin.mediaAddExternal')}
                </button>
                <button
                  type="submit"
                  className="btn btn--primary"
                  disabled={!mediaFile || mediaBusy || mediaPermission !== 'confirmed'}
                >
                  {mediaBusy ? t('admin.saving') : t('admin.mediaUpload')}
                </button>
              </form>

              {filteredMedia.length === 0 ? (
                <p className="admin__empty">{t('admin.mediaEmpty')}</p>
              ) : (
                <ul className="admin__media-grid">
                  {filteredMedia.map((item) => (
                    <li key={item.id} className="admin__media-card">
                      <div className="admin__media-preview">
                        {item.kind === 'video' ? (
                          <video src={item.watermarked_url ?? item.url} controls preload="metadata" />
                        ) : (
                          <img
                            src={item.watermarked_url ?? item.url}
                            alt={item.alt_text ?? item.caption ?? t('admin.mediaPreview')}
                            loading="lazy"
                          />
                        )}
                        {item.is_cover && <span className="admin__media-cover-tag">{t('admin.mediaCover')}</span>}
                      </div>
                      <div className="admin__media-content">
                        <div className="admin__media-badges">
                          <span className="admin__badge">
                            {item.kind === 'photo'
                              ? t('admin.mediaPhoto')
                              : item.kind === 'video'
                                ? t('admin.mediaVideo')
                                : t('admin.mediaFloorplan')}
                          </span>
                          <span className={`admin__badge ${item.source_kind === 'external' ? 'admin__badge--external' : 'admin__badge--upload'}`}>
                            {item.source_kind === 'external' ? t('admin.mediaExternal') : t('admin.mediaUploadSource')}
                          </span>
                          <span className={`admin__badge ${item.visibility === 'public' ? 'admin__badge--published' : 'admin__badge--draft'}`}>
                            {item.visibility === 'public' ? t('admin.mediaPublic') : t('admin.mediaInternal')}
                          </span>
                          <span className={`admin__badge admin__badge--${item.permission_status ?? 'unknown'}`}>
                            {t(`admin.mediaPermission${(item.permission_status ?? 'unknown').charAt(0).toUpperCase() + (item.permission_status ?? 'unknown').slice(1)}`)}
                          </span>
                        </div>

                        {item.source_kind === 'external' ? (
                          <label className="form-group" style={{ margin: 0 }}>
                            <span className="form-label" style={{ fontSize: 'var(--font-size-xs)' }}>{t('admin.mediaExternalUrl')}</span>
                            <input
                              className="form-input"
                              type="url"
                              value={item.external_url ?? ''}
                              onChange={(event) =>
                                setMedia((previous) =>
                                  previous.map((mediaItem) =>
                                    mediaItem.id === item.id
                                      ? { ...mediaItem, external_url: event.target.value || null }
                                      : mediaItem
                                  )
                                )
                              }
                            />
                          </label>
                        ) : (
                          <p style={{ margin: 0, fontSize: 'var(--font-size-xs)', color: 'var(--color-text-secondary)', wordBreak: 'break-all' }}>
                            <strong>{t('admin.mediaStoragePath')}:</strong> {item.storage_path ?? t('common.unknown')}
                          </p>
                        )}

                        <label className="form-group" style={{ margin: 0 }}>
                          <span className="form-label" style={{ fontSize: 'var(--font-size-xs)' }}>{t('admin.mediaCaption')}</span>
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

                        <label className="form-group" style={{ margin: 0 }}>
                          <span className="form-label" style={{ fontSize: 'var(--font-size-xs)' }}>{t('admin.mediaPermission')}</span>
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
                            <option value="confirmed">{t('admin.mediaPermissionConfirmed')}</option>
                            {item.permission_status === 'granted' && (
                              <option value="granted">{t('admin.mediaPermissionGranted')}</option>
                            )}
                            <option value="restricted">{t('admin.mediaPermissionRestricted')}</option>
                          </select>
                        </label>

                        <label className="form-group" style={{ margin: 0 }}>
                          <span className="form-label" style={{ fontSize: 'var(--font-size-xs)' }}>{t('admin.mediaVisibility')}</span>
                          <select
                            className="form-select"
                            value={item.visibility}
                            onChange={(event) =>
                              setMedia((previous) =>
                                previous.map((mediaItem) =>
                                  mediaItem.id === item.id
                                    ? { ...mediaItem, visibility: event.target.value === 'public' ? 'public' : 'internal' }
                                    : mediaItem
                                )
                              )
                            }
                          >
                            <option value="internal">{t('admin.mediaInternal')}</option>
                            <option value="public">{t('admin.mediaPublic')}</option>
                          </select>
                        </label>

                        <div className="admin__row-actions" style={{ marginTop: 'var(--space-sm)' }}>
                          <button
                            type="button"
                            className="btn btn--secondary btn--sm"
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
                          <button
                            type="button"
                            className="btn btn--ghost btn--sm admin__remove"
                            onClick={() => void removeMedia(item)}
                          >
                            {t('admin.remove')}
                          </button>
                        </div>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </>
          )}
        </section>
      )}

      {/* ---------------- Tab 5: Account ---------------- */}
      {activeTab === 'account' && (
        <section className="admin__account surface" id="admin-account" aria-labelledby="admin-account-title">
          <div>
            <h2 id="admin-account-title" className="admin__form-title">{t('admin.accountTitle')}</h2>
            <p><strong>{t('admin.accountEmail')}:</strong> {user?.email ?? t('common.unknown')}</p>
            <p className="form-helper">{t('admin.accountNameHelp')}</p>
          </div>
          <form
            className="admin__account-form"
            onSubmit={async (event) => {
              event.preventDefault();
              if (!user) return;
              setDisplayNameSaving(true);
              const result = await updateDisplayName(user.id, displayName);
              setDisplayNameSaving(false);
              if (result.error) {
                setStatus({ tone: 'error', text: result.error });
                return;
              }
              setDisplayName(result.data ?? '');
              setStatus({ tone: 'ok', text: t('admin.accountSaved') });
            }}
          >
            <label className="form-group">
              <span className="form-label">{t('admin.accountName')}</span>
              <input
                className="form-input"
                maxLength={80}
                value={displayNameLoading ? '' : displayName}
                disabled={displayNameLoading || displayNameSaving}
                onChange={(event) => setDisplayName(event.target.value)}
              />
            </label>
            {displayNameLoading && <p role="status">{t('admin.accountNameLoading')}</p>}
            <button
              type="submit"
              className="btn btn--secondary"
              disabled={displayNameLoading || displayNameSaving}
            >
              {displayNameSaving ? t('admin.saving') : t('admin.accountSave')}
            </button>
          </form>
        </section>
      )}
    </div>
  );
}
