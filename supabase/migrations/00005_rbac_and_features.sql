-- ============================================================================
-- CADENCE CPM: MIGRATION 00005 — RBAC, ADMIN APPROVAL & MODULAR FEATURES
-- ============================================================================

-- 1. Create Enums
DO $$ BEGIN
  CREATE TYPE user_role AS ENUM ('admin', 'manager', 'editor', 'viewer');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE user_status AS ENUM ('pending', 'approved', 'revoked');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

-- 2. Profiles Table (App Users)
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

CREATE INDEX IF NOT EXISTS idx_profiles_status ON public.profiles(status);
CREATE INDEX IF NOT EXISTS idx_profiles_role ON public.profiles(role);

-- 3. Features Table & User Entitlements
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

CREATE INDEX IF NOT EXISTS idx_user_features_user_id ON public.user_feature_entitlements(user_id);

-- Seed Features
INSERT INTO public.features (key, name, description, default_roles)
VALUES
  ('base_tier', 'Base CPM Timeline', 'Browse milestone hierarchy and feeds', '{admin,manager,editor,viewer}'),
  ('node_mutation', 'Create & Edit Milestones', 'Ability to create, update, or delete tasks', '{admin,manager,editor}'),
  ('google_calendar_sync', 'Google Calendar Integration', 'Export milestones & 2-way Google Calendar sync', '{admin,manager}'),
  ('advanced_reports', 'Advanced CPM Variance Reports', 'Executive bottleneck analytics', '{admin,manager}'),
  ('admin_management', 'Admin Control Center', 'User access approval & feature entitlements', '{admin}')
ON CONFLICT (key) DO NOTHING;

-- 4. Trigger: Handle New User Signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
DECLARE
  v_is_first_user BOOLEAN;
BEGIN
  SELECT (COUNT(*) = 0) INTO v_is_first_user FROM public.profiles;

  INSERT INTO public.profiles (
    id,
    email,
    full_name,
    avatar_url,
    role,
    status,
    approved_at
  )
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'full_name', split_part(NEW.email, '@', 1)),
    NEW.raw_user_meta_data->>'avatar_url',
    CASE WHEN v_is_first_user THEN 'admin'::user_role ELSE 'viewer'::user_role END,
    CASE WHEN v_is_first_user THEN 'approved'::user_status ELSE 'pending'::user_status END,
    CASE WHEN v_is_first_user THEN now() ELSE NULL END
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- 5. Security Definer Helper Functions (Recursion Free)
CREATE OR REPLACE FUNCTION public.get_auth_status(p_user_id UUID DEFAULT auth.uid())
RETURNS user_status
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT status FROM public.profiles WHERE id = p_user_id;
$$;

CREATE OR REPLACE FUNCTION public.get_auth_role(p_user_id UUID DEFAULT auth.uid())
RETURNS user_role
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT role FROM public.profiles WHERE id = p_user_id;
$$;

CREATE OR REPLACE FUNCTION public.is_admin(p_user_id UUID DEFAULT auth.uid())
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles 
    WHERE id = p_user_id AND role = 'admin' AND status = 'approved'
  );
$$;

CREATE OR REPLACE FUNCTION public.has_feature(p_feature_key TEXT, p_user_id UUID DEFAULT auth.uid())
RETURNS BOOLEAN
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_status user_status;
  v_role user_role;
  v_override BOOLEAN;
  v_feature_active BOOLEAN;
  v_default_roles user_role[];
BEGIN
  SELECT status, role INTO v_status, v_role FROM public.profiles WHERE id = p_user_id;
  IF v_status != 'approved' THEN
    RETURN false;
  END IF;

  SELECT is_active, default_roles INTO v_feature_active, v_default_roles 
  FROM public.features WHERE key = p_feature_key;
  
  IF NOT FOUND OR NOT v_feature_active THEN
    RETURN false;
  END IF;

  SELECT enabled INTO v_override 
  FROM public.user_feature_entitlements 
  WHERE user_id = p_user_id AND feature_key = p_feature_key;

  IF v_override IS NOT NULL THEN
    RETURN v_override;
  END IF;

  RETURN (v_role = ANY(v_default_roles));
END;
$$;

-- 6. Admin RPC Action Procedures
CREATE OR REPLACE FUNCTION public.admin_set_user_status(
  p_target_user_id UUID,
  p_new_status user_status,
  p_assigned_role user_role DEFAULT NULL
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Unauthorized: Only active Admins can approve or alter user status';
  END IF;

  UPDATE public.profiles
  SET 
    status = p_new_status,
    role = COALESCE(p_assigned_role, role),
    approved_at = CASE WHEN p_new_status = 'approved' THEN now() ELSE NULL END,
    approved_by = CASE WHEN p_new_status = 'approved' THEN auth.uid() ELSE NULL END,
    updated_at = now()
  WHERE id = p_target_user_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_toggle_feature_entitlement(
  p_target_user_id UUID,
  p_feature_key TEXT,
  p_enabled BOOLEAN
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Unauthorized: Only active Admins can configure feature entitlements';
  END IF;

  INSERT INTO public.user_feature_entitlements (user_id, feature_key, enabled, granted_by, granted_at)
  VALUES (p_target_user_id, p_feature_key, p_enabled, auth.uid(), now())
  ON CONFLICT (user_id, feature_key)
  DO UPDATE SET enabled = p_enabled, granted_by = auth.uid(), granted_at = now();
END;
$$;

-- 7. Enable RLS & Define Policies
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.features ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_feature_entitlements ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read own profile" ON public.profiles FOR SELECT USING (auth.uid() = id);
CREATE POLICY "Approved users view directory" ON public.profiles FOR SELECT USING (public.get_auth_status() = 'approved');
CREATE POLICY "Admins full manage profiles" ON public.profiles FOR ALL USING (public.is_admin()) WITH CHECK (public.is_admin());

CREATE POLICY "Approved users read active features" ON public.features FOR SELECT USING (public.get_auth_status() = 'approved');
CREATE POLICY "Users read own feature overrides" ON public.user_feature_entitlements FOR SELECT USING (auth.uid() = user_id OR public.is_admin());
CREATE POLICY "Admins manage feature overrides" ON public.user_feature_entitlements FOR ALL USING (public.is_admin()) WITH CHECK (public.is_admin());
