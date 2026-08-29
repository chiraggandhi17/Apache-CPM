import React, { useState, useMemo, useRef } from 'react';
import { useAuth } from '../../context/AuthContext';
import { useNodes } from '../../context/NodeContext';
import { useToast } from '../../context/ToastContext';
import { generateGoogleCalendarUrl, generateICalSubscriptionUrl, CalendarEventPayload } from '../../utils/calendar-links';
import { downloadICSFile } from '../../utils/ics-export';
import { parseICSFile, ParsedICSEvent } from '../../utils/ics-import';
import { formatLocalDate } from '../../utils/date-format';
import {
  X, Calendar, ExternalLink, Copy, Check, Sparkles, Search, Download,
  Upload, FileUp, CheckSquare, Square, ArrowRight, Info,
} from 'lucide-react';

interface GoogleCalendarSyncModalProps {
  eventPayload?: CalendarEventPayload | null;
  onClose: () => void;
}

export const GoogleCalendarSyncModal: React.FC<GoogleCalendarSyncModalProps> = ({ eventPayload, onClose }) => {
  const { user, profile, organization, isIndividual } = useAuth();
  const { nodes, updateNode, addNode } = useNodes();
  const toast = useToast();

  const [copiedFeed, setCopiedFeed] = useState(false);
  const [linkedSearch, setLinkedSearch] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  // --- Which-tasks-are-linked management ---
  const datedNodes = useMemo(
    () => nodes.filter(n => n.planned_date).sort((a, b) => (a.planned_date! < b.planned_date! ? -1 : 1)),
    [nodes]
  );
  const filteredDatedNodes = useMemo(() => {
    if (!linkedSearch.trim()) return datedNodes;
    const q = linkedSearch.toLowerCase();
    return datedNodes.filter(n => n.title.toLowerCase().includes(q));
  }, [datedNodes, linkedSearch]);

  const linkedCount = datedNodes.filter(n => n.calendar_sync_enabled !== false).length;

  const handleToggleLinked = (nodeId: string, current: boolean) => {
    updateNode(nodeId, { calendar_sync_enabled: !current });
  };

  const directGoogleUrl = eventPayload ? generateGoogleCalendarUrl(eventPayload) : null;
  const iCalFeedUrl = user ? generateICalSubscriptionUrl(user.id) : generateICalSubscriptionUrl('demo-user-1');

  const handleCopyFeed = () => {
    navigator.clipboard.writeText(iCalFeedUrl);
    setCopiedFeed(true);
    setTimeout(() => setCopiedFeed(false), 2500);
  };

  const handleDownloadICS = () => {
    const linked = datedNodes.filter(n => n.calendar_sync_enabled !== false);
    if (linked.length === 0) {
      toast.error('No linked tasks with dates to export. Toggle some on below.');
      return;
    }
    const calendarName = isIndividual ? 'Cadence Personal' : (organization?.name ? `Cadence - ${organization.name}` : 'Cadence CPM');
    downloadICSFile(linked, `cadence-calendar-${new Date().toISOString().slice(0, 10)}.ics`);
    toast.success(`Downloaded ${linked.length} linked task${linked.length === 1 ? '' : 's'} as a calendar file.`);
  };

  // --- Import from Google Calendar (.ics upload) ---
  const [importedEvents, setImportedEvents] = useState<ParsedICSEvent[] | null>(null);
  const [selectedImportIds, setSelectedImportIds] = useState<Set<string>>(new Set());
  const [importParentId, setImportParentId] = useState<string>('');
  const [importing, setImporting] = useState(false);

  const importableParents = useMemo(
    () => nodes.filter(n => n.type === 'department' || n.type === 'season' || n.type === 'project'),
    [nodes]
  );

  const handleFileSelected = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const text = String(reader.result || '');
        const parsed = parseICSFile(text);
        if (parsed.length === 0) {
          toast.error("Couldn't find any events in that file.");
          return;
        }
        setImportedEvents(parsed);
        setSelectedImportIds(new Set(parsed.map(ev => ev.uid)));
      } catch (err: any) {
        toast.error('Failed to read that .ics file: ' + err.message);
      }
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  const toggleImportSelection = (uid: string) => {
    setSelectedImportIds(prev => {
      const next = new Set(prev);
      if (next.has(uid)) next.delete(uid);
      else next.add(uid);
      return next;
    });
  };

  const toggleSelectAllImports = () => {
    if (!importedEvents) return;
    if (selectedImportIds.size === importedEvents.length) {
      setSelectedImportIds(new Set());
    } else {
      setSelectedImportIds(new Set(importedEvents.map(ev => ev.uid)));
    }
  };

  const handleConfirmImport = async () => {
    if (!importedEvents) return;
    const toImport = importedEvents.filter(ev => selectedImportIds.has(ev.uid));
    if (toImport.length === 0) return;

    setImporting(true);
    try {
      for (const ev of toImport) {
        await addNode({
          id: crypto.randomUUID(),
          parent_id: importParentId || null,
          type: 'task',
          title: ev.title,
          description: ev.description,
          planned_date: ev.endISO || ev.startISO,
          start_date: ev.isAllDay ? null : ev.startISO,
          calendar_sync_enabled: true,
        });
      }
      toast.success(`Imported ${toImport.length} event${toImport.length === 1 ? '' : 's'} from Google Calendar.`);
      setImportedEvents(null);
      setSelectedImportIds(new Set());
    } catch (err: any) {
      toast.error('Import failed: ' + err.message);
    } finally {
      setImporting(false);
    }
  };

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
                <span>Google Calendar & iCal Sync</span>
                <span className="text-[9px] bg-emerald-500/20 text-emerald-300 px-2 py-0.5 rounded-full font-mono border border-emerald-500/30">
                  Available to everyone
                </span>
              </h2>
              <p className="text-[11px] text-[var(--sidebar-text-muted)]">Choose which tasks are linked, then export or import calendar files.</p>
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

          {/* Single-event 1-click launcher (only shown when opened from a specific task) */}
          {eventPayload && directGoogleUrl && (
            <div className="bg-gradient-to-r from-teal-50 to-emerald-50 p-4 rounded-2xl border border-teal-200 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-teal-950 flex items-center gap-1.5">
                  <Sparkles className="w-4 h-4 text-teal-600" />
                  1-Click Google Calendar Event
                </span>
                <span className="text-[10px] bg-teal-200/60 text-teal-900 px-2 py-0.5 rounded-md font-mono font-bold">
                  Instant Launcher
                </span>
              </div>

              <p className="text-xs text-teal-900">
                Add <strong className="font-semibold">{eventPayload.title}</strong> directly to your Google Calendar.
              </p>

              <a
                href={directGoogleUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 px-4 py-2 bg-teal-700 hover:bg-teal-800 text-white font-semibold text-xs rounded-xl transition-colors shadow-2xs mt-1"
              >
                <ExternalLink className="w-3.5 h-3.5" />
                <span>Open in Google Calendar</span>
              </a>
            </div>
          )}

          {/* Which tasks are linked */}
          <div className="bg-[var(--badge-bg)] p-4 rounded-2xl border border-[var(--border)] space-y-3">
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs font-bold text-[var(--text-primary)] block">
                Linked Tasks ({linkedCount} of {datedNodes.length})
              </span>
            </div>
            <p className="text-xs text-[var(--text-secondary)] leading-relaxed">
              Only tasks toggled on here are included in your calendar file export and quick-add links. Everything with a date starts linked — turn off anything you don't want on your calendar.
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

          {/* Export: real, working .ics download */}
          <div className="bg-[var(--badge-bg)] p-4 rounded-2xl border border-[var(--border)] space-y-2.5">
            <span className="text-xs font-bold text-[var(--text-primary)] flex items-center gap-1.5">
              <Download className="w-3.5 h-3.5 text-teal-600" /> Export to Google Calendar / Apple Calendar / Outlook
            </span>
            <p className="text-xs text-[var(--text-secondary)] leading-relaxed">
              Downloads a standard calendar file (.ics) with your linked tasks above. In Google Calendar: Settings → Import & export → Import, then choose this file.
            </p>
            <button
              type="button"
              onClick={handleDownloadICS}
              className="inline-flex items-center gap-2 px-4 py-2 bg-[var(--sidebar-bg)] hover:bg-[var(--sidebar-hover)] text-white font-semibold text-xs rounded-xl transition-colors shadow-2xs"
            >
              <Download className="w-3.5 h-3.5" />
              <span>Download Calendar File (.ics)</span>
            </button>
            <p className="text-[10px] text-[var(--text-muted)] flex items-start gap-1 pt-1">
              <Info className="w-3 h-3 shrink-0 mt-0.5" />
              <span>This is a one-time snapshot, not a live feed — re-download after dates change and re-import to refresh.</span>
            </p>
          </div>

          {/* Import from Google Calendar (.ics upload) */}
          <div className="bg-[var(--badge-bg)] p-4 rounded-2xl border border-[var(--border)] space-y-2.5">
            <span className="text-xs font-bold text-[var(--text-primary)] flex items-center gap-1.5">
              <Upload className="w-3.5 h-3.5 text-indigo-600" /> Import from Google Calendar
            </span>
            <p className="text-xs text-[var(--text-secondary)] leading-relaxed">
              In Google Calendar: Settings → Import & export → Export, download your calendar as a .zip, unzip it, then upload the .ics file here. You'll pick exactly which events become tasks.
            </p>

            {!importedEvents ? (
              <>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".ics"
                  onChange={handleFileSelected}
                  className="hidden"
                />
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="inline-flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white font-semibold text-xs rounded-xl transition-colors shadow-2xs"
                >
                  <FileUp className="w-3.5 h-3.5" />
                  <span>Choose .ics File...</span>
                </button>
              </>
            ) : (
              <div className="space-y-2.5">
                <div className="flex items-center justify-between">
                  <button
                    type="button"
                    onClick={toggleSelectAllImports}
                    className="text-[11px] font-semibold text-[var(--accent)] flex items-center gap-1"
                  >
                    {selectedImportIds.size === importedEvents.length ? <CheckSquare className="w-3.5 h-3.5" /> : <Square className="w-3.5 h-3.5" />}
                    {selectedImportIds.size} of {importedEvents.length} selected
                  </button>
                  <button
                    type="button"
                    onClick={() => { setImportedEvents(null); setSelectedImportIds(new Set()); }}
                    className="text-[11px] text-[var(--text-muted)] hover:text-[var(--text-primary)] underline"
                  >
                    Cancel
                  </button>
                </div>

                <div className="max-h-44 overflow-y-auto space-y-1 pr-1">
                  {importedEvents.map(ev => (
                    <label key={ev.uid} className="flex items-center gap-2.5 px-2.5 py-1.5 rounded-lg bg-[var(--card-bg)] border border-[var(--border-subtle)] cursor-pointer">
                      <input
                        type="checkbox"
                        checked={selectedImportIds.has(ev.uid)}
                        onChange={() => toggleImportSelection(ev.uid)}
                        className="rounded"
                      />
                      <div className="min-w-0 flex-1">
                        <p className="text-xs font-semibold text-[var(--text-primary)] truncate">{ev.title}</p>
                        <p className="text-[10px] text-[var(--text-muted)] font-mono">{formatLocalDate(ev.startISO, 'MMM d, yyyy')}</p>
                      </div>
                    </label>
                  ))}
                </div>

                <div>
                  <label className="block text-[11px] font-bold text-[var(--text-secondary)] mb-1">Import into (optional)</label>
                  <select
                    value={importParentId}
                    onChange={e => setImportParentId(e.target.value)}
                    className="w-full text-xs px-3 py-2 bg-[var(--input-bg)] border border-[var(--border)] rounded-xl outline-none focus:border-[var(--accent)]"
                  >
                    <option value="">Top level (no parent project)</option>
                    {importableParents.map(p => (
                      <option key={p.id} value={p.id}>{p.title}</option>
                    ))}
                  </select>
                </div>

                <button
                  type="button"
                  onClick={handleConfirmImport}
                  disabled={importing || selectedImportIds.size === 0}
                  className="inline-flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white font-semibold text-xs rounded-xl transition-colors shadow-2xs"
                >
                  <ArrowRight className="w-3.5 h-3.5" />
                  <span>{importing ? 'Importing...' : `Import ${selectedImportIds.size} Selected`}</span>
                </button>
              </div>
            )}
          </div>

          {/* Legacy live feed URL (requires a backend Edge Function to actually serve content) */}
          <div className="bg-[var(--badge-bg)] p-4 rounded-2xl border border-[var(--border)] space-y-2">
            <span className="text-xs font-bold text-[var(--text-primary)] block">
              Live Subscription Feed URL
            </span>
            <p className="text-xs text-[var(--text-secondary)] leading-relaxed">
              A URL you could subscribe to for always-fresh updates, instead of re-downloading a file. This requires a small backend service that isn't deployed yet — copying it won't work until that's set up.
            </p>
            <div className="flex items-center gap-2">
              <input
                type="text"
                readOnly
                value={iCalFeedUrl}
                className="flex-1 text-[11px] font-mono p-2 bg-[var(--card-bg)] border border-[var(--border)] rounded-xl text-[var(--text-muted)] truncate outline-none select-all"
              />
              <button
                type="button"
                onClick={handleCopyFeed}
                className="px-3 py-2 bg-[var(--card-bg)] border border-[var(--border)] hover:bg-[var(--border-subtle)] text-[var(--text-secondary)] font-semibold text-xs rounded-xl flex items-center gap-1.5 transition-colors shrink-0 shadow-2xs"
              >
                {copiedFeed ? <Check className="w-3.5 h-3.5 text-emerald-500" /> : <Copy className="w-3.5 h-3.5" />}
                <span>{copiedFeed ? 'Copied!' : 'Copy'}</span>
              </button>
            </div>
          </div>

          {/* Honest placeholder for true 2-way OAuth auto-sync */}
          <div className="p-4 rounded-2xl border border-dashed border-[var(--border)] text-center space-y-1">
            <span className="text-xs font-bold text-[var(--text-muted)]">Real-time 2-way auto-sync — coming soon</span>
            <p className="text-[11px] text-[var(--text-muted)] max-w-md mx-auto">
              Instant, always-on syncing in both directions (no re-exporting) needs a deeper Google account connection we haven't built yet. The export/import above works today and covers most day-to-day use.
            </p>
          </div>

        </div>
      </div>
    </div>
  );
};
