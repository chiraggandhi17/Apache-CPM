-- ============================================================================
-- CADENCE CPM: MIGRATION 00007 — WHITE-LABEL CUSTOM BRANDING & CO-TITLE ENGINE
-- ============================================================================

ALTER TABLE public.organizations ADD COLUMN IF NOT EXISTS logo_url TEXT;
ALTER TABLE public.organizations ADD COLUMN IF NOT EXISTS brand_color TEXT DEFAULT '#0d9488';
ALTER TABLE public.organizations ADD COLUMN IF NOT EXISTS brand_title TEXT;
ALTER TABLE public.organizations ADD COLUMN IF NOT EXISTS brand_tagline TEXT DEFAULT 'Enterprise Ex-Factory CPM Tracker';

-- Update Default Organization Apache Footwear with Co-Brand Defaults
UPDATE public.organizations
SET 
  brand_title = 'Cadence - Apache Footwear',
  brand_tagline = 'adidas Ex-Factory Production Critical Path Tracker',
  brand_color = '#0d9488'
WHERE id = '00000000-0000-0000-0000-000000000001';
