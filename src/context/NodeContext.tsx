import React, { createContext, useContext, useState, useEffect } from 'react';
import { NodeItem, ReminderItem, TreeNode, TodayItem, NodeStatus } from '../types/domain';
import { resolveColor } from '../lib/color-resolver';
import { addDays, addHours, parseISO, formatISO, isValid, isBefore, isToday as isDateToday, isAfter } from 'date-fns';
import { playNotificationSound } from '../utils/sound';

// Initial Demo Seed Data
const INITIAL_NODES: NodeItem[] = [
  {
    id: '10000000-0000-0000-0000-000000000001',
    parent_id: null,
    type: 'department',
    title: 'Production',
    description: 'Footwear Manufacturing & Assembly Department',
    color: '#2563EB', // Blue
    planned_date: null,
    actual_date: null,
    trigger_offset_days: null,
    status: 'in_progress',
    is_critical: false,
    assignee: null,
    vendor_contact: null,
    department: 'Production',
    season: null,
    sort_order: 1,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  },
  {
    id: '20000000-0000-0000-0000-000000000002',
    parent_id: '10000000-0000-0000-0000-000000000001',
    type: 'season',
    title: 'SS26',
    description: 'Spring/Summer 2026 Collection for adidas',
    color: null,
    planned_date: null,
    actual_date: null,
    trigger_offset_days: null,
    status: 'in_progress',
    is_critical: false,
    assignee: null,
    vendor_contact: null,
    department: 'Production',
    season: 'SS26',
    sort_order: 1,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  },
  {
    id: '30000000-0000-0000-0000-000000000003',
    parent_id: '20000000-0000-0000-0000-000000000002',
    type: 'project',
    title: 'Model X — Running Shoe',
    description: 'High Performance Running Shoes - Final Ex-Factory Target',
    color: '#0D9488', // Teal override
    planned_date: '2026-12-31T00:00:00.000Z',
    actual_date: null,
    trigger_offset_days: null,
    status: 'in_progress',
    is_critical: true,
    assignee: 'Merchandising Team',
    vendor_contact: null,
    department: 'Production',
    season: 'SS26',
    sort_order: 1,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  },
  {
    id: '40000000-0000-0000-0000-000000000004',
    parent_id: '30000000-0000-0000-0000-000000000003',
    type: 'task',
    title: 'Start Production',
    description: 'Bulk assembly line setup and upper stitching',
    color: null,
    planned_date: '2026-12-01T00:00:00.000Z',
    actual_date: null,
    trigger_offset_days: -30,
    status: 'in_progress',
    is_critical: true,
    assignee: 'Production Lead',
    vendor_contact: null,
    department: 'Production',
    season: 'SS26',
    sort_order: 1,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  },
  {
    id: '50000000-0000-0000-0000-000000000005',
    parent_id: '40000000-0000-0000-0000-000000000004',
    type: 'subtask',
    title: 'Material A in-house (Mesh Upper)',
    description: 'Vendor batch delivery to factory warehouse',
    color: null,
    planned_date: '2026-11-24T00:00:00.000Z',
    actual_date: null,
    trigger_offset_days: -7,
    status: 'not_started',
    is_critical: true,
    assignee: 'Merchandising Team',
    vendor_contact: 'supplier-a@footwear.com',
    department: 'Production',
    season: 'SS26',
    sort_order: 1,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  },
  {
    id: '60000000-0000-0000-0000-000000000006',
    parent_id: '50000000-0000-0000-0000-000000000005',
    type: 'subtask',
    title: 'Contact Vendor re: Material A',
    description: 'Confirm dispatch status with Supplier X',
    color: null,
    planned_date: '2026-11-20T00:00:00.000Z',
    actual_date: '2026-11-20T10:00:00.000Z',
    trigger_offset_days: null,
    status: 'done',
    assignee: 'Alex (Purchasing)',
    vendor_contact: 'supplier-x@footwear-materials.com',
    department: 'Production',
    season: 'SS26',
    sort_order: 1,
    is_critical: false,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  },
  {
    id: '70000000-0000-0000-0000-000000000007',
    parent_id: '40000000-0000-0000-0000-000000000004',
    type: 'subtask',
    title: 'Material B in-house (Outsole Rubber)',
    description: 'Compounding and outsole pressing arrival',
    color: null,
    planned_date: '2026-11-26T00:00:00.000Z',
    actual_date: null,
    trigger_offset_days: -5,
    status: 'not_started',
    is_critical: false,
    assignee: 'Supply Chain',
    vendor_contact: null,
    department: 'Production',
    season: 'SS26',
    sort_order: 2,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  },
  {
    id: '80000000-0000-0000-0000-000000000008',
    parent_id: '30000000-0000-0000-0000-000000000003',
    type: 'task',
    title: 'QC Inspection (AQL 2.5)',
    description: 'Final quality audit before packing & container loading',
    color: null,
    planned_date: '2026-12-21T00:00:00.000Z',
    actual_date: null,
    trigger_offset_days: -10,
    status: 'not_started',
    is_critical: true,
    assignee: 'QA Manager',
    vendor_contact: null,
    department: 'Production',
    season: 'SS26',
    sort_order: 2,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  },
];

