-- ============================================================================
-- CADENCE CPM: MIGRATION 00013 — GOOGLE CALENDAR OAUTH TWO-WAY SYNC
-- ============================================================================
-- Backs the real "Connect Google Calendar" OAuth flow (see the
-- supabase/functions/google-oauth-*, google-calendar-sync Edge Functions).
--
-- Security posture: google_calendar_connections holds refresh/access tokens,
-- so RLS is enabled with NO policies — it is intentionally unreachable from
-- the browser/anon key entirely. All reads/writes to it happen exclusively
-- from Edge Functions using the service-role key, which bypasses RLS. The
-- frontend never sees a token; it only ever calls google-calendar-status to
-- learn "connected: true/false" and metadata.
--
-- google_oauth_states is a short-lived, single-use CSRF token table used to
-- carry "which CPM user started this OAuth flow" across the redirect to
-- Google and back, since the callback lands on a plain HTTP GET with no
-- Cadence session attached.
--
-- google_calendar_pending_events is the review inbox: incoming events pulled
-- from Google land here first (not straight into `nodes`), so the user
-- always explicitly chooses which ones become CPM tasks — same principle as
-- the earlier .ics import flow, just fed automatically instead of by upload.

CREATE TABLE IF NOT EXISTS public.google_calendar_connections (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id             UUID NOT NULL UNIQUE REFERENCES public.profiles(id) ON DELETE CASCADE,
  google_email        TEXT,
  refresh_token       TEXT NOT NULL,
  access_token        TEXT,
  access_token_expiry TIMESTAMPTZ,
  google_calendar_id  TEXT NOT NULL DEFAULT 'primary',
  sync_token          TEXT,
  last_synced_at      TIMESTAMPTZ,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.google_calendar_connections ENABLE ROW LEVEL SECURITY;
-- Deliberately no policies: only the service role (used by Edge Functions) can touch this table.

CREATE TABLE IF NOT EXISTS public.google_oauth_states (
  state       TEXT PRIMARY KEY,
  user_id     UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at  TIMESTAMPTZ NOT NULL
);

ALTER TABLE public.google_oauth_states ENABLE ROW LEVEL SECURITY;
-- Also service-role only — the frontend never reads/writes this table directly.

CREATE TABLE IF NOT EXISTS public.google_calendar_pending_events (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id           UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  google_event_id   TEXT NOT NULL,
  title             TEXT NOT NULL,
  description       TEXT,
  start_at          TIMESTAMPTZ NOT NULL,
  end_at            TIMESTAMPTZ,
  is_all_day        BOOLEAN NOT NULL DEFAULT false,
  status            TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'imported', 'dismissed')),
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, google_event_id)
);

ALTER TABLE public.google_calendar_pending_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users manage their own pending calendar events" ON public.google_calendar_pending_events;
CREATE POLICY "Users manage their own pending calendar events"
  ON public.google_calendar_pending_events
  FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS idx_gcal_pending_user ON public.google_calendar_pending_events(user_id, status);

-- Links a CPM task to the Google Calendar event it's synced to, so repeat
-- pushes update the same event instead of creating duplicates.
ALTER TABLE public.nodes ADD COLUMN IF NOT EXISTS google_event_id TEXT;
CREATE INDEX IF NOT EXISTS idx_nodes_google_event_id ON public.nodes(google_event_id) WHERE google_event_id IS NOT NULL;
