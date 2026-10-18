-- ============================================================================
-- SimePark — 0005 prototype public media display
-- ============================================================================
-- Prototype display policy: photographs and floor plans for published
-- properties are visible even when permission_status is "unknown".
--
-- This is NOT a claim that redistribution rights have been granted. Attribution
-- and permission_status remain on each row. Existing watermarks are untouched.
--
-- Idempotent. Does not delete user data or change administrator grants.
-- ============================================================================

drop policy if exists property_media_public_read on public.property_media;
create policy property_media_public_read
  on public.property_media
  for select
  to anon, authenticated
  using (
    exists (
      select 1
      from public.properties p
      where p.id = property_media.property_id
        and p.is_published
    )
  );
