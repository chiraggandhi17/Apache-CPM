-- Migration 00003: RPC Functions & RLS Policies

-- 1. Cascade Date Update Procedure
-- Recalculates planned_date for a target node and all offset-dependent descendants atomically.
CREATE OR REPLACE FUNCTION cascade_dates(
  p_node_id UUID,
  p_new_planned_date TIMESTAMPTZ
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_old_date TIMESTAMPTZ;
BEGIN
  -- Get current planned date of target node
  SELECT planned_date INTO v_old_date FROM nodes WHERE id = p_node_id;

  -- 1. Update the target node's planned_date directly
  UPDATE nodes
  SET planned_date = p_new_planned_date
  WHERE id = p_node_id;

  -- 2. Recalculate relative dates for all descendants with trigger_offset_days
  -- We process level by level via recursive CTE
  WITH RECURSIVE node_tree AS (
    -- Anchor: direct children of target node
    SELECT 
      n.id,
      n.parent_id,
      n.trigger_offset_days,
      p_new_planned_date AS parent_date
    FROM nodes n
    WHERE n.parent_id = p_node_id

    UNION ALL

    -- Recursive step: descendants of children
    SELECT 
      child.id,
      child.parent_id,
      child.trigger_offset_days,
      -- Resolved date of parent node in previous step
      (
        CASE 
          WHEN parent_step.trigger_offset_days IS NOT NULL 
          THEN parent_step.parent_date + (parent_step.trigger_offset_days || ' days')::INTERVAL
          ELSE (SELECT planned_date FROM nodes WHERE id = parent_step.id)
        END
      ) AS parent_date
    FROM nodes child
    JOIN node_tree parent_step ON child.parent_id = parent_step.id
  )
  UPDATE nodes n
  SET planned_date = nt.parent_date + (nt.trigger_offset_days || ' days')::INTERVAL
  FROM node_tree nt
  WHERE n.id = nt.id
    AND nt.trigger_offset_days IS NOT NULL;

  -- 3. Update any reminders attached to affected nodes where reminder.offset_days IS NOT NULL
  WITH RECURSIVE affected_nodes AS (
    SELECT id, planned_date FROM nodes WHERE id = p_node_id
    UNION ALL
    SELECT child.id, child.planned_date
    FROM nodes child
    JOIN affected_nodes p ON child.parent_id = p.id
  )
  UPDATE reminders r
  SET remind_at = an.planned_date + (r.offset_days || ' days')::INTERVAL
  FROM affected_nodes an
  WHERE r.node_id = an.id
    AND r.offset_days IS NOT NULL
    AND an.planned_date IS NOT NULL;

END;
$$;


-- 2. Fetch Full Subtree with Resolved Color and Depth
CREATE OR REPLACE FUNCTION get_node_tree(p_root_id UUID)
RETURNS TABLE (
  id UUID,
  parent_id UUID,
  type node_type,
  title TEXT,
  description TEXT,
  color TEXT,
  effective_color TEXT,
  planned_date TIMESTAMPTZ,
  actual_date TIMESTAMPTZ,
  trigger_offset_days INT,
  status node_status,
  is_critical BOOLEAN,
  assignee TEXT,
  vendor_contact TEXT,
  department TEXT,
  season TEXT,
  sort_order INT,
  depth INT,
  is_overdue BOOLEAN
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  WITH RECURSIVE tree AS (
    -- Anchor member
    SELECT 
      n.id,
      n.parent_id,
      n.type,
      n.title,
      n.description,
      n.color,
      n.color AS inherited_color,
      n.planned_date,
      n.actual_date,
      n.trigger_offset_days,
      n.status,
      n.is_critical,
      n.assignee,
      n.vendor_contact,
      n.department,
      n.season,
      n.sort_order,
      0 AS depth
    FROM nodes n
    WHERE n.id = p_root_id

    UNION ALL

    -- Recursive member
    SELECT 
      c.id,
      c.parent_id,
      c.type,
      c.title,
      c.description,
      c.color,
      COALESCE(c.color, t.inherited_color) AS inherited_color,
      c.planned_date,
      c.actual_date,
      c.trigger_offset_days,
      c.status,
      c.is_critical,
      c.assignee,
      c.vendor_contact,
      c.department,
      c.season,
      c.sort_order,
      t.depth + 1 AS depth
    FROM nodes c
    JOIN tree t ON c.parent_id = t.id
  )
  SELECT 
    t.id,
    t.parent_id,
    t.type,
    t.title,
    t.description,
    t.color,
    COALESCE(t.inherited_color, '#6B7280') AS effective_color,
    t.planned_date,
    t.actual_date,
    t.trigger_offset_days,
    t.status,
    t.is_critical,
    t.assignee,
    t.vendor_contact,
    t.department,
    t.season,
    t.sort_order,
    t.depth,
    (t.planned_date < NOW() AND t.actual_date IS NULL AND t.status != 'done') AS is_overdue
  FROM tree t
  ORDER BY t.depth ASC, t.sort_order ASC, t.created_at ASC;
END;
$$;


-- 3. Fetch Today & Upcoming Items Across All Projects
CREATE OR REPLACE FUNCTION get_today_upcoming(p_range_days INT DEFAULT 7)
RETURNS TABLE (
  id UUID,
  parent_id UUID,
  type node_type,
  title TEXT,
  effective_color TEXT,
  planned_date TIMESTAMPTZ,
  actual_date TIMESTAMPTZ,
  status node_status,
  is_critical BOOLEAN,
  department TEXT,
  season TEXT,
  is_overdue BOOLEAN,
  category TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  WITH RECURSIVE node_ancestors AS (
    SELECT 
      n.id AS start_id,
      n.id,
      n.parent_id,
      n.color,
      0 AS distance
    FROM nodes n
    
    UNION ALL
    
    SELECT 
      na.start_id,
      parent.id,
      parent.parent_id,
      parent.color,
      na.distance + 1
    FROM node_ancestors na
    JOIN nodes parent ON na.parent_id = parent.id
  ),
  resolved_colors AS (
    SELECT DISTINCT ON (start_id)
      start_id,
      color
    FROM node_ancestors
    WHERE color IS NOT NULL
    ORDER BY start_id, distance ASC
  )
  SELECT 
    n.id,
    n.parent_id,
    n.type,
    n.title,
    COALESCE(rc.color, '#6B7280') AS effective_color,
    n.planned_date,
    n.actual_date,
    n.status,
    n.is_critical,
    n.department,
    n.season,
    (n.planned_date < NOW() AND n.actual_date IS NULL AND n.status != 'done') AS is_overdue,
    CASE 
      WHEN n.planned_date < NOW() AND n.actual_date IS NULL AND n.status != 'done' THEN 'overdue'
      WHEN n.planned_date::date = CURRENT_DATE THEN 'today'
      ELSE 'upcoming'
    END AS category
  FROM nodes n
  LEFT JOIN resolved_colors rc ON n.id = rc.start_id
  WHERE n.planned_date IS NOT NULL
    AND n.status != 'done'
    AND (
      -- Overdue items
      (n.planned_date < NOW() AND n.actual_date IS NULL)
      OR
      -- Items within range
      (n.planned_date >= NOW() AND n.planned_date <= (NOW() + (p_range_days || ' days')::INTERVAL))
    )
  ORDER BY 
    CASE 
      WHEN n.planned_date < NOW() AND n.actual_date IS NULL THEN 1
      WHEN n.planned_date::date = CURRENT_DATE THEN 2
      ELSE 3
    END,
    n.planned_date ASC;
END;
$$;


-- 4. Enable Row-Level Security (RLS)
ALTER TABLE nodes ENABLE ROW LEVEL SECURITY;
ALTER TABLE reminders ENABLE ROW LEVEL SECURITY;

-- Permissive policies for authenticated users or public (if unauthenticated dev mode)
CREATE POLICY "Users can manage their own nodes" ON nodes
  FOR ALL
  USING (user_id IS NULL OR auth.uid() = user_id)
  WITH CHECK (user_id IS NULL OR auth.uid() = user_id);

CREATE POLICY "Users can manage their own reminders" ON reminders
  FOR ALL
  USING (user_id IS NULL OR auth.uid() = user_id)
  WITH CHECK (user_id IS NULL OR auth.uid() = user_id);
