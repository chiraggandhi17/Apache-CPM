-- ============================================================================
-- CADENCE CPM: FULL PRODUCTION SCHEMA (Combined Single-File Script)
-- Includes: Recursive Nodes, Reminders, Date Cascade RPC, Today Feed RPC,
-- RLS Security, Seed Data, and Migration 00005 (RBAC, Admin Approval & Modular Features)
-- ============================================================================

-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "ltree";

-- 1. Create Enums
DO $$ BEGIN
  CREATE TYPE user_role AS ENUM ('admin', 'manager', 'editor', 'viewer');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE TYPE user_status AS ENUM ('pending', 'approved', 'revoked');
EXCEPTION WHEN duplicate_object THEN null; END $$;

-- 2. Profiles Table
CREATE TABLE IF NOT EXISTS public.profiles (
  id                  UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email               TEXT NOT NULL,
  full_name           TEXT,
  avatar_url          TEXT,
  department          TEXT,
  role                user_role NOT NULL DEFAULT 'viewer',
  status              user_status NOT NULL DEFAULT 'pending',
  approved_at         TIMESTAMPTZ,
  approved_by         UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 3. Features & User Entitlements
CREATE TABLE IF NOT EXISTS public.features (
  key                 TEXT PRIMARY KEY,
  name                TEXT NOT NULL,
  description         TEXT,
  default_roles       user_role[] NOT NULL DEFAULT '{}',
  is_active           BOOLEAN NOT NULL DEFAULT true,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.user_feature_entitlements (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id             UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  feature_key         TEXT NOT NULL REFERENCES public.features(key) ON DELETE CASCADE,
  enabled             BOOLEAN NOT NULL DEFAULT true,
  granted_by          UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  granted_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(user_id, feature_key)
);

-- 4. Nodes Table
CREATE TABLE IF NOT EXISTS public.nodes (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  parent_id           UUID REFERENCES public.nodes(id) ON DELETE CASCADE,
  type                TEXT NOT NULL CHECK (type IN ('department', 'season', 'project', 'task', 'subtask', 'reminder')),
  title               TEXT NOT NULL,
  description         TEXT,
  color               TEXT,
  planned_date        TIMESTAMPTZ,
  actual_date         TIMESTAMPTZ,
  trigger_offset_days INT,
  status              TEXT NOT NULL DEFAULT 'not_started' CHECK (status IN ('not_started', 'in_progress', 'done', 'blocked')),
  is_critical         BOOLEAN NOT NULL DEFAULT false,
  assignee            TEXT,
  vendor_contact      TEXT,
  department          TEXT,
  season              TEXT,
  sort_order          INT NOT NULL DEFAULT 1,
  path                ltree,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 5. Reminders Table
CREATE TABLE IF NOT EXISTS public.reminders (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  node_id             UUID NOT NULL REFERENCES public.nodes(id) ON DELETE CASCADE,
  remind_at           TIMESTAMPTZ NOT NULL,
  offset_mode         TEXT NOT NULL DEFAULT 'relative' CHECK (offset_mode IN ('relative', 'fixed')),
  offset_days         INT,
  message             TEXT NOT NULL,
  note                TEXT,
  is_recurring        BOOLEAN NOT NULL DEFAULT false,
  dismissed_at        TIMESTAMPTZ,
  snoozed_until       TIMESTAMPTZ,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Seed Features
INSERT INTO public.features (key, name, description, default_roles)
VALUES
  ('base_tier', 'Base CPM Timeline', 'Browse milestone hierarchy and feeds', '{admin,manager,editor,viewer}'),
  ('node_mutation', 'Create & Edit Milestones', 'Ability to create, update, or delete tasks', '{admin,manager,editor}'),
  ('google_calendar_sync', 'Google Calendar Integration', 'Export milestones & 2-way Google Calendar sync', '{admin,manager}'),
  ('advanced_reports', 'Advanced CPM Variance Reports', 'Executive bottleneck analytics', '{admin,manager}'),
  ('admin_management', 'Admin Control Center', 'User access approval & feature entitlements', '{admin}')
ON CONFLICT (key) DO NOTHING;

-- Security Definer Helpers
CREATE OR REPLACE FUNCTION public.get_auth_status(p_user_id UUID DEFAULT auth.uid())
RETURNS user_status LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT status FROM public.profiles WHERE id = p_user_id;
$$;

CREATE OR REPLACE FUNCTION public.is_admin(p_user_id UUID DEFAULT auth.uid())
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.profiles WHERE id = p_user_id AND role = 'admin' AND status = 'approved');
$$;

CREATE OR REPLACE FUNCTION public.has_feature(p_feature_key TEXT, p_user_id UUID DEFAULT auth.uid())
RETURNS BOOLEAN LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_status user_status; v_role user_role; v_override BOOLEAN; v_feature_active BOOLEAN; v_default_roles user_role[];
BEGIN
  SELECT status, role INTO v_status, v_role FROM public.profiles WHERE id = p_user_id;
  IF v_status != 'approved' THEN RETURN false; END IF;

  SELECT is_active, default_roles INTO v_feature_active, v_default_roles FROM public.features WHERE key = p_feature_key;
  IF NOT FOUND OR NOT v_feature_active THEN RETURN false; END IF;

  SELECT enabled INTO v_override FROM public.user_feature_entitlements WHERE user_id = p_user_id AND feature_key = p_feature_key;
  IF v_override IS NOT NULL THEN RETURN v_override; END IF;

  RETURN (v_role = ANY(v_default_roles));
END;
$$;

-- Admin RPC Procedures
CREATE OR REPLACE FUNCTION public.admin_set_user_status(p_target_user_id UUID, p_new_status user_status, p_assigned_role user_role DEFAULT NULL)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.is_admin() THEN RAISE EXCEPTION 'Unauthorized'; END IF;
  UPDATE public.profiles
  SET status = p_new_status, role = COALESCE(p_assigned_role, role),
      approved_at = CASE WHEN p_new_status = 'approved' THEN now() ELSE NULL END,
      approved_by = CASE WHEN p_new_status = 'approved' THEN auth.uid() ELSE NULL END,
      updated_at = now()
  WHERE id = p_target_user_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_toggle_feature_entitlement(p_target_user_id UUID, p_feature_key TEXT, p_enabled BOOLEAN)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.is_admin() THEN RAISE EXCEPTION 'Unauthorized'; END IF;
  INSERT INTO public.user_feature_entitlements (user_id, feature_key, enabled, granted_by, granted_at)
  VALUES (p_target_user_id, p_feature_key, p_enabled, auth.uid(), now())
  ON CONFLICT (user_id, feature_key) DO UPDATE SET enabled = p_enabled, granted_by = auth.uid(), granted_at = now();
END;
$$;