const INITIAL_REMINDERS: ReminderItem[] = [
  {
    id: 'rem-1',
    node_id: '60000000-0000-0000-0000-000000000006',
    remind_at: '2026-11-22T09:00:00.000Z',
    offset_mode: 'relative',
    offset_days: 2,
    message: 'Follow up if no dispatch confirmation received from Supplier X',
    note: null,
    is_recurring: false,
    dismissed_at: null,
    snoozed_until: null,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  },
  {
    id: 'rem-2',
    node_id: '50000000-0000-0000-0000-000000000005',
    remind_at: '2026-10-10T09:00:00.000Z', // Future reminder example
    offset_mode: 'fixed',
    offset_days: null,
    message: 'Pre-check warehouse space for Material A bulk batch',
    note: null,
    is_recurring: false,
    dismissed_at: null,
    snoozed_until: null,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  },
];

interface NodeContextType {
  nodes: NodeItem[];
  reminders: ReminderItem[];
  selectedNode: NodeItem | null;
  setSelectedNode: (node: NodeItem | null) => void;
  
  // Tree building & queries
  getTree: () => TreeNode[];
  getTodayUpcomingFeed: () => {
    overdue: TodayItem[];
    today: TodayItem[];
    upcoming: TodayItem[];
    triggeredReminders: ReminderItem[];
  };

  // Actions
  cascadeDateChange: (nodeId: string, newPlannedDate: string | null) => void;
  addNode: (data: Partial<NodeItem>) => void;
  updateNode: (nodeId: string, data: Partial<NodeItem>) => void;
  deleteNode: (nodeId: string) => void;
  toggleCritical: (nodeId: string) => void;
  updateStatus: (nodeId: string, status: NodeStatus) => void;
  toggleDone: (nodeId: string) => void;

  // Reminders
  addReminder: (data: Partial<ReminderItem>) => void;
  updateReminder: (reminderId: string, data: Partial<ReminderItem>) => void;
  dismissReminder: (reminderId: string) => void;
  snoozeReminder: (reminderId: string, snoozeOption: '1h' | '1d' | '3d' | string) => void;
  addReminderNote: (reminderId: string, noteText: string) => void;
  deleteReminder: (reminderId: string) => void;
  totalScheduledAlertsCount: number;
  triggeredAlertsCount: number;
}

const NodeContext = createContext<NodeContextType | undefined>(undefined);

