-- ============================================================================
-- CADENCE FOOTWEAR CPM & MULTI-TENANT SAAS — COMPLETE CONSOLIDATED SCHEMA
-- ============================================================================

-- 1. Enable Required PostgreSQL Extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- 2. Organizations Table (Multi-Tenant SaaS Subscribers)
CREATE TABLE IF NOT EXISTS public.organizations (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name                TEXT NOT NULL,
  slug                TEXT UNIQUE NOT NULL,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Ensure all SaaS, Workspace Code, and Branding columns exist
ALTER TABLE public.organizations ADD COLUMN IF NOT EXISTS org_code TEXT;
ALTER TABLE public.organizations ADD COLUMN IF NOT EXISTS primary_admin_email TEXT;
ALTER TABLE public.organizations ADD COLUMN IF NOT EXISTS is_activated BOOLEAN DEFAULT false;
ALTER TABLE public.organizations ADD COLUMN IF NOT EXISTS subscription_tier TEXT NOT NULL DEFAULT 'pro';
ALTER TABLE public.organizations ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'active';
ALTER TABLE public.organizations ADD COLUMN IF NOT EXISTS logo_url TEXT;
ALTER TABLE public.organizations ADD COLUMN IF NOT EXISTS brand_color TEXT DEFAULT '#0d9488';
ALTER TABLE public.organizations ADD COLUMN IF NOT EXISTS brand_title TEXT;
ALTER TABLE public.organizations ADD COLUMN IF NOT EXISTS brand_tagline TEXT DEFAULT 'Enterprise Ex-Factory CPM Tracker';
ALTER TABLE public.organizations ADD COLUMN IF NOT EXISTS features JSONB NOT NULL DEFAULT '{
  "google_calendar_sync": true,
  "advanced_reports": true,
  "node_mutation": true
}'::jsonb;

-- Seed Default Organization (Apache Footwear)
INSERT INTO public.organizations (id, name, slug, org_code, primary_admin_email, is_activated, subscription_tier, status, brand_title, brand_tagline, brand_color)
VALUES (
  '00000000-0000-0000-0000-000000000001',
  'Apache Footwear Inc',
  'apache-footwear',
  'APACHE',
  'admin@apache.com',
  true,
  'enterprise',
  'active',
  'Cadence - Apache Footwear',
  'adidas Ex-Factory Production Critical Path Tracker',
  '#0d9488'
)
ON CONFLICT (id) DO UPDATE SET
  org_code = 'APACHE',
  primary_admin_email = 'admin@apache.com',
  is_activated = true,
  brand_title = EXCLUDED.brand_title,
  brand_tagline = EXCLUDED.brand_tagline;

CREATE UNIQUE INDEX IF NOT EXISTS idx_organizations_org_code_upper ON public.organizations (UPPER(org_code));

