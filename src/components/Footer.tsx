import './Footer.css';

interface FooterProps {
  onNavigate: (section: string) => void;
}

export default function Footer({ onNavigate }: FooterProps) {
  return (
    <footer className="footer" id="footer">
      <div className="container">
        <div className="footer__grid">
          <div className="footer__brand">
            <div className="footer__logo">
              <svg viewBox="0 0 28 28" width="28" height="28" aria-hidden="true">
                <rect width="28" height="28" rx="6" fill="var(--color-primary-light)" />
                <text x="14" y="20" textAnchor="middle" fontFamily="system-ui, sans-serif" fontWeight="700" fontSize="16" fill="var(--color-text-inverse)">S</text>
              </svg>
              <span className="footer__wordmark">
                Sime<span className="footer__wordmark-accent">Park</span>
              </span>
            </div>
            <p className="footer__tagline">
              Affordability-first property discovery for Malaysian homebuyers.
              Helping young adults and first-time buyers understand their estimated
              housing affordability.
            </p>
          </div>

          <div className="footer__links">
            <h4 className="footer__links-title">Navigate</h4>
            <button className="footer__link" onClick={() => onNavigate('hero')}>Home</button>
            <button className="footer__link" onClick={() => onNavigate('affordability')}>Affordability</button>
            <button className="footer__link" onClick={() => onNavigate('properties')}>Properties</button>
            <button className="footer__link" onClick={() => onNavigate('about')}>How It Works</button>
          </div>

          <div className="footer__disclaimer-section">
            <h4 className="footer__links-title">Important Notice</h4>
            <p className="footer__disclaimer-text">
              SimePark provides illustrative estimates only. Mortgage calculations are
              based on simplified assumptions and do not constitute financial advice,
              loan approval, or a guarantee of borrowing capacity. Actual rates,
              eligibility, and costs depend on your specific lender, credit profile,
              and property. Additional costs such as legal fees, stamp duty, insurance,
              valuation, and maintenance are not included. Please consult a licensed
              financial advisor or your bank for personalised guidance.
            </p>
            <p className="footer__disclaimer-text footer__disclaimer-text--notice">
              SimePark is a university hackathon project. It is not affiliated with any
              property developer or financial institution unless explicitly stated.
            </p>
          </div>
        </div>

        <div className="footer__bottom">
          <p className="footer__copyright">
            © {new Date().getFullYear()} SimePark — University Hackathon Project
          </p>
        </div>
      </div>
    </footer>
  );
}
