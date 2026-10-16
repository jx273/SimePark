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
import type { PropertyRow } from '../lib/database.types';
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
  priceMYR: null,
  propertyType: null,
  bedrooms: null,
  bathrooms: null,
  builtUpSqft: null,
  sourceUrl: null,
  verifiedDate: null,
  isExample: true,
  isPublished: false,
};

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
  const [form, setForm] = useState<AdminPropertyForm>(EMPTY_FORM);
  const [editing, setEditing] = useState(false);
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState<{ tone: 'ok' | 'error'; text: string } | null>(null);

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
      setStatus({ tone: 'error', text: t('admin.unauthorized') });
      return;
    }

    setRows((data ?? []) as PropertyRow[]);
  }, [t]);

  useEffect(() => {
    if (isAdmin) void loadRows();
  }, [isAdmin, loadRows]);

  const valid = useMemo(() => {
    const errors: string[] = [];
    if (!form.propertyName.trim()) errors.push(t('admin.validation.nameRequired'));
    if (!form.location.trim()) errors.push(t('admin.validation.locationRequired'));
    if (form.priceMYR !== null && form.priceMYR <= 0) {
      errors.push(t('admin.validation.priceInvalid'));
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
      setStatus({ tone: 'error', text: t('admin.unauthorized') });
      return;
    }

    setStatus({ tone: 'ok', text: t('admin.saved') });
    setForm(EMPTY_FORM);
    setEditing(false);
    await loadRows();
  };

  const togglePublished = async (row: PropertyRow) => {
    const client = await getSupabaseClient();
    if (!client) return;

    const { error } = await client
      .from('properties')
      .update({ is_published: !row.is_published })
      .eq('id', row.id);

    if (error) {
      setStatus({ tone: 'error', text: t('admin.unauthorized') });
      return;
    }
    await loadRows();
  };

  const remove = async (row: PropertyRow) => {
    if (!window.confirm(t('admin.confirmRemove'))) return;

    const client = await getSupabaseClient();
    if (!client) return;

    const { error } = await client.from('properties').delete().eq('id', row.id);
    if (error) {
      setStatus({ tone: 'error', text: t('admin.unauthorized') });
      return;
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
              }}
            >
              {t('common.cancel')}
            </button>
          )}
        </div>
      </form>

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
