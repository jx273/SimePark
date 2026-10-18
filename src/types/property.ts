/**
 * Property data model for SimePark.
 *
 * The shape now covers the fields present in the authoritative source dataset
 * (SP-001..SP-004) while keeping every previously-used field intact, so existing
 * affordability, filtering and comparison logic keeps working.
 *
 * DATA-INTEGRITY CONVENTIONS
 *  - `null` means "not recorded". It is never replaced with 0, '' or a guess.
 *  - Source text that does not fit a typed column (notes, raw amenity strings,
 *    tenure wordings such as "needs checking") is preserved verbatim alongside
 *    the normalized fields.
 *  - `availabilityStatus` is separate from `verifiedDate` and from
 *    `availabilityCheckedDate`. A verification date does NOT mean a property is
 *    still available.
 *  - Coordinates are only present when they were genuinely established. A missing
 *    coordinate must never be replaced with a city-centre point.
 */

export interface Property {
  /** Unique identifier, e.g. SP-001 */
  id: string;
  /** Property / development name */
  propertyName: string;
  /** Area + state, e.g. "Seberang Perai, Penang" */
  location: string;
  /** Project address when recorded in the source, else null */
  address?: string | null;

  /** Headline price in MYR. Required for any affordability calculation. */
  priceMYR: number;
  /** Lower bound when the source gives a range or a "starting price" */
  priceMinMYR?: number | null;
  /** Upper bound when the source gives a range */
  priceMaxMYR?: number | null;
  /** Source wording for the price, e.g. "asking price" / "starting price" */
  priceBasis?: string | null;

  propertyType: PropertyType | null;
  bedrooms: number | null;
  bathrooms: number | null;
  /** Built-up area in square feet */
  builtUpSqft: number | null;
  /** Land area value, unit given separately by the source */
  landArea?: number | null;
  /** Unit for `landArea`, e.g. "sqft" or "acres" */
  landAreaUnit?: string | null;

  /** Monthly maintenance charge in MYR, when stated */
  monthlyMaintenanceMYR?: number | null;
  /** Monthly sinking fund in MYR, when stated */
  sinkingFundMYR?: number | null;

  /** Source tenure wording. May be "needs checking"; not normalized away. */
  tenure?: string | null;
  /** Completion date or year as recorded by the source */
  completionDate?: string | null;
  /** Number of parking bays, when stated */
  parkingBays?: number | null;
  /** Source furnishing wording. May be "needs checking". */
  furnishingStatus?: string | null;

  /** Always "unknown" until availability is genuinely confirmed. */
  availabilityStatus?: string;
  /** Date the availability was last checked (NOT a confirmation) */
  availabilityCheckedDate?: string | null;

  /** Latitude, only when genuinely established. Never invented. */
  latitude?: number | null;
  /** Longitude, only when genuinely established. Never invented. */
  longitude?: number | null;
  /**
   * Reliability of the coordinates.
   * - 'verified': a specific, checked project location
   * - 'approximate': an approximate area only
   * - 'unknown': no usable location
   */
  locationPrecision?: LocationPrecision;

  /** Nearest public transport name, when recorded */
  nearestTransit?: string | null;
  /** Reported route distance in km (route mode may be unspecified) */
  transitDistanceKm?: number | null;
  /** Reported travel time in minutes */
  transitTravelTimeMin?: number | null;
  /**
   * Travel mode, only when the source states it. `null` means the source did not
   * specify, so the UI must not label the distance "walking" or "driving".
   */
  transitMode?: string | null;

  /** Raw amenity string exactly as supplied (names and inline distances) */
  nearbyAmenity?: string | null;
  /** Minimum reported amenity distance in km, when supplied */
  amenityDistanceKm?: number | null;
  /** Amenities parsed from `nearbyAmenity` into structured entries */
  amenities?: PropertyAmenity[];

  /** Normalized facility list, e.g. ["Gym", "Swimming Pool"] */
  facilities?: string[];

  /** Provenance */
  sourceUrl: string | null;
  sourceType?: string | null;
  sourceName?: string | null;
  /** Date the record's source was last verified (not an availability check) */
  verifiedDate: string | null;
  dateAccessed?: string | null;
  /** Who confirmed the data, when recorded */
  confirmedByRole?: string | null;
  /** Source confidence wording, e.g. "indicative" / "needs checking" */
  confidenceStatus?: string | null;
  /** Whether image redistribution permission is known */
  imagePermission?: string | null;
  /** Source notes, preserved verbatim including any unresolved conflicts */
  notes?: string | null;

