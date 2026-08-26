-- ============================================================================
-- CADENCE CPM: MIGRATION 00009 — PER-NODE AUDIT LOGS & DYNAMIC CUSTOM ROLES
-- ============================================================================

-- 1. Create Node Activity Audit Logs Table
CREATE TABLE IF NOT EXISTS public.node_audit_logs (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  node_id         UUID NOT NULL REFERENCES public.nodes(id) ON DELETE CASCADE,
  org_id          UUID REFERENCES public.organizations(id) ON DELETE CASCADE,
  user_id         UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  user_email      TEXT NOT NULL,
  user_name       TEXT,
  action          TEXT NOT NULL, -- 'created', 'date_shifted', 'status_changed', 'details_updated', 'deleted'
  change_summary  TEXT NOT NULL,
  previous_values JSONB,
  new_values      JSONB,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Index for fast lookup by node
CREATE INDEX IF NOT EXISTS idx_node_audit_logs_node_id ON public.node_audit_logs (node_id, created_at DESC);

-- Enable RLS
ALTER TABLE public.node_audit_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow public access to audit logs" ON public.node_audit_logs;
CREATE POLICY "Allow public access to audit logs" ON public.node_audit_logs FOR ALL USING (true) WITH CHECK (true);

-- Enable Realtime for Audit Logs
DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.node_audit_logs;
EXCEPTION WHEN duplicate_object THEN null;
END $$;

-- 2. Custom Roles Table (Dynamic Job Titles & Access Scopes)
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

ALTER TABLE public.custom_roles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow public access to custom roles" ON public.custom_roles;
CREATE POLICY "Allow public access to custom roles" ON public.custom_roles FOR ALL USING (true) WITH CHECK (true);

-- Notify PostgREST to reload schema cache
NOTIFY pgrst, 'reload schema';
