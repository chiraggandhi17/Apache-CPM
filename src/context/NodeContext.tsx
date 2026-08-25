import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import { NodeItem, ReminderItem, TreeNode, TodayItem, NodeStatus } from '../types/domain';
import { resolveColor } from '../lib/color-resolver';
import { addDays, addHours, parseISO, formatISO, isValid, isBefore, isToday as isDateToday, isAfter } from 'date-fns';
import { playNotificationSound } from '../utils/sound';

interface NodeContextType {
  nodes: NodeItem[];
  reminders: ReminderItem[];
  selectedNode: NodeItem | null;
  setSelectedNode: (node: NodeItem | null) => void;
  isLoading: boolean;
  
  // Tree building & queries
  getTree: () => TreeNode[];
  getTodayUpcomingFeed: () => {
    overdue: TodayItem[];
    today: TodayItem[];
    upcoming: TodayItem[];
    triggeredReminders: ReminderItem[];
  };

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
    const buildSubtree = (parentId: string | null, depth: number, ancestorColors: string[]): TreeNode[] => {
      const children = nodes.filter(n => n.parent_id === parentId);
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
    const overdue: TodayItem[] = [];
    const today: TodayItem[] = [];
    const upcoming: TodayItem[] = [];

    const now = new Date();
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);

    const todayEnd = new Date();
    todayEnd.setHours(23, 59, 59, 999);

    const weekLater = addDays(todayEnd, 7);

    nodes.forEach(node => {
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
    // 1. Try atomic PostgreSQL RPC cascade_dates first
    try {
      await supabase.rpc('cascade_dates', {
        p_target_node_id: nodeId,
        p_new_planned_date: newPlannedDateStr,
      });
      await fetchNodesAndReminders();
      return;
    } catch {
      // Client-side cascade fallback if RPC not present in DB
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

    // Save N updated nodes to Supabase
    for (const n of updatedNodes) {
      await supabase.from('nodes').update({ planned_date: n.planned_date, updated_at: n.updated_at }).eq('id', n.id);
    }
    fetchNodesAndReminders();
  };

  const addNode = async (data: Partial<NodeItem>) => {
    const newNode = {
      id: crypto.randomUUID(),
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
      department: data.department || 'Production',
      season: data.season || 'SS26',
      sort_order: data.sort_order || 1,
    };

    const { error } = await supabase.from('nodes').insert(newNode);
    if (error) console.error('addNode error:', error);
    fetchNodesAndReminders();
  };

  const updateNode = async (nodeId: string, data: Partial<NodeItem>) => {
    if (data.planned_date !== undefined) {
      await cascadeDateChange(nodeId, data.planned_date);
    }
    const { error } = await supabase.from('nodes').update({ ...data, updated_at: new Date().toISOString() }).eq('id', nodeId);
    if (error) console.error('updateNode error:', error);
    fetchNodesAndReminders();
  };

  const deleteNode = async (nodeId: string) => {
    const { error } = await supabase.from('nodes').delete().eq('id', nodeId);
    if (error) console.error('deleteNode error:', error);
    if (selectedNode && selectedNode.id === nodeId) setSelectedNode(null);
    fetchNodesAndReminders();
  };

  const toggleCritical = async (nodeId: string) => {
    const node = nodes.find(n => n.id === nodeId);
    if (!node) return;
    await supabase.from('nodes').update({ is_critical: !node.is_critical, updated_at: new Date().toISOString() }).eq('id', nodeId);
    fetchNodesAndReminders();
  };

  const updateStatus = async (nodeId: string, status: NodeStatus) => {
    const actual_date = status === 'done' ? new Date().toISOString() : null;
    await supabase.from('nodes').update({ status, actual_date, updated_at: new Date().toISOString() }).eq('id', nodeId);
    fetchNodesAndReminders();
  };

  const toggleDone = async (nodeId: string) => {
    const node = nodes.find(n => n.id === nodeId);
    if (!node) return;
    const newStatus: NodeStatus = node.status === 'done' ? 'in_progress' : 'done';
    const actual_date = newStatus === 'done' ? new Date().toISOString() : null;
    await supabase.from('nodes').update({ status: newStatus, actual_date, updated_at: new Date().toISOString() }).eq('id', nodeId);
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
        getTree,
        getTodayUpcomingFeed,
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
