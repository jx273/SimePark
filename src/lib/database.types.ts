/**
 * Database types for the Supabase schema in `supabase/migrations`.
 *
 * Hand-written rather than generated, because the project must typecheck without
 * a live database or a Supabase access token. Keep this file in step with the
 * migrations: a mismatch shows up as a type error at the call site, which is the
 * intent.
 *
 * Nullable columns are typed `| null` deliberately. The UI must render null as
 * "Not recorded" and must never substitute a zero or a guess.
 *
 * Delivered catalogue: exactly SP-001..SP-004. The legacy demo-001..demo-015
 * records are removed by `0004_property_catalogue.sql`, and the seed migration
 * that used to recreate them is now a cleanup-only no-op.
 */

export type Json = string | number | boolean | null | { [key: string]: Json } | Json[];

export type PropertyRow = {
  id: string;
  property_name: string;
  location: string;
  address: string | null;
  price_myr: number | null;
  price_min_myr: number | null;
  price_max_myr: number | null;
  price_basis: string | null;
  property_type: string | null;
  bedrooms: number | null;
  bathrooms: number | null;
  built_up_sqft: number | null;
  land_area: number | null;
  land_area_unit: string | null;
  monthly_maintenance_myr: number | null;
  sinking_fund_myr: number | null;
  tenure: string | null;
  completion_date: string | null;
  parking_bays: number | null;
  furnishing_status: string | null;
  availability_status: string;
  availability_checked_date: string | null;
  latitude: number | null;
  longitude: number | null;
  location_precision: string;
  nearest_transit: string | null;
  transit_distance_km: number | null;
  transit_travel_time_min: number | null;
  transit_mode: string | null;
  nearby_amenity: string | null;
  amenity_distance_km: number | null;
  facilities: string[];
  source_url: string | null;
  source_type: string | null;
  source_name: string | null;
  verified_date: string | null;
  date_accessed: string | null;
  confirmed_by_role: string | null;
  confidence_status: string | null;
  image_permission: string | null;
  notes: string | null;
  is_example: boolean;
  is_published: boolean;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export type PropertyInsert = {
  id?: string;
  property_name: string;
  location: string;
  address?: string | null;
  price_myr?: number | null;
  price_min_myr?: number | null;
  price_max_myr?: number | null;
  price_basis?: string | null;
  property_type?: string | null;
  bedrooms?: number | null;
  bathrooms?: number | null;
  built_up_sqft?: number | null;
  land_area?: number | null;
  land_area_unit?: string | null;
  monthly_maintenance_myr?: number | null;
  sinking_fund_myr?: number | null;
  tenure?: string | null;
  completion_date?: string | null;
  parking_bays?: number | null;
  furnishing_status?: string | null;
  availability_status?: string;
  availability_checked_date?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  location_precision?: string;
  nearest_transit?: string | null;
  transit_distance_km?: number | null;
  transit_travel_time_min?: number | null;
  transit_mode?: string | null;
  nearby_amenity?: string | null;
  amenity_distance_km?: number | null;
  facilities?: string[];
  source_url?: string | null;
  source_type?: string | null;
  source_name?: string | null;
  verified_date?: string | null;
  date_accessed?: string | null;
  confirmed_by_role?: string | null;
  confidence_status?: string | null;
  image_permission?: string | null;
  notes?: string | null;
  is_example?: boolean;
  is_published?: boolean;
  created_by?: string | null;
}

export type PropertyUpdate = Partial<PropertyInsert>;

/** One photograph or floor plan. Belongs to exactly one property. */
export type PropertyMediaRow = {
  id: string;
  property_id: string;
  url: string;
  kind: string;
  caption: string | null;
  alt_text: string | null;
  is_cover: boolean;
  sort_order: number;
  attribution: string | null;
  permission_status: string | null;
  watermarked_url: string | null;
  original_url: string | null;
  storage_path: string | null;
  created_at: string;
}

export type PropertyMediaInsert = {
  id?: string;
  property_id: string;
  url: string;
  kind: string;
  caption?: string | null;
  alt_text?: string | null;
  is_cover?: boolean;
  sort_order?: number;
  attribution?: string | null;
  permission_status?: string | null;
  watermarked_url?: string | null;
  original_url?: string | null;
  storage_path?: string | null;
}

export type PropertyMediaUpdate = Partial<PropertyMediaInsert>;

export type ProfileRow = {
  id: string;
  display_name: string | null;
  language: 'en' | 'ms' | 'zh';
  theme: 'light' | 'dark' | 'system';
  created_at: string;
  updated_at: string;
}

export type UserPreferencesRow = {
  user_id: string;
  preferred_location: string | null;
  min_bedrooms: number | null;
  preferred_max_monthly: number | null;
  default_income: number | null;
  default_debts: number | null;
  default_down_payment: number | null;
  default_interest_rate: number | null;
  default_loan_tenure_years: number | null;
  created_at: string;
  updated_at: string;
}

export type SavedScenarioRow = {
  id: string;
  user_id: string;
  name: string;
  monthly_income: number;
  monthly_debts: number;
  down_payment: number;
  interest_rate: number;
  loan_tenure_years: number;
  preferred_max_monthly: number | null;
  result_snapshot: Json | null;
  created_at: string;
  updated_at: string;
}

export type SavedScenarioInsert = {
  id?: string;
  user_id: string;
  name: string;
  monthly_income: number;
  monthly_debts: number;
  down_payment: number;
  interest_rate: number;
  loan_tenure_years: number;
  preferred_max_monthly?: number | null;
  result_snapshot?: Json | null;
}

export type SavedPropertyRow = {
  user_id: string;
  property_id: string;
  note: string | null;
  created_at: string;
}

export type ComparisonHistoryRow = {
  id: string;
  user_id: string;
  set_id: string;
  property_id: string;
  compared_at: string;
}

export type ActivityAction = 'viewed' | 'saved' | 'unsaved' | 'compared' | 'scenario_saved';

export type ActivityLogRow = {
  id: string;
  user_id: string;
  action: ActivityAction;
  property_id: string | null;
  created_at: string;
}

export type AdminUserIdRow = {
  user_id: string;
  note: string | null;
  granted_at: string;
}

/**
 * Shape of one generated table entry.
 *
 * This mirrors what the Supabase CLI generates, and the details matter:
 *
 *  * Rows are declared with `type ... = { ... }`, NOT `interface`. Only object
 *    type aliases get an implicit index signature; an interface is NOT assignable
 *    to `Record<string, unknown>`. Because supabase-js constrains every table
 *    against `Record<string, unknown>`, using an interface makes the constraint
 *    fail silently and every table resolves to `never` — surfacing as unrelated
 *    errors such as "Property 'user_id' does not exist on type 'never[]'".
 *  * Insert/Update must NOT be unioned with `undefined` for the same reason: an
 *    `undefined` member is not assignable to `Record<string, unknown>`. Optional
 *    *properties* are fine; an `undefined` *member* is not.
 */
type TableShape<Row, Insert = never, Update = never> = {
  Row: Row;
  Insert: Insert;
  Update: Update;
  Relationships: [];
};

export interface Database {
  public: {
    Tables: {
      properties: TableShape<PropertyRow, PropertyInsert, PropertyUpdate>;
      property_media: TableShape<
        PropertyMediaRow,
        PropertyMediaInsert,
        PropertyMediaUpdate
      >;
      profiles: TableShape<
        ProfileRow,
        Partial<ProfileRow> & { id: string },
        Partial<ProfileRow>
      >;
      user_preferences: TableShape<
        UserPreferencesRow,
        Partial<UserPreferencesRow> & { user_id: string },
        Partial<UserPreferencesRow>
      >;
      saved_scenarios: TableShape<SavedScenarioRow, SavedScenarioInsert, Partial<SavedScenarioRow>>;
      saved_properties: TableShape<
        SavedPropertyRow,
        Partial<SavedPropertyRow> & { user_id: string; property_id: string },
        Partial<SavedPropertyRow>
      >;
      comparison_history: TableShape<
        ComparisonHistoryRow,
        { user_id: string; property_id: string; set_id?: string },
        Partial<ComparisonHistoryRow>
      >;
      activity_log: TableShape<
        ActivityLogRow,
        { user_id: string; action: ActivityAction; property_id?: string | null },
        Partial<ActivityLogRow>
      >;
      admin_user_ids: TableShape<AdminUserIdRow, never, never>;
    };
    Views: Record<string, never>;
    Functions: {
      is_admin: { Args: Record<string, never>; Returns: boolean };
      /** Returns void; typed as `void` (not the literal `undefined`, which would
       *  break supabase-js's schema constraint and collapse every table to `never`). */
      delete_my_data: { Args: Record<string, never>; Returns: void };
    };
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
}
