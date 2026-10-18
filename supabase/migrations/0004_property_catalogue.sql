-- ============================================================================
-- SimePark — 0004 delivered property catalogue (SP-001 .. SP-004)
-- ============================================================================
-- Before any schema changes, remove only known demo property IDs. The guard
-- refuses to proceed if any existing foreign-key dependent data references one
-- of those rows. It never deletes saved homes, comparisons, activity, media, or
-- other dependent records.
do $$
declare
  legacy_ids text[] := array[
    'demo-001','demo-002','demo-003','demo-004','demo-005',
    'demo-006','demo-007','demo-008','demo-009','demo-010',
    'demo-011','demo-012','demo-013','demo-014','demo-015'
  ];
  has_media_references boolean;
begin
  lock table public.properties in share row exclusive mode;
  lock table public.saved_properties, public.comparison_history, public.activity_log
    in share row exclusive mode;

  if exists (
    select 1 from public.properties
    where id not in (
      'SP-001','SP-002','SP-003','SP-004',
      'demo-001','demo-002','demo-003','demo-004','demo-005',
      'demo-006','demo-007','demo-008','demo-009','demo-010',
      'demo-011','demo-012','demo-013','demo-014','demo-015'
    )
  ) then
    raise exception
      'Refusing to change the catalogue because it contains property IDs outside SP-001..SP-004 and the known demo IDs. Review those records separately; no data was deleted.';
  end if;

  if exists (select 1 from public.saved_properties where property_id = any (legacy_ids))
    or exists (select 1 from public.comparison_history where property_id = any (legacy_ids))
    or exists (select 1 from public.activity_log where property_id = any (legacy_ids))
  then
    raise exception
      'Refusing to remove legacy demo properties because user data references them. Review those rows separately; no data was deleted.';
  end if;

  if to_regclass('public.property_media') is not null then
    lock table public.property_media in share row exclusive mode;
    execute
      'select exists (select 1 from public.property_media where property_id = any ($1))'
      into has_media_references
      using legacy_ids;
    if has_media_references then
      raise exception
        'Refusing to remove legacy demo properties because media rows reference them. Review those rows separately; no data was deleted.';
    end if;
  end if;

  delete from public.properties where id = any (legacy_ids);
end
$$;

-- WHAT THIS DOES, IN ORDER
--   1. Extends `properties` with the fields present in the authoritative source
--      dataset. Columns are nullable because "unknown" is a legitimate value.
--   2. Creates `property_media` (photographs and floor plans) with its own RLS.
--   3. Removes only the legacy fictitious records `demo-001`..`demo-015`, and
--      only when no user data references them.
--   4. Inserts SP-001 .. SP-004 from the supplied JSON only when their IDs are
--      absent. Re-running the import never overwrites later Admin edits.
--   5. Inserts the supplied images for those four properties.
--
-- SAFETY
--   * Deletes are scoped by an explicit id list, never by a pattern that could
--     match a real record.
--   * User accounts and all user-owned rows are preserved. If a saved,
--     compared, or activity row references a legacy property, the migration
--     stops and requires an explicit operator decision.
--   * No administrator is created or modified here.
--
-- Idempotent: safe to re-run. Existing property and media rows are left intact.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. Extend the property catalogue
-- ---------------------------------------------------------------------------
alter table public.properties add column if not exists address text;
alter table public.properties add column if not exists price_min_myr numeric;
alter table public.properties add column if not exists price_max_myr numeric;
alter table public.properties add column if not exists price_basis text;
alter table public.properties add column if not exists land_area numeric;
alter table public.properties add column if not exists land_area_unit text;
alter table public.properties add column if not exists monthly_maintenance_myr numeric;
alter table public.properties add column if not exists sinking_fund_myr numeric;
alter table public.properties add column if not exists tenure text;
alter table public.properties add column if not exists completion_date text;
alter table public.properties add column if not exists parking_bays integer;
alter table public.properties add column if not exists furnishing_status text;
alter table public.properties add column if not exists availability_status text not null default 'unknown';
alter table public.properties add column if not exists availability_checked_date date;
alter table public.properties add column if not exists latitude double precision;
alter table public.properties add column if not exists longitude double precision;
alter table public.properties add column if not exists location_precision text not null default 'unknown';
alter table public.properties add column if not exists nearest_transit text;
alter table public.properties add column if not exists transit_distance_km numeric;
alter table public.properties add column if not exists transit_travel_time_min integer;
alter table public.properties add column if not exists transit_mode text;
alter table public.properties add column if not exists nearby_amenity text;
alter table public.properties add column if not exists amenity_distance_km numeric;
alter table public.properties add column if not exists facilities text[] not null default '{}';
alter table public.properties add column if not exists source_type text;
alter table public.properties add column if not exists source_name text;
alter table public.properties add column if not exists date_accessed date;
alter table public.properties add column if not exists confirmed_by_role text;
alter table public.properties add column if not exists confidence_status text;
alter table public.properties add column if not exists image_permission text;
alter table public.properties add column if not exists notes text;

