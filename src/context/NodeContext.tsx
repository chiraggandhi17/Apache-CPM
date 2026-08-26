import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from './AuthContext';
import { NodeItem, ReminderItem, TreeNode, TodayItem, NodeStatus } from '../types/domain';
import { resolveColor } from '../lib/color-resolver';
import { addDays, addHours, parseISO, formatISO, isValid, isBefore, isToday as isDateToday, isAfter } from 'date-fns';
import { playNotificationSound } from '../utils/sound';

export interface NodeAuditLog {
  id: string;
  node_id: string;
  org_id: string | null;
  user_id: string | null;
  user_email: string;
  user_name: string | null;
  action: 'created' | 'date_shifted' | 'status_changed' | 'details_updated' | 'deleted';
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
  completeNodeAndSubtree: (nodeId: string) => Promise<void>;
  getTree: () => TreeNode[];
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
  addNode: (data: Partial<NodeItem>) => Promise<void>;
  updateNode: (nodeId: string, data: Partial<NodeItem>) => Promise<void>;
  deleteNode: (nodeId: string) => Promise<void>;
  toggleCritical: (nodeId: string) => Promise<void>;
  updateStatus: (nodeId: string, status: NodeStatus) => Promise<void>;
  toggleDone: (nodeId: string) => Promise<void>;

  // Reminders
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
  const { profile, isSuperAdmin, isOrgAdmin, isIndividual, accessLevel } = useAuth();
  
