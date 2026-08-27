import React, { useState } from 'react';
import { useNodes } from '../../context/NodeContext';
import { X, Clock, MessageSquare, Calendar } from 'lucide-react';

interface SnoozeNoteModalProps {
  reminderId: string;
  reminderMessage: string;
  onClose: () => void;
}

export const SnoozeNoteModal: React.FC<SnoozeNoteModalProps> = ({
  reminderId,
  reminderMessage,
  onClose,
}) => {
  const { snoozeReminder, addReminderNote } = useNodes();
  const [noteText, setNoteText] = useState('');
  const [customDate, setCustomDate] = useState('');
  const [activeTab, setActiveTab] = useState<'snooze' | 'note'>('snooze');

  const handleSnoozeOption = (option: '1h' | '1d' | '3d') => {
    snoozeReminder(reminderId, option);
    onClose();
  };

  const handleCustomSnooze = (e: React.FormEvent) => {
    e.preventDefault();
    if (customDate) {
      snoozeReminder(reminderId, customDate);
      onClose();
    }
  };

  const handleAddNote = (e: React.FormEvent) => {
    e.preventDefault();
    if (noteText.trim()) {
      addReminderNote(reminderId, noteText);
      onClose();
    }
  };

  return (
    <div className="fixed inset-0 bg-black/40 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-in fade-in duration-150">
      <div className="bg-[var(--card-bg)] rounded-3xl shadow-2xl w-full max-w-md overflow-hidden border border-[var(--border-subtle)] p-6 space-y-4">
        
        <div className="flex items-center justify-between border-b border-[var(--border-subtle)] pb-3">
          <div>
            <h3 className="text-sm font-bold text-[var(--text-primary)]">Alert Quick Actions</h3>
            <p className="text-xs text-[var(--text-muted)] truncate max-w-xs mt-0.5">{reminderMessage}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1 rounded-lg text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--badge-bg)]"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Tab switch */}
        <div className="flex items-center bg-[var(--badge-bg)] p-1 rounded-xl text-xs font-semibold">
          <button
            type="button"
            onClick={() => setActiveTab('snooze')}
            className={`flex-1 py-1.5 rounded-lg transition-colors flex items-center justify-center gap-1.5 ${
              activeTab === 'snooze' ? 'bg-[var(--card-bg)] text-[var(--text-primary)] shadow-2xs' : 'text-[var(--text-muted)] hover:text-[var(--text-primary)]'
            }`}
          >
            <Clock className="w-3.5 h-3.5" /> Remind Again / Snooze
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('note')}
            className={`flex-1 py-1.5 rounded-lg transition-colors flex items-center justify-center gap-1.5 ${
              activeTab === 'note' ? 'bg-[var(--card-bg)] text-[var(--text-primary)] shadow-2xs' : 'text-[var(--text-muted)] hover:text-[var(--text-primary)]'
            }`}
          >
            <MessageSquare className="w-3.5 h-3.5" /> Add Follow-up Note
          </button>
        </div>

        {activeTab === 'snooze' ? (
          <div className="space-y-3 pt-1">
            <span className="text-xs font-semibold text-[var(--text-secondary)] block">Snooze Presets</span>
            <div className="grid grid-cols-3 gap-2">
              <button
                type="button"
                onClick={() => handleSnoozeOption('1h')}
                className="p-2.5 bg-[var(--badge-bg)] hover:bg-amber-50 hover:border-amber-300 border border-[var(--border)] rounded-xl text-center font-semibold text-xs text-[var(--text-primary)] hover:text-amber-900 transition-colors shadow-2xs"
              >
                ⏱️ 1 Hour
              </button>
              <button
                type="button"
                onClick={() => handleSnoozeOption('1d')}
                className="p-2.5 bg-[var(--badge-bg)] hover:bg-amber-50 hover:border-amber-300 border border-[var(--border)] rounded-xl text-center font-semibold text-xs text-[var(--text-primary)] hover:text-amber-900 transition-colors shadow-2xs"
              >
                📅 Tomorrow
              </button>
              <button
                type="button"
                onClick={() => handleSnoozeOption('3d')}
                className="p-2.5 bg-[var(--badge-bg)] hover:bg-amber-50 hover:border-amber-300 border border-[var(--border)] rounded-xl text-center font-semibold text-xs text-[var(--text-primary)] hover:text-amber-900 transition-colors shadow-2xs"
              >
                🗓️ 3 Days
              </button>
            </div>

            <form onSubmit={handleCustomSnooze} className="pt-2 space-y-2 border-t border-[var(--border-subtle)]">
              <label className="text-xs font-semibold text-[var(--text-secondary)] block flex items-center gap-1">
                <Calendar className="w-3.5 h-3.5 text-[var(--text-muted)]" /> Or Pick Custom Timestamp
              </label>
              <div className="flex items-center gap-2">
                <input
                  type="datetime-local"
                  required
                  value={customDate}
                  onChange={e => setCustomDate(e.target.value)}
                  className="flex-1 text-xs p-2 border border-[var(--border)] rounded-xl outline-none focus:border-teal-500 font-mono"
                />
                <button
                  type="submit"
                  className="px-4 py-2 bg-amber-600 hover:bg-amber-700 text-white text-xs font-semibold rounded-xl shadow-xs"
                >
                  Snooze
                </button>
              </div>
            </form>
          </div>
        ) : (
          <form onSubmit={handleAddNote} className="space-y-3 pt-1">
            <div>
              <label className="text-xs font-semibold text-[var(--text-secondary)] block mb-1">
                Record Vendor Contact / Activity Log
              </label>
              <textarea
                rows={3}
                required
                value={noteText}
                onChange={e => setNoteText(e.target.value)}
                placeholder="e.g. Spoke with Supplier X representative. Batch confirmed for Friday delivery..."
                className="w-full text-xs p-3 border border-[var(--border)] rounded-xl outline-none focus:border-teal-500"
              />
            </div>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={onClose}
                className="px-3 py-1.5 text-xs text-[var(--text-secondary)] font-medium"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="px-4 py-2 bg-teal-600 hover:bg-teal-700 text-white text-xs font-semibold rounded-xl shadow-xs"
              >
                Save Note
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
};