-- Property removal must not silently cascade into user-owned saved homes,
-- comparison history, or activity. The Admin UI reports a blocked deletion.
alter table public.saved_properties
  drop constraint if exists saved_properties_property_id_fkey;
alter table public.saved_properties
  add constraint saved_properties_property_id_fkey
  foreign key (property_id) references public.properties (id) on delete restrict;

alter table public.comparison_history
  drop constraint if exists comparison_history_property_id_fkey;
alter table public.comparison_history
  add constraint comparison_history_property_id_fkey
  foreign key (property_id) references public.properties (id) on delete restrict;

alter table public.activity_log
  drop constraint if exists activity_log_property_id_fkey;
alter table public.activity_log
  add constraint activity_log_property_id_fkey
  foreign key (property_id) references public.properties (id) on delete restrict;

-- Coordinate ranges: a half-set or out-of-range coordinate is a data error, not a
-- value to be silently corrected.
alter table public.properties drop constraint if exists properties_coordinate_pair;
alter table public.properties add constraint properties_coordinate_pair
  check ((latitude is null and longitude is null) or (latitude is not null and longitude is not null));
alter table public.properties drop constraint if exists properties_latitude_range;
alter table public.properties add constraint properties_latitude_range
  check (latitude is null or (latitude between -90 and 90));
alter table public.properties drop constraint if exists properties_longitude_range;
alter table public.properties add constraint properties_longitude_range
  check (longitude is null or (longitude between -180 and 180));
alter table public.properties drop constraint if exists properties_location_precision_valid;
alter table public.properties add constraint properties_location_precision_valid
  check (location_precision in ('verified', 'approximate', 'unknown'));
alter table public.properties drop constraint if exists properties_price_bounds;
alter table public.properties add constraint properties_price_bounds
  check (price_min_myr is null or price_max_myr is null or price_min_myr <= price_max_myr);
alter table public.properties drop constraint if exists properties_price_min_nonnegative;
alter table public.properties add constraint properties_price_min_nonnegative
  check (price_min_myr is null or price_min_myr >= 0);
alter table public.properties drop constraint if exists properties_price_max_nonnegative;
alter table public.properties add constraint properties_price_max_nonnegative
  check (price_max_myr is null or price_max_myr >= 0);
alter table public.properties drop constraint if exists properties_land_area_positive;
alter table public.properties add constraint properties_land_area_positive
  check (land_area is null or land_area > 0);
alter table public.properties drop constraint if exists properties_maintenance_nonnegative;
alter table public.properties add constraint properties_maintenance_nonnegative
  check (monthly_maintenance_myr is null or monthly_maintenance_myr >= 0);
alter table public.properties drop constraint if exists properties_sinking_fund_nonnegative;
alter table public.properties add constraint properties_sinking_fund_nonnegative
  check (sinking_fund_myr is null or sinking_fund_myr >= 0);
alter table public.properties drop constraint if exists properties_parking_bays_nonnegative;
alter table public.properties add constraint properties_parking_bays_nonnegative
  check (parking_bays is null or parking_bays >= 0);
alter table public.properties drop constraint if exists properties_transit_distance_nonnegative;
alter table public.properties add constraint properties_transit_distance_nonnegative
  check (transit_distance_km is null or transit_distance_km >= 0);
alter table public.properties drop constraint if exists properties_transit_time_nonnegative;
alter table public.properties add constraint properties_transit_time_nonnegative
  check (transit_travel_time_min is null or transit_travel_time_min >= 0);
alter table public.properties drop constraint if exists properties_amenity_distance_nonnegative;
alter table public.properties add constraint properties_amenity_distance_nonnegative
  check (amenity_distance_km is null or amenity_distance_km >= 0);

