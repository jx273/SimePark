import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  AffordabilityInputs,
  DEFAULT_AFFORDABILITY_INPUTS,
  ILLUSTRATIVE_DSR_CAP,
  AFFORDABILITY_ASSUMPTIONS,
} from '../types/affordability';
import { calculateMortgageBudget } from '../utils/dsr';
import { useScrollReveal } from '../hooks/interactions';
import './AffordabilityForm.css';

interface AffordabilityFormProps {
  onSubmit: (inputs: AffordabilityInputs) => void;
  /** Values to pre-fill, e.g. a loaded scenario or restored preferences. */
  initialInputs?: AffordabilityInputs | null;
  onReset?: () => void;
  /** Persist the submitted values as the user's preferences, when signed in. */
  onPersistPreferences?: (inputs: AffordabilityInputs) => void;
}

type FieldKey =
  | 'monthlyIncome'
  | 'monthlyDebts'
  | 'downPayment'
  | 'annualInterestRate'
  | 'loanTenureYears'
  | 'preferredMaxMonthlyPayment';

const LOCATIONS = [
  'Kuala Lumpur',
  'Petaling Jaya',
  'Shah Alam',
  'Subang Jaya',
  'Cyberjaya',
  'Putrajaya',
];

export default function AffordabilityForm({
  onSubmit,
  initialInputs = null,
  onReset,
  onPersistPreferences,
}: AffordabilityFormProps) {
  const { t } = useTranslation();
  const reveal = useScrollReveal<HTMLElement>();

  const [formData, setFormData] = useState<AffordabilityInputs>(
    initialInputs ?? DEFAULT_AFFORDABILITY_INPUTS
  );
  const [errors, setErrors] = useState<Partial<Record<FieldKey, string>>>({});
  const [warnings, setWarnings] = useState<Partial<Record<FieldKey, string>>>({});
  const [submitted, setSubmitted] = useState(false);

  // Adopt externally supplied values (a loaded scenario, restored preferences).
  useEffect(() => {
    if (initialInputs) setFormData(initialInputs);
  }, [initialInputs]);

  const locationOptions = useMemo(() => LOCATIONS, []);

  function validate(data: AffordabilityInputs): Partial<Record<FieldKey, string>> {
    const errs: Partial<Record<FieldKey, string>> = {};

    if (!data.monthlyIncome || data.monthlyIncome <= 0) {
      errs.monthlyIncome = t('affordability.validation.incomeRequired');
    }
    if (data.monthlyDebts < 0) errs.monthlyDebts = t('affordability.validation.debtsNegative');
    if (data.downPayment < 0) errs.downPayment = t('affordability.validation.downPaymentNegative');
    if (data.annualInterestRate < 0) {
      errs.annualInterestRate = t('affordability.validation.rateNegative');
    } else if (data.annualInterestRate > 20) {
      errs.annualInterestRate = t('affordability.validation.rateTooHigh');
    }
    if (data.loanTenureYears < 1 || data.loanTenureYears > 40) {
      errs.loanTenureYears = t('affordability.validation.tenureRange');
    }
    if (data.preferredMaxMonthlyPayment !== undefined && data.preferredMaxMonthlyPayment < 0) {
      errs.preferredMaxMonthlyPayment = t('affordability.validation.preferredNegative');
    }

    return errs;
  }

  /**
   * Non-blocking guidance. A preferred payment above the repayment budget still
   * works, but the calculated budget is what limits results, so say so rather
   * than letting the user believe the higher figure applies.
   */
  function collectWarnings(data: AffordabilityInputs): Partial<Record<FieldKey, string>> {
    const warns: Partial<Record<FieldKey, string>> = {};
    const preferred = data.preferredMaxMonthlyPayment ?? 0;

    if (preferred > 0 && data.monthlyIncome > 0) {
      const budget = calculateMortgageBudget(
        data.monthlyIncome,
        data.monthlyDebts,
        ILLUSTRATIVE_DSR_CAP
      );

      if (budget <= 0) {
        warns.preferredMaxMonthlyPayment = t('affordability.warnings.noRoom', {
          cap: ILLUSTRATIVE_DSR_CAP,
        });
      } else if (preferred > budget) {
        warns.preferredMaxMonthlyPayment = t('affordability.warnings.aboveBudget', {
          budget: Math.round(budget).toLocaleString('en-MY'),
          cap: ILLUSTRATIVE_DSR_CAP,
        });
      }
    }

    return warns;
  }

  function handleChange(field: FieldKey, value: string) {
    const numValue = value === '' ? 0 : parseFloat(value);
    if (Number.isNaN(numValue)) return;

    setFormData((previous) => ({ ...previous, [field]: numValue }));

    if (submitted) {
      setErrors((previous) => ({ ...previous, [field]: undefined }));
      setWarnings((previous) => ({ ...previous, [field]: undefined }));
    }
  }

  function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setSubmitted(true);

    const validationErrors = validate(formData);
    setErrors(validationErrors);
    setWarnings(collectWarnings(formData));

    if (Object.keys(validationErrors).length === 0) {
      onSubmit(formData);
      onPersistPreferences?.(formData);
    }

  }

  function handleReset() {
    setFormData(DEFAULT_AFFORDABILITY_INPUTS);
    setErrors({});
    setWarnings({});
    setSubmitted(false);
    onReset?.();
  }

  const inputValue = (value: number | undefined) =>
    value === undefined || value === 0 ? '' : String(value);

  return (
    <section className="affordability-form section" id="affordability" ref={reveal.ref}>
      <div className={`container container--narrow ${reveal.className}`}>
        <h2 className="section__title text-center">{t('affordability.sectionTitle')}</h2>
        <p className="section__subtitle section__subtitle--center">
          {t('affordability.sectionSubtitle')}
        </p>

        <form className="af-form surface" onSubmit={handleSubmit} noValidate>
          <div className="af-form__section">
            <h3 className="af-form__section-title">{t('affordability.financialDetails')}</h3>

            <div className="form-group">
              <label className="form-label" htmlFor="monthlyIncome">
                {t('affordability.monthlyIncome')}
              </label>
              <span className="form-helper">{t('affordability.monthlyIncomeHelp')}</span>
              <input
                id="monthlyIncome"
                type="number"
                className={`form-input ${errors.monthlyIncome ? 'form-input--error' : ''}`}
                placeholder="6000"
                value={inputValue(formData.monthlyIncome)}
                onChange={(event) => handleChange('monthlyIncome', event.target.value)}
                min="0"
                step="100"
                aria-invalid={Boolean(errors.monthlyIncome)}
              />
              {errors.monthlyIncome && (
                <p className="form-error">
                  <span aria-hidden="true">⚠ </span>
                  {errors.monthlyIncome}
                </p>
              )}
            </div>

            <div className="form-group">
              <label className="form-label" htmlFor="monthlyDebts">
                {t('affordability.monthlyDebts')}
              </label>
              <span className="form-helper">{t('affordability.monthlyDebtsHelp')}</span>
              <input
                id="monthlyDebts"
                type="number"
                className={`form-input ${errors.monthlyDebts ? 'form-input--error' : ''}`}
                placeholder="800"
                value={inputValue(formData.monthlyDebts)}
                onChange={(event) => handleChange('monthlyDebts', event.target.value)}
                min="0"
                step="100"
                aria-invalid={Boolean(errors.monthlyDebts)}
              />
              {errors.monthlyDebts && (
                <p className="form-error">
                  <span aria-hidden="true">⚠ </span>
                  {errors.monthlyDebts}
                </p>
              )}
            </div>

            <div className="form-group">
              <label className="form-label" htmlFor="downPayment">
                {t('affordability.downPayment')}
              </label>
              <span className="form-helper">
                {t('affordability.downPaymentHelp', {
                  percent: AFFORDABILITY_ASSUMPTIONS.downPaymentPercent,
                })}
              </span>
              <input
                id="downPayment"
                type="number"
                className={`form-input ${errors.downPayment ? 'form-input--error' : ''}`}
                placeholder="40000"
                value={inputValue(formData.downPayment)}
                onChange={(event) => handleChange('downPayment', event.target.value)}
                min="0"
                step="1000"
                aria-invalid={Boolean(errors.downPayment)}
              />
              {errors.downPayment && (
                <p className="form-error">
                  <span aria-hidden="true">⚠ </span>
                  {errors.downPayment}
                </p>
              )}
            </div>
          </div>

          <div className="af-form__section">
            <h3 className="af-form__section-title">{t('affordability.loanAssumptions')}</h3>

            <div className="af-form__row">
              <div className="form-group">
                <label className="form-label" htmlFor="annualInterestRate">
                  {t('affordability.interestRate')}
                </label>
                <span className="form-helper">{t('affordability.interestRateHelp')}</span>
                <input
                  id="annualInterestRate"
                  type="number"
                  className={`form-input ${errors.annualInterestRate ? 'form-input--error' : ''}`}
                  value={formData.annualInterestRate}
                  onChange={(event) => handleChange('annualInterestRate', event.target.value)}
                  min="0"
                  max="20"
                  step="0.1"
                  aria-invalid={Boolean(errors.annualInterestRate)}
                />
                {errors.annualInterestRate && (
                  <p className="form-error">
                    <span aria-hidden="true">⚠ </span>
                    {errors.annualInterestRate}
                  </p>
                )}
              </div>

              <div className="form-group">
                <label className="form-label" htmlFor="loanTenureYears">
                  {t('affordability.loanTenure')}
                </label>
                <span className="form-helper">{t('affordability.loanTenureHelp')}</span>
                <input
                  id="loanTenureYears"
                  type="number"
                  className={`form-input ${errors.loanTenureYears ? 'form-input--error' : ''}`}
                  value={formData.loanTenureYears}
                  onChange={(event) => handleChange('loanTenureYears', event.target.value)}
                  min="1"
                  max="40"
                  step="1"
                  aria-invalid={Boolean(errors.loanTenureYears)}
                />
                {errors.loanTenureYears && (
                  <p className="form-error">
                    <span aria-hidden="true">⚠ </span>
                    {errors.loanTenureYears}
                  </p>
                )}
              </div>
            </div>
          </div>

          <div className="af-form__section">
            <h3 className="af-form__section-title">
              {t('affordability.preferences')}{' '}
              <span className="af-form__optional">({t('common.optional')})</span>
            </h3>

            <div className="form-group">
              <label className="form-label" htmlFor="preferredMaxMonthlyPayment">
                {t('affordability.preferredMonthlyPayment')}
              </label>
              <span className="form-helper">
                {t('affordability.preferredMonthlyPaymentHelp')}
              </span>
              <input
                id="preferredMaxMonthlyPayment"
                type="number"
                className={`form-input ${
                  errors.preferredMaxMonthlyPayment ? 'form-input--error' : ''
                }`}
                placeholder="2000"
                value={inputValue(formData.preferredMaxMonthlyPayment)}
                onChange={(event) =>
                  handleChange('preferredMaxMonthlyPayment', event.target.value)
                }
                min="0"
                step="100"
                aria-invalid={Boolean(errors.preferredMaxMonthlyPayment)}
              />
              {errors.preferredMaxMonthlyPayment && (
                <p className="form-error">
                  <span aria-hidden="true">⚠ </span>
                  {errors.preferredMaxMonthlyPayment}
                </p>
              )}
              {!errors.preferredMaxMonthlyPayment && warnings.preferredMaxMonthlyPayment && (
                <p className="form-warning">
                  <span aria-hidden="true">ℹ </span>
                  {warnings.preferredMaxMonthlyPayment}
                </p>
              )}
            </div>

            <div className="af-form__row">
              <div className="form-group">
                <label className="form-label" htmlFor="preferredLocation">
                  {t('affordability.preferredLocation')}
                </label>
                <span className="form-helper">{t('affordability.preferredLocationHelp')}</span>
                <select
                  id="preferredLocation"
                  className="form-select"
                  value={formData.preferredLocation ?? ''}
                  onChange={(event) =>
                    setFormData((previous) => ({
                      ...previous,
                      preferredLocation: event.target.value || undefined,
                    }))
                  }
                >
                  <option value="">{t('affordability.anyLocation')}</option>
                  {locationOptions.map((location) => (
                    <option key={location} value={location}>
                      {location}
                    </option>
                  ))}
                </select>
              </div>

              <div className="form-group">
                <label className="form-label" htmlFor="minBedrooms">
                  {t('affordability.minBedrooms')}
                </label>
                <span className="form-helper">{t('affordability.minBedroomsHelp')}</span>
                <select
                  id="minBedrooms"
                  className="form-select"
                  value={formData.minBedrooms ?? ''}
                  onChange={(event) => {
                    const parsed = parseInt(event.target.value, 10);
                    setFormData((previous) => ({
                      ...previous,
                      minBedrooms: Number.isNaN(parsed) || parsed <= 0 ? undefined : parsed,
                    }));
                  }}
                >
                  <option value="">{t('affordability.anyBedrooms')}</option>
                  {[1, 2, 3, 4, 5].map((count) => (
                    <option key={count} value={count}>
                      {t('affordability.bedroomsPlus', { count })}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </div>

          <div className="af-form__actions">
            <button type="submit" className="btn btn--primary btn--large af-form__submit">
              {t('affordability.submit')}
            </button>
            <button type="button" className="btn btn--secondary btn--large" onClick={handleReset}>
              {t('affordability.reset')}
            </button>
          </div>
          <p className="af-form__disclaimer">{t('results.disclaimerText')}</p>
        </form>
      </div>
    </section>
  );
}
