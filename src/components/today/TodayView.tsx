import React, { useState, useMemo } from 'react';
import { useNodes } from '../../context/NodeContext';
import { TodayItem, NodeItem } from '../../types/domain';
import { StatusBadge } from '../shared/StatusBadge';
import { CriticalFlag } from '../shared/CriticalFlag';
import { formatLocalDate, getRelativeDateBadge } from '../../utils/date-format';
import { SnoozeNoteModal } from '../reminders/SnoozeNoteModal';
import { matchesSearchQuery } from '../../utils/search';
import { AlertCircle, Calendar, CheckCircle2, Clock, Bell, ArrowUpRight, Sparkles, CornerDownRight, Search } from 'lucide-react';

interface TodayViewProps {
  onSelectNode: (node: NodeItem) => void;
}

export const TodayView: React.FC<TodayViewProps> = ({ onSelectNode }) => {
  const { getTodayUpcomingFeed, nodes, updateStatus, dismissReminder } = useNodes();
  const { overdue: rawOverdue, today: rawToday, upcoming: rawUpcoming, triggeredReminders: rawReminders } = getTodayUpcomingFeed();

  const [activeSnoozeReminder, setActiveSnoozeReminder] = useState<{ id: string; msg: string } | null>(null);
  const [searchQuery, setSearchQuery] = useState('');

  // Filter items by multi-field search query using full node lookup
  const overdue = useMemo(() => rawOverdue.filter(i => {
    const fullNode = nodes.find(n => n.id === i.id);
    return matchesSearchQuery(fullNode || (i as unknown as NodeItem), searchQuery, nodes);
  }), [rawOverdue, searchQuery, nodes]);

  const today = useMemo(() => rawToday.filter(i => {
    const fullNode = nodes.find(n => n.id === i.id);
    return matchesSearchQuery(fullNode || (i as unknown as NodeItem), searchQuery, nodes);
  }), [rawToday, searchQuery, nodes]);

  const upcoming = useMemo(() => rawUpcoming.filter(i => {
    const fullNode = nodes.find(n => n.id === i.id);
    return matchesSearchQuery(fullNode || (i as unknown as NodeItem), searchQuery, nodes);
  }), [rawUpcoming, searchQuery, nodes]);

  const triggeredReminders = useMemo(() => rawReminders.filter(r => {
    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase();
    const node = nodes.find(n => n.id === r.node_id);
    return r.message.toLowerCase().includes(q) || (r.note && r.note.toLowerCase().includes(q)) || (node && matchesSearchQuery(node, searchQuery, nodes));
  }), [rawReminders, searchQuery, nodes]);

  const totalActionItems = overdue.length + today.length + upcoming.length + triggeredReminders.length;

  const renderTodayRow = (item: TodayItem) => {
    const fullNode = nodes.find(n => n.id === item.id);
    const dateBadge = getRelativeDateBadge(item.planned_date);

    return (
      <div
        key={item.id}
        onClick={() => fullNode && onSelectNode(fullNode)}
        className="group relative flex flex-col sm:flex-row items-start sm:items-center justify-between p-3.5 bg-white rounded-xl border border-gray-200/80 shadow-2xs hover:shadow-xs hover:border-gray-300 transition-all cursor-pointer gap-2.5"
      >
        <div className="flex items-center gap-3 min-w-0 w-full sm:w-auto">
          <span
            className="w-2.5 h-2.5 rounded-full shrink-0 shadow-2xs"
            style={{ backgroundColor: item.effective_color }}
          />

          <div className="min-w-0 space-y-0.5 flex-1">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-semibold text-xs md:text-sm text-gray-900 group-hover:text-teal-700 transition-colors truncate">
                {item.title}
              </span>
              <CriticalFlag isCritical={item.is_critical} size="sm" />
            </div>

            <p className="text-[11px] text-gray-500 flex items-center gap-1 truncate">
              <span>{item.project_title || 'Cadence Project'}</span>
              <span>•</span>
              <span className="font-mono">{formatLocalDate(item.planned_date, 'MMM d, yyyy')}</span>
            </p>
          </div>
        </div>

        <div className="flex items-center justify-between sm:justify-end gap-2.5 shrink-0 w-full sm:w-auto pt-1 sm:pt-0 border-t sm:border-t-0 border-gray-100">
          <span
            className={`text-[11px] font-mono font-semibold px-2.5 py-0.5 rounded-md border ${
              item.is_overdue
                ? 'bg-rose-50 text-rose-700 border-rose-200'
                : 'bg-teal-50 text-teal-800 border-teal-200'
            }`}
          >
            {dateBadge.label}
          </span>

          <StatusBadge status={item.status} onChange={s => updateStatus(item.id, s)} size="sm" />

          <ArrowUpRight className="w-4 h-4 text-gray-300 group-hover:text-teal-600 transition-colors hidden sm:block" />
        </div>
      </div>
    );
  };

  return (
    <div className="space-y-6">
      {/* Header Banner */}
      <div className="bg-gradient-to-r from-teal-900 to-teal-800 text-white p-6 rounded-2xl shadow-sm flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        <div>
          <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-medium bg-teal-800/80 text-teal-200 border border-teal-700/50 mb-2">
            <Sparkles className="w-3 h-3 text-teal-300" /> Today's Action Feed
          </div>
          <h1 className="text-xl md:text-2xl font-bold tracking-tight">Footwear Critical Path</h1>
          <p className="text-xs md:text-sm text-teal-100/90 mt-1 max-w-xl">
            Live overview of upcoming deadlines and critical milestones across all active adidas models.
          </p>
        </div>

        <div className="bg-white/10 backdrop-blur-md px-4 py-3 rounded-xl border border-white/15 text-center min-w-[120px]">
          <span className="text-2xl font-extrabold block text-white font-mono">{totalActionItems}</span>
          <span className="text-[10px] uppercase font-semibold text-teal-200 tracking-wider">Active Items</span>
        </div>
      </div>

      {/* Dashboard Global Deep Search Bar */}
      <div className="bg-white p-3.5 rounded-2xl border border-gray-200 shadow-2xs flex items-center gap-3">
        <div className="relative flex-1">
          <input
            type="text"
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            placeholder="Search subtasks, vendors (e.g. Supplier X), assignees, or months (e.g. October)..."
            className="w-full text-xs pl-9 pr-3 py-2 bg-gray-50 border border-gray-200 rounded-xl outline-none focus:border-teal-500 focus:bg-white"
          />
          <Search className="w-4 h-4 text-gray-400 absolute left-3 top-2.5" />
        </div>
        {searchQuery && (
          <button
            type="button"
            onClick={() => setSearchQuery('')}
            className="text-xs text-teal-600 hover:underline font-semibold"
          >
            Clear Search
          </button>
        )}
      </div>

      {totalActionItems === 0 ? (
        <div className="bg-white rounded-2xl p-12 text-center border border-gray-200 shadow-2xs">
          <CheckCircle2 className="w-12 h-12 text-emerald-500 mx-auto mb-3" />
          <h3 className="text-base font-bold text-gray-900">All caught up!</h3>
          <p className="text-xs text-gray-500 max-w-sm mx-auto mt-1">
            {searchQuery ? 'No matching action items found for your search query.' : 'No overdue items or deadlines due this week. Production is on track. 🎉'}
          </p>
        </div>
      ) : (
        <div className="space-y-6">
          {/* Section 1: Overdue */}
          {overdue.length > 0 && (
            <div className="space-y-2">
              <h2 className="text-xs font-bold uppercase tracking-wider text-rose-700 flex items-center gap-1.5 px-1">
                <AlertCircle className="w-4 h-4 text-rose-600" />
                Overdue Milestones ({overdue.length})
              </h2>
              <div className="space-y-2">{overdue.map(renderTodayRow)}</div>
            </div>
          )}

          {/* Section 2: Due Today */}
          {today.length > 0 && (
            <div className="space-y-2">
              <h2 className="text-xs font-bold uppercase tracking-wider text-amber-800 flex items-center gap-1.5 px-1">
                <Calendar className="w-4 h-4 text-amber-600" />
                Due Today ({today.length})
              </h2>
              <div className="space-y-2">{today.map(renderTodayRow)}</div>
            </div>
          )}

          {/* Section 3: Coming Up This Week */}
          {upcoming.length > 0 && (
            <div className="space-y-2">
              <h2 className="text-xs font-bold uppercase tracking-wider text-teal-900 flex items-center gap-1.5 px-1">
                <Clock className="w-4 h-4 text-teal-600" />
                Coming Up This Week ({upcoming.length})
              </h2>
              <div className="space-y-2">{upcoming.map(renderTodayRow)}</div>
            </div>
          )}

          {/* Section 4: Triggered Alerts */}
          {triggeredReminders.length > 0 && (
            <div className="space-y-2 pt-2">
              <h2 className="text-xs font-bold uppercase tracking-wider text-amber-900 flex items-center gap-1.5 px-1">
                <Bell className="w-4 h-4 text-amber-500" />
                Triggered Alerts for Today ({triggeredReminders.length})
              </h2>
              <div className="space-y-2">
                {triggeredReminders.map(rem => (
                  <div
                    key={rem.id}
                    style={{ borderLeftColor: (rem as any).effective_color || '#f59e0b' }}
                    className="p-3.5 bg-amber-50/90 rounded-xl border border-amber-200/90 border-l-4 shadow-2xs space-y-2 text-xs"
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2.5">
                        <span 
                          className="w-2.5 h-2.5 rounded-full shrink-0 shadow-2xs" 
                          style={{ backgroundColor: (rem as any).effective_color || '#f59e0b' }} 
                        />
                        <Bell className="w-4 h-4 text-amber-600 shrink-0" />
                        <div>
                          <p className="font-bold text-amber-950">{rem.message}</p>
                          <p className="text-[11px] text-amber-800 flex items-center gap-1 font-mono mt-0.5">
                            <span>{rem.project_title}</span>
                            <span>•</span>
                            <span>{rem.node_title}</span>
                          </p>
                        </div>
                      </div>

                      <div className="flex items-center gap-1.5 shrink-0">
                        <button
                          type="button"
                          onClick={() => setActiveSnoozeReminder({ id: rem.id, msg: rem.message })}
                          className="px-2.5 py-1 text-[11px] font-semibold text-amber-900 bg-white hover:bg-amber-100 rounded-lg border border-amber-300 transition-colors shadow-2xs flex items-center gap-1"
                        >
                          <Clock className="w-3 h-3 text-amber-600" /> Remind / Note
                        </button>
                        <button
                          type="button"
                          onClick={() => dismissReminder(rem.id)}
                          className="px-2.5 py-1 text-[11px] font-semibold text-gray-700 bg-white hover:bg-gray-100 rounded-lg border border-gray-300 transition-colors"
                        >
                          Dismiss
                        </button>
                      </div>
                    </div>

                    {rem.note && (
                      <div className="bg-amber-100/60 p-2 rounded-lg text-[11px] text-amber-900 border border-amber-200 flex items-start gap-1.5">
                        <CornerDownRight className="w-3.5 h-3.5 text-amber-700 shrink-0 mt-0.5" />
                        <div>
                          <span className="font-semibold text-amber-950">Follow-up Log: </span>
                          <span>{rem.note}</span>
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {activeSnoozeReminder && (
        <SnoozeNoteModal
          reminderId={activeSnoozeReminder.id}
          reminderMessage={activeSnoozeReminder.msg}
          onClose={() => setActiveSnoozeReminder(null)}
        />
      )}
    </div>
  );
};