export const NodeProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [nodes, setNodes] = useState<NodeItem[]>(() => {
    const saved = localStorage.getItem('cadence_nodes');
    return saved ? JSON.parse(saved) : INITIAL_NODES;
  });

  const [reminders, setReminders] = useState<ReminderItem[]>(() => {
    const saved = localStorage.getItem('cadence_reminders');
    return saved ? JSON.parse(saved) : INITIAL_REMINDERS;
  });

  const [selectedNode, setSelectedNode] = useState<NodeItem | null>(null);

  useEffect(() => {
    localStorage.setItem('cadence_nodes', JSON.stringify(nodes));
  }, [nodes]);

  useEffect(() => {
    localStorage.setItem('cadence_reminders', JSON.stringify(reminders));
  }, [reminders]);

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

  // Build Today / Upcoming Feed
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

    // CORRECTED ALERT FEED: ONLY show reminders triggered TODAY or OVERDUE
    // Do NOT show future reminders (e.g. Oct 10th) on the Today Dashboard!
    const triggeredReminders = reminders
      .filter(r => {
        if (r.dismissed_at) return false;
        if (r.snoozed_until && isAfter(parseISO(r.snoozed_until), now)) return false;
        
        const triggerDate = parseISO(r.remind_at);
        if (!isValid(triggerDate)) return false;

        // Is triggered today or in the past (overdue alert)
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

  const cascadeDateChange = (nodeId: string, newPlannedDateStr: string | null) => {
    setNodes(prevNodes => {
      const updatedNodes = [...prevNodes];
      const targetIndex = updatedNodes.findIndex(n => n.id === nodeId);
      if (targetIndex === -1) return prevNodes;

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
      return updatedNodes;
    });

    if (newPlannedDateStr) {
      setReminders(prevReminders => {
        return prevReminders.map(rem => {
          if (rem.node_id === nodeId && rem.offset_mode !== 'fixed' && rem.offset_days !== null) {
            const nodeDate = parseISO(newPlannedDateStr);
            if (isValid(nodeDate)) {
              const newRemindAt = addDays(nodeDate, rem.offset_days);
              return {
                ...rem,
                remind_at: formatISO(newRemindAt),
                updated_at: new Date().toISOString(),
              };
            }
          }
          return rem;
        });
      });
    }
  };

  const addNode = (data: Partial<NodeItem>) => {
    const newNode: NodeItem = {
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
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    setNodes(prev => [...prev, newNode]);

    if (newNode.parent_id && newNode.trigger_offset_days !== null) {
      const parent = nodes.find(n => n.id === newNode.parent_id);
      if (parent && parent.planned_date) {
        const computedDate = formatISO(addDays(parseISO(parent.planned_date), newNode.trigger_offset_days));
        setNodes(prev => prev.map(n => n.id === newNode.id ? { ...n, planned_date: computedDate } : n));
      }
    }
  };

  const updateNode = (nodeId: string, data: Partial<NodeItem>) => {
    if (data.planned_date !== undefined) {
      cascadeDateChange(nodeId, data.planned_date);
    }
    setNodes(prev => prev.map(n => n.id === nodeId ? { ...n, ...data, updated_at: new Date().toISOString() } : n));
  };

  const deleteNode = (nodeId: string) => {
    const getDescendantIds = (id: string, list: NodeItem[]): string[] => {
      const children = list.filter(n => n.parent_id === id);
      let ids = children.map(c => c.id);
      for (const child of children) {
        ids = [...ids, ...getDescendantIds(child.id, list)];
      }
      return ids;
    };

    const toDelete = [nodeId, ...getDescendantIds(nodeId, nodes)];
    setNodes(prev => prev.filter(n => !toDelete.includes(n.id)));
    setReminders(prev => prev.filter(r => !toDelete.includes(r.node_id)));

    if (selectedNode && toDelete.includes(selectedNode.id)) {
      setSelectedNode(null);
    }
  };

  const toggleCritical = (nodeId: string) => {
    setNodes(prev => prev.map(n => n.id === nodeId ? { ...n, is_critical: !n.is_critical } : n));
  };

  const updateStatus = (nodeId: string, status: NodeStatus) => {
    const actual_date = status === 'done' ? new Date().toISOString() : null;
    setNodes(prev => prev.map(n => n.id === nodeId ? { ...n, status, actual_date } : n));
  };

  const toggleDone = (nodeId: string) => {
    setNodes(prev => prev.map(n => {
      if (n.id === nodeId) {
        const newStatus: NodeStatus = n.status === 'done' ? 'in_progress' : 'done';
        const actual_date = newStatus === 'done' ? new Date().toISOString() : null;
        return { ...n, status: newStatus, actual_date, updated_at: new Date().toISOString() };
      }
      return n;
    }));
  };

  const addReminder = (data: Partial<ReminderItem>) => {
    const newRem: ReminderItem = {
      id: crypto.randomUUID(),
      node_id: data.node_id!,
      remind_at: data.remind_at || new Date().toISOString(),
      offset_mode: data.offset_mode || (data.offset_days !== null && data.offset_days !== undefined ? 'relative' : 'fixed'),
      offset_days: data.offset_days !== undefined ? data.offset_days : null,
      message: data.message || 'Milestone follow up reminder',
      note: data.note || null,
      is_recurring: data.is_recurring || false,
      dismissed_at: null,
      snoozed_until: null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    setReminders(prev => [...prev, newRem]);
  };

  const updateReminder = (reminderId: string, data: Partial<ReminderItem>) => {
    setReminders(prev => prev.map(r => r.id === reminderId ? { ...r, ...data, updated_at: new Date().toISOString() } : r));
  };

  const dismissReminder = (reminderId: string) => {
    setReminders(prev => prev.map(r => r.id === reminderId ? { ...r, dismissed_at: new Date().toISOString() } : r));
  };

  const snoozeReminder = (reminderId: string, snoozeOption: '1h' | '1d' | '3d' | string) => {
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

    setReminders(prev => prev.map(r => r.id === reminderId ? { ...r, snoozed_until: snoozedISO } : r));
  };

  const addReminderNote = (reminderId: string, noteText: string) => {
    setReminders(prev => prev.map(r => r.id === reminderId ? { ...r, note: noteText, updated_at: new Date().toISOString() } : r));
  };

  const deleteReminder = (reminderId: string) => {
    setReminders(prev => prev.filter(r => r.id !== reminderId));
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