create index if not exists properties_facilities_idx
  on public.properties using gin (facilities);

-- ---------------------------------------------------------------------------
-- 2. Photographs and floor plans
-- ---------------------------------------------------------------------------
create table if not exists public.property_media (
  id                uuid primary key default gen_random_uuid(),
  property_id       text not null references public.properties (id) on delete cascade,
  url               text not null,
  kind              text not null check (kind in ('photo', 'floorplan')),
  caption           text,
  alt_text          text,
  is_cover          boolean not null default false,
  sort_order        integer not null default 0,
  attribution       text,
  permission_status text,
  watermarked_url   text,
  original_url      text,
  storage_path      text,
  created_at        timestamptz not null default now()
);

create index if not exists property_media_property_idx
  on public.property_media (property_id, kind, sort_order);

-- At most one cover photo per property, enforced by the database.
create unique index if not exists property_media_one_cover_idx
  on public.property_media (property_id)
  where is_cover and kind = 'photo';

alter table public.property_media enable row level security;

drop policy if exists property_media_public_read on public.property_media;
create policy property_media_public_read
  on public.property_media
  for select
  to anon, authenticated
  using (
    exists (
      select 1 from public.properties p
      where p.id = property_media.property_id
        and p.is_published
        and property_media.permission_status = 'granted'
    )
  );

drop policy if exists property_media_admin_read on public.property_media;
create policy property_media_admin_read
  on public.property_media
  for select
  to authenticated
  using (public.is_admin());

drop policy if exists property_media_admin_insert on public.property_media;
create policy property_media_admin_insert
  on public.property_media
  for insert
  to authenticated
  with check (public.is_admin());

drop policy if exists property_media_admin_update on public.property_media;
create policy property_media_admin_update
  on public.property_media
  for update
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());

drop policy if exists property_media_admin_delete on public.property_media;
create policy property_media_admin_delete
  on public.property_media
  for delete
  to authenticated
  using (public.is_admin());

