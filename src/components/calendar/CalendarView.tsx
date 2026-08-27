import React, { useState, useMemo } from 'react';
import FullCalendar from '@fullcalendar/react';
import dayGridPlugin from '@fullcalendar/daygrid';
import timeGridPlugin from '@fullcalendar/timegrid';
import interactionPlugin from '@fullcalendar/interaction';
import { useNodes } from '../../context/NodeContext';
import { NodeItem, ReminderItem } from '../../types/domain';
import { resolveColor } from '../../lib/color-resolver';
import { SearchableParentSelect } from '../shared/SearchableParentSelect';
import { addDays, parseISO } from 'date-fns';
import { Filter, Calendar as CalendarIcon, Bell, CheckCircle2, Zap, Layers, FolderTree, XCircle } from 'lucide-react';

interface CalendarViewProps {
  onSelectNode: (node: NodeItem) => void;
}

export const CalendarView: React.FC<CalendarViewProps> = ({ onSelectNode }) => {
  const { nodes, reminders } = useNodes();
  const [selectedParentId, setSelectedParentId] = useState<string | null>(null);
  const [selectedLevels, setSelectedLevels] = useState<number[]>([1, 2, 3, 4, 5]);
  const [showCompleted, setShowCompleted] = useState(true);
  const [showAlertsOnCal, setShowAlertsOnCal] = useState(true);

  const toggleLevel = (lvl: number) => {
    setSelectedLevels(prev =>
      prev.includes(lvl) ? prev.filter(l => l !== lvl) : [...prev, lvl]
    );
  };

  // Explicit type level resolution with depth fallback
  const getNodeLevel = (node: NodeItem): number => {
    if (node.type === 'department') return 1;
    if (node.type === 'season') return 2;
    if (node.type === 'project') return 3;
    if (node.type === 'task') return 4;
    if (node.type === 'subtask') return 5;

    let depth = 1;
    let curr: NodeItem | undefined = node;
    while (curr && curr.parent_id) {
      depth++;
      curr = nodes.find(n => n.id === curr!.parent_id);
    }
    return Math.min(5, depth);
  };

  // Calculate recursive descendant sub-task IDs for the selected parent task
  const allowedSubtreeNodeIds = useMemo(() => {
    if (!selectedParentId) return null; // Null means show all nodes

    const result = new Set<string>([selectedParentId]);
    const queue = [selectedParentId];

    while (queue.length > 0) {
      const pId = queue.shift()!;
      const children = nodes.filter(n => n.parent_id === pId);
      for (const child of children) {
        if (!result.has(child.id)) {
          result.add(child.id);
          queue.push(child.id);
        }
      }
    }

    return result;
  }, [selectedParentId, nodes]);

  const selectedParentNode = useMemo(() => {
    return selectedParentId ? nodes.find(n => n.id === selectedParentId) : null;
  }, [selectedParentId, nodes]);

  const events = useMemo(() => {
    // 1. Task & Milestone Events (Subtree & Level Filtered)
    const nodeEvents = nodes
      .filter(n => {
        if (!n.planned_date) return false;
        if (!showCompleted && n.status === 'done') return false;
        
        // Level Matrix Filter
        const level = getNodeLevel(n);
        if (!selectedLevels.includes(level)) return false;

        // Level 1 Department / Stream Subtree Filter
        if (allowedSubtreeNodeIds && !allowedSubtreeNodeIds.has(n.id)) return false;
        return true;
      })
      .map(n => {
        const ancestorColors: string[] = [];
        let curr = nodes.find(item => item.id === n.id);
        while (curr) {
          if (curr.color) ancestorColors.unshift(curr.color);
          if (!curr.parent_id) break;
          curr = nodes.find(item => item.id === curr!.parent_id);
        }

        const color = resolveColor(n.color, ancestorColors);
        const isDone = n.status === 'done';
        const plannedDateStr = n.planned_date!.length >= 10 ? n.planned_date!.slice(0, 10) : n.planned_date!;
        const startDateStr = n.start_date && n.start_date.length >= 10 ? n.start_date.slice(0, 10) : plannedDateStr;
        const isRange = Boolean(n.start_date && startDateStr !== plannedDateStr);

        let endDateStr: string | undefined = undefined;
        if (isRange) {
          try {
            endDateStr = addDays(parseISO(n.planned_date!), 1).toISOString().slice(0, 10);
          } catch {
            endDateStr = undefined;
          }
        }

        return {
          id: n.id,
          title: n.title,
          start: startDateStr,
          end: endDateStr,
          allDay: true,
          backgroundColor: isDone ? '#94a3b8' : color,
          borderColor: isDone ? '#64748b' : color,
          textColor: '#ffffff',
          extendedProps: { 
            node: n, 
            isReminder: false, 
            isRange,
            isDone, 
            isCritical: n.is_critical, 
            color,
            department: n.department 
          },
        };
      });

    // 2. Active Alerts & Reminders Events (Strictly bound to user authorized nodes, level filter, & parent subtree)
    const reminderEvents = showAlertsOnCal
      ? reminders
          .filter(r => {
            if (r.dismissed_at || !r.remind_at) return false;
            const parentNode = nodes.find(n => n.id === r.node_id);
            if (!parentNode) return false;

            // Level Matrix Filter for Reminders
            const parentLevel = getNodeLevel(parentNode);
            if (!selectedLevels.includes(parentLevel)) return false;

            if (allowedSubtreeNodeIds && !allowedSubtreeNodeIds.has(r.node_id)) return false;
            return true;
          })
          .map(r => {
            const parentNode = nodes.find(n => n.id === r.node_id)!;
            let color = '#f59e0b'; // Default fallback amber
            if (parentNode) {
              const ancestorColors: string[] = [];
              let curr: NodeItem | undefined = parentNode;
              while (curr) {
                if (curr.color) ancestorColors.unshift(curr.color);
                if (!curr.parent_id) break;
                curr = nodes.find(item => item.id === curr!.parent_id);
              }
              color = resolveColor(parentNode.color, ancestorColors);
            }

            const dateStr = r.remind_at.length >= 10 ? r.remind_at.slice(0, 10) : r.remind_at;
            return {
              id: `reminder-${r.id}`,
              title: r.message,
              start: dateStr,
              allDay: true,
              backgroundColor: color,
              borderColor: color,
              textColor: '#ffffff',
              extendedProps: { 
                reminder: r, 
                isReminder: true, 
                parentTitle: parentNode?.title || 'Task',
                isDone: false, 
                isCritical: false, 
                color,
                department: parentNode?.department || null 
              },
            };
          })
      : [];

    return [...nodeEvents, ...reminderEvents];
  }, [nodes, reminders, showCompleted, showAlertsOnCal, allowedSubtreeNodeIds, selectedLevels]);

  return (
    <div className="space-y-4">
      {/* Calendar Top Control Header (Single-Row Balanced Layout) */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3 bg-[var(--card-bg)]/90 p-3.5 rounded-2xl border border-[var(--border)] shadow-2xs">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-[var(--accent-subtle)] text-[var(--accent)] flex items-center justify-center border border-[var(--accent)]/20 shrink-0">
            <CalendarIcon className="w-4 h-4" />
          </div>
          <div>
            <h2 className="text-sm font-extrabold text-[var(--text-primary)] tracking-tight flex items-center gap-2">
              <span>Master Execution Calendar</span>
              <span className="text-[10px] font-mono font-bold bg-[var(--accent-subtle)] text-[var(--accent)] px-2 py-0.5 rounded-md border border-[var(--accent)]/20">
                {events.length} Events
              </span>
            </h2>
          </div>
        </div>

        {/* Unified Single-Row Control Action Bar */}
        <div className="flex items-center flex-wrap gap-2">
          {/* SEARCHABLE PARENT TASK / MODEL SUBTREE SELECTOR */}
          <SearchableParentSelect
            nodes={nodes}
            selectedParentId={selectedParentId}
            onSelectParent={setSelectedParentId}
          />

          {/* Toggle Alerts */}
          <button
            type="button"
            onClick={() => setShowAlertsOnCal(!showAlertsOnCal)}
            className={`h-9 px-3 text-xs font-bold rounded-xl border flex items-center gap-1.5 transition-all shadow-2xs ${
              showAlertsOnCal
                ? 'bg-amber-50 text-amber-900 border-amber-300 ring-1 ring-amber-200/60'
                : 'bg-[var(--card-bg)] text-[var(--text-secondary)] border-[var(--border)] hover:bg-[var(--badge-bg)]'
            }`}
          >
            <Bell className="w-3.5 h-3.5 text-amber-600" />
            <span>Alerts {showAlertsOnCal ? 'On' : 'Off'}</span>
          </button>

          {/* Toggle Completed Strikethrough Tasks */}
          <button
            type="button"
            onClick={() => setShowCompleted(!showCompleted)}
            className={`h-9 px-3 text-xs font-bold rounded-xl border flex items-center gap-1.5 transition-all shadow-2xs ${
              showCompleted
                ? 'bg-emerald-50 text-emerald-900 border-emerald-300 ring-1 ring-emerald-200/60'
                : 'bg-[var(--card-bg)] text-[var(--text-secondary)] border-[var(--border)] hover:bg-[var(--badge-bg)]'
            }`}
          >
            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
            <span>Completed ({showCompleted ? 'Shown' : 'Hidden'})</span>
          </button>
        </div>
      </div>

      {/* MELLOW EYE-SOOTHING HIERARCHY LEVEL MATRIX FILTER BAR */}
      <div className="bg-[var(--badge-bg)] backdrop-blur-xs px-3.5 py-2.5 rounded-2xl border border-[var(--border)] shadow-2xs flex items-center flex-wrap justify-between gap-2.5 text-xs">
        <div className="flex items-center gap-2">
          <Filter className="w-3.5 h-3.5 text-[var(--text-secondary)] shrink-0" />
          <span className="text-[var(--text-secondary)] font-extrabold uppercase tracking-wider text-[11px]">Filter Hierarchy Levels:</span>
        </div>

        <div className="flex items-center flex-wrap gap-1.5">
          {[
            { lvl: 1, label: 'L1 Dept' },
            { lvl: 2, label: 'L2 Season' },
            { lvl: 3, label: 'L3 Model' },
            { lvl: 4, label: 'L4 Task' },
            { lvl: 5, label: 'L5 Subtask' },
          ].map(item => {
            const active = selectedLevels.includes(item.lvl);
            return (
              <button
                key={item.lvl}
                type="button"
                onClick={() => toggleLevel(item.lvl)}
                className={`px-2.5 py-1 rounded-lg border text-xs transition-all flex items-center gap-1 ${
                  active
                    ? 'bg-[var(--accent)] text-white border-[var(--accent)] shadow-2xs font-semibold ring-1 ring-[var(--accent)]/30'
                    : 'bg-[var(--card-bg)] text-[var(--text-secondary)] border-[var(--border)] hover:bg-[var(--badge-bg)] font-medium'
                }`}
              >
                <span className="text-[10px]">{active ? '✓' : '+'}</span>
                <span>{item.label}</span>
              </button>
            );
          })}

          <button
            type="button"
            onClick={() => setSelectedLevels(selectedLevels.length === 5 ? [] : [1, 2, 3, 4, 5])}
            className="text-[11px] font-extrabold text-[var(--accent)] hover:text-[var(--text-primary)] underline ml-2 cursor-pointer transition-colors"
          >
            {selectedLevels.length === 5 ? 'Deselect All' : 'Select All'}
          </button>
        </div>
      </div>

      {/* ACTIVE DEPARTMENT / STREAM FILTER BANNER */}
      {selectedParentNode && (
        <div className="bg-indigo-50/90 border border-indigo-200 px-4 py-2.5 rounded-2xl flex items-center justify-between text-xs text-indigo-950 font-medium shadow-2xs animate-in fade-in">
          <div className="flex items-center gap-2">
            <Layers className="w-4 h-4 text-indigo-600 shrink-0" />
            <span>
              Isolated View: Showing all tasks & alerts for <strong>"{selectedParentNode.title}"</strong> ({allowedSubtreeNodeIds?.size || 0} items)
            </span>
          </div>
          <button
            type="button"
            onClick={() => setSelectedParentId(null)}
            className="text-xs text-indigo-700 hover:text-indigo-950 font-bold underline ml-2"
          >
            Clear Filter (Show All)
          </button>
        </div>
      )}

      {/* Calendar Grid Container with Dense Multi-Event Handling */}
      <div className="bg-[var(--card-bg)] p-4 rounded-3xl border border-[var(--border)] shadow-2xs font-sans text-xs">
        <FullCalendar
          plugins={[dayGridPlugin, timeGridPlugin, interactionPlugin]}
          initialView="dayGridMonth"
          dayMaxEvents={3}
          moreLinkClick="popover"
          headerToolbar={{
            left: 'prev,next today',
            center: 'title',
            right: 'dayGridMonth,timeGridWeek,timeGridDay',
          }}
          events={events}
          eventClick={info => {
            const node = info.event.extendedProps.node as NodeItem;
            if (node) onSelectNode(node);
          }}
          eventContent={eventInfo => {
            const isDone = eventInfo.event.extendedProps.isDone;
            const isReminder = eventInfo.event.extendedProps.isReminder;
            const isRange = eventInfo.event.extendedProps.isRange;
            const isCritical = eventInfo.event.extendedProps.isCritical;
            const color = eventInfo.event.extendedProps.color || '#0d9488';

            if (isReminder) {
              return (
                <div
                  title={`🔔 Alert: ${eventInfo.event.title} (for "${eventInfo.event.extendedProps.parentTitle}")`}
                  style={{
                    backgroundColor: color,
                    borderColor: color,
                  }}
                  className="w-full px-2 py-0.5 rounded-md text-white text-[11px] font-bold truncate flex items-center gap-1 shadow-2xs cursor-pointer transition-all hover:brightness-110 border"
                >
                  <span className="text-[11px] shrink-0">🔔</span>
                  <span className="truncate">{eventInfo.event.title}</span>
                </div>
              );
            }

            // Sleek Dashed Rendering for Multi-Day Date Range Spans
            if (isRange) {
              return (
                <div
                  title={`🗓️ Date Range: ${eventInfo.event.title}`}
                  style={{
                    borderColor: isDone ? '#94a3b8' : color,
                    backgroundColor: isDone ? '#f1f5f9' : `${color}20`,
                    color: isDone ? '#64748b' : color,
                  }}
                  className={`w-full px-2 py-0.5 rounded-md text-[11px] font-extrabold truncate flex items-center gap-1 shadow-2xs border-2 border-dashed transition-all hover:brightness-105 cursor-pointer ${
                    isDone ? 'line-through opacity-70 italic' : ''
                  }`}
                >
                  <span className="shrink-0 text-[10px]">🗓️</span>
                  <span className="truncate">{eventInfo.event.title}</span>
                </div>
              );
            }

            return (
              <div
                title={eventInfo.event.title}
                style={{
                  backgroundColor: isDone ? '#94a3b8' : color,
                  borderColor: isDone ? '#64748b' : color,
                }}
                className={`w-full px-2 py-0.5 rounded-md text-white text-[11px] font-bold truncate flex items-center gap-1 shadow-2xs border transition-all hover:brightness-110 cursor-pointer ${
                  isDone ? 'line-through opacity-70 italic' : ''
                }`}
              >
                {isDone ? (
                  <span className="shrink-0 text-[10px] font-extrabold">✓</span>
                ) : isCritical ? (
                  <span className="shrink-0 text-amber-300 font-bold text-[10px]">⚡</span>
                ) : null}
                <span className="truncate">{eventInfo.event.title}</span>
              </div>
            );
          }}
          height="auto"
          aspectRatio={1.6}
        />
      </div>
    </div>
  );
};
