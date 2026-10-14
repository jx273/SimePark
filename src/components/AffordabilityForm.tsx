import { useState } from 'react';
import { AffordabilityInputs, DEFAULT_AFFORDABILITY_INPUTS } from '../types/affordability';
import './AffordabilityForm.css';

interface AffordabilityFormProps {
  onSubmit: (inputs: AffordabilityInputs) => void;
}

interface FormErrors {
  monthlyIncome?: string;
  monthlyDebts?: string;
  downPayment?: string;
  annualInterestRate?: string;
  loanTenureYears?: string;
  preferredMaxMonthlyPayment?: string;
}

export default function AffordabilityForm({ onSubmit }: AffordabilityFormProps) {
  const [formData, setFormData] = useState<AffordabilityInputs>(DEFAULT_AFFORDABILITY_INPUTS);
  const [errors, setErrors] = useState<FormErrors>({});
  const [submitted, setSubmitted] = useState(false);

  const locations = [
    '', 'Kuala Lumpur', 'Petaling Jaya', 'Shah Alam',
    'Subang Jaya', 'Cyberjaya', 'Putrajaya',
  ];

  function validate(data: AffordabilityInputs): FormErrors {
    const errs: FormErrors = {};

    if (!data.monthlyIncome || data.monthlyIncome <= 0) {
      errs.monthlyIncome = 'Monthly income must be greater than zero.';
    }
    if (data.monthlyDebts < 0) {
      errs.monthlyDebts = 'Debts cannot be negative.';
    }
    if (data.downPayment < 0) {
      errs.downPayment = 'Down payment cannot be negative.';
    }
    if (data.annualInterestRate < 0) {
      errs.annualInterestRate = 'Interest rate cannot be negative.';
    }
    if (data.annualInterestRate > 20) {
      errs.annualInterestRate = 'Interest rate seems unreasonably high.';
    }
    if (data.loanTenureYears < 1 || data.loanTenureYears > 40) {
      errs.loanTenureYears = 'Loan tenure must be between 1 and 40 years.';
    }
    if (data.preferredMaxMonthlyPayment !== undefined && data.preferredMaxMonthlyPayment < 0) {
      errs.preferredMaxMonthlyPayment = 'Preferred payment cannot be negative.';
    }

    return errs;
  }

  function handleChange(field: keyof AffordabilityInputs, value: string) {
    const numValue = value === '' ? 0 : parseFloat(value);
    if (isNaN(numValue)) return;

    setFormData((prev) => ({ ...prev, [field]: numValue }));

    // Clear error for this field on change
    if (submitted) {
      setErrors((prev) => ({ ...prev, [field]: undefined }));
    }
  }

  function handleLocationChange(value: string) {
    setFormData((prev) => ({
      ...prev,
      preferredLocation: value || undefined,
    }));
  }

  function handleBedroomChange(value: string) {
    const num = parseInt(value, 10);
    setFormData((prev) => ({
      ...prev,
      minBedrooms: isNaN(num) || num <= 0 ? undefined : num,
    }));
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitted(true);

    const validationErrors = validate(formData);
    setErrors(validationErrors);

    if (Object.keys(validationErrors).length === 0) {
      onSubmit(formData);
    }
  }

  const inputValue = (val: number | undefined) =>
    val === undefined || val === 0 ? '' : String(val);

  return (
    <section className="affordability-form section" id="affordability">
      <div className="container container--narrow">
        <h2 className="section__title text-center">
          Understand Your Affordability
        </h2>
        <p className="section__subtitle" style={{ margin: '0 auto var(--space-2xl)' }}>
          Enter your financial details to estimate how much home you can afford.
          All calculations are illustrative estimates.
        </p>

        <form className="af-form" onSubmit={handleSubmit} noValidate>
          {/* Required Financial Inputs */}
          <div className="af-form__section">
            <h3 className="af-form__section-title">Financial Details</h3>

            <div className="form-group">
              <label className="form-label" htmlFor="monthlyIncome">
                Monthly Household Income (RM)
              </label>
              <span className="form-helper">
                Your gross monthly household income before tax and deductions.
              </span>
              <input
                id="monthlyIncome"
                type="number"
                className={`form-input ${errors.monthlyIncome ? 'form-input--error' : ''}`}
                placeholder="e.g. 6000"
                value={inputValue(formData.monthlyIncome)}
                onChange={(e) => handleChange('monthlyIncome', e.target.value)}
                min="0"
                step="100"
              />
              {errors.monthlyIncome && (
                <p className="form-error">{errors.monthlyIncome}</p>
              )}
            </div>

            <div className="form-group">
              <label className="form-label" htmlFor="monthlyDebts">
                Existing Monthly Debt Commitments (RM)
              </label>
              <span className="form-helper">
                Include car loans, personal loans, credit card minimums, PTPTN, etc.
              </span>
              <input
                id="monthlyDebts"
                type="number"
                className={`form-input ${errors.monthlyDebts ? 'form-input--error' : ''}`}
                placeholder="e.g. 800"
                value={inputValue(formData.monthlyDebts)}
                onChange={(e) => handleChange('monthlyDebts', e.target.value)}
                min="0"
                step="100"
              />
              {errors.monthlyDebts && (
                <p className="form-error">{errors.monthlyDebts}</p>
              )}
            </div>

            <div className="form-group">
              <label className="form-label" htmlFor="downPayment">
                Available Down Payment (RM)
              </label>
              <span className="form-helper">
                How much cash you have available for a down payment. Most conventional
                loans require at least 10% of the property price.
              </span>
              <input
                id="downPayment"
                type="number"
                className={`form-input ${errors.downPayment ? 'form-input--error' : ''}`}
                placeholder="e.g. 40000"
                value={inputValue(formData.downPayment)}
                onChange={(e) => handleChange('downPayment', e.target.value)}
                min="0"
                step="1000"
              />
              {errors.downPayment && (
                <p className="form-error">{errors.downPayment}</p>
              )}
            </div>
          </div>

          {/* Loan Assumptions */}
          <div className="af-form__section">
            <h3 className="af-form__section-title">Loan Assumptions</h3>

            <div className="af-form__row">
              <div className="form-group">
                <label className="form-label" htmlFor="annualInterestRate">
                  Annual Interest Rate (%)
                </label>
                <span className="form-helper">
                  Typical Malaysian housing loan rates are 3.5%–5.0%.
                </span>
                <input
                  id="annualInterestRate"
                  type="number"
                  className={`form-input ${errors.annualInterestRate ? 'form-input--error' : ''}`}
                  value={formData.annualInterestRate}
                  onChange={(e) => handleChange('annualInterestRate', e.target.value)}
                  min="0"
                  max="20"
                  step="0.1"
                />
                {errors.annualInterestRate && (
                  <p className="form-error">{errors.annualInterestRate}</p>
                )}
              </div>

              <div className="form-group">
                <label className="form-label" htmlFor="loanTenureYears">
                  Loan Tenure (Years)
                </label>
                <span className="form-helper">
                  Maximum 35 years in Malaysia. Common choices: 25–35 years.
                </span>
                <input
                  id="loanTenureYears"
                  type="number"
                  className={`form-input ${errors.loanTenureYears ? 'form-input--error' : ''}`}
                  value={formData.loanTenureYears}
                  onChange={(e) => handleChange('loanTenureYears', e.target.value)}
                  min="1"
                  max="40"
                  step="1"
                />
                {errors.loanTenureYears && (
                  <p className="form-error">{errors.loanTenureYears}</p>
                )}
              </div>
            </div>
          </div>

          {/* Optional Preferences */}
          <div className="af-form__section">
            <h3 className="af-form__section-title">
              Preferences <span className="af-form__optional">(Optional)</span>
            </h3>

            <div className="form-group">
              <label className="form-label" htmlFor="preferredMaxMonthlyPayment">
                Preferred Maximum Monthly Payment (RM)
              </label>
              <span className="form-helper">
                Leave blank to use the calculated maximum based on your income and debts.
              </span>
              <input
                id="preferredMaxMonthlyPayment"
                type="number"
                className={`form-input ${errors.preferredMaxMonthlyPayment ? 'form-input--error' : ''}`}
                placeholder="e.g. 2000"
                value={inputValue(formData.preferredMaxMonthlyPayment)}
                onChange={(e) => handleChange('preferredMaxMonthlyPayment', e.target.value)}
                min="0"
                step="100"
              />
              {errors.preferredMaxMonthlyPayment && (
                <p className="form-error">{errors.preferredMaxMonthlyPayment}</p>
              )}
            </div>

            <div className="af-form__row">
              <div className="form-group">
                <label className="form-label" htmlFor="preferredLocation">
                  Preferred Location
                </label>
                <span className="form-helper">
                  Filter properties to a specific area.
                </span>
                <select
                  id="preferredLocation"
                  className="form-select"
                  value={formData.preferredLocation || ''}
                  onChange={(e) => handleLocationChange(e.target.value)}
                >
                  <option value="">Any location</option>
                  {locations.filter(Boolean).map((loc) => (
                    <option key={loc} value={loc}>{loc}</option>
                  ))}
                </select>
              </div>

              <div className="form-group">
                <label className="form-label" htmlFor="minBedrooms">
                  Minimum Bedrooms
                </label>
                <span className="form-helper">
                  Minimum number of bedrooms you need.
                </span>
                <select
                  id="minBedrooms"
                  className="form-select"
                  value={formData.minBedrooms || ''}
                  onChange={(e) => handleBedroomChange(e.target.value)}
                >
                  <option value="">Any</option>
                  <option value="1">1+</option>
                  <option value="2">2+</option>
                  <option value="3">3+</option>
                  <option value="4">4+</option>
                  <option value="5">5+</option>
                </select>
              </div>
            </div>
          </div>

          <button type="submit" className="btn btn--primary btn--large af-form__submit">
            🏠 Find My Home
          </button>
        </form>
      </div>
    </section>
  );
}