-- ---------------------------------------------------------------------------
-- 3. Upsert the four delivered records
-- ---------------------------------------------------------------------------
-- Source: SimePark_Property_Data.json (supplied). Values transcribed verbatim.
-- `location_precision` is 'unknown' because the source has no coordinates.
-- `availability_status` stays 'unknown' because availability was never confirmed.
-- `transit_mode` is NULL: the source does not state whether the reported distance
-- is walking, driving, or route distance.
insert into public.properties (
  id, property_name, location, address,
  price_myr, price_min_myr, price_max_myr, price_basis,
  property_type, bedrooms, bathrooms, built_up_sqft,
  land_area, land_area_unit,
  monthly_maintenance_myr, sinking_fund_myr,
  tenure, completion_date, parking_bays, furnishing_status,
  availability_status, availability_checked_date,
  latitude, longitude, location_precision,
  nearest_transit, transit_distance_km, transit_travel_time_min, transit_mode,
  nearby_amenity, amenity_distance_km, facilities,
  source_url, source_type, source_name, verified_date,
  date_accessed, confirmed_by_role, confidence_status,
  image_permission, notes,
  is_example, is_published
) values
  (
    'SP-001', 'Park View @ Taman Juru Setia', 'Seberang Perai, Penang', 'Jalan Perusahaan Maju 9, Seberang Perai, Penang',
    1100000, null, null, 'asking price',
    'Bungalow', 6, 6, 3738,
    4030, 'sqft',
    null, null,
    'Freehold', '2017', null, 'Fully furnished',
    'unknown', '2026-10-17',
    null, null, 'unknown',
    null, null, null, null,
    'SK PERMAI INDAH; SMT SEBERANG PERAI; DRAGONFLY KINDERGARTEN', null, array['Gym', 'Jogging Track', 'Swimming Pool', 'Kids Playground', 'Guarded & Gated', '24-hour security', 'Bbq', 'Covered car park']::text[],
    'https://www.iproperty.com.my/property/seberang-perai/park-view-taman-juru-setia/sale-502276294/', 'listing portal', 'iProperty.com.my (Listing ID: 502276294)', '2026-10-17',
    '2026-10-17', null, 'indicative',
    'unknown', 'Address: Jalan Perusahaan Maju 9, Seberang Perai, Penang. Subtype: 3 Sty Bungalow. Land psf: RM 272.95. Unit amenities: Air conditioner, Balcony, Bed, Cctv (10 total). Listed on 2026-10-17.',
    false, true
  ),
  (
    'SP-002', 'Bandar Putra Mak Lagam Kemaman', 'Kemaman, Terengganu', null,
    690000, null, null, 'asking price',
    'Semi-Detached', 4, 4, 1800,
    3455, 'sqft',
    null, null,
    'Leasehold', null, null, 'Partially furnished',
    'unknown', '2026-10-17',
    null, null, 'unknown',
    null, null, null, null,
    'TMG Mart Mak Lagam (0.3km); SMK Banggol (0.9km); SK Mak Lagam (1.5km); KKTM Kemaman (1.5km); Bandar Chukai (7.0km); Toll Chukai (15km)', 0.3, array['Gated Guarded 24 hours', 'Playground']::text[],
    'https://www.iproperty.com.my/property/kemaman/bandar-putra-mak-lagam-kemaman/sale-502279244/', 'listing portal', 'iProperty.com.my (Listing ID: 502279244)', '2026-10-17',
    '2026-10-17', null, 'indicative',
    'unknown', 'Subtype: 2-Storey Semi-D (Semi-D 2 Tingkat). Rooms: 4+1 Beds (4 Bilik + 1 Store). Land area stated as 3,455 sqft (RM 199.71 psf) in summary and 321m2 / 3455.22 sqft in description. Leasehold expires 2110 (Open Title). Booking fee: 3.24%. Inclusions: Extended kitchen, laundry room, 3 airconds, bedroom set, kitchen tool, water heater, autogate. Distance measurement method unverified.',
    false, true
  ),
  (
    'SP-003', 'Cappella Embassy', 'Ampang Hilir, Kuala Lumpur', null,
    1114000, 1114000, null, 'starting price',
    'Condominium', 2, 2, 1109,
    9.12, 'acres',
    null, null,
    'needs checking', '2022-02-14', null, 'Partially Furnished',
    'unknown', '2026-10-17',
    null, null, 'unknown',
    'Jelatek LRT', 1.4, 16, null,
    'SK (2) Kuala Ampang; Libyan School; SMK HULU KELANG', null, array['24-hour security', 'Badminton hall', 'Basketball court', 'Bbq']::text[],
    'https://www.iproperty.com.my/new-property/property/kuala-lumpur/cappella-embassy/sale-502215449/', 'listing portal', 'iProperty.com.my (Official Listing ID: 502215449)', '2026-10-17',
    '2026-10-17', null, 'needs checking',
    'unknown', 'Recorded for base Unit Type D2 (1,109 sqft, RM 1,004.51 psf, 2 bed 2 bath); overall project has 2-3 beds, 2-4 baths, 1,109-2,260 sqft (Type D3: 1119 sqft, Type D1: 1152 sqft). Developer: TSLAW Land (formerly D''Rapport Residences). CONFLICTS IN SOURCE: (1) Highlights state ''Freehold & Low Density - Only 440 units with 5 Lifts per floor'', ''4 Rooms + Study Area up to 1050 sqft'', and ''8 Mins to Pavilion Bukit Jalil'', whereas Property Details & About text state ''Leasehold Tenure'', ''1,099 total units'' across five 38-storey towers (6 units/floor), sizes 1,109-2,260 sqft, located in Ampang Hilir. Brochure URL: https://ipp1-cdn.pgimgs.com/projectnet-project/220613/ZPBRO.161870201.pdf | Floor plan URL: https://ipp1-cdn.pgimgs.com/project-listing-unit/500001731/PUFLO.391968670.V550.jpg',
    false, true
  ),
  (
    'SP-004', 'Vogue Suites One', 'KL Eco City, Kuala Lumpur', 'Jalan Bangsar, KL Eco City, Kuala Lumpur',
    850000, null, null, 'asking price',
    'Apartment', 1, 1, 732,
    null, null,
    null, null,
    'Leasehold', '2013', null, 'needs checking',
    'unknown', '2026-10-17',
    null, null, 'unknown',
    'Abdullah Hukum LRT / KTM', 0.3, 4, null,
    'Mid Valley Megamall (0.75km); KL Eco City Mall (3km); Pantai Hospital Kuala Lumpur (3km); SMK Seri Pantai (4km); SJK(T) Bangsar (5km)', 0.75, array['24-hour security', 'Covered car park', 'Jacuzzi', 'Multi-purpose hall', 'Business centre', 'Gymnasium', 'Playground', 'Meditation pavilion', 'Sky bar', 'Swimming pool']::text[],
    'https://www.iproperty.com.my/property/kl-eco-city/vogue-suites-one/sale-101578223/', 'listing portal', 'iProperty.com.my (Listing ID: 101578223)', '2026-10-17',
    '2026-10-17', null, 'needs checking',
    'unknown', 'Address: Jalan Bangsar, KL Eco City, Kuala Lumpur. Original propertyType wording: ''Service Residence for sale'' (also referred to as leasehold condominium in project text); mapped to ''Apartment'' per strict 7-category rule, needs team confirmation. Rooms: 1+1 Beds (Corner unit with 1 Bedroom + 1 Studyroom). Price psf: RM 1,161.20. CONFLICT IN SOURCE: Property details table states ''Partially furnished'', but agent description states ''Bare Fitting''. Other walking transits: Kerinchi LRT (670m, 8 mins), Angkasapuri KTM (740m, 9 mins), Mid Valley KTM (1km, 12 mins). Floor plan URL: https://ipp1-cdn.pgimgs.com/listing/101578223/UFLOO.316834744.V800.jpeg',
    false, true
  )
