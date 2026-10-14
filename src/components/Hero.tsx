import './Hero.css';

interface HeroProps {
  onFindHome: () => void;
  onExplore: () => void;
}

export default function Hero({ onFindHome, onExplore }: HeroProps) {
  return (
    <section className="hero" id="hero">
      <div className="hero__bg">
        {/* Decorative SVG pattern instead of remote images */}
        <svg className="hero__pattern" viewBox="0 0 800 400" preserveAspectRatio="none" aria-hidden="true">
          <defs>
            <linearGradient id="heroGrad" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0%" stopColor="#1B4332" />
              <stop offset="100%" stopColor="#2D6A4F" />
            </linearGradient>
          </defs>
          <rect width="800" height="400" fill="url(#heroGrad)" />
          {/* Stylized house silhouettes */}
          <g opacity="0.08" fill="#FFFFFF">
            <rect x="60" y="220" width="80" height="120" rx="2" />
            <polygon points="60,220 100,180 140,220" />
            <rect x="180" y="200" width="60" height="140" rx="2" />
            <polygon points="180,200 210,170 240,200" />
            <rect x="280" y="240" width="100" height="100" rx="2" />
            <polygon points="280,240 330,190 380,240" />
            <rect x="430" y="210" width="70" height="130" rx="2" />
            <polygon points="430,210 465,175 500,210" />
            <rect x="550" y="230" width="90" height="110" rx="2" />
            <polygon points="550,230 595,185 640,230" />
            <rect x="690" y="220" width="60" height="120" rx="2" />
            <polygon points="690,220 720,190 750,220" />
          </g>
          {/* Decorative circles */}
          <circle cx="650" cy="80" r="60" fill="rgba(255,255,255,0.03)" />
          <circle cx="120" cy="100" r="40" fill="rgba(255,255,255,0.03)" />
        </svg>
      </div>

      <div className="hero__content container">
        <h1 className="hero__title">
          Find a home that fits<br />
          your life and budget.
        </h1>
        <p className="hero__subtitle">
          Understand your estimated affordability before exploring properties.
          SimePark helps Malaysian homebuyers make more informed housing decisions.
        </p>
        <div className="hero__actions">
          <button className="btn btn--large btn--hero-primary" onClick={onFindHome}>
            🏠 Find My Home
          </button>
          <button className="btn btn--large btn--hero-secondary" onClick={onExplore}>
            Explore Properties
          </button>
        </div>
        <div className="hero__stats">
          <div className="hero__stat">
            <span className="hero__stat-value">Free</span>
            <span className="hero__stat-label">No cost, no sign-up</span>
          </div>
          <div className="hero__stat">
            <span className="hero__stat-value">Transparent</span>
            <span className="hero__stat-label">See every assumption</span>
          </div>
          <div className="hero__stat">
            <span className="hero__stat-value">Malaysian</span>
            <span className="hero__stat-label">Built for local buyers</span>
          </div>
        </div>
      </div>
    </section>
  );
}
