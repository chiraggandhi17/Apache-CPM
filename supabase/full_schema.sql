-- ============================================================================
-- CADENCE FOOTWEAR CPM & MULTI-TENANT SAAS — COMPLETE MASTER SCHEMA
-- ============================================================================

-- 1. Enable Required PostgreSQL Extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- 2. Organizations Table (Multi-Tenant SaaS Subscribers)
CREATE TABLE IF NOT EXISTS public.organizations (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name                TEXT NOT NULL,
  slug                TEXT UNIQUE NOT NULL,
  org_code            TEXT,
  primary_admin_email TEXT,
  is_activated        BOOLEAN DEFAULT false,
  subscription_tier   TEXT NOT NULL DEFAULT 'pro' CHECK (subscription_tier IN ('starter', 'pro', 'enterprise')),
  status              TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'suspended', 'cancelled')),
  logo_url            TEXT,
  brand_color         TEXT DEFAULT '#0d9488',
  brand_title         TEXT,
  brand_tagline       TEXT DEFAULT 'Enterprise Ex-Factory CPM Tracker',
  features            JSONB NOT NULL DEFAULT '{
    "google_calendar_sync": true,
    "advanced_reports": true,
    "node_mutation": true
  }'::jsonb,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

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

CREATE UNIQUE INDEX IF NOT EXISTS idx_organizations_org_code_upper ON public.organizations (UPPER(org_code));

