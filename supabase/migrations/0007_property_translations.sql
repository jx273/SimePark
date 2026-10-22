-- Add optional JSONB column for multi-language translations (ms, zh)
-- Default to empty object '{}'::jsonb so existing queries and RLS function seamlessly.

ALTER TABLE public.properties
ADD COLUMN IF NOT EXISTS translations JSONB DEFAULT '{}'::jsonb;

COMMENT ON COLUMN public.properties.translations IS 'Optional multi-language translation overrides (e.g. { "ms": { ... }, "zh": { ... } })';
