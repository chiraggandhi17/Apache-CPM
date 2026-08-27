import React, { useState, useMemo } from 'react';
import { useNodes } from '../../context/NodeContext';
import { formatLocalDate } from '../../utils/date-format';
import { X, Bell, Filter, Search, Calendar, Trash2, Clock, MessageSquare, Check, Edit2, RefreshCw } from 'lucide-react';
import { formatISO } from 'date-fns';
import { recurrenceLabel } from '../../utils/recurrence';

interface ManageAlertsModalProps {
  onClose: () => void;
}

export const ManageAlertsModal: React.FC<ManageAlertsModalProps> = ({ onClose }) => {
  const { reminders, nodes, dismissReminder, snoozeReminder, deleteReminder, updateReminder, addReminderNote } = useNodes();
  
  const [activeTab, setActiveTab] = useState<'all' | 'triggered' | 'snoozed'>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedProjectId, setSelectedProjectId] = useState<string>('all');
  const [editingReminderId, setEditingReminderId] = useState<string | null>(null);
  const [editDate, setEditDate] = useState('');
  const [activeNoteId, setActiveNoteId] = useState<string | null>(null);
  const [noteText, setNoteText] = useState('');

  // Extract unique projects for dropdown filter
  const projects = useMemo(() => {
    return nodes.filter(n => n.type === 'project' || n.type === 'season' || n.type === 'department');
  }, [nodes]);

  // Filter reminders
  const filteredReminders = useMemo(() => {
    const now = new Date();
    return reminders.filter(rem => {
      // Search
      if (searchQuery.trim()) {
        const query = searchQuery.toLowerCase();
        const msgMatch = rem.message.toLowerCase().includes(query);
        const noteMatch = rem.note?.toLowerCase().includes(query);
        const node = nodes.find(n => n.id === rem.node_id);
        const nodeMatch = node?.title.toLowerCase().includes(query);
        if (!msgMatch && !noteMatch && !nodeMatch) return false;
      }

      // Project filter
      if (selectedProjectId !== 'all') {
        const node = nodes.find(n => n.id === rem.node_id);
        if (!node) return false;
        // check if node or ancestor matches selectedProjectId
        let curr: typeof node | undefined = node;
        let matches = false;
        while (curr) {
          if (curr.id === selectedProjectId) { matches = true; break; }
          if (!curr.parent_id) break;
          curr = nodes.find(n => n.id === curr!.parent_id);
        }
        if (!matches) return false;
      }

      // Tab filter
      if (activeTab === 'snoozed') {
        return Boolean(rem.snoozed_until);
      }
      if (activeTab === 'triggered') {
        return rem.remind_at && new Date(rem.remind_at) <= now && !rem.dismissed_at;
      }

      return !rem.dismissed_at;
    });
  }, [reminders, nodes, searchQuery, selectedProjectId, activeTab]);

  const handleSaveEditDate = (remId: string) => {
    if (editDate) {
      updateReminder(remId, { remind_at: new Date(editDate).toISOString() });
    }
    setEditingReminderId(null);
  };

  const handleSaveNote = (remId: string) => {
    addReminderNote(remId, noteText);
    setActiveNoteId(null);
    setNoteText('');
  };

  return (
    <div className="fixed inset-0 bg-black/40 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-in fade-in duration-150">
      <div className="bg-[var(--card-bg)] rounded-3xl shadow-2xl w-full max-w-2xl overflow-hidden border border-[var(--border-subtle)] flex flex-col max-h-[85vh]">
        
        {/* Header */}
        <div className="px-6 py-4 border-b border-[var(--border-subtle)] flex items-center justify-between bg-[var(--badge-bg)] shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-amber-500/10 border border-amber-500/30 flex items-center justify-center text-amber-600">
              <Bell className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-base font-bold text-[var(--text-primary)]">Manage All Scheduled Alerts</h2>
              <p className="text-xs text-[var(--text-muted)]">View, search, snooze, or filter relative & fixed alerts across all active orders.</p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="p-1 rounded-lg text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--badge-bg)] transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Toolbar & Filter Controls */}
        <div className="p-4 bg-[var(--badge-bg)] border-b border-[var(--border-subtle)] space-y-3 shrink-0">
          <div className="flex flex-col sm:flex-row items-center justify-between gap-3">
            
            {/* Search Input */}
            <div className="relative w-full sm:w-64">
              <input
                type="text"
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                placeholder="Search alerts or tasks..."
                className="w-full text-xs pl-8 pr-3 py-1.5 bg-[var(--card-bg)] border border-[var(--border)] rounded-xl outline-none focus:border-teal-500"
              />
              <Search className="w-3.5 h-3.5 text-[var(--text-muted)] absolute left-2.5 top-2.5" />
            </div>

            {/* Project Filter Dropdown */}
            <div className="flex items-center gap-2 w-full sm:w-auto">
              <Filter className="w-3.5 h-3.5 text-[var(--text-muted)]" />
              <select
                value={selectedProjectId}
                onChange={e => setSelectedProjectId(e.target.value)}
                className="text-xs px-2.5 py-1.5 bg-[var(--card-bg)] border border-[var(--border)] rounded-xl outline-none focus:border-teal-500"
              >
                <option value="all">All Projects</option>
                {projects.map(p => (
                  <option key={p.id} value={p.id}>{p.title}</option>
                ))}
              </select>
            </div>
          </div>

          {/* Filter Tabs */}
          <div className="flex items-center gap-1 text-xs">
            <button
              type="button"
              onClick={() => setActiveTab('all')}
              className={`px-3 py-1 rounded-lg font-semibold transition-colors ${
                activeTab === 'all' ? 'bg-amber-500 text-white shadow-2xs' : 'text-[var(--text-secondary)] hover:bg-[var(--badge-bg)]'
              }`}
            >
              All Active Scheduled ({reminders.filter(r => !r.dismissed_at).length})
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('triggered')}
              className={`px-3 py-1 rounded-lg font-semibold transition-colors ${
                activeTab === 'triggered' ? 'bg-rose-600 text-white shadow-2xs' : 'text-[var(--text-secondary)] hover:bg-[var(--badge-bg)]'
              }`}
            >
              Triggered / Due
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('snoozed')}
              className={`px-3 py-1 rounded-lg font-semibold transition-colors ${
                activeTab === 'snoozed' ? 'bg-indigo-600 text-white shadow-2xs' : 'text-[var(--text-secondary)] hover:bg-[var(--badge-bg)]'
              }`}
            >
              Snoozed ({reminders.filter(r => r.snoozed_until).length})
            </button>
          </div>
        </div>

        {/* Alerts List */}
        <div className="flex-1 overflow-y-auto p-4 space-y-3">
          {filteredReminders.length === 0 ? (
            <div className="text-center py-12 text-[var(--text-muted)] space-y-2">
              <Bell className="w-10 h-10 mx-auto text-[var(--text-muted)]" />
              <p className="text-xs font-semibold text-[var(--text-secondary)]">No matching scheduled alerts found.</p>
            </div>
          ) : (
            filteredReminders.map(rem => {
              const node = nodes.find(n => n.id === rem.node_id);
              return (
                <div
                  key={rem.id}
                  className="bg-[var(--card-bg)] p-4 rounded-2xl border border-[var(--border)] shadow-2xs space-y-2 hover:border-[var(--border)] transition-colors"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-bold text-[var(--text-primary)]">{rem.message}</span>
                        {rem.offset_mode === 'fixed' ? (
                          <span className="text-[10px] bg-indigo-50 text-indigo-700 px-2 py-0.5 rounded-md font-mono border border-indigo-200">
                            Fixed Timestamp
                          </span>
                        ) : (
                          <span className="text-[10px] bg-teal-50 text-teal-800 px-2 py-0.5 rounded-md font-mono border border-teal-200">
                            {rem.offset_days}d Offset
                          </span>
                        )}
                        {rem.is_recurring && recurrenceLabel(rem.recurrence_rule) && (
                          <span className="text-[10px] bg-amber-50 text-amber-800 px-2 py-0.5 rounded-md font-mono border border-amber-200 flex items-center gap-1">
                            <RefreshCw className="w-2.5 h-2.5" /> {recurrenceLabel(rem.recurrence_rule)}
                          </span>
                        )}
                      </div>

                      {node && (
                        <p className="text-[11px] text-[var(--text-muted)] font-medium">
                          Attached to: <span className="text-[var(--text-primary)] font-semibold">{node.title}</span>
                        </p>
                      )}
                    </div>

                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        onClick={() => {
                          setEditingReminderId(rem.id);
                          setEditDate(rem.remind_at.substring(0, 16));
                        }}
                        title="Edit Trigger Date"
                        className="p-1 text-[var(--text-muted)] hover:text-[var(--text-primary)] rounded-md hover:bg-[var(--badge-bg)]"
                      >
                        <Edit2 className="w-3.5 h-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => deleteReminder(rem.id)}
                        title="Delete Alert"
                        className="p-1 text-rose-400 hover:text-rose-600 rounded-md hover:bg-rose-50"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>

                  {/* Scheduled Trigger Date */}
                  {editingReminderId === rem.id ? (
                    <div className="flex items-center gap-2 bg-amber-50 p-2 rounded-xl border border-amber-200">
                      <input
                        type="datetime-local"
                        value={editDate}
                        onChange={e => setEditDate(e.target.value)}
                        className="text-xs p-1 border border-amber-300 rounded-md bg-[var(--card-bg)] font-mono"
                      />
                      <button
                        type="button"
                        onClick={() => handleSaveEditDate(rem.id)}
                        className="px-2.5 py-1 bg-amber-600 text-white text-xs font-semibold rounded-md flex items-center gap-1"
                      >
                        <Check className="w-3 h-3" /> Save
                      </button>
                    </div>
                  ) : (
                    <div className="flex items-center justify-between text-xs pt-1 border-t border-[var(--border-subtle)] text-[var(--text-secondary)]">
                      <span className="flex items-center gap-1 text-[11px]">
                        <Calendar className="w-3.5 h-3.5 text-amber-500" />
                        Trigger Date: <strong className="font-mono text-[var(--text-primary)]">{formatLocalDate(rem.remind_at, 'MMM d, yyyy h:mm a')}</strong>
                      </span>

                      {/* Quick Snooze Actions */}
                      <div className="flex items-center gap-1">
                        <button
                          type="button"
                          onClick={() => snoozeReminder(rem.id, '1d')}
                          className="text-[10px] px-2 py-0.5 bg-[var(--badge-bg)] hover:bg-amber-100 text-[var(--text-secondary)] hover:text-amber-900 rounded-md font-medium border border-[var(--border)]"
                        >
                          Snooze 1d
                        </button>
                        <button
                          type="button"
                          onClick={() => dismissReminder(rem.id)}
                          title={rem.is_recurring ? 'Advance to next occurrence' : 'Dismiss'}
                          className="text-[10px] px-2 py-0.5 bg-rose-50 hover:bg-rose-100 text-rose-700 rounded-md font-semibold border border-rose-200"
                        >
                          {rem.is_recurring ? 'Skip' : 'Dismiss'}
                        </button>
                      </div>
                    </div>
                  )}

                  {/* User Activity Note */}
                  {rem.note && (
                    <div className="bg-[var(--badge-bg)] p-2 rounded-xl border border-[var(--border)] text-xs text-[var(--text-secondary)] flex items-start gap-2">
                      <MessageSquare className="w-3.5 h-3.5 text-teal-600 shrink-0 mt-0.5" />
                      <div>
                        <span className="font-semibold text-[var(--text-primary)] text-[10px] uppercase block">Vendor Log / Note:</span>
                        <p className="text-[11px] leading-tight">{rem.note}</p>
                      </div>
                    </div>
                  )}

                  {/* Add Note Prompt */}
                  {activeNoteId === rem.id ? (
                    <div className="flex items-center gap-2 pt-1">
                      <input
                        type="text"
                        placeholder="e.g. Called vendor Alex, promised delivery Friday..."
                        value={noteText}
                        onChange={e => setNoteText(e.target.value)}
                        className="flex-1 text-xs p-1.5 border border-teal-300 rounded-lg outline-none"
                      />
                      <button
                        type="button"
                        onClick={() => handleSaveNote(rem.id)}
                        className="px-2.5 py-1 bg-teal-600 text-white text-xs font-semibold rounded-lg"
                      >
                        Add Note
                      </button>
                    </div>
                  ) : !rem.note && (
                    <button
                      type="button"
                      onClick={() => {
                        setActiveNoteId(rem.id);
                        setNoteText('');
                      }}
                      className="text-[11px] text-teal-600 hover:underline font-semibold flex items-center gap-1"
                    >
                      <MessageSquare className="w-3 h-3" /> + Add Note / Activity Log
                    </button>
                  )}
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
};
