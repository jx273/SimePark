import { useState, useCallback } from 'react';
import Header from './components/Header';
import Hero from './components/Hero';
import AffordabilityForm from './components/AffordabilityForm';
import AffordabilityResults from './components/AffordabilityResults';
import PropertyExplorer from './components/PropertyExplorer';
import PropertyModal from './components/PropertyModal';
import HowItWorks from './components/HowItWorks';
import Footer from './components/Footer';

import { AffordabilityInputs, AffordabilityResult } from './types/affordability';
import { Property, PropertyWithCalculations } from './types/property';
import { calculateAffordability } from './utils/affordability';
import { enrichPropertiesWithCalculations } from './utils/propertyFilter';

import propertiesData from './data/properties.json';

// Load property data from local JSON
const properties: Property[] = propertiesData as Property[];

export default function App() {
  const [affordabilityResult, setAffordabilityResult] = useState<AffordabilityResult | null>(null);
  const [userInputs, setUserInputs] = useState<AffordabilityInputs | null>(null);
  const [selectedProperty, setSelectedProperty] = useState<PropertyWithCalculations | null>(null);

  const scrollToSection = useCallback((section: string) => {
    const el = document.getElementById(section);
    if (el) {
      const headerHeight = 64; // sticky header height
      const top = el.getBoundingClientRect().top + window.scrollY - headerHeight;
      window.scrollTo({ top, behavior: 'smooth' });
    }
  }, []);

  const handleAffordabilitySubmit = useCallback((inputs: AffordabilityInputs) => {
    setUserInputs(inputs);
    const result = calculateAffordability(inputs);
    setAffordabilityResult(result);

    // Scroll to results after a brief delay to allow render
    setTimeout(() => scrollToSection('results'), 100);
  }, [scrollToSection]);

  // Enrich properties with calculations if we have affordability results
  const enrichedProperties: PropertyWithCalculations[] =
    userInputs && affordabilityResult
      ? enrichPropertiesWithCalculations(properties, userInputs, affordabilityResult)
      : [];

  return (
    <div className="app">
      <Header onNavigate={scrollToSection} />

      <main>
        <Hero
          onFindHome={() => scrollToSection('affordability')}
          onExplore={() => scrollToSection('properties')}
        />

        <AffordabilityForm onSubmit={handleAffordabilitySubmit} />

        {affordabilityResult && (
          <AffordabilityResults result={affordabilityResult} />
        )}

        {enrichedProperties.length > 0 && (
          <PropertyExplorer
            // Re-seed the explorer filters whenever new preferences are submitted
            key={`explorer-${userInputs?.preferredLocation ?? 'any'}-${userInputs?.minBedrooms ?? 0}`}
            properties={enrichedProperties}
            preferences={userInputs}
            onViewDetails={setSelectedProperty}
          />
        )}

        <HowItWorks />
      </main>

      <Footer onNavigate={scrollToSection} />

      {/* Property details modal */}
      {selectedProperty && (
        <PropertyModal
          property={selectedProperty}
          onClose={() => setSelectedProperty(null)}
        />
      )}
    </div>
  );
}
