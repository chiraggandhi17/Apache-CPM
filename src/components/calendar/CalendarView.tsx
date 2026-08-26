import React, { useState, useMemo } from 'react';
import FullCalendar from '@fullcalendar/react';
import dayGridPlugin from '@fullcalendar/daygrid';
import timeGridPlugin from '@fullcalendar/timegrid';
import interactionPlugin from '@fullcalendar/interaction';
import { useNodes } from '../../context/NodeContext';
import { NodeItem, ReminderItem } from '../../types/domain';
import { resolveColor } from '../../lib/color-resolver';
import { SearchableParentSelect } from '../shared/SearchableParentSelect';
import { ExportModal } from '../shared/ExportModal';
import { Filter, Calendar as CalendarIcon, Bell, CheckCircle2, Zap, Layers, FolderTree, XCircle, FileSpreadsheet, Download } from 'lucide-react';

interface CalendarViewProps {
  onSelectNode: (node: NodeItem) => void;
}

export const CalendarView: React.FC<CalendarViewProps> = ({ onSelectNode }) => {
  const { nodes, reminders } = useNodes();
  const [selectedParentId, setSelectedParentId] = useState<string | null>(null);
  const [showCompleted, setShowCompleted] = useState(true);
  const [showAlertsOnCal, setShowAlertsOnCal] = useState(true);
  const [showExportModal, setShowExportModal] = useState(false);

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
    // 1. Task & Milestone Events (Subtree Filtered)
    const nodeEvents = nodes
      .filter(n => {
        if (!n.planned_date) return false;
        if (!showCompleted && n.status === 'done') return false;
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
        const dateStr = n.planned_date!.length >= 10 ? n.planned_date!.slice(0, 10) : n.planned_date!;

        return {
          id: n.id,
          title: n.title,
          start: dateStr,
          allDay: true,
          backgroundColor: isDone ? '#94a3b8' : color,
          borderColor: isDone ? '#64748b' : color,
          textColor: '#ffffff',
          extendedProps: { 
            node: n, 
            isReminder: false, 
            isDone, 
            isCritical: n.is_critical, 
            color,
            department: n.department 
          },
        };
      });

    // 2. Active Alerts & Reminders Events (Strictly bound to user's authorized nodes & parent subtree)
    const reminderEvents = showAlertsOnCal
      ? reminders
          .filter(r => {
            if (r.dismissed_at || !r.remind_at) return false;
            if (!nodes.some(n => n.id === r.node_id)) return false;
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
                isDone: false, 
                isCritical: false, 
                color,
                department: parentNode?.department || null 
              },
            };
          })
      : [];

    return [...nodeEvents, ...reminderEvents];
  }, [nodes, reminders, showCompleted, showAlertsOnCal, allowedSubtreeNodeIds]);

  return (
    <div className="space-y-4">
      {/* Calendar Top Control Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 bg-white p-4 rounded-3xl border border-gray-200 shadow-2xs">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-2xl bg-teal-500/10 text-teal-700 flex items-center justify-center border border-teal-500/20 shrink-0">
            <CalendarIcon className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-base font-extrabold text-gray-900 tracking-tight">Master Execution Calendar</h2>
            <p className="text-xs text-gray-500">Color-coded milestone schedule view with Subtree filtering and alert sync</p>
          </div>
        </div>

        <div className="flex items-center flex-wrap gap-2.5">
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
            className={`px-3 py-1.5 text-xs font-bold rounded-xl border flex items-center gap-1.5 transition-colors shadow-2xs ${
              showAlertsOnCal
                ? 'bg-amber-50 text-amber-900 border-amber-300 ring-1 ring-amber-200'
                : 'bg-white text-gray-500 border-gray-200'
            }`}
          >
            <Bell className="w-3.5 h-3.5 text-amber-600" />
            <span>Alerts {showAlertsOnCal ? 'On' : 'Off'}</span>
          </button>

          {/* Toggle Completed Strikethrough Tasks */}
          <button
            type="button"
            onClick={() => setShowCompleted(!showCompleted)}
            className={`px-3 py-1.5 text-xs font-bold rounded-xl border flex items-center gap-1.5 transition-colors shadow-2xs ${
              showCompleted
                ? 'bg-emerald-50 text-emerald-900 border-emerald-300 ring-1 ring-emerald-200'
                : 'bg-white text-gray-500 border-gray-200'
            }`}
          >
            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
            <span>Completed ({showCompleted ? 'Shown' : 'Hidden'})</span>
          </button>

          {/* Export Excel Button */}
          <button
            type="button"
            onClick={() => setShowExportModal(true)}
            className="px-3 py-1.5 text-xs font-extrabold text-white bg-emerald-600 hover:bg-emerald-700 rounded-xl transition-all shadow-2xs flex items-center gap-1.5"
          >
            <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-100" />
            <span>Export Excel</span>
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
      <div className="bg-white p-4 rounded-3xl border border-gray-200 shadow-2xs font-sans text-xs">
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

      {showExportModal && <ExportModal onClose={() => setShowExportModal(false)} />}
    </div>
  );
};
