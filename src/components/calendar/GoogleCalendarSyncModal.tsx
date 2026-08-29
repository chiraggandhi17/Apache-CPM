import React, { useState, useMemo, useEffect, useCallback } from 'react';
import { useAuth } from '../../context/AuthContext';
import { useNodes } from '../../context/NodeContext';
import { useToast } from '../../context/ToastContext';
import { useDialog } from '../../context/DialogContext';
import { supabase } from '../../lib/supabase';
import { generateGoogleCalendarUrl, CalendarEventPayload } from '../../utils/calendar-links';
import { formatLocalDate } from '../../utils/date-format';
import {
  startGoogleOAuth, getGoogleCalendarStatus, disconnectGoogleCalendar, syncGoogleCalendarNow, GoogleCalendarStatus,
} from '../../utils/google-calendar-api';
import {
  X, Calendar, ExternalLink, Sparkles, Search, Info, Link2,
  RefreshCw, Unlink, Inbox, Check, XCircle,
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

  // --- Pending events review inbox (populated by the sync Edge Function) ---
  const [pendingEvents, setPendingEvents] = useState<PendingGoogleEvent[]>([]);
  const [loadingPending, setLoadingPending] = useState(false);
  const [reviewParentId, setReviewParentId] = useState<string>('');

  const importableParents = useMemo(
    () => nodes.filter(n => n.type === 'department' || n.type === 'season' || n.type === 'project'),
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

  const handleAcceptPendingEvent = async (ev: PendingGoogleEvent) => {
    try {
      await addNode({
        id: crypto.randomUUID(),
        parent_id: reviewParentId || null,
        type: 'task',
        title: ev.title,
        description: ev.description,
        planned_date: ev.end_at || ev.start_at,
        start_date: ev.is_all_day ? null : ev.start_at,
        calendar_sync_enabled: true,
        google_event_id: ev.google_event_id,
      });
      await supabase.from('google_calendar_pending_events').update({ status: 'imported' }).eq('id', ev.id);
      setPendingEvents(prev => prev.filter(p => p.id !== ev.id));
      toast.success(`Added "${ev.title}" to CPM.`);
    } catch (err: any) {
      toast.error('Failed to add task: ' + err.message);
    }
  };

  const handleDismissPendingEvent = async (ev: PendingGoogleEvent) => {
    await supabase.from('google_calendar_pending_events').update({ status: 'dismissed' }).eq('id', ev.id);
    setPendingEvents(prev => prev.filter(p => p.id !== ev.id));
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
                <div className="flex items-center gap-2 pt-1">
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
                    onClick={handleDisconnect}
                    disabled={disconnecting}
                    className="inline-flex items-center gap-2 px-3 py-2 bg-white hover:bg-rose-50 text-rose-600 font-semibold text-xs rounded-xl transition-colors shadow-2xs border border-rose-200"
                  >
                    <Unlink className="w-3.5 h-3.5" />
                    <span>Disconnect</span>
                  </button>
                </div>
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
              <span className="text-xs font-bold text-indigo-950 flex items-center gap-1.5">
                <Inbox className="w-3.5 h-3.5 text-indigo-600" /> New from Google Calendar ({pendingEvents.length})
              </span>
              <p className="text-xs text-indigo-900 leading-relaxed">
                Events found in your Google Calendar that aren't in CPM yet. Nothing is added automatically — review and choose.
              </p>

              {pendingEvents.length > 0 && (
                <div>
                  <label className="block text-[11px] font-bold text-indigo-900 mb-1">Add accepted events into</label>
                  <select
                    value={reviewParentId}
                    onChange={e => setReviewParentId(e.target.value)}
                    className="w-full text-xs px-3 py-2 bg-[var(--card-bg)] border border-indigo-200 rounded-xl outline-none focus:border-indigo-400"
                  >
                    <option value="">Top level (no parent project)</option>
                    {importableParents.map(p => (
                      <option key={p.id} value={p.id}>{p.title}</option>
                    ))}
                  </select>
                </div>
              )}

              <div className="max-h-52 overflow-y-auto space-y-1.5 pr-1">
                {loadingPending ? (
                  <p className="text-xs text-indigo-800 italic py-2 text-center">Loading...</p>
                ) : pendingEvents.length === 0 ? (
                  <p className="text-xs text-indigo-800 italic py-2 text-center">Nothing new — click Sync Now above to check again.</p>
                ) : (
                  pendingEvents.map(ev => (
                    <div key={ev.id} className="flex items-center justify-between gap-2 px-2.5 py-1.5 rounded-lg bg-[var(--card-bg)] border border-indigo-100">
                      <div className="min-w-0">
                        <p className="text-xs font-semibold text-[var(--text-primary)] truncate">{ev.title}</p>
                        <p className="text-[10px] text-[var(--text-muted)] font-mono">{formatLocalDate(ev.start_at, 'MMM d, yyyy')}</p>
                      </div>
                      <div className="flex items-center gap-1 shrink-0">
                        <button
                          type="button"
                          onClick={() => handleAcceptPendingEvent(ev)}
                          title="Add to CPM"
                          className="p-1.5 rounded-lg bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border border-emerald-200"
                        >
                          <Check className="w-3.5 h-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDismissPendingEvent(ev)}
                          title="Dismiss"
                          className="p-1.5 rounded-lg bg-[var(--badge-bg)] hover:bg-[var(--border-subtle)] text-[var(--text-muted)] border border-[var(--border)]"
                        >
                          <XCircle className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  ))
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
    </div>
  );
};
