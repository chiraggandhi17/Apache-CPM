import React, { useState } from 'react';
import { NodeItem } from '../../types/domain';
import { useNodes } from '../../context/NodeContext';
import { StatusBadge } from '../shared/StatusBadge';
import { CriticalFlag } from '../shared/CriticalFlag';
import { formatLocalDate } from '../../utils/date-format';
import { NodeForm } from './NodeForm';
import { useToast } from '../../context/ToastContext';
import { X, Calendar, Edit3, Trash2, Plus, Bell, User, Tag, ArrowRight } from 'lucide-react';
import { formatISO, addDays } from 'date-fns';

interface NodeDetailProps {
  node: NodeItem;
  onClose: () => void;
}

export const NodeDetail: React.FC<NodeDetailProps> = ({ node, onClose }) => {
  const { nodes, reminders, deleteNode, toggleCritical, updateStatus, addReminder, dismissReminder, hideNodeLocally, restoreNodesLocally, cleanupGoogleEventsFor } = useNodes();
  const toast = useToast();
  
  const [isEditing, setIsEditing] = useState(false);
  const [showAddSubtask, setShowAddSubtask] = useState(false);
  const [showAddReminder, setShowAddReminder] = useState(false);

  const [reminderMessage, setReminderMessage] = useState(`Follow up on: ${node.title}`);
  const [reminderOffset, setReminderOffset] = useState(0);

  const children = nodes.filter(n => n.parent_id === node.id);
  const nodeReminders = reminders.filter(r => r.node_id === node.id && !r.dismissed_at);
  const parentNode = node.parent_id ? nodes.find(n => n.id === node.parent_id) : null;

  const handleCreateReminder = (e: React.FormEvent) => {
    e.preventDefault();
    let remindAt = new Date().toISOString();
    if (node.planned_date) {
      remindAt = formatISO(addDays(new Date(node.planned_date), reminderOffset));
    }
    addReminder({
      node_id: node.id,
      remind_at: remindAt,
      offset_days: reminderOffset,
      message: reminderMessage,
    });
    setShowAddReminder(false);
  };

  return (
    <div className="fixed inset-0 bg-black/30 backdrop-blur-2xs flex justify-end z-50 animate-in fade-in duration-150">
      <div className="bg-[var(--card-bg)] w-full max-w-md h-full shadow-2xl flex flex-col border-l border-[var(--border)] animate-in slide-in-from-right duration-200">
        <div className="p-4 border-b border-[var(--border-subtle)] flex items-center justify-between bg-[var(--badge-bg)]">
          <div className="flex items-center gap-2">
            <span
              className="w-3 h-3 rounded-full shadow-2xs"
              style={{ backgroundColor: node.color || '#6B7280' }}
            />
            <span className="text-xs font-semibold text-[var(--text-muted)] uppercase tracking-wider">
              {node.type} Detail
            </span>
          </div>
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => setIsEditing(true)}
              title="Edit Milestone"
              className="p-1.5 rounded-lg text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--badge-bg)] transition-colors"
            >
              <Edit3 className="w-4 h-4" />
            </button>
            <button
              type="button"
              onClick={() => {
                const removed = hideNodeLocally(node.id);
                toast.undoable({
                  message: `"${node.title}" deleted.`,
                  onCommit: () => { cleanupGoogleEventsFor(removed); deleteNode(node.id); },
                  onUndo: () => restoreNodesLocally(removed),
                });
                onClose();
              }}
              title="Delete Milestone"
              className="p-1.5 rounded-lg text-rose-500 hover:text-rose-700 hover:bg-rose-50 transition-colors"
            >
              <Trash2 className="w-4 h-4" />
            </button>
            <button
              type="button"
              onClick={onClose}
              className="p-1.5 rounded-lg text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--badge-bg)] transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {parentNode && (
            <div className="text-xs text-[var(--text-muted)] flex items-center gap-1 font-medium bg-[var(--badge-bg)] p-2 rounded-lg border border-[var(--border-subtle)]">
              <span>{parentNode.title}</span>
              <ArrowRight className="w-3 h-3 text-[var(--text-muted)]" />
              <span className="text-[var(--text-primary)] font-semibold">{node.title}</span>
            </div>
          )}

          <div>
            <h1 className="text-xl font-bold text-[var(--text-primary)] leading-snug">{node.title}</h1>
            
            <div className="flex items-center gap-3 mt-3">
              <StatusBadge status={node.status} onChange={s => updateStatus(node.id, s)} size="md" />
              <CriticalFlag isCritical={node.is_critical} onToggle={() => toggleCritical(node.id)} interactive size="md" />
            </div>
          </div>

          <div className="bg-[var(--badge-bg)] p-4 rounded-xl border border-[var(--border)] space-y-2">
            <div className="flex items-center justify-between text-xs">
              <span className="text-[var(--text-muted)] font-medium flex items-center gap-1.5">
                <Calendar className="w-4 h-4 text-teal-600" /> Planned Target Date
              </span>
              <span className="font-bold text-[var(--text-primary)] font-mono">
                {formatLocalDate(node.planned_date, 'EEEE, MMM d, yyyy')}
              </span>
            </div>

            {node.trigger_offset_days !== null && node.trigger_offset_days !== undefined && (
              <div className="text-[11px] text-teal-800 bg-teal-50 px-2.5 py-1 rounded-md border border-teal-200 flex items-center justify-between">
                <span>Relative trigger offset:</span>
                <span className="font-mono font-bold">{node.trigger_offset_days} days from parent</span>
              </div>
            )}

            {node.actual_date && (
              <div className="flex items-center justify-between text-xs pt-1 border-t border-[var(--border)] text-emerald-800">
                <span>Actual Completed:</span>
                <span className="font-mono font-medium">{formatLocalDate(node.actual_date, 'MMM d, yyyy')}</span>
              </div>
            )}
          </div>

          <div className="grid grid-cols-2 gap-3 text-xs">
            <div className="bg-[var(--card-bg)] p-3 rounded-lg border border-[var(--border)]">
              <span className="text-[var(--text-muted)] font-medium block text-[10px] uppercase flex items-center gap-1">
                <User className="w-3 h-3 text-[var(--text-muted)]" /> Assignee
              </span>
              <span className="font-semibold text-[var(--text-primary)] block mt-0.5">{node.assignee || 'Unassigned'}</span>
            </div>
            <div className="bg-[var(--card-bg)] p-3 rounded-lg border border-[var(--border)]">
              <span className="text-[var(--text-muted)] font-medium block text-[10px] uppercase flex items-center gap-1">
                <Tag className="w-3 h-3 text-[var(--text-muted)]" /> Vendor Contact
              </span>
              <span className="font-semibold text-[var(--text-primary)] block mt-0.5">{node.vendor_contact || 'None'}</span>
            </div>
          </div>

          {node.description && (
            <div>
              <h3 className="text-xs font-semibold text-[var(--text-secondary)] uppercase tracking-wider mb-1">Notes</h3>
              <p className="text-xs text-[var(--text-secondary)] bg-[var(--badge-bg)] p-3 rounded-lg border border-[var(--border-subtle)] leading-relaxed whitespace-pre-wrap">
                {node.description}
              </p>
            </div>
          )}

          <div className="space-y-2 pt-2 border-t border-[var(--border-subtle)]">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-bold text-[var(--text-primary)] flex items-center gap-1.5">
                <Bell className="w-4 h-4 text-amber-500" /> In-App Reminders ({nodeReminders.length})
              </h3>
              <button
                type="button"
                onClick={() => setShowAddReminder(!showAddReminder)}
                className="text-xs text-teal-600 font-semibold hover:underline flex items-center gap-0.5"
              >
                <Plus className="w-3.5 h-3.5" /> Add Alert
              </button>
            </div>

            {showAddReminder && (
              <form onSubmit={handleCreateReminder} className="bg-amber-50/70 p-3 rounded-xl border border-amber-200 space-y-2 text-xs">
                <div>
                  <label className="block font-semibold text-amber-900 mb-1">Alert Message</label>
                  <input
                    type="text"
                    required
                    value={reminderMessage}
                    onChange={e => setReminderMessage(e.target.value)}
                    className="w-full text-xs p-2 border border-amber-300 rounded-md bg-[var(--card-bg)] outline-none"
                  />
                </div>
                <div>
                  <label className="block font-semibold text-amber-900 mb-1">Trigger Offset</label>
                  <div className="flex items-center gap-2">
                    <input
                      type="number"
                      value={reminderOffset}
                      onChange={e => setReminderOffset(Number(e.target.value))}
                      className="w-16 p-1 border border-amber-300 rounded-md bg-[var(--card-bg)] text-center font-mono font-bold"
                    />
                    <span className="text-amber-800 text-[11px]">days {reminderOffset < 0 ? 'before' : 'after'} target date</span>
                  </div>
                </div>
                <div className="flex justify-end gap-2 pt-1">
                  <button type="button" onClick={() => setShowAddReminder(false)} className="px-2.5 py-1 text-amber-800">Cancel</button>
                  <button type="submit" className="px-3 py-1 bg-amber-600 text-white font-semibold rounded-md shadow-2xs">Save Alert</button>
                </div>
              </form>
            )}

            {nodeReminders.length === 0 ? (
              <p className="text-xs text-[var(--text-muted)] italic">No relative alerts set for this milestone.</p>
            ) : (
              <div className="space-y-1.5">
                {nodeReminders.map(rem => (
                  <div key={rem.id} className="bg-amber-50/50 p-2.5 rounded-lg border border-amber-200/60 flex items-center justify-between text-xs">
                    <div>
                      <p className="font-medium text-amber-900">{rem.message}</p>
                      <p className="text-[10px] text-amber-700 font-mono mt-0.5">
                        Trigger: {formatLocalDate(rem.remind_at)} ({rem.offset_days}d offset)
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => dismissReminder(rem.id)}
                      className="text-amber-700 hover:text-amber-900 text-[10px] underline font-semibold"
                    >
                      Dismiss
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="space-y-2 pt-2 border-t border-[var(--border-subtle)]">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-bold text-[var(--text-primary)]">Sub-Milestones ({children.length})</h3>
              <button
                type="button"
                onClick={() => setShowAddSubtask(true)}
                className="text-xs text-teal-600 font-semibold hover:underline flex items-center gap-0.5"
              >
                <Plus className="w-3.5 h-3.5" /> Add Sub-task
              </button>
            </div>

            {children.length === 0 ? (
              <p className="text-xs text-[var(--text-muted)] italic">No child subtasks defined yet.</p>
            ) : (
              <div className="space-y-1.5">
                {children.map(child => (
                  <div
                    key={child.id}
                    className="bg-[var(--badge-bg)] hover:bg-[var(--badge-bg)] p-2.5 rounded-lg border border-[var(--border)] flex items-center justify-between transition-colors text-xs"
                  >
                    <div className="flex items-center gap-2">
                      <StatusBadge status={child.status} size="sm" />
                      <span className="font-medium text-[var(--text-primary)]">{child.title}</span>
                    </div>
                    <span className="text-[11px] font-mono text-[var(--text-muted)]">
                      {formatLocalDate(child.planned_date, 'MMM d')}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {isEditing && (
        <NodeForm
          initialNode={node}
          parentId={node.parent_id}
          onClose={() => setIsEditing(false)}
        />
      )}

      {showAddSubtask && (
        <NodeForm
          parentId={node.id}
          parentType={node.type}
          parentDate={node.planned_date}
          onClose={() => setShowAddSubtask(false)}
        />
      )}
    </div>
  );
};
