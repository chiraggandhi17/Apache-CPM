import React, { useState, useEffect, lazy, Suspense } from 'react';
import { NodeItem } from '../../types/domain';
import { useNodes, NodeAuditLog } from '../../context/NodeContext';
import { StatusBadge } from '../shared/StatusBadge';
import { CriticalFlag } from '../shared/CriticalFlag';
import { formatLocalDate } from '../../utils/date-format';
import { getAncestorPath, getSiblingNodes } from '../../utils/hierarchy';
// Lazy: keeps this modal (and its calendar-sync dependencies) out of the
// main bundle — it's only needed if the user actually opens Google Calendar
// sync from a task, matching how AppShell lazy-loads the same component.
const GoogleCalendarSyncModal = lazy(() => import('../calendar/GoogleCalendarSyncModal').then(m => ({ default: m.GoogleCalendarSyncModal })));
import { NodeForm } from './NodeForm';
import { SubtreeCompletionModal } from './SubtreeCompletionModal';
import { useToast } from '../../context/ToastContext';
import { 
  X, Calendar, Edit3, Trash2, Plus, Bell, User, Tag, ChevronRight, 
  ChevronLeft, ArrowLeft, ArrowRight, FileText, Sparkles, History, 
  Lock, RefreshCw, Clock, Building2
} from 'lucide-react';
import { formatISO, addDays, isValid } from 'date-fns';
import { RECURRENCE_OPTIONS, RecurrenceRule, recurrenceLabel } from '../../utils/recurrence';

interface NodeInspectorModalProps {
  initialNode: NodeItem;
  onClose: () => void;
}

