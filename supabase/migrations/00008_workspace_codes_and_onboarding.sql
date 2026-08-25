-- ============================================================================
-- CADENCE CPM: MIGRATION 00008 — WORKSPACE CODES & CLIENT ONBOARDING ACTIVATION
-- ============================================================================

-- 1. Add org_code and primary_admin_email to organizations
ALTER TABLE public.organizations ADD COLUMN IF NOT EXISTS org_code TEXT;
ALTER TABLE public.organizations ADD COLUMN IF NOT EXISTS primary_admin_email TEXT;
ALTER TABLE public.organizations ADD COLUMN IF NOT EXISTS is_activated BOOLEAN DEFAULT false;

-- Update Default Organization
UPDATE public.organizations
SET 
  org_code = 'APACHE',
  primary_admin_email = 'admin@apache.com',
  is_activated = true
WHERE id = '00000000-0000-0000-0000-000000000001';

-- Create Unique Index on uppercase org_code
CREATE UNIQUE INDEX IF NOT EXISTS idx_organizations_org_code_upper ON public.organizations (UPPER(org_code));

-- 2. Public Safe Organization Lookup by Workspace Code (for live login page theming)
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

-- 3. Onboarding & Registration RPC
CREATE OR REPLACE FUNCTION public.handle_user_workspace_signup(
  p_user_id UUID,
  p_email TEXT,
  p_org_code TEXT,
  p_full_name TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_org RECORD;
  v_role user_role;
  v_status user_status;
  v_is_primary_admin BOOLEAN := false;
BEGIN
  -- Look up organization by code
  SELECT * INTO v_org FROM public.organizations 
  WHERE UPPER(org_code) = UPPER(p_org_code) AND status = 'active';

  IF v_org.id IS NULL THEN
    RAISE EXCEPTION 'Invalid Workspace Code: Organization "%" not found.', p_org_code;
  END IF;

  -- Check if user is the designated primary Org Admin
  IF LOWER(v_org.primary_admin_email) = LOWER(p_email) THEN
    v_role := 'org_admin'::user_role;
    v_status := 'approved'::user_status;
    v_is_primary_admin := true;
    
    -- Mark organization as activated
    UPDATE public.organizations SET is_activated = true WHERE id = v_org.id;
  ELSE
    v_role := 'junior_manager'::user_role;
    v_status := 'pending'::user_status;
  END IF;

  -- Upsert Profile
  INSERT INTO public.profiles (
    id,
    org_id,
    email,
    full_name,
    role,
    status,
    approved_at
  ) VALUES (
    p_user_id,
    v_org.id,
    p_email,
    COALESCE(p_full_name, split_part(p_email, '@', 1)),
    v_role,
    v_status,
    CASE WHEN v_status = 'approved' THEN now() ELSE NULL END
  )
  ON CONFLICT (id) DO UPDATE SET
    org_id = EXCLUDED.org_id,
    role = CASE WHEN v_is_primary_admin THEN 'org_admin'::user_role ELSE public.profiles.role END,
    status = CASE WHEN v_is_primary_admin THEN 'approved'::user_status ELSE public.profiles.status END,
    approved_at = CASE WHEN v_is_primary_admin THEN now() ELSE public.profiles.approved_at END;

  RETURN jsonb_build_object(
    'org_id', v_org.id,
    'org_name', v_org.name,
    'role', v_role,
    'status', v_status,
    'is_primary_admin', v_is_primary_admin
  );
END;
$$;
