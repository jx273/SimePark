import { useTranslation } from 'react-i18next';
import { useSelection } from '../state/SelectionProvider';
import { navigate, useRoute } from '../router/router';
import type { Property } from '../types/property';
import './FloatingCompareBar.css';

interface FloatingCompareBarProps {
  catalog: Property[];
}

export default function FloatingCompareBar({ catalog }: FloatingCompareBarProps) {
  const { t } = useTranslation();
  const route = useRoute();
  const { comparisonIds, toggleCompared, clearComparison } = useSelection();

  if (comparisonIds.length === 0) return null;

  const comparedProperties = comparisonIds
    .map((id) => catalog.find((p) => p.id === id))
    .filter((p): p is Property => p !== undefined);

  const handleOpenCompare = () => {
    if (route.name === 'home') {
      const el = document.getElementById('compare');
      if (el) {
        el.scrollIntoView({ behavior: 'smooth' });
        return;
      }
    }
    navigate({ name: 'home' });
    window.setTimeout(() => {
      const el = document.getElementById('compare');
      el?.scrollIntoView({ behavior: 'smooth' });
    }, 180);
  };

  return (
    <aside className="floating-compare" aria-label={t('compare.title')}>
      <div className="floating-compare__info">
        <span className="floating-compare__badge">{comparisonIds.length}</span>
        <span className="floating-compare__text">
          {t('compare.selectedCount', { count: comparisonIds.length, max: 3 })}
        </span>
        <div className="floating-compare__items" aria-hidden="true">
          {comparedProperties.map((prop) => (
            <span key={prop.id} className="floating-compare__chip" title={prop.propertyName}>
              {prop.propertyName}
              <button
                type="button"
                className="floating-compare__chip-remove"
                aria-label={`${t('compare.remove')}: ${prop.propertyName}`}
                onClick={(e) => {
                  e.stopPropagation();
                  void toggleCompared(prop.id);
                }}
              >
                ×
              </button>
            </span>
          ))}
        </div>
      </div>
      <div className="floating-compare__actions">
        <button
          type="button"
          className="floating-compare__view-btn"
          onClick={handleOpenCompare}
        >
          {t('compare.open')} ↗
        </button>
        <button
          type="button"
          className="floating-compare__clear-btn"
          onClick={clearComparison}
        >
          {t('compare.clear')}
        </button>
      </div>
    </aside>
  );
}
