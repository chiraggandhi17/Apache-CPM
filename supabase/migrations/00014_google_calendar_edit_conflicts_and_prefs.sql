-- ============================================================================
-- CADENCE CPM: MIGRATION 00014 — GOOGLE CALENDAR EDIT-CONFLICT REVIEW + PREFS
-- ============================================================================
-- Two additions to the Google Calendar two-way sync (migration 00013):
--
-- 1. Edit-conflict review: previously, an already-linked CPM task whose
--    Google Calendar event was edited directly on Google's side (time,
--    title) was invisible to the pull step — only outright deletion was
--    detected. `kind` + `node_id` let google_calendar_pending_events also
--    carry "this linked task's Google event no longer matches CPM" rows,
--    reviewed the same way as new-import candidates (see
--    google-calendar-sync's pull step and GoogleCalendarSyncModal's Inbox).
--
-- 2. Per-user sync preferences, set once right after connecting (and
--    editable any time after): default_sync_new_tasks controls whether a
--    brand-new task starts with "Sync to Calendar" on or off; setup_completed
--    marks whether that first-connection preferences step has been shown.
ALTER TABLE public.google_calendar_pending_events
  ADD COLUMN IF NOT EXISTS kind    TEXT NOT NULL DEFAULT 'new' CHECK (kind IN ('new', 'edited')),
  ADD COLUMN IF NOT EXISTS node_id UUID REFERENCES public.nodes(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS idx_gcal_pending_node_id ON public.google_calendar_pending_events(node_id) WHERE node_id IS NOT NULL;

ALTER TABLE public.google_calendar_connections
  ADD COLUMN IF NOT EXISTS default_sync_new_tasks BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS setup_completed         BOOLEAN NOT NULL DEFAULT false;
