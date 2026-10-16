import { useTranslation } from 'react-i18next';
import { useScrollReveal } from '../hooks/interactions';
import './HowItWorks.css';

const STEPS = ['step1', 'step2', 'step3'] as const;
const ICONS: Record<(typeof STEPS)[number], string> = {
  step1: '📊',
  step2: '🏠',
  step3: '🔍',
};

export default function HowItWorks() {
  const { t } = useTranslation();
  const reveal = useScrollReveal<HTMLElement>();

  return (
    <section className="how-it-works section" id="about" ref={reveal.ref}>
      <div className={`container ${reveal.className}`}>
        <h2 className="section__title text-center">{t('howItWorks.title')}</h2>
        <p className="section__subtitle section__subtitle--center">
          {t('howItWorks.subtitle')}
        </p>

        <ol className="hiw__grid">
          {STEPS.map((step, index) => (
            <li className={`hiw__step surface reveal--d${index + 1}`} key={step}>
              <span className="hiw__number" aria-hidden="true">
                {String(index + 1).padStart(2, '0')}
              </span>
              <span className="hiw__icon" aria-hidden="true">
                {ICONS[step]}
              </span>
              <h3 className="hiw__title">{t(`howItWorks.${step}Title`)}</h3>
              <p className="hiw__description">{t(`howItWorks.${step}Text`)}</p>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}
