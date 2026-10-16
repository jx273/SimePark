import { useTranslation } from 'react-i18next';
import './Hero.css';

interface HeroProps {
  onFindHome: () => void;
  onExplore: () => void;
}

/**
 * Hero section.
 *
 * Visual approach: a slow-moving brand gradient over a layered architectural
 * motif drawn with CSS (no stock photography, so nothing can be mistaken for a
 * real listing), a soft glass panel for the copy, and two clear calls to action.
 * The gradient drift and float are disabled under prefers-reduced-motion by the
 * global rule in index.css.
 */
export default function Hero({ onFindHome, onExplore }: HeroProps) {
  const { t } = useTranslation();

  const stats = [
    { label: t('hero.statCeilings'), value: t('hero.statCeilingsValue') },
    { label: t('hero.statDsr'), value: t('hero.statDsrValue') },
    { label: t('hero.statEstimate'), value: t('hero.statEstimateValue') },
  ];

  return (
    <section className="hero" id="hero">
      {/* Decorative layers: gradient wash, architectural silhouettes, ambient light. */}
      <div className="hero__backdrop animated-gradient" aria-hidden="true" />
      <div className="hero__skyline" aria-hidden="true">
        <span className="hero__tower hero__tower--1" />
        <span className="hero__tower hero__tower--2" />
        <span className="hero__tower hero__tower--3" />
        <span className="hero__tower hero__tower--4" />
        <span className="hero__tower hero__tower--5" />
      </div>
      <div className="hero__glow float-slow" aria-hidden="true" />

      <div className="container hero__inner">
        <div className="hero__content">
          <p className="hero__eyebrow">{t('hero.eyebrow')}</p>
          <h1 className="hero__headline">{t('hero.headline')}</h1>
          <p className="hero__subheadline">{t('hero.subheadline')}</p>

          <div className="hero__actions">
            <button type="button" className="btn btn--hero-primary btn--large" onClick={onFindHome}>
              {t('hero.primaryCta')}
            </button>
            <button
              type="button"
              className="btn btn--hero-secondary btn--large"
              onClick={onExplore}
            >
              {t('hero.secondaryCta')}
            </button>
          </div>

          <dl className="hero__stats">
            {stats.map((stat) => (
              <div className="hero__stat" key={stat.label}>
                <dt className="hero__stat-label">{stat.label}</dt>
                <dd className="hero__stat-value">{stat.value}</dd>
              </div>
            ))}
          </dl>
        </div>
      </div>

      {/* The brand rule anchors the hero to the section below. */}
      <div className="brand-rule hero__rule" aria-hidden="true" />
    </section>
  );
}
