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
  subscription_tier   TEXT NOT NULL DEFAULT 'enterprise' CHECK (subscription_tier IN ('starter', 'pro', 'enterprise')),
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
ALTER TABLE public.organizations ADD COLUMN IF NOT EXISTS subscription_tier TEXT NOT NULL DEFAULT 'enterprise';
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
  default_role        TEXT NOT NULL DEFAULT 'level_2',
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.teams ADD COLUMN IF NOT EXISTS default_role TEXT NOT NULL DEFAULT 'level_2';

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
  CREATE TYPE user_role AS ENUM ('super_admin', 'org_admin', 'level_1', 'level_2', 'level_3', 'senior_manager', 'junior_manager', 'admin', 'manager', 'editor', 'viewer');
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
  role            TEXT NOT NULL DEFAULT 'level_2',
  status          TEXT NOT NULL DEFAULT 'approved',
  account_type    TEXT NOT NULL DEFAULT 'organization_member' CHECK (account_type IN ('individual', 'organization_member')),
  tier            TEXT NOT NULL DEFAULT 'tier_1' CHECK (tier IN ('tier_1', 'tier_2', 'tier_3')),
  approved_at     TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS org_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE;
ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS profiles_org_id_fkey;
ALTER TABLE public.profiles ADD CONSTRAINT profiles_org_id_fkey FOREIGN KEY (org_id) REFERENCES public.organizations(id) ON DELETE CASCADE;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS team_id UUID REFERENCES public.teams(id) ON DELETE SET NULL;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS custom_role_id UUID REFERENCES public.custom_roles(id) ON DELETE SET NULL;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS account_type TEXT NOT NULL DEFAULT 'organization_member';
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS tier TEXT NOT NULL DEFAULT 'tier_1';

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
ALTER TABLE public.nodes ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE;

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

CREATE INDEX IF NOT EXISTS idx_node_audit_logs_node_id ON public.node_audit_logs(node_id);
CREATE INDEX IF NOT EXISTS idx_node_audit_logs_org_id ON public.node_audit_logs(org_id);
CREATE INDEX IF NOT EXISTS idx_node_audit_logs_created ON public.node_audit_logs(created_at DESC);

-- 8. Reminders & Alerts Table
CREATE TABLE IF NOT EXISTS public.reminders (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  node_id             UUID NOT NULL REFERENCES public.nodes(id) ON DELETE CASCADE,
  remind_at           TIMESTAMPTZ NOT NULL,
  offset_mode         TEXT DEFAULT 'relative',
  offset_days         INT,
  message             TEXT NOT NULL,
  note                TEXT,
  is_recurring        BOOLEAN NOT NULL DEFAULT false,
  snoozed_until       TIMESTAMPTZ,
  dismissed_at        TIMESTAMPTZ,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Ensure all columns exist if reminders table pre-existed in DB
ALTER TABLE public.reminders ADD COLUMN IF NOT EXISTS note TEXT;
ALTER TABLE public.reminders ADD COLUMN IF NOT EXISTS offset_mode TEXT DEFAULT 'relative';
ALTER TABLE public.reminders ADD COLUMN IF NOT EXISTS offset_days INT;
ALTER TABLE public.reminders ADD COLUMN IF NOT EXISTS is_recurring BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE public.reminders ADD COLUMN IF NOT EXISTS snoozed_until TIMESTAMPTZ;
ALTER TABLE public.reminders ADD COLUMN IF NOT EXISTS dismissed_at TIMESTAMPTZ;

-- 9. Modular Feature Entitlements Table
CREATE TABLE IF NOT EXISTS public.user_feature_entitlements (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id             UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  feature_key         TEXT NOT NULL,
  enabled             BOOLEAN NOT NULL DEFAULT true,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, feature_key)
);

