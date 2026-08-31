import React, { useState, useMemo, useRef, useEffect } from 'react';
import FullCalendar from '@fullcalendar/react';
import dayGridPlugin from '@fullcalendar/daygrid';
import timeGridPlugin from '@fullcalendar/timegrid';
import interactionPlugin from '@fullcalendar/interaction';
import { useNodes } from '../../context/NodeContext';
import { NodeItem } from '../../types/domain';
import { NodeForm } from '../nodes/NodeForm';
import { resolveColor, getReadableTextColor } from '../../lib/color-resolver';
import { SearchableParentSelect } from '../shared/SearchableParentSelect';
import { PortalDropdown } from '../shared/PortalDropdown';
import { addDays, parseISO } from 'date-fns';
import { getNodeLevel } from '../../utils/hierarchy';
import {
  Filter, Calendar as CalendarIcon, Bell, CheckCircle2,
  Layers, ChevronLeft, ChevronRight, ChevronDown, MousePointer, Zap, Check,
} from 'lucide-react';

interface CalendarViewProps {
  onSelectNode: (node: NodeItem) => void;
}

const LEVEL_DEFS = [
  { lvl: 1, label: 'Department', short: 'L1' },
  { lvl: 2, label: 'Season', short: 'L2' },
  { lvl: 3, label: 'Model', short: 'L3' },
  { lvl: 4, label: 'Task', short: 'L4' },
  { lvl: 5, label: 'Subtask', short: 'L5' },
];

