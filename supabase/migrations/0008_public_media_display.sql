-- SimePark 0008: Display all property images and media from the dataset
-- Ensure supplied external media records have public visibility and are readable

UPDATE public.property_media
SET visibility = 'public'
WHERE source_kind = 'external';

DROP POLICY IF EXISTS property_media_public_read ON public.property_media;
CREATE POLICY property_media_public_read
  ON public.property_media FOR SELECT TO anon, authenticated
  USING (
    coalesce(permission_status, 'unknown') != 'restricted'
    AND EXISTS (
      SELECT 1 FROM public.properties p
      WHERE p.id = property_media.property_id AND p.is_published
    )
  );