-- 10. Tier Upgrade Requests Table (Super Admin Approval Engine)
CREATE TABLE IF NOT EXISTS public.tier_upgrade_requests (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id             UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  user_email          TEXT NOT NULL,
  user_name           TEXT,
  org_id              UUID REFERENCES public.organizations(id) ON DELETE SET NULL,
  org_name            TEXT,
  requested_tier      TEXT NOT NULL CHECK (requested_tier IN ('tier_1', 'tier_2', 'tier_3')),
  current_tier        TEXT NOT NULL,
  status              TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  notes               TEXT,
  reviewed_by         UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  reviewed_at         TIMESTAMPTZ,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_tier_upgrade_requests_status ON public.tier_upgrade_requests(status);

-- 11. Atomic Server-Side Procedure: cascade_dates
DROP FUNCTION IF EXISTS public.cascade_dates(uuid, timestamptz);
CREATE OR REPLACE FUNCTION cascade_dates(
  p_node_id UUID,
  p_new_planned_date TIMESTAMPTZ
)
RETURNS VOID AS $$
BEGIN
  UPDATE public.nodes
  SET planned_date = p_new_planned_date,
      updated_at = now()
  WHERE id = p_node_id;

  IF p_new_planned_date IS NOT NULL THEN
    WITH RECURSIVE descendant_tree AS (
      SELECT 
        id,
        p_new_planned_date as parent_effective_date
      FROM public.nodes
      WHERE id = p_node_id

      UNION ALL

      SELECT 
        c.id,
        (dt.parent_effective_date + (COALESCE(c.trigger_offset_days, 0) || ' days')::interval) as parent_effective_date
      FROM public.nodes c
      JOIN descendant_tree dt ON c.parent_id = dt.id
      WHERE c.trigger_offset_days IS NOT NULL
    )
    UPDATE public.nodes n
    SET planned_date = dt.parent_effective_date,
        updated_at = now()
    FROM descendant_tree dt
    WHERE n.id = dt.id
      AND n.id <> p_node_id;
  END IF;
END;
$$ LANGUAGE plpgsql;

-- 12. Helper Function: get_public_org_branding
DROP FUNCTION IF EXISTS public.get_public_org_branding(text);
CREATE OR REPLACE FUNCTION get_public_org_branding(p_code TEXT)
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
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    o.id,
    o.name,
    o.org_code,
    COALESCE(o.brand_title, 'Cadence - ' || o.name),
    COALESCE(o.brand_tagline, 'Enterprise Ex-Factory CPM Tracker'),
    o.logo_url,
    COALESCE(o.brand_color, '#0d9488'),
    COALESCE(o.is_activated, false),
    o.primary_admin_email
  FROM public.organizations o
  WHERE UPPER(o.org_code) = UPPER(TRIM(p_code))
    AND o.status = 'active'
  LIMIT 1;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 13. Enable Row Level Security (RLS)
ALTER TABLE public.organizations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.teams ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.custom_roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.nodes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.node_audit_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.reminders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_feature_entitlements ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tier_upgrade_requests ENABLE ROW LEVEL SECURITY;

-- Permissive authenticated RLS policies
DROP POLICY IF EXISTS "Allow authenticated full access to organizations" ON public.organizations;
CREATE POLICY "Allow authenticated full access to organizations" ON public.organizations FOR ALL TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Allow anon public lookup of active organizations" ON public.organizations;
CREATE POLICY "Allow anon public lookup of active organizations" ON public.organizations FOR SELECT TO anon USING (status = 'active');

DROP POLICY IF EXISTS "Allow authenticated full access to teams" ON public.teams;
CREATE POLICY "Allow authenticated full access to teams" ON public.teams FOR ALL TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Allow authenticated full access to custom_roles" ON public.custom_roles;
CREATE POLICY "Allow authenticated full access to custom_roles" ON public.custom_roles FOR ALL TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Allow authenticated full access to profiles" ON public.profiles;
CREATE POLICY "Allow authenticated full access to profiles" ON public.profiles FOR ALL TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Allow authenticated full access to nodes" ON public.nodes;
CREATE POLICY "Allow authenticated full access to nodes" ON public.nodes FOR ALL TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Allow authenticated full access to node_audit_logs" ON public.node_audit_logs;
CREATE POLICY "Allow authenticated full access to node_audit_logs" ON public.node_audit_logs FOR ALL TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Allow authenticated full access to reminders" ON public.reminders;
CREATE POLICY "Allow authenticated full access to reminders" ON public.reminders FOR ALL TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Allow public full access to reminders" ON public.reminders;
CREATE POLICY "Allow public full access to reminders" ON public.reminders FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Allow authenticated full access to user_feature_entitlements" ON public.user_feature_entitlements;
CREATE POLICY "Allow authenticated full access to user_feature_entitlements" ON public.user_feature_entitlements FOR ALL TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Allow authenticated full access to tier_upgrade_requests" ON public.tier_upgrade_requests;
CREATE POLICY "Allow authenticated full access to tier_upgrade_requests" ON public.tier_upgrade_requests FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- 14. Realtime Publication Setup (Duplicate-Safe)
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
    CREATE PUBLICATION supabase_realtime;
  END IF;

  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.organizations;
  EXCEPTION WHEN duplicate_object THEN null;
  END;

  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.teams;
  EXCEPTION WHEN duplicate_object THEN null;
  END;

  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.custom_roles;
  EXCEPTION WHEN duplicate_object THEN null;
  END;

  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.profiles;
  EXCEPTION WHEN duplicate_object THEN null;
  END;

  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.nodes;
  EXCEPTION WHEN duplicate_object THEN null;
  END;

  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.node_audit_logs;
  EXCEPTION WHEN duplicate_object THEN null;
  END;

  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.reminders;
  EXCEPTION WHEN duplicate_object THEN null;
  END;

  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.user_feature_entitlements;
  EXCEPTION WHEN duplicate_object THEN null;
  END;

  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.tier_upgrade_requests;
  EXCEPTION WHEN duplicate_object THEN null;
  END;
END $$;
