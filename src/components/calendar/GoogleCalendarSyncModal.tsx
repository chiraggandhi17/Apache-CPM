import React, { useState, useMemo, useEffect, useCallback } from 'react';
import { useAuth } from '../../context/AuthContext';
import { useNodes } from '../../context/NodeContext';
import { useToast } from '../../context/ToastContext';
import { useDialog } from '../../context/DialogContext';
import { supabase } from '../../lib/supabase';
import { NodeType } from '../../types/domain';
import { generateGoogleCalendarUrl, CalendarEventPayload } from '../../utils/calendar-links';
import { formatLocalDate } from '../../utils/date-format';
import {
  startGoogleOAuth, getGoogleCalendarStatus, disconnectGoogleCalendar, syncGoogleCalendarNow,
  pullGoogleCalendarRange, GoogleCalendarStatus,
} from '../../utils/google-calendar-api';
import { NodeForm } from '../nodes/NodeForm';
import {
  X, Calendar, ExternalLink, Sparkles, Search, Info, Link2,
  RefreshCw, Unlink, Inbox, Check, XCircle, CheckSquare, Square, Layers, Settings2, AlertTriangle,
} from 'lucide-react';

interface GoogleCalendarSyncModalProps {
  eventPayload?: CalendarEventPayload | null;
  onClose: () => void;
}

interface PendingGoogleEvent {
  id: string;
  google_event_id: string;
  title: string;
  description: string | null;
  start_at: string;
  end_at: string | null;
  is_all_day: boolean;
}

const LEVEL_LABELS: Record<Exclude<NodeType, 'reminder'>, string> = {
  department: 'Department (L1)',
  season: 'Season (L2)',
  project: 'Project (L3)',
  task: 'Task (L4)',
  subtask: 'Subtask (L5)',
};
const LEVEL_ORDER: Array<keyof typeof LEVEL_LABELS> = ['department', 'season', 'project', 'task', 'subtask'];

function parentTypeFor(level: keyof typeof LEVEL_LABELS): keyof typeof LEVEL_LABELS | null {
  const idx = LEVEL_ORDER.indexOf(level);
  return idx > 0 ? LEVEL_ORDER[idx - 1] : null;
}