-- 3. Teams Table (Dynamic Company Org Structure)
CREATE TABLE IF NOT EXISTS public.teams (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id              UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  parent_team_id      UUID REFERENCES public.teams(id) ON DELETE CASCADE,
  name                TEXT NOT NULL,
  level_depth         INT NOT NULL DEFAULT 1,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Seed Default Teams for Apache Footwear
INSERT INTO public.teams (id, org_id, parent_team_id, name, level_depth)
VALUES 
  ('11111111-1111-1111-1111-111111111111', '00000000-0000-0000-0000-000000000001', NULL, 'Production Department', 1),
  ('22222222-2222-2222-2222-222222222222', '00000000-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111', 'Stitching Line A', 2),
  ('33333333-3333-3333-3333-333333333333', '00000000-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111', 'Outsole Assembly B', 2)
ON CONFLICT (id) DO NOTHING;

-- 4. Custom Types & Profiles Table
DO $$ BEGIN
  CREATE TYPE user_role AS ENUM ('super_admin', 'org_admin', 'senior_manager', 'junior_manager', 'admin', 'manager', 'editor', 'viewer');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE user_status AS ENUM ('pending', 'approved', 'revoked');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

CREATE TABLE IF NOT EXISTS public.profiles (
  id          UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email       TEXT NOT NULL,
  full_name   TEXT,
  avatar_url  TEXT,
  department  TEXT DEFAULT 'Production',
  role        user_role NOT NULL DEFAULT 'viewer',
  status      user_status NOT NULL DEFAULT 'pending',
  approved_at TIMESTAMPTZ,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS org_id UUID REFERENCES public.organizations(id) ON DELETE SET NULL;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS team_id UUID REFERENCES public.teams(id) ON DELETE SET NULL;

-- 5. Nodes Table (Recursive Milestones & Critical Paths)
CREATE TABLE IF NOT EXISTS public.nodes (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  parent_id           UUID REFERENCES public.nodes(id) ON DELETE CASCADE,
  type                TEXT NOT NULL DEFAULT 'task',
  title               TEXT NOT NULL,
  description         TEXT,
  color               TEXT,
  planned_date        TIMESTAMPTZ,
  actual_date         TIMESTAMPTZ,
  trigger_offset_days INT,
  status              TEXT NOT NULL DEFAULT 'not_started',
  is_critical         BOOLEAN NOT NULL DEFAULT false,
  assignee            TEXT,
  vendor_contact      TEXT,
  department          TEXT DEFAULT 'Production',
  season              TEXT DEFAULT 'SS26',
  sort_order          INT NOT NULL DEFAULT 1,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.nodes ADD COLUMN IF NOT EXISTS org_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE;
ALTER TABLE public.nodes ADD COLUMN IF NOT EXISTS team_id UUID REFERENCES public.teams(id) ON DELETE SET NULL;

-- 6. Reminders Table
CREATE TABLE IF NOT EXISTS public.reminders (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  node_id        UUID NOT NULL REFERENCES public.nodes(id) ON DELETE CASCADE,
  remind_at      TIMESTAMPTZ NOT NULL,
  offset_mode    TEXT NOT NULL DEFAULT 'fixed',
  offset_days    INT,
  message        TEXT NOT NULL,
  note           TEXT,
  is_recurring   BOOLEAN NOT NULL DEFAULT false,
  dismissed_at   TIMESTAMPTZ,
  snoozed_until  TIMESTAMPTZ,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 7. User Feature Entitlements Table
CREATE TABLE IF NOT EXISTS public.user_feature_entitlements (
  user_id     UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  feature_key TEXT NOT NULL,
  enabled     BOOLEAN NOT NULL DEFAULT false,
  PRIMARY KEY (user_id, feature_key)
);

-- 8. Enable Row Level Security (RLS)
ALTER TABLE public.organizations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.teams ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.nodes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.reminders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_feature_entitlements ENABLE ROW LEVEL SECURITY;

-- 9. Open Permissive Policies for App
DROP POLICY IF EXISTS "Allow public access to organizations" ON public.organizations;
CREATE POLICY "Allow public access to organizations" ON public.organizations FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Allow public access to teams" ON public.teams;
CREATE POLICY "Allow public access to teams" ON public.teams FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Allow public access to profiles" ON public.profiles;
CREATE POLICY "Allow public access to profiles" ON public.profiles FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Allow public access to nodes" ON public.nodes;
CREATE POLICY "Allow public access to nodes" ON public.nodes FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Allow public access to reminders" ON public.reminders;
CREATE POLICY "Allow public access to reminders" ON public.reminders FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Allow public access to entitlements" ON public.user_feature_entitlements;
CREATE POLICY "Allow public access to entitlements" ON public.user_feature_entitlements FOR ALL USING (true) WITH CHECK (true);

-- 10. Enable Realtime Publications Safely (Ignore if already member)
DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.nodes;
EXCEPTION WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.reminders;
EXCEPTION WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.profiles;
EXCEPTION WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.organizations;
EXCEPTION WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.teams;
EXCEPTION WHEN duplicate_object THEN null;
END $$;

-- 11. Helper Functions
CREATE OR REPLACE FUNCTION public.get_public_org_branding(p_code TEXT)
RETURNS TABLE (
  org_id UUID,
  org_name TEXT,
  org_code TEXT,
  brand_title TEXT,
  brand_tagline TEXT,
  logo_url TEXT,
  brand_color TEXT,
  is_activated BOOLEAN,
  primary_admin_email TEXT
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT 
    id, 
    name, 
    org_code, 
    COALESCE(brand_title, 'Cadence - ' || name), 
    brand_tagline, 
    logo_url, 
    COALESCE(brand_color, '#0d9488'),
    is_activated,
    primary_admin_email
  FROM public.organizations
  WHERE UPPER(org_code) = UPPER(p_code) AND status = 'active'
  LIMIT 1;
$$;

-- 12. Helper Admin Check
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid() AND (role = 'super_admin' OR role = 'admin' OR role = 'org_admin')
  );
$$;

-- Notify PostgREST to reload schema cache
NOTIFY pgrst, 'reload schema';
