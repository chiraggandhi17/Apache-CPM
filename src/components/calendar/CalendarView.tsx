import React, { useState, useMemo, useRef, useEffect } from 'react';
import FullCalendar from '@fullcalendar/react';
import dayGridPlugin from '@fullcalendar/daygrid';
import timeGridPlugin from '@fullcalendar/timegrid';
import interactionPlugin from '@fullcalendar/interaction';
import { useNodes } from '../../context/NodeContext';
import { NodeItem } from '../../types/domain';
import { resolveColor } from '../../lib/color-resolver';
import { SearchableParentSelect } from '../shared/SearchableParentSelect';
import { addDays, parseISO } from 'date-fns';
import { 
  Filter, Calendar as CalendarIcon, Bell, CheckCircle2, 
  Layers, ChevronLeft, ChevronRight, MousePointer
} from 'lucide-react';

interface CalendarViewProps {
  onSelectNode: (node: NodeItem) => void;
}

export const CalendarView: React.FC<CalendarViewProps> = ({ onSelectNode }) => {
  const { nodes, reminders } = useNodes();
  const calendarRef = useRef<FullCalendar>(null);
  const calendarContainerRef = useRef<HTMLDivElement>(null);
  const lastScrollTime = useRef<number>(0);

  const [selectedParentId, setSelectedParentId] = useState<string | null>(null);
  const [selectedLevels, setSelectedLevels] = useState<number[]>([1, 2, 3, 4, 5]);
  const [showCompleted, setShowCompleted] = useState(true);
  const [showAlertsOnCal, setShowAlertsOnCal] = useState(true);
  const [currentMonthTitle, setCurrentMonthTitle] = useState<string>('');
  const [activeView, setActiveView] = useState<'dayGridMonth' | 'timeGridWeek' | 'timeGridDay'>('dayGridMonth');

  // Mouse wheel scroll to move between months / weeks / days
  useEffect(() => {
    const container = calendarContainerRef.current;
    if (!container) return;

    const handleWheel = (e: WheelEvent) => {
      const api = calendarRef.current?.getApi();
      if (!api) return;

      const now = Date.now();
      if (now - lastScrollTime.current < 260) return;

      if (Math.abs(e.deltaY) > 25 || Math.abs(e.deltaX) > 25) {
        if (e.deltaY > 0 || e.deltaX > 0) {
          api.next();
        } else {
          api.prev();
        }
        lastScrollTime.current = now;
      }
    };

    container.addEventListener('wheel', handleWheel, { passive: true });
    return () => {
      container.removeEventListener('wheel', handleWheel);
    };
  }, []);

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
        const level = getNodeLevel(n);
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
          textColor: level >= 3 && !isDone ? '#0f172a' : '#ffffff',
          extendedProps: { 
            node: n, 
            isReminder: false, 
            isRange,
            isDone, 
            isCritical: n.is_critical, 
            color,
            level,
            department: n.department 
          },
        };
      });

    // 2. Active Alerts & Reminders Events
    const reminderEvents = showAlertsOnCal
      ? reminders
          .filter(r => {
            if (r.dismissed_at || !r.remind_at) return false;
            const parentNode = nodes.find(n => n.id === r.node_id);
            if (!parentNode) return false;

            const parentLevel = getNodeLevel(parentNode);
            if (!selectedLevels.includes(parentLevel)) return false;

            if (allowedSubtreeNodeIds && !allowedSubtreeNodeIds.has(r.node_id)) return false;
            return true;
          })
          .map(r => {
            const parentNode = nodes.find(n => n.id === r.node_id)!;
            let color = '#f59e0b';
            let parentLevel = 1;
            if (parentNode) {
              parentLevel = getNodeLevel(parentNode);
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
              backgroundColor: '#fffbe6',
              borderColor: '#f59e0b',
              textColor: '#92400e',
              extendedProps: { 
                reminder: r, 
                isReminder: true, 
                parentTitle: parentNode?.title || 'Task',
                isDone: false, 
                isCritical: false, 
                color,
                level: parentLevel,
                department: parentNode?.department || null 
              },
            };
          })
      : [];

    return [...nodeEvents, ...reminderEvents];
  }, [nodes, reminders, showCompleted, showAlertsOnCal, allowedSubtreeNodeIds, selectedLevels]);

  const handlePrev = () => calendarRef.current?.getApi().prev();
  const handleNext = () => calendarRef.current?.getApi().next();
  const handleToday = () => calendarRef.current?.getApi().today();

  const handleViewChange = (view: 'dayGridMonth' | 'timeGridWeek' | 'timeGridDay') => {
    setActiveView(view);
    calendarRef.current?.getApi().changeView(view);
  };

  return (
    <div className="space-y-4">
      {/* REORGANIZED UNIFIED CALENDAR CONTROL CENTER */}
      <div className="bg-[var(--card-bg)] p-4 rounded-3xl border border-[var(--border)] shadow-2xs space-y-3.5">
        
        {/* TOP ROW: Title & Month Navigation + View Mode Controls */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 border-b border-[var(--border)] pb-3">
          
          {/* Title & Active Month Indicator */}
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-[var(--accent-subtle)] text-[var(--accent)] flex items-center justify-center border border-[var(--accent)]/20 shrink-0 shadow-2xs">
              <CalendarIcon className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base font-extrabold text-[var(--text-primary)] tracking-tight">
                  {currentMonthTitle || 'Master Execution Calendar'}
                </h2>
                <span className="text-[10px] font-mono font-extrabold bg-[var(--accent-subtle)] text-[var(--accent)] px-2 py-0.5 rounded-md border border-[var(--accent)]/20 shadow-2xs">
                  {events.length} Events
                </span>
              </div>
              <p className="text-[11px] text-[var(--text-secondary)] font-medium flex items-center gap-1 mt-0.5">
                <MousePointer className="w-3 h-3 text-[var(--accent)]" />
                <span>Scroll mouse wheel over calendar grid to switch months naturally</span>
              </p>
            </div>
          </div>

          {/* Month Navigation & View Modes */}
          <div className="flex items-center flex-wrap gap-2">
            
            {/* Prev / Today / Next Controls */}
            <div className="flex items-center bg-[var(--badge-bg)] p-1 rounded-xl border border-[var(--border)] shadow-2xs">
              <button
                type="button"
                onClick={handlePrev}
                title="Previous Month/Week (Or Scroll Up)"
                className="p-1.5 rounded-lg text-[var(--text-primary)] hover:bg-[var(--card-bg)] transition-colors"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>

              <button
                type="button"
                onClick={handleToday}
                className="px-3 py-1 text-xs font-bold text-[var(--text-primary)] hover:bg-[var(--card-bg)] rounded-lg transition-colors"
              >
                Today
              </button>

              <button
                type="button"
                onClick={handleNext}
                title="Next Month/Week (Or Scroll Down)"
                className="p-1.5 rounded-lg text-[var(--text-primary)] hover:bg-[var(--card-bg)] transition-colors"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>

            {/* View Switcher Tabs (Month / Week / Day) */}
            <div className="flex items-center bg-[var(--badge-bg)] p-1 rounded-xl border border-[var(--border)] shadow-2xs">
              {[
                { view: 'dayGridMonth' as const, label: 'Month' },
                { view: 'timeGridWeek' as const, label: 'Week' },
                { view: 'timeGridDay' as const, label: 'Day' },
              ].map(v => (
                <button
                  key={v.view}
                  type="button"
                  onClick={() => handleViewChange(v.view)}
                  className={`px-3 py-1 text-xs font-extrabold rounded-lg transition-all ${
                    activeView === v.view
                      ? 'bg-[var(--accent)] text-white shadow-2xs'
                      : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
                  }`}
                >
                  {v.label}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* BOTTOM ROW: Filters & Toggles Action Bar */}
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
          
          {/* Searchable Subtree Filter & Display Toggles */}
          <div className="flex items-center flex-wrap gap-2">
            <SearchableParentSelect
              nodes={nodes}
              selectedParentId={selectedParentId}
              onSelectParent={setSelectedParentId}
            />

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

          {/* Hierarchy Level Matrix Pills */}
          <div className="flex items-center flex-wrap gap-1.5">
            <span className="text-[11px] font-extrabold uppercase tracking-wider text-[var(--text-secondary)] mr-1 flex items-center gap-1">
              <Filter className="w-3 h-3 text-[var(--accent)]" /> Levels:
            </span>

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
                      ? 'bg-[var(--accent)] text-white border-[var(--accent)] shadow-2xs font-bold ring-1 ring-[var(--accent)]/30'
                      : 'bg-[var(--badge-bg)] text-[var(--text-secondary)] border-[var(--border)] hover:bg-[var(--card-bg)] font-medium'
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
              className="text-[11px] font-extrabold text-[var(--accent)] hover:text-[var(--text-primary)] underline ml-1 cursor-pointer transition-colors"
            >
              {selectedLevels.length === 5 ? 'Clear' : 'All'}
            </button>
          </div>
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

      {/* Calendar Grid Container with Wheel Scroll Listener */}
      <div 
        ref={calendarContainerRef} 
        className="bg-[var(--card-bg)] p-4 rounded-3xl border border-[var(--border)] shadow-2xs font-sans text-xs select-none"
      >
        <FullCalendar
          ref={calendarRef}
          plugins={[dayGridPlugin, timeGridPlugin, interactionPlugin]}
          initialView="dayGridMonth"
          dayMaxEvents={3}
          moreLinkClick="popover"
          headerToolbar={false}
          datesSet={dateInfo => {
            setCurrentMonthTitle(dateInfo.view.title);
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
            const level = eventInfo.event.extendedProps.level || 1;

            if (isReminder) {
              return (
                <div
                  title={`🔔 Alert: ${eventInfo.event.title} (for "${eventInfo.event.extendedProps.parentTitle}")`}
                  className="w-full px-2 py-1 rounded-lg bg-amber-50 border-l-4 border-l-amber-500 border border-amber-200 text-amber-950 text-[11px] font-extrabold truncate flex items-center gap-1.5 shadow-2xs cursor-pointer transition-all hover:scale-[1.01]"
                >
                  <span className="text-[11px] shrink-0 animate-pulse">🔔</span>
                  <span className="truncate">{eventInfo.event.title}</span>
                </div>
              );
            }

            // Sleek Rendering for Multi-Day Date Range Spans
            if (isRange) {
              const isLightBackground = level >= 3 && !isDone;
              return (
                <div
                  title={`🗓️ Range [L${level}]: ${eventInfo.event.title}`}
                  style={{
                    backgroundColor: isDone ? '#f1f5f9' : color,
                    borderColor: isDone ? '#94a3b8' : color,
                    color: isDone ? '#64748b' : isLightBackground ? '#0f172a' : '#ffffff',
                  }}
                  className={`w-full px-2 py-1 rounded-lg text-[11px] font-extrabold truncate flex items-center justify-between gap-1 shadow-2xs border-l-4 transition-all hover:scale-[1.01] cursor-pointer ${
                    isDone ? 'line-through opacity-70 italic border-l-slate-400 border' : ''
                  }`}
                >
                  <div className="flex items-center gap-1 truncate">
                    <span className="shrink-0 text-[10px]">🗓️</span>
                    <span className="truncate">{eventInfo.event.title}</span>
                  </div>
                  <span className={`text-[9px] font-mono px-1 rounded shrink-0 ${isLightBackground ? 'bg-black/10 text-slate-900 font-bold' : 'bg-white/25 text-white font-bold'}`}>
                    L{level}
                  </span>
                </div>
              );
            }

            // Standard Task Event Card with Shaded Level Gradient Pill
            const isLightBackground = level >= 3 && !isDone;
            const textColor = isDone ? '#64748b' : isLightBackground ? '#0f172a' : '#ffffff';

            return (
              <div
                title={`[L${level}] ${eventInfo.event.title}`}
                style={{
                  backgroundColor: isDone ? '#f1f5f9' : color,
                  borderColor: isDone ? '#cbd5e1' : color,
                  color: textColor,
                }}
                className={`w-full px-2 py-1 rounded-lg text-[11px] font-extrabold truncate flex items-center justify-between gap-1 shadow-2xs border transition-all hover:scale-[1.01] cursor-pointer ${
                  isDone ? 'line-through opacity-75 italic' : ''
                }`}
              >
                <div className="flex items-center gap-1 truncate">
                  {isDone ? (
                    <span className="shrink-0 text-[10px] font-extrabold text-emerald-600">✓</span>
                  ) : isCritical ? (
                    <span className="shrink-0 text-amber-300 font-bold text-[10px]">⚡</span>
                  ) : null}
                  <span className="truncate">{eventInfo.event.title}</span>
                </div>
                <span 
                  className={`text-[9px] font-mono px-1.5 py-0.2 rounded font-extrabold shrink-0 ${
                    isLightBackground ? 'bg-slate-900/10 text-slate-900 border border-slate-900/10' : 'bg-white/25 text-white'
                  }`}
                >
                  L{level}
                </span>
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