function toISODateInput(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export const GoogleCalendarSyncModal: React.FC<GoogleCalendarSyncModalProps> = ({ eventPayload, onClose }) => {
  const { user } = useAuth();
  const { nodes, updateNode, addNode } = useNodes();
  const toast = useToast();
  const { confirm } = useDialog();

  // --- Google account connection state ---
  const [status, setStatus] = useState<GoogleCalendarStatus | null>(null);
  const [loadingStatus, setLoadingStatus] = useState(true);
  const [connecting, setConnecting] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [disconnecting, setDisconnecting] = useState(false);

  const refreshStatus = useCallback(async () => {
    setLoadingStatus(true);
    try {
      const s = await getGoogleCalendarStatus();
      setStatus(s);
    } catch (err: any) {
      console.error('Failed to load Google Calendar status:', err);
      setStatus({ connected: false });
    } finally {
      setLoadingStatus(false);
    }
  }, []);

  useEffect(() => { refreshStatus(); }, [refreshStatus]);

  const handleConnect = async () => {
    setConnecting(true);
    try {
      await startGoogleOAuth();
      // Browser navigates away to Google — nothing more to do here.
    } catch (err: any) {
      toast.error('Failed to start Google connection: ' + err.message);
      setConnecting(false);
    }
  };

  const handleDisconnect = async () => {
    const ok = await confirm({
      title: 'Disconnect Google Calendar',
      message: 'This stops future syncing and removes the stored connection. Events already created in your Google Calendar will stay there.',
      destructive: true,
      confirmLabel: 'Disconnect',
    });
    if (!ok) return;

    setDisconnecting(true);
    try {
      await disconnectGoogleCalendar();
      toast.success('Disconnected from Google Calendar.');
      setPendingEvents([]);
      await refreshStatus();
    } catch (err: any) {
      toast.error('Failed to disconnect: ' + err.message);
    } finally {
      setDisconnecting(false);
    }
  };

  const handleSyncNow = async () => {
    setSyncing(true);
    try {
      const result = await syncGoogleCalendarNow();
      toast.success(`Synced — ${result.pulled} event${result.pulled === 1 ? '' : 's'} found, ${result.pushed} task${result.pushed === 1 ? '' : 's'} pushed.`);
      await refreshStatus();
      await loadPendingEvents();
    } catch (err: any) {
      toast.error('Sync failed: ' + err.message);
    } finally {
      setSyncing(false);
    }
  };

  // --- Pull a specific date range instead of the default auto window ---
  const [showRangePicker, setShowRangePicker] = useState(false);
  const [rangeFrom, setRangeFrom] = useState(() => toISODateInput(new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)));
  const [rangeTo, setRangeTo] = useState(() => toISODateInput(new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)));
  const [pullingRange, setPullingRange] = useState(false);

  const handlePullRange = async () => {
    if (!rangeFrom || !rangeTo) return;
    if (new Date(rangeFrom) > new Date(rangeTo)) {
      toast.error('The start date is after the end date.');
      return;
    }
    setPullingRange(true);
    try {
      const result = await pullGoogleCalendarRange(rangeFrom, rangeTo);
      toast.success(`Found ${result.pulled} event${result.pulled === 1 ? '' : 's'} between ${formatLocalDate(rangeFrom, 'MMM d')} and ${formatLocalDate(rangeTo, 'MMM d, yyyy')}.`);
      await refreshStatus();
      await loadPendingEvents();
    } catch (err: any) {
      toast.error('Pull failed: ' + err.message);
    } finally {
      setPullingRange(false);
    }
  };

  // --- Pending events review inbox (populated by the sync Edge Function) ---
  const [pendingEvents, setPendingEvents] = useState<PendingGoogleEvent[]>([]);
  const [loadingPending, setLoadingPending] = useState(false);
  const [pendingSearch, setPendingSearch] = useState('');
  const [selectedPendingIds, setSelectedPendingIds] = useState<Set<string>>(new Set());

  // Batch placement (applies to every currently-selected pending event)
  const [batchLevel, setBatchLevel] = useState<keyof typeof LEVEL_LABELS>('task');
  const [batchParentId, setBatchParentId] = useState<string>('');
  const [batchWorking, setBatchWorking] = useState(false);

  // Per-row "place this one carefully" flow: pick level + parent, then hand
  // off to the full task form (with color, critical flag, reminders, etc.)
  const [placingEventId, setPlacingEventId] = useState<string | null>(null);
  const [placeLevel, setPlaceLevel] = useState<keyof typeof LEVEL_LABELS>('task');
  const [placeParentId, setPlaceParentId] = useState<string>('');
  const [formEvent, setFormEvent] = useState<PendingGoogleEvent | null>(null);
  const [formParentId, setFormParentId] = useState<string | null>(null);
  const [formParentType, setFormParentType] = useState<NodeType | undefined>(undefined);

  const batchParentOptions = useMemo(() => {
    const pType = parentTypeFor(batchLevel);
    if (!pType) return [];
    return nodes.filter(n => n.type === pType);
  }, [nodes, batchLevel]);

  const placeParentOptions = useMemo(() => {
    const pType = parentTypeFor(placeLevel);
    if (!pType) return [];
    return nodes.filter(n => n.type === pType);
  }, [nodes, placeLevel]);

  // Already tracked by an existing CPM task (belt-and-suspenders against
  // a double-click, a slow retry, or a pending row that slipped through
  // the server-side dedupe) — resolved from the already-loaded node list,
  // no extra round trip.
  const findLinkedNode = useCallback(
    (googleEventId: string) => nodes.find(n => n.google_event_id === googleEventId),
    [nodes]
  );

  // Soft heads-up only — a same title + same day CPM task that was never
  // actually linked to this Google event. Could be a genuine duplicate, or
  // could just be a coincidence (recurring task names repeat legitimately),
  // so this is a warning badge, never a block.
  const findPossibleDuplicate = useCallback(
    (ev: PendingGoogleEvent) => {
      const evDate = (ev.start_at || '').slice(0, 10);
      const normTitle = ev.title.trim().toLowerCase();
      if (!normTitle || !evDate) return null;
      return nodes.find(n =>
        n.google_event_id !== ev.google_event_id &&
        n.title.trim().toLowerCase() === normTitle &&
        n.planned_date && n.planned_date.slice(0, 10) === evDate
      ) || null;
    },
    [nodes]
  );

  const loadPendingEvents = useCallback(async () => {
    if (!user) return;
    setLoadingPending(true);
    const { data, error } = await supabase
      .from('google_calendar_pending_events')
      .select('id, google_event_id, title, description, start_at, end_at, is_all_day')
      .eq('user_id', user.id)
      .eq('status', 'pending')
      .order('start_at', { ascending: true });
    if (!error) setPendingEvents((data as PendingGoogleEvent[]) || []);
    setLoadingPending(false);
  }, [user]);

  useEffect(() => {
    if (status?.connected) loadPendingEvents();
  }, [status?.connected, loadPendingEvents]);

  const filteredPendingEvents = useMemo(() => {
    if (!pendingSearch.trim()) return pendingEvents;
    const q = pendingSearch.toLowerCase();
    return pendingEvents.filter(ev => ev.title.toLowerCase().includes(q));
  }, [pendingEvents, pendingSearch]);

  const togglePendingSelected = (id: string) => {
    setSelectedPendingIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleSelectAllFiltered = () => {
    const filteredIds = filteredPendingEvents.map(ev => ev.id);
    const allSelected = filteredIds.length > 0 && filteredIds.every(id => selectedPendingIds.has(id));
    setSelectedPendingIds(prev => {
      const next = new Set(prev);
      if (allSelected) filteredIds.forEach(id => next.delete(id));
      else filteredIds.forEach(id => next.add(id));
      return next;
    });
  };

  const removePendingLocally = (ids: string[]) => {
    const idSet = new Set(ids);
    setPendingEvents(prev => prev.filter(p => !idSet.has(p.id)));
    setSelectedPendingIds(prev => {
      const next = new Set(prev);
      ids.forEach(id => next.delete(id));
      return next;
    });
  };

  const handleDismissSelected = async () => {
    const ids = Array.from(selectedPendingIds);
    if (ids.length === 0) return;
    await supabase.from('google_calendar_pending_events').update({ status: 'dismissed' }).in('id', ids);
    removePendingLocally(ids);
    toast.success(`Dismissed ${ids.length} event${ids.length === 1 ? '' : 's'}.`);
  };

  const handleDismissAll = async () => {
    if (pendingEvents.length === 0) return;
    const ok = await confirm({
      title: 'Dismiss all new events?',
      message: `This dismisses all ${pendingEvents.length} events currently waiting for review. You can bring them back with "Sync Now" or a range pull later — Google won't re-offer a dismissed event unless it changes.`,
      confirmLabel: 'Dismiss All',
    });
    if (!ok) return;
    const ids = pendingEvents.map(ev => ev.id);
    await supabase.from('google_calendar_pending_events').update({ status: 'dismissed' }).in('id', ids);
    removePendingLocally(ids);
  };

  const handleAddSelectedAsBatch = async () => {
    const ids = Array.from(selectedPendingIds);
    const toAdd = pendingEvents.filter(ev => ids.includes(ev.id));
    if (toAdd.length === 0) return;
    if (parentTypeFor(batchLevel) && !batchParentId) {
      toast.error(`Pick a parent ${parentTypeFor(batchLevel)} for these ${LEVEL_LABELS[batchLevel].toLowerCase()}s first.`);
      return;
    }

    setBatchWorking(true);
    let created = 0;
    let alreadyLinked = 0;
    try {
      for (const ev of toAdd) {
        // Someone already accepted this exact event (a previous sync's
        // batch, a race from double-clicking, etc.) — link instead of
        // creating a second task for it.
        const existingNode = findLinkedNode(ev.google_event_id);
        if (existingNode) {
          alreadyLinked++;
        } else {
          await addNode({
            id: crypto.randomUUID(),
            parent_id: batchParentId || null,
            type: batchLevel,
            title: ev.title,
            description: ev.description,
            planned_date: ev.end_at || ev.start_at,
            start_date: ev.is_all_day ? null : ev.start_at,
            calendar_sync_enabled: true,
            google_event_id: ev.google_event_id,
          });
          created++;
        }
        await supabase.from('google_calendar_pending_events').update({ status: 'imported' }).eq('id', ev.id);
      }
      removePendingLocally(toAdd.map(ev => ev.id));
      if (alreadyLinked > 0) {
        toast.success(`Added ${created} task${created === 1 ? '' : 's'} · ${alreadyLinked} were already linked to an existing task.`);
      } else {
        toast.success(`Added ${created} task${created === 1 ? '' : 's'} to CPM.`);
      }
    } catch (err: any) {
      toast.error('Batch add failed: ' + err.message);
    } finally {
      setBatchWorking(false);
    }
  };

  const handleDismissOne = async (ev: PendingGoogleEvent) => {
    await supabase.from('google_calendar_pending_events').update({ status: 'dismissed' }).eq('id', ev.id);
    removePendingLocally([ev.id]);
  };

  const beginPlaceOne = (ev: PendingGoogleEvent) => {
    setPlacingEventId(ev.id);
    setPlaceLevel('task');
    setPlaceParentId('');
  };

  const continueToFullForm = (ev: PendingGoogleEvent) => {
    // Already linked to a task (a previous accept, a race from a fast
    // double-click) — don't open the form to create a second one.
    const existingNode = findLinkedNode(ev.google_event_id);
    if (existingNode) {
      supabase.from('google_calendar_pending_events').update({ status: 'imported' }).eq('id', ev.id).then(() => {});
      removePendingLocally([ev.id]);
      toast.success(`Already linked to "${existingNode.title}" — nothing new added.`);
      setPlacingEventId(null);
      return;
    }

    const pType = parentTypeFor(placeLevel);
    if (pType && !placeParentId) {
      toast.error(`Pick a parent ${pType} first.`);
      return;
    }
    const parentNode = placeParentId ? nodes.find(n => n.id === placeParentId) : null;
    setFormEvent(ev);
    setFormParentId(placeParentId || null);
    setFormParentType(parentNode?.type);
    setPlacingEventId(null);
  };

  const handleFormSaved = (ev: PendingGoogleEvent) => {
    supabase.from('google_calendar_pending_events').update({ status: 'imported' }).eq('id', ev.id).then(() => {});
    removePendingLocally([ev.id]);
    toast.success(`Added "${ev.title}" to CPM.`);
  };

  // --- Which-tasks-are-linked management (controls what gets pushed) ---
  const [linkedSearch, setLinkedSearch] = useState('');
  const [showAllLinked, setShowAllLinked] = useState(false);
  const datedNodes = useMemo(
    () => nodes.filter(n => n.planned_date).sort((a, b) => (a.planned_date! < b.planned_date! ? -1 : 1)),
    [nodes]
  );
  // Once someone has a lot of tasks, listing every dated task with a toggle
  // gets long fast. Default to a recent/upcoming window (searching or
  // "Show all" bypasses it) so the common case stays short.
  const RECENT_WINDOW_DAYS = 14;
  const UPCOMING_WINDOW_DAYS = 180;
  const windowedNodes = useMemo(() => {
    const now = Date.now();
    const minTime = now - RECENT_WINDOW_DAYS * 24 * 60 * 60 * 1000;
    const maxTime = now + UPCOMING_WINDOW_DAYS * 24 * 60 * 60 * 1000;
    return datedNodes.filter(n => {
      const t = new Date(n.planned_date!).getTime();
      return t >= minTime && t <= maxTime;
    });
  }, [datedNodes]);
  const isSearching = Boolean(linkedSearch.trim());
  const visibleDatedNodes = isSearching || showAllLinked ? datedNodes : windowedNodes;
  const hiddenLinkedCount = datedNodes.length - windowedNodes.length;
  const filteredDatedNodes = useMemo(() => {
    if (!isSearching) return visibleDatedNodes;
    const q = linkedSearch.toLowerCase();
    return visibleDatedNodes.filter(n => n.title.toLowerCase().includes(q));
  }, [visibleDatedNodes, linkedSearch, isSearching]);
  const linkedCount = datedNodes.filter(n => n.calendar_sync_enabled !== false).length;

  const handleToggleLinked = (nodeId: string, current: boolean) => {
    updateNode(nodeId, { calendar_sync_enabled: !current });
  };

  const directGoogleUrl = eventPayload ? generateGoogleCalendarUrl(eventPayload) : null;
  const allFilteredSelected = filteredPendingEvents.length > 0 && filteredPendingEvents.every(ev => selectedPendingIds.has(ev.id));

  return (
    <div className="fixed inset-0 bg-black/40 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-in fade-in duration-150">
      <div className="bg-[var(--card-bg)] rounded-3xl shadow-2xl w-full max-w-2xl overflow-hidden border border-[var(--border-subtle)] flex flex-col max-h-[90vh]">

        {/* Modal Header */}
        <div className="px-6 py-4 border-b border-[var(--border-subtle)] flex items-center justify-between bg-[var(--sidebar-bg)] text-white shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-teal-500/20 border border-teal-500/40 flex items-center justify-center text-teal-400">
              <Calendar className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-sm font-bold flex items-center gap-1.5">
                <span>Google Calendar Sync</span>
                <span className="text-[9px] bg-emerald-500/20 text-emerald-300 px-2 py-0.5 rounded-full font-mono border border-emerald-500/30">
                  Available to everyone
                </span>
              </h2>
              <p className="text-[11px] text-[var(--sidebar-text-muted)]">Connect your Google account for automatic two-way sync.</p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="p-1 rounded-lg text-[var(--sidebar-text-muted)] hover:text-white hover:bg-[var(--sidebar-hover)] transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 space-y-5 flex-1 overflow-y-auto">

          {/* Connection status */}
          <div className="bg-gradient-to-r from-teal-50 to-emerald-50 p-4 rounded-2xl border border-teal-200 space-y-3">
            {loadingStatus ? (
              <p className="text-xs text-teal-900">Checking connection status...</p>
            ) : status?.connected ? (
              <>
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-bold text-teal-950 flex items-center gap-1.5">
                    <Link2 className="w-4 h-4 text-teal-600" />
                    Connected as {status.googleEmail || 'your Google account'}
                  </span>
                </div>
                <p className="text-[11px] text-teal-800">
                  Last synced: {status.lastSyncedAt ? formatLocalDate(status.lastSyncedAt, 'MMM d, yyyy h:mm a') : 'Never — click Sync Now'}
                </p>
                <div className="flex items-center gap-2 pt-1 flex-wrap">
                  <button
                    type="button"
                    onClick={handleSyncNow}
                    disabled={syncing}
                    className="inline-flex items-center gap-2 px-4 py-2 bg-teal-700 hover:bg-teal-800 disabled:opacity-60 text-white font-semibold text-xs rounded-xl transition-colors shadow-2xs"
                  >
                    <RefreshCw className={`w-3.5 h-3.5 ${syncing ? 'animate-spin' : ''}`} />
                    <span>{syncing ? 'Syncing...' : 'Sync Now'}</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowRangePicker(v => !v)}
                    className="inline-flex items-center gap-1.5 px-3 py-2 bg-white hover:bg-teal-50 text-teal-800 font-semibold text-xs rounded-xl transition-colors shadow-2xs border border-teal-200"
                  >
                    <Settings2 className="w-3.5 h-3.5" />
                    <span>Pull a Specific Range</span>
                  </button>
                  <button
                    type="button"
                    onClick={handleDisconnect}
                    disabled={disconnecting}
                    className="inline-flex items-center gap-2 px-3 py-2 bg-white hover:bg-rose-50 text-rose-600 font-semibold text-xs rounded-xl transition-colors shadow-2xs border border-rose-200"
                  >
                    <Unlink className="w-3.5 h-3.5" />
                    <span>Disconnect</span>
                  </button>
                </div>

                {showRangePicker && (
                  <div className="pt-2 mt-1 border-t border-teal-200/70 space-y-2">
                    <p className="text-[11px] text-teal-900">
                      Instead of the default window, just look for events between two dates — useful for sweeping in an older season or a far-future launch without waiting on everything else.
                    </p>
                    <div className="flex items-center flex-wrap gap-2">
                      <input
                        type="date"
                        value={rangeFrom}
                        onChange={e => setRangeFrom(e.target.value)}
                        className="text-xs px-2.5 py-1.5 bg-white border border-teal-200 rounded-lg outline-none focus:border-teal-400"
                      />
                      <span className="text-[11px] text-teal-800 font-semibold">to</span>
                      <input
                        type="date"
                        value={rangeTo}
                        onChange={e => setRangeTo(e.target.value)}
                        className="text-xs px-2.5 py-1.5 bg-white border border-teal-200 rounded-lg outline-none focus:border-teal-400"
                      />
                      <button
                        type="button"
                        onClick={handlePullRange}
                        disabled={pullingRange}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-teal-700 hover:bg-teal-800 disabled:opacity-60 text-white font-semibold text-xs rounded-lg transition-colors"
                      >
                        <span>{pullingRange ? 'Pulling...' : 'Pull This Range'}</span>
                      </button>
                    </div>
                  </div>
                )}
              </>
            ) : (
              <>
                <span className="text-xs font-bold text-teal-950 flex items-center gap-1.5">
                  <Sparkles className="w-4 h-4 text-teal-600" /> Connect Google Calendar
                </span>
                <p className="text-xs text-teal-900">
                  Real two-way sync: changes here push to your Google Calendar, and new events you create in Google show up here to review and add as tasks.
                </p>
                <button
                  type="button"
                  onClick={handleConnect}
                  disabled={connecting}
                  className="inline-flex items-center gap-2 px-4 py-2 bg-teal-700 hover:bg-teal-800 disabled:opacity-60 text-white font-semibold text-xs rounded-xl transition-colors shadow-2xs"
                >
                  <Link2 className="w-3.5 h-3.5" />
                  <span>{connecting ? 'Redirecting to Google...' : 'Connect Google Calendar'}</span>
                </button>
              </>
            )}
          </div>

          {/* Single-event 1-click launcher (only shown when opened from a specific task) */}
          {eventPayload && directGoogleUrl && (
            <div className="bg-[var(--badge-bg)] p-4 rounded-2xl border border-[var(--border)] space-y-2">
              <span className="text-xs font-bold text-[var(--text-primary)] flex items-center gap-1.5">
                <ExternalLink className="w-3.5 h-3.5 text-teal-600" /> Quick Add This One Task
              </span>
              <p className="text-xs text-[var(--text-secondary)]">
                Add <strong className="font-semibold">{eventPayload.title}</strong> directly to Google Calendar, without waiting for a sync.
              </p>
              <a
                href={directGoogleUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 px-4 py-2 bg-[var(--sidebar-bg)] hover:bg-[var(--sidebar-hover)] text-white font-semibold text-xs rounded-xl transition-colors shadow-2xs"
              >
                <ExternalLink className="w-3.5 h-3.5" />
                <span>Open in Google Calendar</span>
              </a>
            </div>
          )}

          {/* Pending events review inbox — only relevant once connected */}
          {status?.connected && (
            <div className="bg-indigo-50/60 p-4 rounded-2xl border border-indigo-200 space-y-2.5">
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-bold text-indigo-950 flex items-center gap-1.5">
                  <Inbox className="w-3.5 h-3.5 text-indigo-600" /> New from Google Calendar ({pendingEvents.length})
                </span>
                {pendingEvents.length > 0 && (
                  <button
                    type="button"
                    onClick={handleDismissAll}
                    className="text-[11px] font-bold text-indigo-700 hover:underline shrink-0"
                  >
                    Dismiss All
                  </button>
                )}
              </div>
              <p className="text-xs text-indigo-900 leading-relaxed">
                Events found in your Google Calendar that aren't in CPM yet. Nothing is added automatically — review and choose.
              </p>

              {pendingEvents.length > 0 && (
                <div className="relative">
                  <input
                    type="text"
                    value={pendingSearch}
                    onChange={e => setPendingSearch(e.target.value)}
                    placeholder="Search new events..."
                    className="w-full text-xs pl-8 pr-3 py-1.5 bg-[var(--card-bg)] border border-indigo-200 rounded-xl outline-none focus:border-indigo-400"
                  />
                  <Search className="w-3.5 h-3.5 text-indigo-400 absolute left-2.5 top-2" />
                </div>
              )}

              {filteredPendingEvents.length > 0 && (
                <button
                  type="button"
                  onClick={toggleSelectAllFiltered}
                  className="text-[11px] font-semibold text-indigo-800 flex items-center gap-1.5"
                >
                  {allFilteredSelected ? <CheckSquare className="w-3.5 h-3.5" /> : <Square className="w-3.5 h-3.5" />}
                  <span>{selectedPendingIds.size > 0 ? `${selectedPendingIds.size} selected` : 'Select all'}</span>
                </button>
              )}

              {selectedPendingIds.size > 0 && (
                <div className="bg-white/80 p-2.5 rounded-xl border border-indigo-200 space-y-2">
                  <p className="text-[11px] font-bold text-indigo-950">
                    Add {selectedPendingIds.size} selected as:
                  </p>
                  <div className="flex items-center flex-wrap gap-2">
                    <select
                      value={batchLevel}
                      onChange={e => { setBatchLevel(e.target.value as keyof typeof LEVEL_LABELS); setBatchParentId(''); }}
                      className="text-xs px-2.5 py-1.5 bg-[var(--card-bg)] border border-indigo-200 rounded-lg outline-none focus:border-indigo-400 font-semibold"
                    >
                      {LEVEL_ORDER.map(lvl => (
                        <option key={lvl} value={lvl}>{LEVEL_LABELS[lvl]}</option>
                      ))}
                    </select>
                    {parentTypeFor(batchLevel) && (
                      <select
                        value={batchParentId}
                        onChange={e => setBatchParentId(e.target.value)}
                        className="text-xs px-2.5 py-1.5 bg-[var(--card-bg)] border border-indigo-200 rounded-lg outline-none focus:border-indigo-400 flex-1 min-w-[10rem]"
                      >
                        <option value="">Choose a parent {parentTypeFor(batchLevel)}...</option>
                        {batchParentOptions.map(p => (
                          <option key={p.id} value={p.id}>{p.title}</option>
                        ))}
                      </select>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={handleAddSelectedAsBatch}
                      disabled={batchWorking}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-60 text-white font-semibold text-xs rounded-lg transition-colors"
                    >
                      <Check className="w-3.5 h-3.5" />
                      <span>{batchWorking ? 'Adding...' : 'Add Selected'}</span>
                    </button>
                    <button
                      type="button"
                      onClick={handleDismissSelected}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-[var(--card-bg)] hover:bg-[var(--badge-bg)] border border-[var(--border)] text-[var(--text-secondary)] font-semibold text-xs rounded-lg transition-colors"
                    >
                      <XCircle className="w-3.5 h-3.5" />
                      <span>Dismiss Selected</span>
                    </button>
                  </div>
                </div>
              )}

              <div className="max-h-64 overflow-y-auto space-y-1.5 pr-1">
                {loadingPending ? (
                  <p className="text-xs text-indigo-800 italic py-2 text-center">Loading...</p>
                ) : filteredPendingEvents.length === 0 ? (
                  <p className="text-xs text-indigo-800 italic py-2 text-center">
                    {pendingEvents.length === 0 ? 'Nothing new — click Sync Now above to check again.' : 'No matching events.'}
                  </p>
                ) : (
                  filteredPendingEvents.map(ev => {
                    const possibleDup = findPossibleDuplicate(ev);
                    return (
                    <div key={ev.id} className="rounded-lg bg-[var(--card-bg)] border border-indigo-100 overflow-hidden">
                      <div className="flex items-center gap-2 px-2.5 py-1.5">
                        <input
                          type="checkbox"
                          checked={selectedPendingIds.has(ev.id)}
                          onChange={() => togglePendingSelected(ev.id)}
                          className="rounded shrink-0"
                        />
                        <div className="min-w-0 flex-1">
                          <p className="text-xs font-semibold text-[var(--text-primary)] truncate">{ev.title}</p>
                          <p className="text-[10px] text-[var(--text-muted)] font-mono">{formatLocalDate(ev.start_at, 'MMM d, yyyy')}</p>
                          {possibleDup && (
                            <p className="text-[10px] text-amber-700 flex items-center gap-1 mt-0.5" title="Same title and date as an existing task, but not linked to this event — could be a coincidence.">
                              <AlertTriangle className="w-2.5 h-2.5 shrink-0" />
                              <span className="truncate">Possibly already tracked as "{possibleDup.title}"</span>
                            </p>
                          )}
                        </div>
                        <div className="flex items-center gap-1 shrink-0">
                          <button
                            type="button"
                            onClick={() => beginPlaceOne(ev)}
                            title="Add to CPM (choose level & parent)"
                            className="p-1.5 rounded-lg bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border border-emerald-200"
                          >
                            <Check className="w-3.5 h-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDismissOne(ev)}
                            title="Dismiss"
                            className="p-1.5 rounded-lg bg-[var(--badge-bg)] hover:bg-[var(--border-subtle)] text-[var(--text-muted)] border border-[var(--border)]"
                          >
                            <XCircle className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>

                      {placingEventId === ev.id && (
                        <div className="px-2.5 pb-2.5 pt-1 bg-emerald-50/60 border-t border-emerald-100 space-y-2">
                          <p className="text-[10px] font-bold text-emerald-900 flex items-center gap-1">
                            <Layers className="w-3 h-3" /> Add as which level?
                          </p>
                          <div className="flex items-center flex-wrap gap-1.5">
                            <select
                              value={placeLevel}
                              onChange={e => { setPlaceLevel(e.target.value as keyof typeof LEVEL_LABELS); setPlaceParentId(''); }}
                              className="text-[11px] px-2 py-1 bg-[var(--card-bg)] border border-emerald-200 rounded-lg outline-none focus:border-emerald-400 font-semibold"
                            >
                              {LEVEL_ORDER.map(lvl => (
                                <option key={lvl} value={lvl}>{LEVEL_LABELS[lvl]}</option>
                              ))}
                            </select>
                            {parentTypeFor(placeLevel) && (
                              <select
                                value={placeParentId}
                                onChange={e => setPlaceParentId(e.target.value)}
                                className="text-[11px] px-2 py-1 bg-[var(--card-bg)] border border-emerald-200 rounded-lg outline-none focus:border-emerald-400 flex-1 min-w-[8rem]"
                              >
                                <option value="">Choose a parent {parentTypeFor(placeLevel)}...</option>
                                {placeParentOptions.map(p => (
                                  <option key={p.id} value={p.id}>{p.title}</option>
                                ))}
                              </select>
                            )}
                          </div>
                          <div className="flex items-center gap-2">
                            <button
                              type="button"
                              onClick={() => continueToFullForm(ev)}
                              className="text-[11px] font-bold text-emerald-700 hover:underline"
                            >
                              Continue to full task form →
                            </button>
                            <button
                              type="button"
                              onClick={() => setPlacingEventId(null)}
                              className="text-[11px] text-[var(--text-muted)] hover:text-[var(--text-primary)] underline"
                            >
                              Cancel
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                    );
                  })
                )}
              </div>
            </div>
          )}

          {/* Which tasks are linked (controls what gets pushed) */}
          <div className="bg-[var(--badge-bg)] p-4 rounded-2xl border border-[var(--border)] space-y-3">
            <span className="text-xs font-bold text-[var(--text-primary)] block">
              Linked Tasks ({linkedCount} of {datedNodes.length})
            </span>
            <p className="text-xs text-[var(--text-secondary)] leading-relaxed">
              Only tasks toggled on here are pushed to Google Calendar.
            </p>

            <div className="relative">
              <input
                type="text"
                value={linkedSearch}
                onChange={e => setLinkedSearch(e.target.value)}
                placeholder="Search tasks..."
                className="w-full text-xs pl-8 pr-3 py-1.5 bg-[var(--input-bg)] border border-[var(--border)] rounded-xl outline-none focus:border-[var(--accent)]"
              />
              <Search className="w-3.5 h-3.5 text-[var(--text-muted)] absolute left-2.5 top-2" />
            </div>

            {!isSearching && hiddenLinkedCount > 0 && (
              <p className="text-[11px] text-[var(--text-muted)] flex items-center justify-between gap-2 -mt-1">
                <span>Showing recent &amp; upcoming tasks · {hiddenLinkedCount} older/farther-out hidden</span>
                <button
                  type="button"
                  onClick={() => setShowAllLinked(v => !v)}
                  className="font-bold text-[var(--accent)] hover:underline shrink-0"
                >
                  {showAllLinked ? 'Show fewer' : 'Show all'}
                </button>
              </p>
            )}

            <div className="max-h-52 overflow-y-auto space-y-1 pr-1">
              {filteredDatedNodes.length === 0 ? (
                <p className="text-xs text-[var(--text-muted)] italic py-4 text-center">
                  {datedNodes.length === 0 ? 'No tasks with dates yet.' : 'No matching tasks.'}
                </p>
              ) : (
                filteredDatedNodes.map(node => {
                  const isLinked = node.calendar_sync_enabled !== false;
                  return (
                    <div key={node.id} className="flex items-center justify-between gap-2 px-2.5 py-1.5 rounded-lg bg-[var(--card-bg)] border border-[var(--border-subtle)]">
                      <div className="min-w-0">
                        <p className="text-xs font-semibold text-[var(--text-primary)] truncate">{node.title}</p>
                        <p className="text-[10px] text-[var(--text-muted)] font-mono">{formatLocalDate(node.planned_date!, 'MMM d, yyyy')}</p>
                      </div>
                      <button
                        type="button"
                        onClick={() => handleToggleLinked(node.id, isLinked)}
                        className={`w-8 h-4.5 rounded-full transition-colors flex items-center px-0.5 shrink-0 ${
                          isLinked ? 'bg-[var(--accent)] justify-end' : 'bg-[var(--border)] justify-start'
                        }`}
                      >
                        <span className="w-3.5 h-3.5 rounded-full bg-white shadow-sm block" />
                      </button>
                    </div>
                  );
                })
              )}
            </div>
          </div>

          <p className="text-[10px] text-[var(--text-muted)] flex items-start gap-1">
            <Info className="w-3 h-3 shrink-0 mt-0.5" />
            <span>Sync isn't instant — it runs when you click "Sync Now" (a background schedule can be added later). Deleting or completing a linked task automatically removes its Google Calendar event.</span>
          </p>

        </div>
      </div>

      {formEvent && (
        <NodeForm
          parentId={formParentId}
          parentType={formParentType}
          initialTitle={formEvent.title}
          initialDescription={formEvent.description}
          initialPlannedDate={(formEvent.end_at || formEvent.start_at).slice(0, 10)}
          linkedGoogleEventId={formEvent.google_event_id}
          onSaved={() => handleFormSaved(formEvent)}
          onClose={() => setFormEvent(null)}
        />
      )}
    </div>
  );
};
