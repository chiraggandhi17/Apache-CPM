-- ============================================================================
-- CADENCE CPM: MIGRATION 00006 — MULTI-TENANT SAAS & TEAM INHERITED VISIBILITY
-- ============================================================================

-- 1. Create Organizations Table (Client SaaS Subscribers)
CREATE TABLE IF NOT EXISTS public.organizations (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name                TEXT NOT NULL,
  slug                TEXT UNIQUE NOT NULL,
  subscription_tier   TEXT NOT NULL DEFAULT 'pro' CHECK (subscription_tier IN ('starter', 'pro', 'enterprise')),
  status              TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'suspended')),
  features            JSONB NOT NULL DEFAULT '{
    "google_calendar_sync": true,
    "advanced_reports": true,
    "node_mutation": true
  }'::jsonb,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Seed Default Organization
INSERT INTO public.organizations (id, name, slug, subscription_tier, status)
VALUES ('00000000-0000-0000-0000-000000000001', 'Apache Footwear Inc', 'apache-footwear', 'enterprise', 'active')
ON CONFLICT (id) DO NOTHING;

-- 2. Create Teams Table (Dynamic Company Org Structure)
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

-- 3. Add SaaS Fields to Profiles & Nodes
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS org_id UUID REFERENCES public.organizations(id) ON DELETE SET NULL;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS team_id UUID REFERENCES public.teams(id) ON DELETE SET NULL;

ALTER TABLE public.nodes ADD COLUMN IF NOT EXISTS org_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE;
ALTER TABLE public.nodes ADD COLUMN IF NOT EXISTS team_id UUID REFERENCES public.teams(id) ON DELETE SET NULL;

-- Default existing profiles and nodes to Default Org
UPDATE public.profiles SET org_id = '00000000-0000-0000-0000-000000000001' WHERE org_id IS NULL;
UPDATE public.nodes SET org_id = '00000000-0000-0000-0000-000000000001' WHERE org_id IS NULL;

-- 4. Inherited Team Visibility Function (Recursive Team Tree Walker)
CREATE OR REPLACE FUNCTION public.get_user_visible_team_ids(p_user_id UUID DEFAULT auth.uid())
RETURNS TABLE (team_id UUID)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_user_team_id UUID;
BEGIN
  SELECT profiles.team_id INTO v_user_team_id FROM public.profiles WHERE id = p_user_id;
  
  IF v_user_team_id IS NULL THEN
    RETURN;
  END IF;

  -- Recursively return user's team + all descendant sub-teams
  RETURN QUERY
  WITH RECURSIVE team_hierarchy AS (
    SELECT t.id FROM public.teams t WHERE t.id = v_user_team_id
    UNION ALL
    SELECT child.id FROM public.teams child
    JOIN team_hierarchy th ON child.parent_team_id = th.id
  )
  SELECT th.id FROM team_hierarchy th;
END;
$$;

-- 5. Super Admin & Org Admin RPC Actions
CREATE OR REPLACE FUNCTION public.super_admin_create_organization(
  p_name TEXT,
  p_slug TEXT,
  p_subscription_tier TEXT DEFAULT 'pro'
)
RETURNS UUID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_new_id UUID;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Unauthorized: Only Super Admins can create organizations';
  END IF;

  INSERT INTO public.organizations (name, slug, subscription_tier)
  VALUES (p_name, p_slug, p_subscription_tier)
  RETURNING id INTO v_new_id;

  RETURN v_new_id;
END;
$$;