  /** False while a record is a draft in the admin workflow */
  isPublished?: boolean;
  /** Legacy demo flag. The delivered catalogue is entirely non-example. */
  isExample: boolean;

  /** Gallery and floor plans, ordered. May be empty. */
  media?: PropertyMedia[];
}

/** Structured amenity, parsed from the source's semicolon-separated string. */
export interface PropertyAmenity {
  name: string;
  /** Distance in km when the source included one in the same entry */
  distanceKm: number | null;
}

export type LocationPrecision = 'verified' | 'approximate' | 'unknown';

export type PropertyMediaKind = 'photo' | 'floorplan';

/** One photograph or floor plan belonging to exactly one property. */
export interface PropertyMedia {
  id: string;
  propertyId: string;
  /** Public URL or site-relative path, e.g. /media/SP-001/photo-1.jpg */
  url: string;
  kind: PropertyMediaKind;
  /** Short caption shown under the image */
  caption: string | null;
  /** Accessible description. Falls back to the caption, never invented details. */
  altText: string | null;
  isCover: boolean;
  sortOrder: number;
  /** Attribution shown with the image, e.g. "Property agent" */
  attribution: string | null;
  /** Permission status carried from the property record */
  permissionStatus: string | null;
  /** When an upload was watermarked, the generated copy (original retained) */
  watermarkedUrl: string | null;
  /** Original upload location, retained when a watermarked copy exists */
  originalUrl: string | null;
}

export type PropertyType =
  | 'Condominium'
  | 'Apartment'
  | 'Terrace House'
  | 'Semi-Detached'
  | 'Bungalow'
  | 'Townhouse'
  | 'Flat';

export const PROPERTY_TYPES: readonly PropertyType[] = [
  'Condominium',
  'Apartment',
  'Terrace House',
  'Semi-Detached',
  'Bungalow',
  'Townhouse',
  'Flat',
];

/**
 * Why a property does or does not fit the user's budget.
 * - 'affordable': repayment fits the monthly budget AND cash covers the deposit
 * - 'overMonthlyBudget': repayment exceeds the monthly budget
 * - 'insufficientDownPayment': repayment fits but cash is short
 * - 'uncalculated': no affordability calculation has been performed yet
 */
export type PropertyBudgetStatus =
  | 'affordable'
  | 'overMonthlyBudget'
  | 'insufficientDownPayment'
  | 'uncalculated';

/**
 * A property record enriched with affordability calculations for one user.
 *
 * Budget-dependent fields are null in the uncalculated state rather than 0, so
 * the UI can render a neutral state instead of a misleading verdict.
 */
export interface PropertyWithCalculations extends Property {
  /** Estimated monthly mortgage payment in MYR, or null when uncalculated */
  estimatedMonthlyMortgage: number | null;
  /** Required down payment in MYR, or null when uncalculated */
  requiredDownPayment: number | null;
  /** Cash applied to this property, or null when uncalculated */
  downPaymentApplied: number | null;
  /** Down-payment shortfall, or null when uncalculated */
  cashShortfall: number | null;
  /** Loan principal, or null when uncalculated */
  loanPrincipal: number | null;
  /** Estimated DSR including this mortgage, or null when uncalculated */
  estimatedDSR: number | null;
  /** Whether the property fits both constraints. Null when uncalculated. */
  isAffordable: boolean | null;
  /** Which constraint fails, for display */
  budgetStatus: PropertyBudgetStatus;
  /** Match score 0-100. In the uncalculated state this reflects factual fit only. */
  matchScore: number;
  /** Human-readable explanation */
  matchExplanation: string;
}

/** The cover image for a property, or the first photo, or null. */
export function coverImage(property: Property): PropertyMedia | null {
  const media = property.media ?? [];
  return (
    media.find((item) => item.kind === 'photo' && item.isCover) ??
    media.find((item) => item.kind === 'photo') ??
    null
  );
}

/** Floor plans in display order. */
export function floorPlans(property: Property): PropertyMedia[] {
  return (property.media ?? [])
    .filter((item) => item.kind === 'floorplan')
    .sort((a, b) => a.sortOrder - b.sortOrder);
}

/** Photographs in display order, cover first. */
export function photos(property: Property): PropertyMedia[] {
  const list = (property.media ?? []).filter((item) => item.kind === 'photo');
  return [...list].sort((a, b) => {
    if (a.isCover !== b.isCover) return a.isCover ? -1 : 1;
    return a.sortOrder - b.sortOrder;
  });
}