-- 3. Teams Table (Dynamic Company Org Structure)
CREATE TABLE IF NOT EXISTS public.teams (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id              UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  parent_team_id      UUID REFERENCES public.teams(id) ON DELETE CASCADE,
  name                TEXT NOT NULL,
  level_depth         INT NOT NULL DEFAULT 1,
  default_role        TEXT NOT NULL DEFAULT 'junior_manager',
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.teams ADD COLUMN IF NOT EXISTS default_role TEXT NOT NULL DEFAULT 'junior_manager';

-- 4. Custom Roles Table (Dynamic Job Titles & Access Scopes)
CREATE TABLE IF NOT EXISTS public.custom_roles (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id            UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  name              TEXT NOT NULL,
  access_scope      TEXT NOT NULL DEFAULT 'scoped_subtrees' CHECK (access_scope IN ('full_tree', 'scoped_subtrees', 'read_only')),
  can_create_tasks  BOOLEAN NOT NULL DEFAULT true,
  can_shift_dates   BOOLEAN NOT NULL DEFAULT true,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 5. Custom Types & Profiles Table
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
  id              UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email           TEXT NOT NULL,
  full_name       TEXT,
  avatar_url      TEXT,
  department      TEXT DEFAULT 'Production',
  role            user_role NOT NULL DEFAULT 'viewer',
  status          user_status NOT NULL DEFAULT 'pending',
  approved_at     TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS org_id UUID REFERENCES public.organizations(id) ON DELETE SET NULL;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS team_id UUID REFERENCES public.teams(id) ON DELETE SET NULL;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS custom_role_id UUID REFERENCES public.custom_roles(id) ON DELETE SET NULL;

-- 6. Nodes Table (Recursive Milestones & Critical Paths)
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

-- 7. Node Activity Audit Logs Table
CREATE TABLE IF NOT EXISTS public.node_audit_logs (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  node_id         UUID NOT NULL REFERENCES public.nodes(id) ON DELETE CASCADE,
  org_id          UUID REFERENCES public.organizations(id) ON DELETE CASCADE,
  user_id         UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  user_email      TEXT NOT NULL,
  user_name       TEXT,
  action          TEXT NOT NULL,
  change_summary  TEXT NOT NULL,
  previous_values JSONB,
  new_values      JSONB,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_node_audit_logs_node_id ON public.node_audit_logs (node_id, created_at DESC);

-- 8. Reminders Table
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

-- 9. User Feature Entitlements Table
CREATE TABLE IF NOT EXISTS public.user_feature_entitlements (
  user_id     UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  feature_key TEXT NOT NULL,
  enabled     BOOLEAN NOT NULL DEFAULT false,
  PRIMARY KEY (user_id, feature_key)
);

-- 10. Enable Row Level Security (RLS)
ALTER TABLE public.organizations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.teams ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.custom_roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.nodes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.node_audit_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.reminders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_feature_entitlements ENABLE ROW LEVEL SECURITY;

-- 11. Open Permissive Policies for App
DROP POLICY IF EXISTS "Allow public access to organizations" ON public.organizations;
CREATE POLICY "Allow public access to organizations" ON public.organizations FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Allow public access to teams" ON public.teams;
CREATE POLICY "Allow public access to teams" ON public.teams FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Allow public access to custom roles" ON public.custom_roles;
CREATE POLICY "Allow public access to custom roles" ON public.custom_roles FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Allow public access to profiles" ON public.profiles;
CREATE POLICY "Allow public access to profiles" ON public.profiles FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Allow public access to nodes" ON public.nodes;
CREATE POLICY "Allow public access to nodes" ON public.nodes FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Allow public access to audit logs" ON public.node_audit_logs;
CREATE POLICY "Allow public access to audit logs" ON public.node_audit_logs FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Allow public access to reminders" ON public.reminders;
CREATE POLICY "Allow public access to reminders" ON public.reminders FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Allow public access to entitlements" ON public.user_feature_entitlements;
CREATE POLICY "Allow public access to entitlements" ON public.user_feature_entitlements FOR ALL USING (true) WITH CHECK (true);

-- 12. Enable Realtime Publications Safely
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

DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.node_audit_logs;
EXCEPTION WHEN duplicate_object THEN null;
END $$;

-- 13. Cascade Dates RPC Function
CREATE OR REPLACE FUNCTION cascade_dates(
  p_node_id UUID,
  p_new_planned_date TIMESTAMPTZ
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- 1. Update target node planned_date
  UPDATE public.nodes
  SET planned_date = p_new_planned_date, updated_at = now()
  WHERE id = p_node_id;

  -- 2. Recalculate relative dates for all descendants with trigger_offset_days
  WITH RECURSIVE node_tree AS (
    SELECT 
      n.id,
      n.parent_id,
      n.trigger_offset_days,
      p_new_planned_date AS parent_date
    FROM public.nodes n
    WHERE n.parent_id = p_node_id

    UNION ALL

    SELECT 
      child.id,
      child.parent_id,
      child.trigger_offset_days,
      (
        CASE 
          WHEN parent_step.trigger_offset_days IS NOT NULL 
          THEN parent_step.parent_date + (parent_step.trigger_offset_days || ' days')::INTERVAL
          ELSE (SELECT planned_date FROM public.nodes WHERE id = parent_step.id)
        END
      ) AS parent_date
    FROM public.nodes child
    JOIN node_tree parent_step ON child.parent_id = parent_step.id
  )
  UPDATE public.nodes n
  SET planned_date = nt.parent_date + (nt.trigger_offset_days || ' days')::INTERVAL, updated_at = now()
  FROM node_tree nt
  WHERE n.id = nt.id
    AND nt.trigger_offset_days IS NOT NULL;

  -- 3. Update any reminders attached to affected nodes
  WITH RECURSIVE affected_nodes AS (
    SELECT id, planned_date FROM public.nodes WHERE id = p_node_id
    UNION ALL
    SELECT child.id, child.planned_date
    FROM public.nodes child
    JOIN affected_nodes p ON child.parent_id = p.id
  )
  UPDATE public.reminders r
  SET remind_at = an.planned_date + (r.offset_days || ' days')::INTERVAL, updated_at = now()
  FROM affected_nodes an
  WHERE r.node_id = an.id
    AND r.offset_days IS NOT NULL
    AND an.planned_date IS NOT NULL;
END;
$$;

-- 14. Branding Helper Function
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

-- 15. Helper Admin Check
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