on conflict (id) do nothing;

-- ---------------------------------------------------------------------------
-- 4. Supplied photographs and floor plans
-- ---------------------------------------------------------------------------
-- IMPORTANT: the ZIP folder names are shifted by one relative to the JSON ids.
-- These rows were mapped by the property NAME in each filename, not by folder:
--   archive SP-001 -> Vogue Suites One        (JSON SP-004)
--   archive SP-002 -> Park View Taman Juru    (JSON SP-001)
--   archive SP-003 -> Bandar Putra Mak Lagam  (JSON SP-002)
--   archive SP-004 -> Cappella Embassy        (JSON SP-003)
-- Images are served from the site's own /media path, so display does not depend
-- on an external image host and listing URLs are never used as image URLs.
create unique index if not exists property_media_property_url_uidx
  on public.property_media (property_id, url);

insert into public.property_media (
  property_id, url, kind, caption, is_cover, sort_order, attribution, permission_status
) values
  ('SP-001', '/media/SP-001/SP-001-photo-1.jpg', 'photo', 'Photograph 1 from the source listing', true, 1, 'Property agent', 'unknown'),
  ('SP-001', '/media/SP-001/SP-001-photo-2.jpg', 'photo', 'Photograph 2 from the source listing', false, 2, 'Property agent', 'unknown'),
  ('SP-001', '/media/SP-001/SP-001-photo-3.jpg', 'photo', 'Photograph 3 from the source listing', false, 3, 'Property agent', 'unknown'),
  ('SP-001', '/media/SP-001/SP-001-photo-4.jpg', 'photo', 'Photograph 4 from the source listing', false, 4, 'Property agent', 'unknown'),
  ('SP-001', '/media/SP-001/SP-001-photo-5.jpg', 'photo', 'Photograph 5 from the source listing', false, 5, 'Property agent', 'unknown'),
  ('SP-002', '/media/SP-002/SP-002-photo-1.jpg', 'photo', 'Photograph 1 from the source listing', true, 1, 'Property agent', 'unknown'),
  ('SP-002', '/media/SP-002/SP-002-photo-2.jpg', 'photo', 'Photograph 2 from the source listing', false, 2, 'Property agent', 'unknown'),
  ('SP-002', '/media/SP-002/SP-002-photo-3.jpg', 'photo', 'Photograph 3 from the source listing', false, 3, 'Property agent', 'unknown'),
  ('SP-002', '/media/SP-002/SP-002-photo-4.jpg', 'photo', 'Photograph 4 from the source listing', false, 4, 'Property agent', 'unknown'),
  ('SP-002', '/media/SP-002/SP-002-photo-5.jpg', 'photo', 'Photograph 5 from the source listing', false, 5, 'Property agent', 'unknown'),
  ('SP-003', '/media/SP-003/SP-003-photo-1.jpg', 'photo', 'Photograph 1 from the source listing', true, 1, 'Property agent', 'unknown'),
  ('SP-003', '/media/SP-003/SP-003-photo-2.jpg', 'photo', 'Photograph 2 from the source listing', false, 2, 'Property agent', 'unknown'),
  ('SP-003', '/media/SP-003/SP-003-photo-3.jpg', 'photo', 'Photograph 3 from the source listing', false, 3, 'Property agent', 'unknown'),
  ('SP-003', '/media/SP-003/SP-003-photo-4.jpg', 'photo', 'Photograph 4 from the source listing', false, 4, 'Property agent', 'unknown'),
  ('SP-003', '/media/SP-003/SP-003-floorplan-1.jpg', 'floorplan', 'Floor plan from the source listing', false, 1, 'Property agent', 'unknown'),
  ('SP-004', '/media/SP-004/SP-004-photo-1.jpg', 'photo', 'Photograph 1 from the source listing', true, 1, 'Property agent', 'unknown'),
  ('SP-004', '/media/SP-004/SP-004-photo-2.jpg', 'photo', 'Photograph 2 from the source listing', false, 2, 'Property agent', 'unknown'),
  ('SP-004', '/media/SP-004/SP-004-photo-3.jpg', 'photo', 'Photograph 3 from the source listing', false, 3, 'Property agent', 'unknown'),
  ('SP-004', '/media/SP-004/SP-004-photo-4.jpg', 'photo', 'Photograph 4 from the source listing', false, 4, 'Property agent', 'unknown'),
  ('SP-004', '/media/SP-004/SP-004-floorplan-1.jpeg', 'floorplan', 'Floor plan excerpt from the source listing', false, 1, 'Property agent', 'unknown')
