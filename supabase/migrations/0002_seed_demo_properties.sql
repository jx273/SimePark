-- ============================================================================
-- SimePark — 0002 seed demonstration properties
-- ============================================================================
-- Seeds the SAME records that ship in src/data/properties.json, so the app looks
-- identical whether it is reading from Supabase or from the local fallback.
--
-- Every seeded row keeps is_example = true, verified_date = null and
-- source_url = null, exactly as in the local dataset. They are demonstration
-- records for interface testing, NOT real listings, and the database constraint
-- properties_example_not_verified will reject any attempt to mark them verified.
--
-- Re-running this file refreshes the demonstration rows without touching any
-- records an administrator created under a different id.
-- ============================================================================

insert into public.properties (
  id, property_name, location, price_myr, property_type,
  bedrooms, bathrooms, built_up_sqft,
  source_url, verified_date, is_example, is_published
) values
  ('demo-001', 'Residensi Harmoni Cheras', 'Cheras, Kuala Lumpur', 320000, 'Apartment', 3, 2, 850, null, null, true, true),
  ('demo-002', 'CyberHeights Villa', 'Cyberjaya, Selangor', 240000, 'Apartment', 2, 1, 650, null, null, true, true),
  ('demo-003', 'The Maple Residences', 'Bukit Jalil, Kuala Lumpur', 580000, 'Condominium', 3, 2, 1100, null, null, true, true),
  ('demo-004', 'Subang Suria Court', 'Subang Jaya, Selangor', 420000, 'Condominium', 3, 2, 980, null, null, true, true),
  ('demo-005', 'Taman Setia Damai', 'Setia Alam, Shah Alam', 720000, 'Terrace House', 4, 3, 1900, null, null, true, true),
  ('demo-006', 'Ara Greens Residences', 'Ara Damansara, Petaling Jaya', 680000, 'Condominium', 3, 2, 1215, null, null, true, true),
  ('demo-007', 'Presint 11 Lakeview Homes', 'Presint 11, Putrajaya', 530000, 'Townhouse', 3, 3, 1400, null, null, true, true),
  ('demo-008', 'Verdi Eco-dominiums', 'Cyberjaya, Selangor', 450000, 'Condominium', 2, 2, 960, null, null, true, true),
  ('demo-009', 'Bukit Jelutong Hillside', 'Seksyen U8, Shah Alam', 890000, 'Semi-Detached', 5, 4, 2800, null, null, true, true),
  ('demo-010', 'USJ Heights Subang', 'USJ, Subang Jaya', 1150000, 'Semi-Detached', 5, 5, 3200, null, null, true, true),
  ('demo-011', 'Mont Kiara Pines', 'Mont Kiara, Kuala Lumpur', 950000, 'Condominium', 4, 3, 1650, null, null, true, true),
  ('demo-012', 'Damansara Perdana Suites', 'Damansara Perdana, Petaling Jaya', 210000, 'Apartment', 1, 1, 500, null, null, true, true),
  ('demo-013', 'Putrajaya Sentral Pavilion', 'Presint 9, Putrajaya', 380000, 'Apartment', 3, 2, 950, null, null, true, true),
  ('demo-014', 'Saujana Residency Penthouse', 'SS16, Subang Jaya', 1480000, 'Condominium', 4, 4, 2400, null, null, true, true),
  ('demo-015', 'Taman Paramount Garden Home', 'SS2, Petaling Jaya', 820000, 'Terrace House', 4, 3, 2100, null, null, true, true)
on conflict (id) do update set
  property_name = excluded.property_name,
  location      = excluded.location,
  price_myr     = excluded.price_myr,
  property_type = excluded.property_type,
  bedrooms      = excluded.bedrooms,
  bathrooms     = excluded.bathrooms,
  built_up_sqft = excluded.built_up_sqft,
  source_url    = excluded.source_url,
  verified_date = excluded.verified_date,
  is_example    = excluded.is_example,
  is_published  = excluded.is_published,
  updated_at    = now();

-- Sanity check: the catalogue should now hold the 15 demonstration records.
do $$
declare
  n integer;
begin
  select count(*) into n from public.properties where is_published;
  raise notice 'SimePark: % published property records available.', n;
end $$;
