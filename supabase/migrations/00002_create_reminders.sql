-- Migration 00002: Create Reminders Table

CREATE TABLE reminders (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  node_id         UUID NOT NULL REFERENCES nodes(id) ON DELETE CASCADE,
  user_id         UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  
  -- The calculated or fixed trigger datetime (UTC)
  remind_at       TIMESTAMPTZ NOT NULL,
  
  -- If non-null, remind_at = node.planned_date + offset_days
  offset_days     INTEGER,
  
  message         TEXT,
  is_recurring    BOOLEAN NOT NULL DEFAULT false,
  recurrence_rule TEXT,
  
  dismissed_at    TIMESTAMPTZ,
  snoozed_until   TIMESTAMPTZ,
  
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Indexes
CREATE INDEX idx_reminders_node_id ON reminders(node_id);
CREATE INDEX idx_reminders_user_id ON reminders(user_id);
CREATE INDEX idx_reminders_remind_at ON reminders(remind_at);
CREATE INDEX idx_reminders_pending ON reminders(remind_at)
  WHERE dismissed_at IS NULL AND snoozed_until IS NULL;

CREATE TRIGGER reminders_updated_at
  BEFORE UPDATE ON reminders
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at();