  const [nodes, setNodes] = useState<NodeItem[]>([]);
  const [reminders, setReminders] = useState<ReminderItem[]>([]);
  const [selectedNode, setSelectedNode] = useState<NodeItem | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);

  // Fetch nodes & reminders directly from Supabase Cloud DB
  const fetchNodesAndReminders = useCallback(async () => {
    try {
      const { data: nodesData, error: nodesErr } = await supabase
        .from('nodes')
        .select('*')
        .order('sort_order', { ascending: true });

      if (nodesErr) throw nodesErr;

      const { data: remindersData, error: remErr } = await supabase
        .from('reminders')
        .select('*');

      if (remErr) throw remErr;

      setNodes(nodesData || []);
      setReminders(remindersData || []);
    } catch (err) {
      console.error('Supabase fetch error:', err);
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Initial fetch + Supabase Realtime Subscription Setup
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
  }, [fetchNodesAndReminders]);

  useEffect(() => {
    if (selectedNode) {
      const updated = nodes.find(n => n.id === selectedNode.id);
      if (updated) setSelectedNode(updated);
    }
  }, [nodes]);

  // Audio chime polling hook
  useEffect(() => {
    const checkReminders = () => {
      const soundEnabled = localStorage.getItem('cadence_sound_enabled') !== 'false';
      if (!soundEnabled) return;

      const now = new Date();
      const active = reminders.filter(r => {
        if (r.dismissed_at) return false;
        if (r.snoozed_until && isAfter(parseISO(r.snoozed_until), now)) return false;
        const triggerDate = parseISO(r.remind_at);
        return isBefore(triggerDate, now) || isDateToday(triggerDate);
      });

      if (active.length > 0) {
        playNotificationSound();
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
    // Personal users, Org Admins, and Level 1 are NEVER blocked by ancestor locks
    if (!profile || isIndividual || !profile.org_id || isOrgAdmin || accessLevel === 1 || profile.role === 'level_1') return false;

    const userEmail = profile.email.toLowerCase();
    const userFullName = (profile.full_name || '').toLowerCase();

    // Directly assigned nodes
    const assignedNodes = nodes.filter(n => {
      if (!n.assignee) return false;
      const a = n.assignee.toLowerCase();
      return a.includes(userEmail) || (userFullName && a.includes(userFullName));
    });

    // Check if nodeId is in the ancestor chain of any assigned node
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
    // If no profile or individual personal user (no org_id) -> ALWAYS Full Creator/Edit access!
    if (!profile || isIndividual || !profile.org_id || profile.role === 'level_1') {
      return true;
    }
    
    // 1. Super Admin & Org Admin have universal edit access
    if (isSuperAdmin || isOrgAdmin || profile.role === 'super_admin' || profile.role === 'org_admin') {
      return true;
    }

    // 2. Level 1 (Full Access): Can edit all nodes within their organization
    if (accessLevel === 1 || profile.role === 'senior_manager') {
      return true;
    }

    // 3. Level 3 (View Only) has zero edit access
    if (accessLevel === 3 || profile.role === 'level_3' || profile.role === 'viewer') {
      return false;
    }

    // 4. Level 2 (Limited Access):
    if (isNodeAncestorOfAssigned(nodeId)) {
      return false;
    }

    // If target node is their assigned task OR a child/descendant of their assigned task -> Editable!
    const userEmail = profile.email.toLowerCase();
    const userFullName = (profile.full_name || '').toLowerCase();

    const assignedNodes = nodes.filter(n => {
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

  // Clean compact access info helper for UI tooltips
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

  // Get all descendant nodes of a specific parent
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

  // Complete parent and all its descendant subtasks atomically
  const completeNodeAndSubtree = async (nodeId: string) => {
    const descendants = getDescendantNodes(nodeId);
    const allIdsToComplete = [nodeId, ...descendants.map(d => d.id)];
    const nowISO = new Date().toISOString();

    await supabase
      .from('nodes')
      .update({ status: 'done', actual_date: nowISO, updated_at: nowISO })
      .in('id', allIdsToComplete);

    for (const id of allIdsToComplete) {
      const n = nodes.find(item => item.id === id);
      if (n) {
        await logNodeActivity(id, 'status_changed', `Marked as DONE (Subtree completion cascade)`);
      }
    }

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
        return {
          ...r,
          node_title: node?.title || 'Milestone',
          project_title: node ? getProjectTitle(node.id, nodes) : 'Project',
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

    fetchNodesAndReminders();
  };

  const addNode = async (data: Partial<NodeItem>) => {
    const newNodeId = crypto.randomUUID();
    const newNode = {
      id: newNodeId,
      org_id: profile?.org_id || null,
      parent_id: data.parent_id || null,
      type: data.type || 'task',
      title: data.title || 'Untitled Task',
      description: data.description || null,
      color: data.color || null,
      planned_date: data.planned_date || null,
      actual_date: data.actual_date || null,
      trigger_offset_days: data.trigger_offset_days !== undefined ? data.trigger_offset_days : null,
      status: data.status || 'not_started',
      is_critical: data.is_critical || false,
      assignee: data.assignee || null,
      vendor_contact: data.vendor_contact || null,
      department: data.department || profile?.department || (isIndividual ? 'Personal' : 'Production'),
      season: data.season || 'SS26',
      sort_order: data.sort_order || 1,
    };

    const { error } = await supabase.from('nodes').insert(newNode);
    if (error) console.error('addNode error:', error);

    await logNodeActivity(
      newNodeId,
      'created',
      `Milestone "${newNode.title}" created (${newNode.department})`,
      null,
      newNode
    );

    fetchNodesAndReminders();
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

    fetchNodesAndReminders();
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
    fetchNodesAndReminders();
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

    fetchNodesAndReminders();
  };

  const updateStatus = async (nodeId: string, status: NodeStatus) => {
    const node = nodes.find(n => n.id === nodeId);
    const prevStatus = node?.status;
    const actual_date = status === 'done' ? new Date().toISOString() : null;
    
    await supabase.from('nodes').update({ status, actual_date, updated_at: new Date().toISOString() }).eq('id', nodeId);

    await logNodeActivity(
      nodeId,
      'status_changed',
      `Status changed from "${prevStatus}" to "${status}"`,
      { status: prevStatus },
      { status }
    );

    fetchNodesAndReminders();
  };

  const toggleDone = async (nodeId: string) => {
    const node = nodes.find(n => n.id === nodeId);
    if (!node) return;
    const newStatus: NodeStatus = node.status === 'done' ? 'in_progress' : 'done';
    const actual_date = newStatus === 'done' ? new Date().toISOString() : null;
    await supabase.from('nodes').update({ status: newStatus, actual_date, updated_at: new Date().toISOString() }).eq('id', nodeId);

    await logNodeActivity(
      nodeId,
      'status_changed',
      `Marked as ${newStatus === 'done' ? 'DONE' : 'IN PROGRESS'}`,
      { status: node.status },
      { status: newStatus }
    );

    fetchNodesAndReminders();
  };

  const addReminder = async (data: Partial<ReminderItem>) => {
    const newRem = {
      id: crypto.randomUUID(),
      node_id: data.node_id!,
      remind_at: data.remind_at || new Date().toISOString(),
      offset_mode: data.offset_mode || (data.offset_days !== null && data.offset_days !== undefined ? 'relative' : 'fixed'),
      offset_days: data.offset_days !== undefined ? data.offset_days : null,
      message: data.message || 'Milestone follow up reminder',
      note: data.note || null,
      is_recurring: data.is_recurring || false,
    };
    await supabase.from('reminders').insert(newRem);
    fetchNodesAndReminders();
  };

  const updateReminder = async (reminderId: string, data: Partial<ReminderItem>) => {
    await supabase.from('reminders').update({ ...data, updated_at: new Date().toISOString() }).eq('id', reminderId);
    fetchNodesAndReminders();
  };

  const dismissReminder = async (reminderId: string) => {
    await supabase.from('reminders').update({ dismissed_at: new Date().toISOString() }).eq('id', reminderId);
    fetchNodesAndReminders();
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

    await supabase.from('reminders').update({ snoozed_until: snoozedISO }).eq('id', reminderId);
    fetchNodesAndReminders();
  };

  const addReminderNote = async (reminderId: string, noteText: string) => {
    await supabase.from('reminders').update({ note: noteText, updated_at: new Date().toISOString() }).eq('id', reminderId);
    fetchNodesAndReminders();
  };

  const deleteReminder = async (reminderId: string) => {
    await supabase.from('reminders').delete().eq('id', reminderId);
    fetchNodesAndReminders();
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
        completeNodeAndSubtree,
        getTree,
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