on conflict (property_id, url) do nothing;

-- ---------------------------------------------------------------------------
-- 5. Private storage bucket for future admin uploads. Public access is granted
-- only for files linked to a published property and explicitly marked granted.
-- ---------------------------------------------------------------------------
do $$
begin
  insert into storage.buckets (id, name, public)
  values ('property-media', 'property-media', false)
  on conflict (id) do nothing;

  begin
    drop policy if exists property_media_objects_public_read on storage.objects;
    create policy property_media_objects_public_read
      on storage.objects for select
      to anon, authenticated
      using (
        bucket_id = 'property-media'
        and exists (
          select 1
          from public.property_media m
          join public.properties p on p.id = m.property_id
          where m.storage_path = storage.objects.name
            and m.permission_status = 'granted'
            and p.is_published
        )
      );
  exception when duplicate_object then null;
  end;

  begin
    create policy property_media_objects_admin_read
      on storage.objects for select
      to authenticated
      using (bucket_id = 'property-media' and public.is_admin());
  exception when duplicate_object then null;
  end;

  begin
    create policy property_media_objects_admin_write
      on storage.objects for insert
      to authenticated
      with check (bucket_id = 'property-media' and public.is_admin());
  exception when duplicate_object then null;
  end;

  begin
    create policy property_media_objects_admin_update
      on storage.objects for update
      to authenticated
      using (bucket_id = 'property-media' and public.is_admin());
  exception when duplicate_object then null;
  end;

  begin
    create policy property_media_objects_admin_delete
      on storage.objects for delete
      to authenticated
      using (bucket_id = 'property-media' and public.is_admin());
  exception when duplicate_object then null;
  end;
exception when insufficient_privilege or undefined_table then
  raise notice 'Storage setup skipped; configure the property-media bucket manually if admin uploads are required.';
end $$;

-- ---------------------------------------------------------------------------
-- Verification
-- ---------------------------------------------------------------------------
do $$
declare
  total integer;
  demo integer;
  media integer;
begin
  select count(*) into total from public.properties;
  select count(*) into demo from public.properties where id like 'demo-%';
  select count(*) into media from public.property_media;

  raise notice 'SimePark catalogue: % propert(ies), % media row(s), legacy demo rows remaining: %', total, media, demo;

  if demo > 0 then
    raise exception 'Legacy demo properties still present after cleanup';
  end if;
  if total <> 4 or exists (
    select 1
    from (values ('SP-001'), ('SP-002'), ('SP-003'), ('SP-004')) expected(id)
    where not exists (select 1 from public.properties p where p.id = expected.id)
  ) then
    raise exception 'Expected exactly SP-001 through SP-004 in the property catalogue; review the database without deleting other records.';
  end if;
end $$;
