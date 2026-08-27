-- ============================================================================
-- CADENCE CPM: MIGRATION 00010 — RECURRING REMINDERS
-- ============================================================================
-- Adds the recurrence_rule column backing the in-app recurring-reminder
-- feature. When a recurring reminder is dismissed, the app advances
-- remind_at to the next occurrence (daily/weekly/monthly) instead of
-- permanently dismissing it — see NodeContext.dismissReminder().

ALTER TABLE public.reminders ADD COLUMN IF NOT EXISTS recurrence_rule TEXT;

COMMENT ON COLUMN public.reminders.recurrence_rule IS
  'One of: daily, weekly, monthly. Only meaningful when is_recurring = true.';
