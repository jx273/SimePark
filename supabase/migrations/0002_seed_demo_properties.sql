-- ============================================================================
-- SimePark — 0002 legacy seed (SUPERSEDED — cleanup only)
-- ============================================================================
-- This file previously seeded 15 fictitious demonstration properties
-- (demo-001 .. demo-015). It is now a no-op so those records cannot reappear.
--
-- The file is kept (rather than deleted) because migration history is
-- append-only. Its body is a no-op, so a fresh migration chain cannot recreate
-- the fictitious data. Existing legacy rows are handled by the guarded 0004.
--
-- The delivered catalogue (SP-001 .. SP-004) is imported by
-- 0004_property_catalogue.sql, after the schema has been extended for the source
-- fields. Nothing is inserted here.
--
-- Do not delete records here: the later catalogue migration performs a guarded,
-- explicit-ID cleanup and aborts if any user-owned rows still reference them.
-- ============================================================================

select 1;
