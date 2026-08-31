import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from './AuthContext';
import { NodeItem, ReminderItem, TreeNode, TodayItem, NodeStatus } from '../types/domain';
import { resolveColor } from '../lib/color-resolver';
import { addDays, addHours, parseISO, formatISO, isValid, isBefore, isToday as isDateToday, isAfter } from 'date-fns';
import { sendBrowserNotification } from '../utils/notifications';
import { computeNextOccurrence } from '../utils/recurrence';
import { deleteGoogleCalendarEvents } from '../utils/google-calendar-api';
import { getChildType, getRootAncestorId } from '../utils/hierarchy';
import { playNotificationSound } from '../utils/sound';
import { useToast } from './ToastContext';

export interface NodeAuditLog {
  id: string;
  node_id: string;
  org_id: string | null;
  user_id: string | null;
  user_email: string;
  user_name: string | null;
  action: 'created' | 'date_shifted' | 'status_changed' | 'details_updated' | 'deleted' | 'moved';
  change_summary: string;
  previous_values: Record<string, any> | null;
  new_values: Record<string, any> | null;
  created_at: string;
}

export interface NodeAccessInfo {
  isEditable: boolean;
  isAncestorProtected: boolean;
  isCrossDepartment: boolean;
  owningDepartment: string;
  tooltipText: string;
}

export interface MoveConflictItem {
  nodeId: string;
  title: string;
  currentDate: string; // ISO planned_date that exceeds the new ancestor limit
  limitDate: string;   // ISO planned_date of the nearest new ancestor with a date
}

export interface MoveInvalidReason {
  code: 'same_parent' | 'self' | 'descendant' | 'cross_root';
  message: string;
}

export interface MovePreview {
  nodeId: string;
  nodeTitle: string;
  newParentId: string;
  newParentTitle: string;
  affectedCount: number; // moved node + all its descendants
  conflicts: MoveConflictItem[];
}

interface NodeContextType {
  nodes: NodeItem[];
  reminders: ReminderItem[];
  selectedNode: NodeItem | null;
  setSelectedNode: (node: NodeItem | null) => void;
  isLoading: boolean;
  
  // Scoped Permissions & Hierarchy
  canUserEditNode: (nodeId: string) => boolean;
  getNodeAccessInfo: (nodeId: string) => NodeAccessInfo;
  isNodeAncestorOfAssigned: (nodeId: string) => boolean;
  getDescendantNodes: (nodeId: string) => NodeItem[];
  hideNodeLocally: (nodeId: string) => NodeItem[];
  restoreNodesLocally: (removed: NodeItem[]) => void;
  cleanupGoogleEventsFor: (removedNodes: NodeItem[]) => void;
  completeNodeAndSubtree: (nodeId: string) => Promise<void>;
  getTree: () => TreeNode[];
  previewMove: (nodeId: string, newParentId: string) => MovePreview | MoveInvalidReason;
  commitMove: (nodeId: string, newParentId: string, dateOverrides?: Record<string, string>) => Promise<void>;
  getTodayUpcomingFeed: () => {
    overdue: TodayItem[];
    today: TodayItem[];
    upcoming: TodayItem[];
    triggeredReminders: ReminderItem[];
  };

  // Activity Audit Logs
  fetchNodeAuditLogs: (nodeId: string) => Promise<NodeAuditLog[]>;
  logNodeActivity: (
    nodeId: string, 
    action: NodeAuditLog['action'], 
    summary: string, 
    prevValues?: Record<string, any> | null, 
    newValues?: Record<string, any> | null
  ) => Promise<void>;

  // Actions
  cascadeDateChange: (nodeId: string, newPlannedDate: string | null) => Promise<void>;
  addNode: (data: Partial<NodeItem>) => Promise<string>;
  updateNode: (nodeId: string, data: Partial<NodeItem>) => Promise<void>;
  deleteNode: (nodeId: string) => Promise<void>;
  toggleCritical: (nodeId: string) => Promise<void>;
  updateStatus: (nodeId: string, status: NodeStatus) => Promise<void>;
  toggleDone: (nodeId: string) => Promise<void>;

  // Reminders (Single Source of Truth: Supabase)
  addReminder: (data: Partial<ReminderItem>) => Promise<void>;
  updateReminder: (reminderId: string, data: Partial<ReminderItem>) => Promise<void>;
  dismissReminder: (reminderId: string) => Promise<void>;
  snoozeReminder: (reminderId: string, snoozeOption: '1h' | '1d' | '3d' | string) => Promise<void>;
  addReminderNote: (reminderId: string, noteText: string) => Promise<void>;
  deleteReminder: (reminderId: string) => Promise<void>;
  totalScheduledAlertsCount: number;
  triggeredAlertsCount: number;
}

const NodeContext = createContext<NodeContextType | undefined>(undefined);

