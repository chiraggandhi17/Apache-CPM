export type NodeType = 'department' | 'season' | 'project' | 'task' | 'subtask' | 'reminder';

export type NodeStatus = 'not_started' | 'in_progress' | 'done' | 'blocked';

export interface NodeItem {
  id: string;
  org_id?: string | null;
  user_id?: string | null;
  created_by?: string | null;
  parent_id: string | null;
  type: NodeType;
  title: string;
  description: string | null;
  color: string | null;
  start_date: string | null;         // ISO 8601 UTC string (Range start date)
  planned_date: string | null;       // ISO 8601 UTC string (Target / End date)
  actual_date: string | null;        // ISO 8601 UTC string
  trigger_offset_days: number | null; // Offset relative to parent.planned_date
  status: NodeStatus;
  is_critical: boolean;
  assignee: string | null;
  assignee_user_id?: string | null;
  calendar_sync_enabled?: boolean;
  google_event_id?: string | null;
  vendor_contact: string | null;
  department: string | null;
  season: string | null;
  sort_order: number;
  created_at: string;
  updated_at: string;
}

export interface TreeNode extends NodeItem {
  effective_color: string;
  depth: number;
  is_overdue: boolean;
  children: TreeNode[];
}

export interface TodayItem {
  id: string;
  parent_id: string | null;
  type: NodeType;
  title: string;
  effective_color: string;
  start_date: string | null;
  planned_date: string | null;
  actual_date: string | null;
  status: NodeStatus;
  is_critical: boolean;
  department: string | null;
  season: string | null;
  is_overdue: boolean;
  category: 'overdue' | 'today' | 'upcoming';
  project_title?: string;
}

export interface ReminderItem {
  id: string;
  node_id: string;
  user_id?: string | null;
  remind_at: string;                  // ISO 8601 UTC string
  offset_mode?: 'relative' | 'fixed';  // Relative to node date OR fixed datetime
  offset_days: number | null;
  message: string;
  note?: string | null;               // Activity log / vendor follow-up note
  is_recurring: boolean;
  recurrence_rule?: string | null;
  dismissed_at: string | null;
  snoozed_until: string | null;
  created_at: string;
  updated_at: string;
  node_title?: string;
  project_title?: string;
}
