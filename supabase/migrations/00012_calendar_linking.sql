-- ============================================================================
-- CADENCE CPM: MIGRATION 00012 — PER-TASK CALENDAR LINKING
-- ============================================================================
-- Lets users choose which individual tasks/subtasks are included when they
-- export their milestone dates to an external calendar (.ics download / the
-- "Add to Google Calendar" quick-links). Defaults to true so existing
-- behavior (every dated node was already exportable one at a time) doesn't
-- silently regress — users can opt individual tasks out from the Google
-- Calendar Sync modal.

ALTER TABLE public.nodes ADD COLUMN IF NOT EXISTS calendar_sync_enabled BOOLEAN NOT NULL DEFAULT true;

COMMENT ON COLUMN public.nodes.calendar_sync_enabled IS
  'Whether this task/subtask is included in the user''s exported .ics calendar file and quick Google Calendar links.';
