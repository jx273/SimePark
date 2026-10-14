import { useState } from 'react';
import './Header.css';

interface HeaderProps {
  onNavigate: (section: string) => void;
}

export default function Header({ onNavigate }: HeaderProps) {
  const [menuOpen, setMenuOpen] = useState(false);

  const navItems = [
    { label: 'Home', section: 'hero' },
    { label: 'Affordability', section: 'affordability' },
    { label: 'Explore Properties', section: 'properties' },
    { label: 'About', section: 'about' },
  ];

  const handleNav = (section: string) => {
    onNavigate(section);
    setMenuOpen(false);
  };

  return (
    <header className="header">
      <div className="header__inner container">
        <button className="header__brand" onClick={() => handleNav('hero')} aria-label="SimePark Home">
          <span className="header__logo">
            <svg viewBox="0 0 28 28" width="28" height="28" aria-hidden="true">
              <rect width="28" height="28" rx="6" fill="var(--color-primary)" />
              <text x="14" y="20" textAnchor="middle" fontFamily="system-ui, sans-serif" fontWeight="700" fontSize="16" fill="var(--color-text-inverse)">S</text>
            </svg>
          </span>
          <span className="header__wordmark">
            Sime<span className="header__wordmark-accent">Park</span>
          </span>
        </button>

        <nav className={`header__nav ${menuOpen ? 'header__nav--open' : ''}`}>
          {navItems.map((item) => (
            <button
              key={item.section}
              className="header__nav-link"
              onClick={() => handleNav(item.section)}
            >
              {item.label}
            </button>
          ))}
        </nav>

        <button
          className="header__menu-toggle"
          onClick={() => setMenuOpen(!menuOpen)}
          aria-label={menuOpen ? 'Close menu' : 'Open menu'}
          aria-expanded={menuOpen}
        >
          <span className={`header__hamburger ${menuOpen ? 'header__hamburger--open' : ''}`}>
            <span></span>
            <span></span>
            <span></span>
          </span>
        </button>
      </div>
    </header>
  );
}
