import './HowItWorks.css';

export default function HowItWorks() {
  const steps = [
    {
      number: '01',
      icon: '📊',
      title: 'Understand Your Budget',
      description:
        'Enter your household income, existing debts, and down payment. SimePark estimates your affordable mortgage budget using transparent assumptions.',
    },
    {
      number: '02',
      icon: '🏠',
      title: 'Compare Matching Properties',
      description:
        'Browse properties filtered and ranked by how well they fit your estimated budget. See estimated monthly payments, down payment requirements, and DSR for each.',
    },
    {
      number: '03',
      icon: '🔍',
      title: 'Review & Research',
      description:
        'View detailed calculations for each property, understand the assumptions, and follow source links to original listings for further research.',
    },
  ];

  return (
    <section className="how-it-works section" id="about">
      <div className="container">
        <h2 className="section__title text-center">How SimePark Works</h2>
        <p className="section__subtitle" style={{ margin: '0 auto var(--space-2xl)', textAlign: 'center' }}>
          Three simple steps to understand your housing affordability.
        </p>

        <div className="hiw__grid">
          {steps.map((step) => (
            <div key={step.number} className="hiw__step">
              <span className="hiw__number">{step.number}</span>
              <span className="hiw__icon">{step.icon}</span>
              <h3 className="hiw__title">{step.title}</h3>
              <p className="hiw__description">{step.description}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