export const NodeProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user, profile, isSuperAdmin, isOrgAdmin, isIndividual, accessLevel } = useAuth();
  const toast = useToast();
  
  const [nodes, setNodes] = useState<NodeItem[]>(() => {
    try {
      const cached = localStorage.getItem('cadence_cached_nodes');
      return cached ? JSON.parse(cached) : [];
    } catch {
      return [];
    }
  });

  const [reminders, setReminders] = useState<ReminderItem[]>([]);
  const [selectedNode, setSelectedNode] = useState<NodeItem | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);

  // Optimistic "pending delete" tracking for the undo-toast delete flow: a node
  // (and its descendants) is removed from local state immediately on delete-click,
  // but the real Supabase delete only fires once the undo window expires. A ref
  // mirrors the state so the realtime-refetch callback below (a stable useCallback)
  // can always see the latest set without being resubscribed on every change.
  const [pendingDeleteIds, setPendingDeleteIds] = useState<Set<string>>(new Set());
  const pendingDeleteIdsRef = useRef<Set<string>>(new Set());

  // Tracks reminder ids we've already fired a browser Notification for this
  // session, so the 60s poll doesn't re-notify the same triggered alert.
  const notifiedReminderIdsRef = useRef<Set<string>>(new Set());

  // Single Source of Truth: Fetch nodes & reminders directly from Supabase Cloud DB with Strict Multi-Tenant Scoping
  const fetchNodesAndReminders = useCallback(async () => {
    if (!user) {
      setNodes([]);
      setReminders([]);
      setIsLoading(false);
      return;
    }

    try {
      let query = supabase.from('nodes').select('*').order('sort_order', { ascending: true });

      // Multi-Tenant Security & User Privacy Scoping:
      if (!isSuperAdmin) {
        if (profile?.org_id) {
          // Organization Member: Only fetch nodes belonging to this organization
          query = query.eq('org_id', profile.org_id);
        } else {
          // Individual Account: Only fetch nodes created by or assigned to this user
          query = query.or(`created_by.eq.${user.id},user_id.eq.${user.id}`);
        }
      }

      const { data: nodesData, error: nodesErr } = await query;
      let scopedNodes: NodeItem[] = [];

      if (nodesErr) {
        console.error('Supabase nodes fetch error:', nodesErr);
      } else if (nodesData) {
        // Double-check in-memory filtering for maximum isolation safety
        scopedNodes = nodesData.filter(n => {
          if (isSuperAdmin) return true;
          if (profile?.org_id) return n.org_id === profile.org_id;
          return n.created_by === user.id || n.user_id === user.id || (!n.org_id && (!n.created_by || n.created_by === user.id));
        });

        const visibleScopedNodes = scopedNodes.filter(n => !pendingDeleteIdsRef.current.has(n.id));
        setNodes(visibleScopedNodes);
        try {
          localStorage.setItem(`cadence_cached_nodes_${user.id}`, JSON.stringify(scopedNodes));
        } catch {
          // Ignore quota errors
        }
      }

      const { data: remindersData, error: remErr } = await supabase
        .from('reminders')
        .select('*');

      if (remErr) {
        console.error('Supabase reminders fetch error:', remErr);
      } else if (remindersData) {
        // Strict Alert Privacy: Only include reminders belonging to user's authorized nodes
        const allowedNodeIds = new Set(scopedNodes.map(n => n.id));
        const scopedReminders = remindersData.filter(r => allowedNodeIds.has(r.node_id));
        setReminders(scopedReminders);
      }
    } catch (err) {
      console.error('Supabase fetch error:', err);
    } finally {
      setIsLoading(false);
    }
  }, [user, profile?.org_id, isSuperAdmin]);

  // Initial fetch & re-fetch when user authentication loads + Supabase Realtime Subscription Setup
  useEffect(() => {
    fetchNodesAndReminders();

    const channel = supabase
      .channel('cadence_realtime_changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'nodes' }, () => {
        fetchNodesAndReminders();
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'reminders' }, () => {
        fetchNodesAndReminders();
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'node_audit_logs' }, () => {
        // Realtime logs notification
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user?.id, fetchNodesAndReminders]);

  useEffect(() => {
    if (selectedNode) {
      const updated = nodes.find(n => n.id === selectedNode.id);
      if (updated) setSelectedNode(updated);
    }
  }, [nodes]);

  // Audio chime + browser push-notification polling hook
  useEffect(() => {
    const checkReminders = () => {
      const soundEnabled = localStorage.getItem('cadence_sound_enabled') !== 'false';
      const pushEnabled = localStorage.getItem('cadence_push_enabled') === 'true';

      const now = new Date();
      const active = reminders.filter(r => {
        if (r.dismissed_at) return false;
        if (r.snoozed_until && isAfter(parseISO(r.snoozed_until), now)) return false;
        const triggerDate = parseISO(r.remind_at);
        return isBefore(triggerDate, now) || isDateToday(triggerDate);
      });

      if (active.length > 0 && soundEnabled) {
        playNotificationSound();
      }

      // Fire a browser Notification for any newly-triggered reminder we
      // haven't already notified about this session (avoids re-notifying
      // the same alert on every 60s poll).
      if (pushEnabled && active.length > 0) {
        for (const r of active) {
          if (notifiedReminderIdsRef.current.has(r.id)) continue;
          notifiedReminderIdsRef.current.add(r.id);
          sendBrowserNotification(r.message || 'Milestone reminder', {
            body: r.node_title ? `Task: ${r.node_title}` : undefined,
            tag: r.id,
          });
        }
      }
    };

    checkReminders();
    const interval = setInterval(checkReminders, 60000);
    return () => clearInterval(interval);
  }, [reminders]);

  // Activity Audit Log Logger
  const logNodeActivity = async (
    nodeId: string, 
    action: NodeAuditLog['action'], 
    summary: string, 
    prevValues?: Record<string, any> | null, 
    newValues?: Record<string, any> | null
  ) => {
    try {
      const userEmail = profile?.email || 'user@cadence.app';
      const userName = profile?.full_name || userEmail.split('@')[0];

      await supabase.from('node_audit_logs').insert({
        node_id: nodeId,
        org_id: profile?.org_id || null,
        user_id: profile?.id || null,
        user_email: userEmail,
        user_name: userName,
        action,
        change_summary: summary,
        previous_values: prevValues || null,
        new_values: newValues || null,
      });
    } catch (err) {
      console.error('Audit log write error:', err);
    }
  };

  const fetchNodeAuditLogs = async (nodeId: string): Promise<NodeAuditLog[]> => {
    try {
      const { data, error } = await supabase
        .from('node_audit_logs')
        .select('*')
        .eq('node_id', nodeId)
        .order('created_at', { ascending: false });

      if (error) throw error;
      return (data as NodeAuditLog[]) || [];
    } catch (err) {
      console.error('Failed to fetch node audit logs:', err);
      return [];
    }
  };

  // Helper: check if a node is an ancestor of any node assigned to the user
  const isNodeAncestorOfAssigned = useCallback((nodeId: string): boolean => {
    if (!profile || isIndividual || !profile.org_id || isOrgAdmin || accessLevel === 1 || profile.role === 'level_1') return false;

    const userEmail = profile.email.toLowerCase();
    const userFullName = (profile.full_name || '').toLowerCase();

    const assignedNodes = nodes.filter(n => {
      // Prefer the reliable FK-based assignment; only fall back to fuzzy
      // text-matching for legacy nodes assigned before assignee_user_id existed.
      if (n.assignee_user_id) return n.assignee_user_id === profile.id;
      if (!n.assignee) return false;
      const a = n.assignee.toLowerCase();
      return a.includes(userEmail) || (userFullName && a.includes(userFullName));
    });

    for (const assigned of assignedNodes) {
      let curr = nodes.find(n => n.id === assigned.parent_id);
      while (curr) {
        if (curr.id === nodeId) return true;
        if (!curr.parent_id) break;
        curr = nodes.find(n => n.id === curr!.parent_id);
      }
    }

    return false;
  }, [nodes, profile, isOrgAdmin, isIndividual, accessLevel]);

  // Scoped Edit Permission Check
  const canUserEditNode = useCallback((nodeId: string): boolean => {
    if (!profile || isIndividual || !profile.org_id || profile.role === 'level_1') {
      return true;
    }
    
    if (isSuperAdmin || isOrgAdmin || profile.role === 'super_admin' || profile.role === 'org_admin') {
      return true;
    }

    if (accessLevel === 1 || profile.role === 'senior_manager') {
      return true;
    }

    if (accessLevel === 3 || profile.role === 'level_3' || profile.role === 'viewer') {
      return false;
    }

    if (isNodeAncestorOfAssigned(nodeId)) {
      return false;
    }

    const userEmail = profile.email.toLowerCase();
    const userFullName = (profile.full_name || '').toLowerCase();

    const assignedNodes = nodes.filter(n => {
      // Prefer the reliable FK-based assignment; only fall back to fuzzy
      // text-matching for legacy nodes assigned before assignee_user_id existed.
      if (n.assignee_user_id) return n.assignee_user_id === profile.id;
      if (!n.assignee) return false;
      const a = n.assignee.toLowerCase();
      return a.includes(userEmail) || (userFullName && a.includes(userFullName));
    });

    if (assignedNodes.some(n => n.id === nodeId)) {
      return true;
    }

    const isDescendantOf = (targetId: string, ancestorId: string): boolean => {
      let curr = nodes.find(n => n.id === targetId);
      while (curr && curr.parent_id) {
        if (curr.parent_id === ancestorId) return true;
        curr = nodes.find(n => n.id === curr!.parent_id);
      }
      return false;
    };

    for (const assigned of assignedNodes) {
      if (isDescendantOf(nodeId, assigned.id)) {
        return true;
      }
    }

    return true;
  }, [nodes, profile, isSuperAdmin, isOrgAdmin, isIndividual, accessLevel, isNodeAncestorOfAssigned]);

  const getNodeAccessInfo = useCallback((nodeId: string): NodeAccessInfo => {
    const node = nodes.find(n => n.id === nodeId);
    const owningDept = node?.department || 'Personal';
    const isAncestor = isNodeAncestorOfAssigned(nodeId);
    const isCrossDept = Boolean(!isIndividual && profile?.org_id && profile?.department && node?.department && profile.department.toLowerCase() !== node.department.toLowerCase());
    const isEditable = canUserEditNode(nodeId);

    let tooltipText = 'Full Access (Level 1)';
    if (!isEditable) {
      if (isAncestor) {
        tooltipText = 'Parent Milestone (View-Only context)';
      } else if (accessLevel === 3) {
        tooltipText = 'Level 3: View-Only Account';
      } else if (isCrossDept) {
        tooltipText = `Owned by ${owningDept} Department (View-Only)`;
      } else {
        tooltipText = 'View-Only Mode';
      }
    }

    return {
      isEditable,
      isAncestorProtected: isAncestor,
      isCrossDepartment: isCrossDept,
      owningDepartment: owningDept,
      tooltipText,
    };
  }, [nodes, profile, isIndividual, isNodeAncestorOfAssigned, canUserEditNode, accessLevel]);

  const getDescendantNodes = useCallback((nodeId: string): NodeItem[] => {
    const results: NodeItem[] = [];
    const collectChildren = (pid: string) => {
      const children = nodes.filter(n => n.parent_id === pid);
      for (const child of children) {
        results.push(child);
        collectChildren(child.id);
      }
    };
    collectChildren(nodeId);
    return results;
  }, [nodes]);

  /**
   * Optimistically hides a node (and its subtree) from local state immediately,
   * without touching Supabase. Pairs with restoreNodesLocally() to power an
   * "Undo" toast on delete: the real DB delete is deferred until the undo
   * window expires (see deleteNode call sites).
   */
  const hideNodeLocally = useCallback((nodeId: string): NodeItem[] => {
    const idsToHide = new Set([nodeId, ...getDescendantNodes(nodeId).map(n => n.id)]);
    const removed = nodes.filter(n => idsToHide.has(n.id));

    setPendingDeleteIds(prev => {
      const next = new Set(prev);
      idsToHide.forEach(id => next.add(id));
      pendingDeleteIdsRef.current = next;
      return next;
    });
    setNodes(prev => prev.filter(n => !idsToHide.has(n.id)));

    if (selectedNode && idsToHide.has(selectedNode.id)) setSelectedNode(null);

    return removed;
  }, [nodes, getDescendantNodes, selectedNode]);

  /** Restores nodes hidden by hideNodeLocally() — used when the user clicks "Undo". */
  const restoreNodesLocally = useCallback((removed: NodeItem[]) => {
    const ids = new Set(removed.map(n => n.id));

    setPendingDeleteIds(prev => {
      const next = new Set(prev);
      ids.forEach(id => next.delete(id));
      pendingDeleteIdsRef.current = next;
      return next;
    });
    setNodes(prev => {
      const existingIds = new Set(prev.map(n => n.id));
      const toAdd = removed.filter(n => !existingIds.has(n.id));
      return toAdd.length ? [...prev, ...toAdd] : prev;
    });
  }, []);

  /**
   * Best-effort cleanup of the Google Calendar events belonging to nodes
   * that were just deleted. Takes the `removed` snapshot returned by
   * hideNodeLocally() (captured BEFORE the nodes left local state), since by
   * the time deleteNode() actually runs — after the undo-toast window — the
   * nodes are already gone from both local state and (once committed) the
   * database, so there's nowhere left to read their google_event_id from.
   */
  const cleanupGoogleEventsFor = useCallback((removedNodes: NodeItem[]) => {
    const eventIds = removedNodes.filter(n => n.google_event_id).map(n => n.google_event_id as string);
    if (eventIds.length === 0) return;
    deleteGoogleCalendarEvents(eventIds).catch(() => {});
  }, []);

  const completeNodeAndSubtree = async (nodeId: string) => {
    const descendants = getDescendantNodes(nodeId);
    const allIdsToComplete = [nodeId, ...descendants.map(d => d.id)];
    const nowISO = new Date().toISOString();

    // Completed tasks don't need a calendar reminder anymore — clear the
    // Google Calendar link and delete the event(s) so it doesn't linger.
    const googleEventIdsToClean = nodes
      .filter(n => allIdsToComplete.includes(n.id) && n.google_event_id)
      .map(n => n.google_event_id as string);

    await supabase
      .from('nodes')
      .update({ status: 'done', actual_date: nowISO, updated_at: nowISO, google_event_id: null })
      .in('id', allIdsToComplete);

    if (googleEventIdsToClean.length > 0) {
      deleteGoogleCalendarEvents(googleEventIdsToClean).catch(() => {});
    }

    for (const id of allIdsToComplete) {
      const n = nodes.find(item => item.id === id);
      if (n) {
        await logNodeActivity(id, 'status_changed', `Marked as DONE (Subtree completion cascade)`);
      }
    }

    await fetchNodesAndReminders();
  };

  /**
   * Finds the nearest ancestor's planned_date walking up from startParentId,
   * following real parent_id links except at `remapNodeId` (if reached),
   * where it continues instead from `remapToParentId`. This lets us compute
   * "what date limit would apply after a reparent" without mutating state —
   * used by previewMove for conflict detection.
   */
  const findEffectiveDateLimit = (
    startParentId: string | null,
    remapNodeId?: string,
    remapToParentId?: string | null
  ): string | null => {
    let curId = startParentId;
    while (curId) {
      const node = nodes.find(n => n.id === curId);
      if (!node) break;
      if (node.planned_date) return node.planned_date;
      curId = node.id === remapNodeId ? (remapToParentId ?? null) : node.parent_id;
    }
    return null;
  };

  /**
   * Dry-run for dragging `nodeId` to become a child of `newParentId`. Validates
   * the move (no-op, self-drop, cyclical drop, cross-Level-1-tree drop) and
   * computes every date conflict the move would create — the moved node and
   * any descendant whose own target date would now exceed its nearest new
   * ancestor's target date — without writing anything. commitMove() applies it.
   */
  const previewMove = (nodeId: string, newParentId: string): MovePreview | MoveInvalidReason => {
    const movedNode = nodes.find(n => n.id === nodeId);
    const newParent = nodes.find(n => n.id === newParentId);

    if (!movedNode || !newParent) {
      return { code: 'self', message: 'That item could not be found.' };
    }
    if (nodeId === newParentId) {
      return { code: 'self', message: "A task can't be moved onto itself." };
    }
    if (movedNode.parent_id === newParentId) {
      return { code: 'same_parent', message: 'Already positioned there.' };
    }

    const descendants = getDescendantNodes(nodeId);
    if (descendants.some(d => d.id === newParentId)) {
      return { code: 'descendant', message: "A task can't be moved into its own subtask." };
    }

    const rootOfMoved = getRootAncestorId(nodeId, nodes);
    const rootOfTarget = getRootAncestorId(newParentId, nodes);
    if (!rootOfMoved || !rootOfTarget || rootOfMoved !== rootOfTarget) {
      return { code: 'cross_root', message: 'Tasks can only be repositioned within the same top-level department tree.' };
    }

    const conflicts: MoveConflictItem[] = [];

    // The moved node itself: its new limit comes from walking up the new parent's real chain.
    if (movedNode.planned_date) {
      const limit = findEffectiveDateLimit(newParentId);
      if (limit && new Date(movedNode.planned_date) > new Date(limit)) {
        conflicts.push({ nodeId: movedNode.id, title: movedNode.title, currentDate: movedNode.planned_date, limitDate: limit });
      }
    }

    // Each descendant: walk its real chain, but once it would reach the moved
    // node, redirect upward through the new parent instead of the old one.
    for (const d of descendants) {
      if (!d.planned_date) continue;
      const limit = findEffectiveDateLimit(d.parent_id, nodeId, newParentId);
      if (limit && new Date(d.planned_date) > new Date(limit)) {
        conflicts.push({ nodeId: d.id, title: d.title, currentDate: d.planned_date, limitDate: limit });
      }
    }

    return {
      nodeId,
      nodeTitle: movedNode.title,
      newParentId,
      newParentTitle: newParent.title,
      affectedCount: 1 + descendants.length,
      conflicts,
    };
  };

  /**
   * Applies a previously-previewed move: reparents `nodeId` under `newParentId`,
   * cascades `type` for it and every descendant so hierarchy levels stay in sync
   * with their new tree position (capped at 'subtask', there is no Level 6), and
   * applies any user-supplied date fixes for conflicts surfaced by previewMove.
   */
  const commitMove = async (nodeId: string, newParentId: string, dateOverrides: Record<string, string> = {}) => {
    const movedNode = nodes.find(n => n.id === nodeId);
    const newParent = nodes.find(n => n.id === newParentId);
    if (!movedNode || !newParent) return;

    const oldParentTitle = nodes.find(n => n.id === movedNode.parent_id)?.title || 'Root';
    const descendants = getDescendantNodes(nodeId);
    const movedNewType = getChildType(newParent.type);

    // Recompute each descendant's new type at the same relative depth below
    // the moved node, so a Level 5 subtask that gets dragged to become a
    // Level 4 task (say) correctly shifts everything beneath it too.
    const depthOf = new Map<string, number>();
    depthOf.set(nodeId, 0);
    for (const d of descendants) {
      const parentDepth = depthOf.get(d.parent_id || '');
      depthOf.set(d.id, (parentDepth ?? 0) + 1);
    }
    const typeOrder: NodeItem['type'][] = ['department', 'season', 'project', 'task', 'subtask'];
    const baseIndex = typeOrder.indexOf(movedNewType);

    const newSiblings = nodes.filter(n => n.parent_id === newParentId);
    const nextSortOrder = newSiblings.length > 0 ? Math.max(...newSiblings.map(n => n.sort_order || 0)) + 1 : 1;

    const movedUpdate: Record<string, any> = {
      parent_id: newParentId,
      type: movedNewType,
      sort_order: nextSortOrder,
      updated_at: new Date().toISOString(),
    };
    if (dateOverrides[nodeId]) movedUpdate.planned_date = dateOverrides[nodeId];
    await supabase.from('nodes').update(movedUpdate).eq('id', nodeId);

    for (const d of descendants) {
      const depth = depthOf.get(d.id) ?? 1;
      const newType = typeOrder[Math.min(typeOrder.length - 1, baseIndex + depth)];
      const update: Record<string, any> = { updated_at: new Date().toISOString() };
      if (newType !== d.type) update.type = newType;
      if (dateOverrides[d.id]) update.planned_date = dateOverrides[d.id];
      if (Object.keys(update).length > 1) {
        await supabase.from('nodes').update(update).eq('id', d.id);
      }
    }

    await logNodeActivity(
      nodeId,
      'moved',
      `Moved "${movedNode.title}" from "${oldParentTitle}" to "${newParent.title}"`,
      { parent_id: movedNode.parent_id, type: movedNode.type },
      { parent_id: newParentId, type: movedNewType }
    );

    await fetchNodesAndReminders();
  };

  const getScopedNodes = useCallback((): NodeItem[] => {
    return nodes;
  }, [nodes]);

  const getAncestorColors = (nodeId: string, allNodes: NodeItem[]): string[] => {
    const colors: string[] = [];
    let current = allNodes.find(n => n.id === nodeId);
    while (current) {
      if (current.color) colors.unshift(current.color);
      if (!current.parent_id) break;
      current = allNodes.find(n => n.id === current!.parent_id);
    }
    return colors;
  };

  const getProjectTitle = (nodeId: string, allNodes: NodeItem[]): string => {
    let current = allNodes.find(n => n.id === nodeId);
    while (current) {
      if (current.type === 'project' || current.type === 'season' || current.type === 'department') {
        return current.title;
      }
      if (!current.parent_id) break;
      current = allNodes.find(n => n.id === current!.parent_id);
    }
    return 'Cadence Project';
  };

  const getTree = (): TreeNode[] => {
    const scopedNodes = getScopedNodes();

    const buildSubtree = (parentId: string | null, depth: number, ancestorColors: string[]): TreeNode[] => {
      const children = scopedNodes.filter(n => n.parent_id === parentId);
      children.sort((a, b) => a.sort_order - b.sort_order);

      return children.map(node => {
        const currentAncestorColors = [...ancestorColors, ...(node.color ? [node.color] : [])];
        const effective_color = resolveColor(node.color, ancestorColors);
        
        const now = new Date();
        const is_overdue = Boolean(
          node.planned_date && 
          isBefore(parseISO(node.planned_date), now) && 
          !node.actual_date && 
          node.status !== 'done'
        );

        const subTreeChildren = buildSubtree(node.id, depth + 1, currentAncestorColors);

        return {
          ...node,
          effective_color,
          depth,
          is_overdue,
          children: subTreeChildren,
        };
      });
    };

    return buildSubtree(null, 0, []);
  };

  const getTodayUpcomingFeed = () => {
    const scopedNodes = getScopedNodes();
    const overdue: TodayItem[] = [];
    const today: TodayItem[] = [];
    const upcoming: TodayItem[] = [];

    const now = new Date();
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);

    const todayEnd = new Date();
    todayEnd.setHours(23, 59, 59, 999);

    const weekLater = addDays(todayEnd, 7);

    scopedNodes.forEach(node => {
      if (!node.planned_date || node.status === 'done') return;

      const pDate = parseISO(node.planned_date);
      if (!isValid(pDate)) return;

      const ancestorColors = getAncestorColors(node.id, nodes);
      const effective_color = resolveColor(node.color, ancestorColors);
      const project_title = getProjectTitle(node.id, nodes);

      const is_overdue = isBefore(pDate, todayStart) && !node.actual_date;

      if (is_overdue) {
        overdue.push({
          ...node,
          effective_color,
          is_overdue: true,
          category: 'overdue',
          project_title,
        });
      } else if (pDate >= todayStart && pDate <= todayEnd) {
        today.push({
          ...node,
          effective_color,
          is_overdue: false,
          category: 'today',
          project_title,
        });
      } else if (pDate > todayEnd && pDate <= weekLater) {
        upcoming.push({
          ...node,
          effective_color,
          is_overdue: false,
          category: 'upcoming',
          project_title,
        });
      }
    });

    const triggeredReminders = reminders
      .filter(r => {
        if (r.dismissed_at) return false;
        if (r.snoozed_until && isAfter(parseISO(r.snoozed_until), now)) return false;
        
        const triggerDate = parseISO(r.remind_at);
        if (!isValid(triggerDate)) return false;

        return isBefore(triggerDate, todayEnd) || isDateToday(triggerDate);
      })
      .map(r => {
        const node = nodes.find(n => n.id === r.node_id);
        let effective_color = '#f59e0b';
        if (node) {
          const ancestorColors = getAncestorColors(node.id, nodes);
          effective_color = resolveColor(node.color, ancestorColors);
        }
        return {
          ...r,
          node_title: node?.title || 'Milestone',
          project_title: node ? getProjectTitle(node.id, nodes) : 'Project',
          effective_color,
        };
      });

    return { overdue, today, upcoming, triggeredReminders };
  };

  const cascadeDateChange = async (nodeId: string, newPlannedDateStr: string | null) => {
    const existingNode = nodes.find(n => n.id === nodeId);
    const prevDate = existingNode?.planned_date;

    try {
      await supabase.rpc('cascade_dates', {
        p_node_id: nodeId,
        p_new_planned_date: newPlannedDateStr,
      });

      await logNodeActivity(
        nodeId,
        'date_shifted',
        `Planned Date shifted from ${prevDate ? prevDate.slice(0, 10) : 'None'} to ${newPlannedDateStr ? newPlannedDateStr.slice(0, 10) : 'None'} (Relative cascade applied)`,
        { planned_date: prevDate },
        { planned_date: newPlannedDateStr }
      );

      await fetchNodesAndReminders();
      return;
    } catch {
      // Fallback
    }

    const updatedNodes = [...nodes];
    const targetIndex = updatedNodes.findIndex(n => n.id === nodeId);
    if (targetIndex === -1) return;

    updatedNodes[targetIndex] = {
      ...updatedNodes[targetIndex],
      planned_date: newPlannedDateStr,
      updated_at: new Date().toISOString(),
    };

    const updateChildrenDates = (parentId: string, parentDateStr: string | null) => {
      if (!parentDateStr) return;
      const parentDate = parseISO(parentDateStr);
      if (!isValid(parentDate)) return;

      const childrenIndices = updatedNodes
        .map((n, idx) => (n.parent_id === parentId && n.trigger_offset_days !== null ? idx : -1))
        .filter(idx => idx !== -1);

      for (const idx of childrenIndices) {
        const child = updatedNodes[idx];
        const newChildDate = addDays(parentDate, child.trigger_offset_days!);
        const newChildDateISO = formatISO(newChildDate);

        updatedNodes[idx] = {
          ...child,
          planned_date: newChildDateISO,
          updated_at: new Date().toISOString(),
        };

        updateChildrenDates(child.id, newChildDateISO);
      }
    };

    updateChildrenDates(nodeId, newPlannedDateStr);

    for (const n of updatedNodes) {
      await supabase.from('nodes').update({ planned_date: n.planned_date, updated_at: n.updated_at }).eq('id', n.id);
    }

    await logNodeActivity(
      nodeId,
      'date_shifted',
      `Planned Date shifted to ${newPlannedDateStr ? newPlannedDateStr.slice(0, 10) : 'None'}`,
      { planned_date: prevDate },
      { planned_date: newPlannedDateStr }
    );

    await fetchNodesAndReminders();
  };

  const addNode = async (data: Partial<NodeItem>): Promise<string> => {
    const newNodeId = data.id || crypto.randomUUID();
    const newNode = {
      id: newNodeId,
      org_id: profile?.org_id || null,
      user_id: user?.id || null,
      created_by: user?.id || null,
      parent_id: data.parent_id || null,
      type: data.type || 'task',
      title: data.title || 'Untitled Task',
      description: data.description || null,
      color: data.color || null,
      start_date: data.start_date || null,
      planned_date: data.planned_date || null,
      actual_date: data.actual_date || null,
      trigger_offset_days: data.trigger_offset_days !== undefined ? data.trigger_offset_days : null,
      status: data.status || 'not_started',
      is_critical: data.is_critical || false,
      assignee: data.assignee || null,
      assignee_user_id: data.assignee_user_id || null,
      calendar_sync_enabled: data.calendar_sync_enabled !== undefined ? data.calendar_sync_enabled : true,
      google_event_id: data.google_event_id || null,
      vendor_contact: data.vendor_contact || null,
      department: data.department || profile?.department || (isIndividual ? 'Personal' : 'Production'),
      season: data.season || 'SS26',
      sort_order: data.sort_order || 1,
    };

    const { error } = await supabase.from('nodes').insert(newNode);
    if (error) {
      console.error('addNode Supabase insert error:', error);
      throw error;
    }

    await logNodeActivity(
      newNodeId,
      'created',
      `Milestone "${newNode.title}" created (${newNode.department})`,
      null,
      newNode
    );

    await fetchNodesAndReminders();
    return newNodeId;
  };

  const updateNode = async (nodeId: string, data: Partial<NodeItem>) => {
    const existingNode = nodes.find(n => n.id === nodeId);
    const prevValues: Record<string, any> = {};
    if (existingNode) {
      Object.keys(data).forEach(k => {
        prevValues[k] = (existingNode as any)[k];
      });
    }

    if (data.planned_date !== undefined && data.planned_date !== existingNode?.planned_date) {
      await cascadeDateChange(nodeId, data.planned_date);
    }

    const { error } = await supabase.from('nodes').update({ ...data, updated_at: new Date().toISOString() }).eq('id', nodeId);
    if (error) console.error('updateNode error:', error);

    const changes = Object.keys(data).map(k => `${k}: ${data[k as keyof NodeItem]}`).join(', ');
    await logNodeActivity(
      nodeId,
      'details_updated',
      `Updated milestone (${changes})`,
      prevValues,
      data
    );

    await fetchNodesAndReminders();
  };

  const deleteNode = async (nodeId: string) => {
    const existingNode = nodes.find(n => n.id === nodeId);

    await logNodeActivity(
      nodeId,
      'deleted',
      `Milestone "${existingNode?.title || nodeId}" deleted`,
      existingNode,
      null
    );

    const { error } = await supabase.from('nodes').delete().eq('id', nodeId);
    if (error) console.error('deleteNode error:', error);
    if (selectedNode && selectedNode.id === nodeId) setSelectedNode(null);
    await fetchNodesAndReminders();
  };

  const toggleCritical = async (nodeId: string) => {
    const node = nodes.find(n => n.id === nodeId);
    if (!node) return;
    const newCrit = !node.is_critical;
    await supabase.from('nodes').update({ is_critical: newCrit, updated_at: new Date().toISOString() }).eq('id', nodeId);
    
    await logNodeActivity(
      nodeId,
      'details_updated',
      `Critical path flagged: ${newCrit ? 'YES' : 'NO'}`
    );

    await fetchNodesAndReminders();
  };

  const updateStatus = async (nodeId: string, status: NodeStatus) => {
    const node = nodes.find(n => n.id === nodeId);
    const prevStatus = node?.status;
    const actual_date = status === 'done' ? new Date().toISOString() : null;

    // Completed tasks don't need a calendar reminder anymore — clear the
    // Google Calendar link and delete the event so it doesn't linger.
    const eventIdToClean = status === 'done' ? node?.google_event_id : null;

    await supabase.from('nodes').update({
      status,
      actual_date,
      updated_at: new Date().toISOString(),
      ...(eventIdToClean ? { google_event_id: null } : {}),
    }).eq('id', nodeId);

    if (eventIdToClean) {
      deleteGoogleCalendarEvents([eventIdToClean]).catch(() => {});
    }

    await logNodeActivity(
      nodeId,
      'status_changed',
      `Status changed from "${prevStatus}" to "${status}"`,
      { status: prevStatus },
      { status }
    );

    await fetchNodesAndReminders();
  };

  const toggleDone = async (nodeId: string) => {
    const node = nodes.find(n => n.id === nodeId);
    if (!node) return;
    const newStatus: NodeStatus = node.status === 'done' ? 'in_progress' : 'done';
    const actual_date = newStatus === 'done' ? new Date().toISOString() : null;

    // Completed tasks don't need a calendar reminder anymore — clear the
    // Google Calendar link and delete the event so it doesn't linger.
    const eventIdToClean = newStatus === 'done' ? node.google_event_id : null;

    await supabase.from('nodes').update({
      status: newStatus,
      actual_date,
      updated_at: new Date().toISOString(),
      ...(eventIdToClean ? { google_event_id: null } : {}),
    }).eq('id', nodeId);

    if (eventIdToClean) {
      deleteGoogleCalendarEvents([eventIdToClean]).catch(() => {});
    }

    await logNodeActivity(
      nodeId,
      'status_changed',
      `Marked as ${newStatus === 'done' ? 'DONE' : 'IN PROGRESS'}`,
      { status: node.status },
      { status: newStatus }
    );

    await fetchNodesAndReminders();
  };

  // Pure Supabase Single Source of Truth: addReminder
  const addReminder = async (data: Partial<ReminderItem>) => {
    if (!data.node_id) {
      console.error('addReminder error: missing node_id');
      return;
    }

    const newRem: any = {
      id: data.id || crypto.randomUUID(),
      node_id: data.node_id,
      remind_at: data.remind_at || new Date().toISOString(),
      offset_mode: data.offset_mode || (data.offset_days !== null && data.offset_days !== undefined ? 'relative' : 'fixed'),
      offset_days: data.offset_days !== undefined ? data.offset_days : null,
      message: data.message || 'Milestone follow up reminder',
      is_recurring: data.is_recurring || false,
      recurrence_rule: data.is_recurring ? (data.recurrence_rule || null) : null,
    };
    if (data.note) {
      newRem.note = data.note;
    }

    const { error } = await supabase.from('reminders').insert(newRem);
    if (error) {
      console.error('addReminder Supabase insert error:', error);
      toast.error(`Couldn't save alert: ${error.message}. Try running the updated supabase/full_schema.sql in your Supabase SQL Editor.`);
      return;
    }

    // Refresh state directly from Supabase single source of truth
    await fetchNodesAndReminders();
  };

  const updateReminder = async (reminderId: string, data: Partial<ReminderItem>) => {
    const { error } = await supabase.from('reminders').update({ ...data, updated_at: new Date().toISOString() }).eq('id', reminderId);
    if (error) console.error('updateReminder error:', error);
    await fetchNodesAndReminders();
  };

  const dismissReminder = async (reminderId: string) => {
    // Recurring reminders don't get permanently dismissed — instead they're
    // rolled forward to their next occurrence, clearing dismissed/snoozed
    // state so the alert becomes "live" again for the next cycle.
    const reminder = reminders.find(r => r.id === reminderId);
    if (reminder?.is_recurring && reminder.recurrence_rule) {
      const nextRemindAt = computeNextOccurrence(reminder.remind_at, reminder.recurrence_rule);
      if (nextRemindAt) {
        notifiedReminderIdsRef.current.delete(reminderId);
        const { error } = await supabase.from('reminders').update({
          remind_at: nextRemindAt,
          dismissed_at: null,
          snoozed_until: null,
        }).eq('id', reminderId);
        if (error) console.error('dismissReminder (recurrence advance) error:', error);
        await fetchNodesAndReminders();
        return;
      }
    }

    const nowISO = new Date().toISOString();
    const { error } = await supabase.from('reminders').update({ dismissed_at: nowISO }).eq('id', reminderId);
    if (error) console.error('dismissReminder error:', error);
    await fetchNodesAndReminders();
  };

  const snoozeReminder = async (reminderId: string, snoozeOption: '1h' | '1d' | '3d' | string) => {
    const now = new Date();
    let snoozedISO: string;

    if (snoozeOption === '1h') {
      snoozedISO = formatISO(addHours(now, 1));
    } else if (snoozeOption === '1d') {
      snoozedISO = formatISO(addDays(now, 1));
    } else if (snoozeOption === '3d') {
      snoozedISO = formatISO(addDays(now, 3));
    } else {
      snoozedISO = new Date(snoozeOption).toISOString();
    }

    const { error } = await supabase.from('reminders').update({ snoozed_until: snoozedISO }).eq('id', reminderId);
    if (error) console.error('snoozeReminder error:', error);
    await fetchNodesAndReminders();
  };

  const addReminderNote = async (reminderId: string, noteText: string) => {
    const { error } = await supabase.from('reminders').update({ note: noteText, updated_at: new Date().toISOString() }).eq('id', reminderId);
    if (error) console.error('addReminderNote error:', error);
    await fetchNodesAndReminders();
  };

  const deleteReminder = async (reminderId: string) => {
    const { error } = await supabase.from('reminders').delete().eq('id', reminderId);
    if (error) console.error('deleteReminder error:', error);
    await fetchNodesAndReminders();
  };

  const totalScheduledAlertsCount = reminders.filter(r => !r.dismissed_at).length;
  
  const now = new Date();
  const todayEnd = new Date();
  todayEnd.setHours(23, 59, 59, 999);

  const triggeredAlertsCount = reminders.filter(r => {
    if (r.dismissed_at) return false;
    if (r.snoozed_until && isAfter(parseISO(r.snoozed_until), now)) return false;
    const triggerDate = parseISO(r.remind_at);
    return isBefore(triggerDate, todayEnd) || isDateToday(triggerDate);
  }).length;

  return (
    <NodeContext.Provider
      value={{
        nodes,
        reminders,
        selectedNode,
        setSelectedNode,
        isLoading,
        canUserEditNode,
        getNodeAccessInfo,
        isNodeAncestorOfAssigned,
        getDescendantNodes,
        hideNodeLocally,
        restoreNodesLocally,
        cleanupGoogleEventsFor,
        completeNodeAndSubtree,
        getTree,
        previewMove,
        commitMove,
        getTodayUpcomingFeed,
        fetchNodeAuditLogs,
        logNodeActivity,
        cascadeDateChange,
        addNode,
        updateNode,
        deleteNode,
        toggleCritical,
        updateStatus,
        toggleDone,
        addReminder,
        updateReminder,
        dismissReminder,
        snoozeReminder,
        addReminderNote,
        deleteReminder,
        totalScheduledAlertsCount,
        triggeredAlertsCount,
      }}
    >
      {children}
    </NodeContext.Provider>
  );
};

export const useNodes = () => {
  const ctx = useContext(NodeContext);
  if (!ctx) throw new Error('useNodes must be used within NodeProvider');
  return ctx;
};
