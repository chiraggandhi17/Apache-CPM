import React, { useState, useMemo } from 'react';
import FullCalendar from '@fullcalendar/react';
import dayGridPlugin from '@fullcalendar/daygrid';
import timeGridPlugin from '@fullcalendar/timegrid';
import interactionPlugin from '@fullcalendar/interaction';
import { useNodes } from '../../context/NodeContext';
import { NodeItem, ReminderItem } from '../../types/domain';
import { resolveColor } from '../../lib/color-resolver';
import { Filter, Calendar as CalendarIcon, Bell, CheckCircle2, Zap, Layers, FolderTree, XCircle } from 'lucide-react';

interface CalendarViewProps {
  onSelectNode: (node: NodeItem) => void;
}

export const CalendarView: React.FC<CalendarViewProps> = ({ onSelectNode }) => {
  const { nodes, reminders } = useNodes();
  const [showFilters, setShowFilters] = useState(false);
  const [selectedDepts, setSelectedDepts] = useState<string[]>([]);
  const [selectedSeasons, setSelectedSeasons] = useState<string[]>([]);
  const [selectedParentId, setSelectedParentId] = useState<string | null>(null);
  const [showCompleted, setShowCompleted] = useState(true);
  const [showAlertsOnCal, setShowAlertsOnCal] = useState(true);

  const departments = useMemo(() => {
    return Array.from(new Set(nodes.map(n => n.department).filter(Boolean))) as string[];
  }, [nodes]);

  const seasons = useMemo(() => {
    return Array.from(new Set(nodes.map(n => n.season).filter(Boolean))) as string[];
  }, [nodes]);

  // List candidate Parent Nodes (nodes that have children or act as containers)
  const parentOptions = useMemo(() => {
    const parentIdsWithChildren = new Set(nodes.map(n => n.parent_id).filter(Boolean));
    return nodes.filter(n => parentIdsWithChildren.has(n.id) || ['project', 'department', 'season', 'task'].includes(n.type));
  }, [nodes]);

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
        if (selectedDepts.length > 0 && n.department && !selectedDepts.includes(n.department)) return false;
        if (selectedSeasons.length > 0 && n.season && !selectedSeasons.includes(n.season)) return false;
        // Parent Task Subtree Filter
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
  }, [nodes, reminders, selectedDepts, selectedSeasons, showCompleted, showAlertsOnCal, allowedSubtreeNodeIds]);

  const toggleDept = (dept: string) => {
    setSelectedDepts(prev =>
      prev.includes(dept) ? prev.filter(d => d !== dept) : [...prev, dept]
    );
  };

  const toggleSeason = (season: string) => {
    setSelectedSeasons(prev =>
      prev.includes(season) ? prev.filter(s => s !== season) : [...prev, season]
    );
  };

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
          {/* PARENT TASK / MODEL SUBTREE SELECTOR */}
          <div className="flex items-center gap-1.5 bg-indigo-50/90 p-1 rounded-xl border border-indigo-200/80 shadow-2xs">
            <FolderTree className="w-4 h-4 text-indigo-600 ml-1.5 shrink-0" />
            <select
              value={selectedParentId || ''}
              onChange={e => setSelectedParentId(e.target.value || null)}
              className="text-xs font-bold text-indigo-950 bg-transparent outline-none pr-2 py-1 cursor-pointer max-w-[210px] truncate"
            >
              <option value="">✨ All Parent Tasks & Subtrees</option>
              {parentOptions.map(p => (
                <option key={p.id} value={p.id}>
                  [{p.type.toUpperCase()}] {p.title}
                </option>
              ))}
            </select>

            {selectedParentId && (
              <button
                type="button"
                onClick={() => setSelectedParentId(null)}
                className="p-1 text-indigo-600 hover:text-indigo-950 rounded-md transition-colors"
                title="Clear Parent Task Filter"
              >
                <XCircle className="w-4 h-4" />
              </button>
            )}
          </div>

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

          <button
            type="button"
            onClick={() => setShowFilters(!showFilters)}
            className={`px-3 py-1.5 text-xs font-semibold rounded-xl border flex items-center gap-1.5 transition-colors ${
              showFilters || selectedDepts.length > 0 || selectedSeasons.length > 0
                ? 'bg-teal-50 text-teal-800 border-teal-300'
                : 'bg-white text-gray-700 border-gray-200 hover:bg-gray-50'
            }`}
          >
            <Filter className="w-3.5 h-3.5" />
            <span>Filter {selectedDepts.length + selectedSeasons.length > 0 && `(${selectedDepts.length + selectedSeasons.length})`}</span>
          </button>
        </div>
      </div>

      {/* ACTIVE SUBTREE FILTER BANNER */}
      {selectedParentNode && (
        <div className="bg-indigo-50/90 border border-indigo-200 px-4 py-2.5 rounded-2xl flex items-center justify-between text-xs text-indigo-950 font-medium shadow-2xs animate-in fade-in">
          <div className="flex items-center gap-2">
            <FolderTree className="w-4 h-4 text-indigo-600 shrink-0" />
            <span>
              Isolated View: Showing subtasks & alerts for <strong>"[{selectedParentNode.type.toUpperCase()}] {selectedParentNode.title}"</strong> ({allowedSubtreeNodeIds?.size || 0} sub-items)
            </span>
          </div>
          <button
            type="button"
            onClick={() => setSelectedParentId(null)}
            className="text-xs text-indigo-700 hover:text-indigo-950 font-bold underline ml-2"
          >
            Clear Subtree Filter
          </button>
        </div>
      )}

      {showFilters && (
        <div className="bg-white p-4 rounded-2xl border border-gray-200 shadow-2xs space-y-3 animate-in fade-in duration-150">
          <div className="flex items-center justify-between">
            <h3 className="text-xs font-bold text-gray-700 uppercase tracking-wider">Filter Milestones</h3>
            <button
              type="button"
              onClick={() => {
                setSelectedDepts([]);
                setSelectedSeasons([]);
              }}
              className="text-xs text-teal-600 font-medium hover:underline"
            >
              Reset Filters
            </button>
          </div>

          <div className="grid grid-cols-2 gap-4 text-xs">
            <div>
              <span className="block font-semibold text-gray-600 mb-1.5">Department</span>
              <div className="flex flex-wrap gap-1.5">
                {departments.map(dept => (
                  <button
                    key={dept}
                    type="button"
                    onClick={() => toggleDept(dept)}
                    className={`px-2.5 py-1 rounded-lg border font-medium transition-colors ${
                      selectedDepts.includes(dept)
                        ? 'bg-teal-600 text-white border-teal-600'
                        : 'bg-gray-50 text-gray-700 border-gray-200 hover:bg-gray-100'
                    }`}
                  >
                    {dept}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <span className="block font-semibold text-gray-600 mb-1.5">Season</span>
              <div className="flex flex-wrap gap-1.5">
                {seasons.map(season => (
                  <button
                    key={season}
                    type="button"
                    onClick={() => toggleSeason(season)}
                    className={`px-2.5 py-1 rounded-lg border font-medium transition-colors ${
                      selectedSeasons.includes(season)
                        ? 'bg-indigo-600 text-white border-indigo-600'
                        : 'bg-gray-50 text-gray-700 border-gray-200 hover:bg-gray-100'
                    }`}
                  >
                    {season}
                  </button>
                ))}
              </div>
            </div>
          </div>
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
    </div>
  );
};
