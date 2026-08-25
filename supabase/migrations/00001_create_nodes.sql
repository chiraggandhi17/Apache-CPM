-- Migration 00001: Create Nodes Table & Enums

CREATE EXTENSION IF NOT EXISTS ltree;

-- Node Type Enum
CREATE TYPE node_type AS ENUM (
  'department', 
  'season', 
  'project', 
  'task', 
  'subtask', 
  'reminder'
);

-- Node Status Enum (overdue is computed at query time)
CREATE TYPE node_status AS ENUM (
  'not_started', 
  'in_progress', 
  'done', 
  'blocked'
);

-- Nodes Table
CREATE TABLE nodes (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  parent_id           UUID REFERENCES nodes(id) ON DELETE CASCADE,
  user_id             UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  type                node_type NOT NULL DEFAULT 'task',
  title               TEXT NOT NULL,
  description         TEXT,
  color               TEXT CHECK (color ~ '^#[0-9a-fA-F]{6}$'),
  
  -- Target date (UTC)
  planned_date        TIMESTAMPTZ,
  -- Actual completion date (UTC)
  actual_date         TIMESTAMPTZ,
  
  -- Relative offset in days from parent.planned_date
  -- Null means planned_date is absolute/manually set
  trigger_offset_days INTEGER,
  
  status              node_status NOT NULL DEFAULT 'not_started',
  is_critical         BOOLEAN NOT NULL DEFAULT false,
  
  assignee            TEXT,
  vendor_contact      TEXT,
  department          TEXT,
  season              TEXT,
  sort_order          INTEGER NOT NULL DEFAULT 0,
  
  -- Materialized path for fast sub-tree graph traversal
  path                ltree,
  
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Indexes
CREATE INDEX idx_nodes_parent_id ON nodes(parent_id);
CREATE INDEX idx_nodes_user_id ON nodes(user_id);
CREATE INDEX idx_nodes_planned_date ON nodes(planned_date);
CREATE INDEX idx_nodes_status ON nodes(status);
CREATE INDEX idx_nodes_is_critical ON nodes(is_critical) WHERE is_critical = true;
CREATE INDEX idx_nodes_path ON nodes USING gist(path);
CREATE INDEX idx_nodes_department_season ON nodes(department, season);

-- Updated_at trigger function
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER nodes_updated_at
  BEFORE UPDATE ON nodes
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at();