export const NodeInspectorModal: React.FC<NodeInspectorModalProps> = ({ initialNode, onClose }) => {
  const { 
    nodes, reminders, deleteNode, toggleCritical, updateStatus, 
    addReminder, dismissReminder, getNodeAccessInfo, fetchNodeAuditLogs,
    getDescendantNodes, completeNodeAndSubtree, hideNodeLocally, restoreNodesLocally, cleanupGoogleEventsFor
  } = useNodes();
  const toast = useToast();
  
  const [currentNodeId, setCurrentNodeId] = useState<string>(initialNode.id);
  const [isEditing, setIsEditing] = useState(false);
  const [showAddSubtask, setShowAddSubtask] = useState(false);
  const [showAddReminder, setShowAddReminder] = useState(false);
  const [showCalModal, setShowCalModal] = useState(false);
  const [showLogsModal, setShowLogsModal] = useState(false);
  const [showCompletionModal, setShowCompletionModal] = useState(false);
  const [auditLogs, setAuditLogs] = useState<NodeAuditLog[]>([]);
  const [loadingLogs, setLoadingLogs] = useState(false);

  // Intuitive Reminder Form State
  const [reminderMessage, setReminderMessage] = useState('');
  const [reminderPreset, setReminderPreset] = useState<string>('-2'); // '-2' = 2 days before
  const [customReminderDays, setCustomReminderDays] = useState<number>(2);
  const [isRecurring, setIsRecurring] = useState(false);
  const [recurrenceRule, setRecurrenceRule] = useState<RecurrenceRule>('weekly');

  const currentNode = nodes.find(n => n.id === currentNodeId) || initialNode;
  const parentNode = currentNode.parent_id ? nodes.find(n => n.id === currentNode.parent_id) : null;
  const ancestorPath = getAncestorPath(currentNode.id, nodes);
  const { prevNode, nextNode } = getSiblingNodes(currentNode.id, nodes);

  const accessInfo = getNodeAccessInfo(currentNode.id);
  const isEditable = accessInfo.isEditable;
  const children = nodes.filter(n => n.parent_id === currentNode.id);
  const nodeReminders = reminders.filter(r => r.node_id === currentNode.id && !r.dismissed_at);

  const descendants = getDescendantNodes(currentNode.id);
  const pendingDescendants = descendants.filter(d => d.status !== 'done');

  const loadLogs = async (nodeId: string) => {
    setLoadingLogs(true);
    const logs = await fetchNodeAuditLogs(nodeId);
    setAuditLogs(logs);
    setLoadingLogs(false);
  };

  useEffect(() => {
    if (showLogsModal) {
      loadLogs(currentNode.id);
    }
  }, [showLogsModal, currentNode.id]);

  // Live preview of reminder date
  const calculatedReminderDate: string | null = (() => {
    const daysBefore = reminderPreset === 'custom' ? customReminderDays : Math.abs(Number(reminderPreset));
    if (currentNode.planned_date) {
      try {
        const base = new Date(currentNode.planned_date);
        if (isValid(base)) {
          return formatISO(addDays(base, -daysBefore));
        }
      } catch {
        return null;
      }
    }
    return formatISO(addDays(new Date(), -daysBefore));
  })();

  const handleCreateReminder = async (e: React.FormEvent) => {
    e.preventDefault();
    const daysBefore = reminderPreset === 'custom' ? customReminderDays : Math.abs(Number(reminderPreset));
    let remindAt = calculatedReminderDate || new Date().toISOString();

    await addReminder({
      node_id: currentNode.id,
      remind_at: remindAt,
      offset_days: -daysBefore,
      message: reminderMessage.trim() || `Follow up on: ${currentNode.title}`,
      is_recurring: isRecurring,
      recurrence_rule: isRecurring ? recurrenceRule : null,
    });

    setReminderMessage('');
    setIsRecurring(false);
    setShowAddReminder(false);
  };

  const handleStatusChange = (newStatus: any) => {
    if (newStatus === 'done' && pendingDescendants.length > 0) {
      setShowCompletionModal(true);
    } else {
      updateStatus(currentNode.id, newStatus);
    }
  };

  const handleConfirmCascadeCompletion = () => {
    completeNodeAndSubtree(currentNode.id);
    setShowCompletionModal(false);
  };

  return (
    <div className="fixed inset-0 bg-black/40 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-in fade-in duration-150">
      <div className="bg-[var(--card-bg)] rounded-3xl shadow-2xl w-full max-w-2xl overflow-hidden border border-[var(--border-subtle)] flex flex-col max-h-[90vh]">
        
        {/* Top Control Bar */}
        <div className="px-6 py-3 bg-[var(--sidebar-bg)] text-[var(--sidebar-text)] flex items-center justify-between text-xs shrink-0">
          {parentNode ? (
            <button
              type="button"
              onClick={() => setCurrentNodeId(parentNode.id)}
              className="flex items-center gap-1.5 font-semibold text-teal-400 hover:text-teal-300 transition-colors bg-[var(--sidebar-hover)] px-2.5 py-1 rounded-lg border border-[var(--sidebar-border)]"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              <span>Back to {parentNode.title}</span>
            </button>
          ) : (
            <span className="text-[var(--sidebar-text-muted)] font-mono">Top-Level Root</span>
          )}

          <div className="flex items-center gap-2">
            {prevNode && (
              <button
                type="button"
                onClick={() => setCurrentNodeId(prevNode.id)}
                title={`Previous: ${prevNode.title}`}
                className="flex items-center gap-1 px-2 py-1 bg-[var(--sidebar-hover)] hover:bg-[var(--sidebar-active)]/20 rounded-lg text-[var(--sidebar-text)] border border-[var(--sidebar-border)]"
              >
                <ChevronLeft className="w-3.5 h-3.5" /> Prev
              </button>
            )}

            {nextNode && (
              <button
                type="button"
                onClick={() => setCurrentNodeId(nextNode.id)}
                title={`Next: ${nextNode.title}`}
                className="flex items-center gap-1 px-2 py-1 bg-[var(--sidebar-hover)] hover:bg-[var(--sidebar-active)]/20 rounded-lg text-[var(--sidebar-text)] border border-[var(--sidebar-border)]"
              >
                Next <ChevronRight className="w-3.5 h-3.5" />
              </button>
            )}

            <button
              type="button"
              onClick={onClose}
              className="p-1 rounded-lg text-[var(--sidebar-text-muted)] hover:text-white hover:bg-[var(--sidebar-hover)] transition-colors ml-2"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Interactive Clickable Breadcrumb Bar */}
        <div className="px-6 py-2.5 bg-[var(--badge-bg)] border-b border-[var(--border-subtle)] flex items-center flex-wrap gap-1 text-xs text-[var(--text-muted)] font-medium shrink-0">
          <span className="text-[10px] uppercase font-bold text-[var(--text-muted)] mr-1">Hierarchy:</span>
          {ancestorPath.map((step, idx) => (
            <React.Fragment key={step.id}>
              <button
                type="button"
                onClick={() => setCurrentNodeId(step.id)}
                className={`hover:underline flex items-center gap-1 ${
                  step.id === currentNode.id ? 'font-bold text-teal-700 bg-teal-50 px-2 py-0.5 rounded-md border border-teal-200' : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
                }`}
              >
                <span>{step.title}</span>
              </button>
              {idx < ancestorPath.length - 1 && (
                <ChevronRight className="w-3.5 h-3.5 text-[var(--text-muted)] shrink-0" />
              )}
            </React.Fragment>
          ))}
        </div>

        {/* Content Body */}
        <div className="flex-1 overflow-y-auto p-6 space-y-5">
          
          {/* Main Title & Action Bar */}
          <div className="flex items-start justify-between gap-4">
            <div>
              <div className="flex items-center flex-wrap gap-2 mb-1">
                <span
                  className="w-3 h-3 rounded-full shadow-2xs shrink-0"
                  style={{ backgroundColor: currentNode.color || '#6B7280' }}
                />
                <span className="text-xs uppercase font-bold text-[var(--text-muted)] tracking-wider">
                  {currentNode.type}
                </span>

                {/* Clean Department Chip */}
                {currentNode.department && (
                  <span className="px-2 py-0.5 rounded-md bg-[var(--badge-bg)] text-[var(--text-secondary)] text-[10px] font-semibold flex items-center gap-1 border border-[var(--border)]">
                    <Building2 className="w-3 h-3 text-[var(--text-muted)]" /> {currentNode.department}
                  </span>
                )}

                {!isEditable && (
                  <span 
                    title={accessInfo.tooltipText}
                    className="px-2 py-0.5 rounded-md bg-amber-50 text-amber-800 text-[10px] font-bold flex items-center gap-1 border border-amber-200 cursor-help"
                  >
                    <Lock className="w-3 h-3 text-amber-600" /> View-Only
                  </span>
                )}
              </div>
              <h1 className="text-xl font-extrabold text-[var(--text-primary)] leading-snug">{currentNode.title}</h1>
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setShowLogsModal(true)}
                title="View Node Activity Audit Logs"
                className="px-2.5 py-1.5 rounded-xl border border-[var(--border)] text-[var(--text-secondary)] bg-[var(--badge-bg)] hover:bg-[var(--border)] transition-colors text-xs font-semibold flex items-center gap-1 shadow-2xs"
              >
                <History className="w-3.5 h-3.5 text-[var(--text-muted)]" /> Logs
              </button>

              <button
                type="button"
                onClick={() => setShowCalModal(true)}
                title="Sync to Google Calendar"
                className="px-2.5 py-1.5 rounded-xl border border-teal-200 text-teal-700 bg-teal-50 hover:bg-teal-100 transition-colors text-xs font-semibold flex items-center gap-1 shadow-2xs"
              >
                <Sparkles className="w-3.5 h-3.5 text-teal-600" /> Google Cal
              </button>

              {isEditable && (
                <>
                  <button
                    type="button"
                    onClick={() => setIsEditing(true)}
                    title="Edit Milestone"
                    className="px-3 py-1.5 rounded-xl border border-[var(--border)] text-[var(--text-secondary)] bg-[var(--card-bg)] hover:bg-[var(--badge-bg)] transition-colors text-xs font-bold flex items-center gap-1 shadow-2xs"
                  >
                    <Edit3 className="w-3.5 h-3.5 text-[var(--text-secondary)]" /> Edit
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      const removed = hideNodeLocally(currentNode.id);
                      toast.undoable({
                        message: `"${currentNode.title}" deleted.`,
                        onCommit: () => { cleanupGoogleEventsFor(removed); deleteNode(currentNode.id); },
                        onUndo: () => restoreNodesLocally(removed),
                      });
                      onClose();
                    }}
                    title="Delete Milestone"
                    className="px-3 py-1.5 rounded-xl border border-rose-200 text-rose-600 bg-rose-50 hover:bg-rose-100 transition-colors text-xs font-bold flex items-center gap-1 shadow-2xs"
                  >
                    <Trash2 className="w-3.5 h-3.5" /> Delete
                  </button>
                </>
              )}
            </div>
          </div>

          <div className="flex items-center gap-3">
            <StatusBadge 
              status={currentNode.status} 
              onChange={isEditable ? handleStatusChange : undefined} 
              size="md" 
            />
            <CriticalFlag 
              isCritical={currentNode.is_critical} 
              onToggle={isEditable ? () => toggleCritical(currentNode.id) : undefined} 
              interactive={isEditable} 
              size="md" 
            />
          </div>

          {/* Target Dates Card */}
          <div className="bg-[var(--badge-bg)] p-4 rounded-2xl border border-[var(--border)] space-y-2">
            <div className="flex items-center justify-between text-xs">
              <span className="text-[var(--text-muted)] font-semibold flex items-center gap-1.5">
                <Calendar className="w-4 h-4 text-teal-600" /> Planned Target Date
              </span>
              <span className="font-bold text-[var(--text-primary)] font-mono">
                {formatLocalDate(currentNode.planned_date, 'EEEE, MMM d, yyyy')}
              </span>
            </div>

            {currentNode.trigger_offset_days !== null && currentNode.trigger_offset_days !== undefined && (
              <div className="text-xs text-teal-900 bg-teal-50 px-3 py-1.5 rounded-xl border border-teal-200 flex items-center justify-between">
                <span>Relative trigger offset:</span>
                <span className="font-mono font-bold">
                  {currentNode.trigger_offset_days < 0 
                    ? `${Math.abs(currentNode.trigger_offset_days)} days before parent (${parentNode?.title || 'Parent'})`
                    : currentNode.trigger_offset_days > 0
                    ? `${currentNode.trigger_offset_days} days after parent (${parentNode?.title || 'Parent'})`
                    : `Same day as parent (${parentNode?.title || 'Parent'})`}
                </span>
              </div>
            )}
          </div>

          {/* Ownership & Vendor Details */}
          <div className="grid grid-cols-2 gap-3 text-xs">
            <div className="bg-[var(--card-bg)] p-3 rounded-xl border border-[var(--border)]">
              <span className="text-[var(--text-muted)] font-semibold block text-[10px] uppercase flex items-center gap-1">
                <User className="w-3 h-3 text-[var(--text-muted)]" /> Assignee
              </span>
              <span className="font-bold text-[var(--text-primary)] block mt-0.5">{currentNode.assignee || 'Unassigned'}</span>
            </div>
            <div className="bg-[var(--card-bg)] p-3 rounded-xl border border-[var(--border)]">
              <span className="text-[var(--text-muted)] font-semibold block text-[10px] uppercase flex items-center gap-1">
                <Tag className="w-3 h-3 text-[var(--text-muted)]" /> Vendor Contact
              </span>
              <span className="font-bold text-[var(--text-primary)] block mt-0.5">{currentNode.vendor_contact || 'None'}</span>
            </div>
          </div>

          {/* Description & Follow-up Notes */}
          {currentNode.description && (
            <div className="bg-[var(--badge-bg)] p-3.5 rounded-2xl border border-[var(--border)] space-y-1">
              <h3 className="text-xs font-bold text-[var(--text-secondary)] flex items-center gap-1">
                <FileText className="w-3.5 h-3.5 text-[var(--text-muted)]" /> Notes & Follow-up Log
              </h3>
              <p className="text-xs text-[var(--text-secondary)] leading-relaxed whitespace-pre-wrap">
                {currentNode.description}
              </p>
            </div>
          )}

          {/* Reminders Section with Intuitive Form */}
          <div className="space-y-2 pt-2 border-t border-[var(--border-subtle)]">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-bold text-[var(--text-primary)] flex items-center gap-1.5">
                <Bell className="w-4 h-4 text-amber-500" /> Active Alerts & Reminders ({nodeReminders.length})
              </h3>
              {isEditable && (
                <button
                  type="button"
                  onClick={() => setShowAddReminder(!showAddReminder)}
                  className="px-2.5 py-1 bg-amber-50 text-amber-800 border border-amber-200 rounded-lg text-xs font-bold hover:bg-amber-100 flex items-center gap-0.5"
                >
                  <Plus className="w-3.5 h-3.5" /> Add Alert
                </button>
              )}
            </div>

            {showAddReminder && isEditable && (
              <form onSubmit={handleCreateReminder} className="bg-amber-50/80 p-3.5 rounded-2xl border border-amber-200 space-y-3 text-xs animate-in fade-in">
                <div>
                  <label className="block font-bold text-amber-950 mb-1">Alert Message</label>
                  <input
                    type="text"
                    required
                    value={reminderMessage}
                    onChange={e => setReminderMessage(e.target.value)}
                    placeholder="e.g. Follow up on dispatch"
                    className="w-full text-xs p-2 border border-amber-300 rounded-xl bg-[var(--card-bg)] outline-none focus:border-teal-500 font-medium"
                  />
                </div>

                <div>
                  <label className="block font-bold text-amber-950 mb-1.5">When should alert trigger?</label>
                  
                  {/* Preset Buttons Grid */}
                  <div className="grid grid-cols-3 sm:grid-cols-6 gap-1.5 mb-2">
                    {[
                      { label: 'Due Day', val: '0' },
                      { label: '1d Prior', val: '-1' },
                      { label: '2d Prior', val: '-2' },
                      { label: '3d Prior', val: '-3' },
                      { label: '7d Prior', val: '-7' },
                      { label: 'Custom', val: 'custom' },
                    ].map(p => (
                      <button
                        key={p.val}
                        type="button"
                        onClick={() => setReminderPreset(p.val)}
                        className={`py-1.5 px-1 rounded-xl text-[10px] font-bold border transition-colors text-center truncate ${
                          reminderPreset === p.val
                            ? 'bg-amber-600 text-white border-amber-600 shadow-2xs'
                            : 'bg-[var(--card-bg)] text-[var(--text-secondary)] border-amber-200 hover:bg-amber-100'
                        }`}
                      >
                        {p.label}
                      </button>
                    ))}
                  </div>

                  {reminderPreset === 'custom' && (
                    <div className="flex items-center gap-2 mb-2">
                      <input
                        type="number"
                        min="1"
                        max="60"
                        value={customReminderDays}
                        onChange={e => setCustomReminderDays(Math.max(1, Number(e.target.value) || 1))}
                        className="w-16 h-7 text-center font-mono font-bold bg-[var(--card-bg)] border border-amber-300 rounded-lg text-xs"
                      />
                      <span className="text-[11px] text-amber-900 font-medium">days before milestone date</span>
                    </div>
                  )}

                  {/* Live calculated date */}
                  {calculatedReminderDate && (
                    <div className="p-2 bg-[var(--card-bg)]/90 rounded-lg border border-amber-200 text-amber-950 text-[11px] font-bold flex items-center justify-between">
                      <span>🔔 Trigger Date:</span>
                      <span className="font-mono text-amber-900">{formatLocalDate(calculatedReminderDate, 'EEE, MMM d, yyyy')}</span>
                    </div>
                  )}
                </div>

                <div>
                  <label className="flex items-center gap-2 cursor-pointer select-none">
                    <button
                      type="button"
                      onClick={() => setIsRecurring(!isRecurring)}
                      className={`w-9 h-5 rounded-full transition-colors flex items-center px-0.5 shrink-0 ${
                        isRecurring ? 'bg-amber-600 justify-end' : 'bg-amber-200 justify-start'
                      }`}
                    >
                      <span className="w-4 h-4 rounded-full bg-white shadow-sm block" />
                    </button>
                    <span className="font-bold text-amber-950">Repeat this alert</span>
                  </label>

                  {isRecurring && (
                    <div className="flex items-center gap-1.5 mt-2">
                      {RECURRENCE_OPTIONS.map(opt => (
                        <button
                          key={opt.value}
                          type="button"
                          onClick={() => setRecurrenceRule(opt.value)}
                          className={`px-2.5 py-1 rounded-lg text-[10px] font-bold border transition-colors ${
                            recurrenceRule === opt.value
                              ? 'bg-amber-600 text-white border-amber-600 shadow-2xs'
                              : 'bg-[var(--card-bg)] text-[var(--text-secondary)] border-amber-200 hover:bg-amber-100'
                          }`}
                        >
                          {opt.label}
                        </button>
                      ))}
                    </div>
                  )}
                </div>

                <div className="flex justify-end gap-2 pt-1 border-t border-amber-200/60">
                  <button type="button" onClick={() => setShowAddReminder(false)} className="px-2.5 py-1 text-amber-800 font-semibold hover:underline">Cancel</button>
                  <button type="submit" className="px-3.5 py-1.5 bg-amber-600 hover:bg-amber-700 text-white font-bold rounded-xl shadow-xs">Save Alert</button>
                </div>
              </form>
            )}

            {nodeReminders.length === 0 ? (
              <p className="text-xs text-[var(--text-muted)] italic">No alerts attached to this milestone.</p>
            ) : (
              <div className="space-y-1.5">
                {nodeReminders.map(rem => (
                  <div key={rem.id} className="bg-amber-50/60 p-3 rounded-xl border border-amber-200 flex items-center justify-between text-xs">
                    <div>
                      <p className="font-semibold text-amber-950 flex items-center gap-1.5">
                        {rem.message}
                        {rem.is_recurring && recurrenceLabel(rem.recurrence_rule) && (
                          <span className="px-1.5 py-0.5 rounded-md bg-amber-200/70 text-amber-900 text-[9px] font-bold flex items-center gap-0.5">
                            <RefreshCw className="w-2.5 h-2.5" /> {recurrenceLabel(rem.recurrence_rule)}
                          </span>
                        )}
                      </p>
                      <p className="text-[11px] text-amber-800 font-mono mt-0.5">
                        Trigger: {formatLocalDate(rem.remind_at)}
                      </p>
                    </div>
                    {isEditable && (
                      <button
                        type="button"
                        onClick={() => dismissReminder(rem.id)}
                        className="text-amber-800 hover:text-amber-950 text-[11px] font-semibold underline"
                      >
                        {rem.is_recurring ? 'Skip' : 'Dismiss'}
                      </button>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Children List with Direct Add Subtask Action */}
          <div className="space-y-2 pt-2 border-t border-[var(--border-subtle)]">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-bold text-[var(--text-primary)]">Sub-Milestones ({children.length})</h3>
              {isEditable && (
                <button
                  type="button"
                  onClick={() => setShowAddSubtask(true)}
                  className="px-3 py-1.5 bg-teal-600 hover:bg-teal-700 text-white rounded-xl text-xs font-bold shadow-2xs flex items-center gap-1"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>Add Sub-task</span>
                </button>
              )}
            </div>

            {children.length === 0 ? (
              <div className="p-4 bg-[var(--badge-bg)] rounded-2xl border border-dashed text-center space-y-2">
                <p className="text-xs text-[var(--text-muted)] italic">No sub-tasks created under this milestone yet.</p>
                {isEditable && (
                  <button
                    type="button"
                    onClick={() => setShowAddSubtask(true)}
                    className="px-3 py-1.5 bg-teal-600 hover:bg-teal-700 text-white rounded-xl text-xs font-bold shadow-2xs inline-flex items-center gap-1"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>Create First Sub-task</span>
                  </button>
                )}
              </div>
            ) : (
              <div className="space-y-2">
                {children.map(child => (
                  <div
                    key={child.id}
                    onClick={() => setCurrentNodeId(child.id)}
                    className="group bg-[var(--card-bg)] hover:bg-teal-50/50 p-3 rounded-2xl border border-[var(--border)] hover:border-teal-300 flex items-center justify-between transition-colors text-xs cursor-pointer shadow-2xs"
                  >
                    <div className="flex items-center gap-2.5">
                      <StatusBadge status={child.status} size="sm" />
                      <span className={`font-bold ${child.status === 'done' ? 'line-through text-[var(--text-muted)]' : 'text-[var(--text-primary)] group-hover:text-teal-800'}`}>
                        {child.title}
                      </span>
                    </div>

                    <div className="flex items-center gap-3">
                      <span className="text-[11px] font-mono text-[var(--text-muted)]">
                        {formatLocalDate(child.planned_date, 'MMM d')}
                      </span>
                      <span className="text-[11px] font-semibold text-teal-700 group-hover:underline flex items-center gap-0.5">
                        Drill Down <ArrowRight className="w-3 h-3" />
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* SUBTREE COMPLETION CONFIRMATION MODAL */}
      {showCompletionModal && (
        <SubtreeCompletionModal
          parentTitle={currentNode.title}
          descendantNodes={descendants}
          onConfirm={handleConfirmCascadeCompletion}
          onCancel={() => setShowCompletionModal(false)}
        />
      )}

      {/* EDIT MODAL */}
      {isEditing && (
        <NodeForm
          initialNode={currentNode}
          parentId={currentNode.parent_id}
          parentDate={parentNode?.planned_date}
          onClose={() => setIsEditing(false)}
        />
      )}

      {/* ADD SUBTASK MODAL */}
      {showAddSubtask && (
        <NodeForm
          parentId={currentNode.id}
          parentType={currentNode.type}
          parentDate={currentNode.planned_date}
          onClose={() => setShowAddSubtask(false)}
        />
      )}

      {/* GOOGLE CALENDAR MODAL */}
      {showCalModal && (
        <Suspense fallback={null}>
          <GoogleCalendarSyncModal
            eventPayload={{
              title: currentNode.title,
              description: currentNode.description,
              startDate: currentNode.planned_date || new Date().toISOString(),
              department: currentNode.department,
              isCritical: currentNode.is_critical,
            }}
            onClose={() => setShowCalModal(false)}
          />
        </Suspense>
      )}

      {/* ACTIVITY AUDIT LOGS MODAL */}
      {showLogsModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-in fade-in">
          <div className="bg-[var(--card-bg)] rounded-3xl shadow-2xl max-w-lg w-full p-6 space-y-4 max-h-[85vh] flex flex-col border border-[var(--border)]">
            <div className="flex items-center justify-between border-b border-[var(--border-subtle)] pb-3">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-xl bg-[var(--sidebar-bg)] text-teal-400 flex items-center justify-center">
                  <History className="w-4 h-4" />
                </div>
                <div>
                  <h2 className="text-sm font-bold text-[var(--text-primary)]">Activity Audit History</h2>
                  <p className="text-[11px] text-[var(--text-muted)] font-medium truncate max-w-xs">{currentNode.title}</p>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => loadLogs(currentNode.id)}
                  className="p-1.5 text-[var(--text-muted)] hover:text-[var(--text-primary)] rounded-lg hover:bg-[var(--badge-bg)] transition-colors"
                  title="Refresh Audit Logs"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${loadingLogs ? 'animate-spin' : ''}`} />
                </button>
                <button onClick={() => setShowLogsModal(false)} className="text-[var(--text-muted)] hover:text-[var(--text-primary)]">✕</button>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto space-y-2.5 text-xs pr-1">
              {loadingLogs ? (
                <div className="p-8 text-center text-[var(--text-muted)] animate-pulse">Loading activity logs...</div>
              ) : auditLogs.length === 0 ? (
                <div className="p-8 text-center text-[var(--text-muted)] italic bg-[var(--badge-bg)] rounded-2xl border border-dashed">
                  No activity history recorded for this milestone yet. All future changes will be logged here automatically.
                </div>
              ) : (
                auditLogs.map(log => (
                  <div key={log.id} className="p-3 bg-[var(--badge-bg)] rounded-2xl border border-[var(--border)] space-y-1 hover:bg-[var(--border-subtle)] transition-colors">
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-[var(--text-primary)] flex items-center gap-1.5">
                        <span className="w-2 h-2 rounded-full bg-teal-500" />
                        {log.user_name || log.user_email.split('@')[0]}
                      </span>
                      <span className="text-[10px] text-[var(--text-muted)] font-mono flex items-center gap-1">
                        <Clock className="w-3 h-3" />
                        {new Date(log.created_at).toLocaleString()}
                      </span>
                    </div>

                    <p className="text-[var(--text-secondary)] text-[11px] font-medium pl-3.5">{log.change_summary}</p>
                    <div className="text-[10px] text-[var(--text-muted)] pl-3.5 font-mono">{log.user_email}</div>
                  </div>
                ))
              )}
            </div>

            <div className="flex justify-end pt-2 border-t border-[var(--border-subtle)]">
              <button
                type="button"
                onClick={() => setShowLogsModal(false)}
                className="h-8 px-4 bg-[var(--sidebar-bg)] hover:bg-[var(--sidebar-hover)] text-white font-bold text-xs rounded-xl shadow-2xs"
              >
                Close Logs
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