export const CalendarView: React.FC<CalendarViewProps> = ({ onSelectNode }) => {
  const { nodes, reminders } = useNodes();
  const calendarRef = useRef<FullCalendar>(null);
  const calendarContainerRef = useRef<HTMLDivElement>(null);
  const lastScrollTime = useRef<number>(0);
  const levelDropdownRef = useRef<HTMLButtonElement>(null);

  const [selectedParentId, setSelectedParentId] = useState<string | null>(null);
  const [selectedLevels, setSelectedLevels] = useState<number[]>([1, 2, 3, 4, 5]);
  const [showCompleted, setShowCompleted] = useState(true);
  const [showAlertsOnCal, setShowAlertsOnCal] = useState(true);
  const [currentMonthTitle, setCurrentMonthTitle] = useState<string>('');
  const [activeView, setActiveView] = useState<'dayGridMonth' | 'timeGridWeek' | 'timeGridDay'>('dayGridMonth');
  const [levelDropdownOpen, setLevelDropdownOpen] = useState(false);
  const [quickAddDate, setQuickAddDate] = useState<string | null>(null);

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
        const level = getNodeLevel(n, nodes);
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
        const level = getNodeLevel(n, nodes);
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
          textColor: isDone ? '#ffffff' : getReadableTextColor(color),
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

            const parentLevel = getNodeLevel(parentNode, nodes);
            if (!selectedLevels.includes(parentLevel)) return false;

            if (allowedSubtreeNodeIds && !allowedSubtreeNodeIds.has(r.node_id)) return false;
            return true;
          })
          .map(r => {
            const parentNode = nodes.find(n => n.id === r.node_id)!;
            let color = '#f59e0b';
            let parentLevel = 1;
            if (parentNode) {
              parentLevel = getNodeLevel(parentNode, nodes);
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

  const allLevelsSelected = selectedLevels.length === 5;
  const noLevelsSelected = selectedLevels.length === 0;

  return (
    <div className="space-y-4">
      {/* CALENDAR CONTROL CENTER */}
      <div className="bg-[var(--card-bg)] p-4 rounded-3xl border border-[var(--border)] shadow-2xs space-y-3">

        {/* TOP ROW: Title & Month Navigation + View Mode Controls */}
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">

          {/* Title & Active Month Indicator */}
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-10 h-10 rounded-2xl bg-[var(--accent-subtle)] text-[var(--accent)] flex items-center justify-center border border-[var(--accent)]/20 shrink-0 shadow-2xs">
              <CalendarIcon className="w-5 h-5" />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2 min-w-0">
                <h2 className="text-base font-extrabold text-[var(--text-primary)] tracking-tight truncate">
                  {currentMonthTitle || 'Master Execution Calendar'}
                </h2>
                <span className="text-[10px] font-mono font-bold bg-[var(--accent-subtle)] text-[var(--accent)] px-2 py-0.5 rounded-md border border-[var(--accent)]/20 shrink-0">
                  {events.length}
                </span>
              </div>
              <p className="text-[11px] text-[var(--text-secondary)] font-medium flex items-center gap-1 mt-0.5">
                <MousePointer className="w-3 h-3 text-[var(--accent)] shrink-0" />
                <span className="truncate">Scroll to move between months · Click a date to add a task</span>
              </p>
            </div>
          </div>

          {/* Month Navigation & View Modes */}
          <div className="flex items-center flex-wrap gap-2 shrink-0">
            {/* "Today" is a standalone jump action — kept separate from the
                prev/next pair below so it's never mistaken for a 3rd nav step
                sitting between the arrows. */}
            <button
              type="button"
              onClick={handleToday}
              className="h-9 px-3 text-xs font-bold rounded-xl border border-[var(--border)] bg-[var(--card-bg)] text-[var(--text-primary)] hover:bg-[var(--badge-bg)] transition-colors"
            >
              Today
            </button>

            {/* Prev / Next — a single unambiguous pair, no label between them */}
            <div className="flex items-center h-9 bg-[var(--badge-bg)] rounded-xl border border-[var(--border)] overflow-hidden">
              <button
                type="button"
                onClick={handlePrev}
                title="Previous (or scroll up)"
                className="h-full px-2 text-[var(--text-primary)] hover:bg-[var(--card-bg)] transition-colors"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <span className="w-px h-4 bg-[var(--border)]" />
              <button
                type="button"
                onClick={handleNext}
                title="Next (or scroll down)"
                className="h-full px-2 text-[var(--text-primary)] hover:bg-[var(--card-bg)] transition-colors"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>

            <div className="flex items-center bg-[var(--badge-bg)] p-1 rounded-xl border border-[var(--border)]">
              {[
                { view: 'dayGridMonth' as const, label: 'Month' },
                { view: 'timeGridWeek' as const, label: 'Week' },
                { view: 'timeGridDay' as const, label: 'Day' },
              ].map(v => (
                <button
                  key={v.view}
                  type="button"
                  onClick={() => handleViewChange(v.view)}
                  className={`px-3 py-1 text-xs font-bold rounded-lg transition-all ${
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

        {/* DIVIDER */}
        <div className="border-t border-[var(--border-subtle)]" />

        {/* FILTER BAR: single unified row, wraps gracefully */}
        <div className="flex flex-wrap items-center gap-2">
          <SearchableParentSelect
            nodes={nodes}
            selectedParentId={selectedParentId}
            onSelectParent={setSelectedParentId}
          />

          {/* Level Filter Dropdown (replaces 5 loose pill buttons) */}
          <button
            ref={levelDropdownRef}
            type="button"
            onClick={() => setLevelDropdownOpen(o => !o)}
            className={`h-9 px-3 text-xs font-bold rounded-xl border flex items-center gap-1.5 transition-all ${
              levelDropdownOpen || !allLevelsSelected
                ? 'bg-[var(--accent-subtle)] text-[var(--accent)] border-[var(--accent)]/30'
                : 'bg-[var(--card-bg)] text-[var(--text-secondary)] border-[var(--border)] hover:bg-[var(--badge-bg)]'
            }`}
          >
            <Filter className="w-3.5 h-3.5" />
            <span>Levels {noLevelsSelected ? '(none)' : allLevelsSelected ? '(all)' : `(${selectedLevels.length}/5)`}</span>
            <ChevronDown className={`w-3.5 h-3.5 transition-transform ${levelDropdownOpen ? 'rotate-180' : ''}`} />
          </button>

          {/* Portaled so it always renders above the sidebar and is never
              clipped by the scrollable <main> content area */}
          <PortalDropdown open={levelDropdownOpen} anchorRef={levelDropdownRef} onClose={() => setLevelDropdownOpen(false)} align="left" width={224}>
            <div className="bg-[var(--card-bg)] border border-[var(--border)] rounded-2xl shadow-lg p-2">
              {LEVEL_DEFS.map(item => {
                const active = selectedLevels.includes(item.lvl);
                return (
                  <button
                    key={item.lvl}
                    type="button"
                    onClick={() => toggleLevel(item.lvl)}
                    className={`w-full flex items-center justify-between px-2.5 py-1.5 rounded-xl text-xs font-semibold transition-colors ${
                      active ? 'bg-[var(--accent-subtle)] text-[var(--text-primary)]' : 'text-[var(--text-secondary)] hover:bg-[var(--badge-bg)]'
                    }`}
                  >
                    <span className="flex items-center gap-2">
                      <span className="font-mono text-[10px] font-extrabold text-[var(--accent)] w-6 text-left">{item.short}</span>
                      <span>{item.label}</span>
                    </span>
                    {active && <Check className="w-3.5 h-3.5 text-[var(--accent)]" />}
                  </button>
                );
              })}
              <div className="flex items-center justify-between px-2 pt-1.5 mt-1 border-t border-[var(--border-subtle)]">
                <button
                  type="button"
                  onClick={() => setSelectedLevels([1, 2, 3, 4, 5])}
                  className="text-[11px] font-bold text-[var(--accent)] hover:underline"
                >
                  Select All
                </button>
                <button
                  type="button"
                  onClick={() => setSelectedLevels([])}
                  className="text-[11px] font-bold text-[var(--text-muted)] hover:underline"
                >
                  Clear
                </button>
              </div>
            </div>
          </PortalDropdown>

          <button
            type="button"
            onClick={() => setShowAlertsOnCal(!showAlertsOnCal)}
            className={`h-9 px-3 text-xs font-bold rounded-xl border flex items-center gap-1.5 transition-all ${
              showAlertsOnCal
                ? 'bg-amber-50 text-amber-900 border-amber-300'
                : 'bg-[var(--card-bg)] text-[var(--text-secondary)] border-[var(--border)] hover:bg-[var(--badge-bg)]'
            }`}
          >
            <Bell className="w-3.5 h-3.5 text-amber-600" />
            <span>Alerts</span>
          </button>

          <button
            type="button"
            onClick={() => setShowCompleted(!showCompleted)}
            className={`h-9 px-3 text-xs font-bold rounded-xl border flex items-center gap-1.5 transition-all ${
              showCompleted
                ? 'bg-emerald-50 text-emerald-900 border-emerald-300'
                : 'bg-[var(--card-bg)] text-[var(--text-secondary)] border-[var(--border)] hover:bg-[var(--badge-bg)]'
            }`}
          >
            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
            <span>Completed {showCompleted ? 'Shown' : 'Hidden'}</span>
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
          dateClick={info => setQuickAddDate(info.dateStr)}
          eventClick={info => {
            const node = info.event.extendedProps.node as NodeItem;
            if (node) onSelectNode(node);
          }}
          eventContent={eventInfo => {
            const isDone = eventInfo.event.extendedProps.isDone;
            const isReminder = eventInfo.event.extendedProps.isReminder;
            const isRange = eventInfo.event.extendedProps.isRange;
            const isCritical = eventInfo.event.extendedProps.isCritical;
            const color = eventInfo.event.extendedProps.color || '#0EA5A0';
            const level = eventInfo.event.extendedProps.level || 1;

            if (isReminder) {
              return (
                <div
                  title={`Alert: ${eventInfo.event.title} (for "${eventInfo.event.extendedProps.parentTitle}")`}
                  className="w-full px-2 py-1 rounded-lg bg-amber-50 border border-amber-200 text-amber-950 text-[11px] font-bold truncate flex items-center gap-1.5 shadow-2xs cursor-pointer transition-all hover:shadow-sm"
                  style={{ borderLeft: '3px solid #F59E0B' }}
                >
                  <Bell className="w-3 h-3 shrink-0 text-amber-500" />
                  <span className="truncate">{eventInfo.event.title}</span>
                </div>
              );
            }

            const cardBg = isDone ? 'var(--badge-bg)' : `${color}1C`;
            const barColor = isDone ? '#94a3b8' : color;

            return (
              <div
                title={`[L${level}]${isRange ? ' Range' : ''} ${eventInfo.event.title}`}
                style={{
                  backgroundColor: cardBg,
                  borderLeftColor: barColor,
                  color: isDone ? 'var(--text-muted)' : 'var(--text-primary)',
                }}
                className={`group w-full pl-2 pr-1.5 py-1 rounded-lg text-[11px] font-bold truncate flex items-center justify-between gap-1 border-l-[3px] transition-all hover:shadow-sm hover:brightness-105 cursor-pointer ${
                  isDone ? 'line-through opacity-70 italic' : ''
                }`}
              >
                <div className="flex items-center gap-1 min-w-0">
                  {isDone ? (
                    <Check className="w-3 h-3 shrink-0 text-emerald-600" strokeWidth={3} />
                  ) : isRange ? (
                    <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ backgroundColor: barColor }} />
                  ) : isCritical ? (
                    <Zap className="w-3 h-3 shrink-0 text-amber-500" fill="currentColor" />
                  ) : null}
                  <span className="truncate">{eventInfo.event.title}</span>
                </div>
                <span
                  style={!isDone ? { color: barColor, borderColor: `${barColor}55`, backgroundColor: `${barColor}14` } : undefined}
                  className="text-[9px] font-mono font-extrabold px-1 rounded shrink-0 border opacity-0 group-hover:opacity-100 transition-opacity"
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

      {/* Click-a-date quick add: opens the standard task form pre-filled with that date */}
      {quickAddDate && (
        <NodeForm
          parentId={null}
          initialPlannedDate={quickAddDate}
          onClose={() => setQuickAddDate(null)}
        />
      )}
    </div>
  );
};
