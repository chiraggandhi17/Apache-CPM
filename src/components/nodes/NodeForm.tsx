import React, { useState } from 'react';
import { NodeItem, NodeType, NodeStatus } from '../../types/domain';
import { useNodes } from '../../context/NodeContext';
import { ColorPicker } from '../shared/ColorPicker';
import { CriticalFlag } from '../shared/CriticalFlag';
import { getUnusedProjectColor } from '../../lib/color-resolver';
import { getAncestorPath } from '../../utils/hierarchy';
import { X, Calendar, User, Tag, FileText, Bell, Layers, Check, ChevronRight } from 'lucide-react';

interface NodeFormProps {
  parentId?: string | null;
  parentType?: NodeType;
  parentDate?: string | null;
  initialNode?: NodeItem | null;
  onClose: () => void;
}

export const NodeForm: React.FC<NodeFormProps> = ({
  parentId = null,
  parentType,
  initialNode = null,
  onClose,
}) => {
  const { addNode, updateNode, nodes, addReminder } = useNodes();
  const isEditing = Boolean(initialNode);

  const getSuggestedType = (): NodeType => {
    if (initialNode) return initialNode.type;
    if (!parentType) return 'project';
    if (parentType === 'department') return 'season';
    if (parentType === 'season') return 'project';
    if (parentType === 'project') return 'task';
    return 'subtask';
  };

  const parentNode = parentId ? nodes.find(n => n.id === parentId) : null;
  const ancestorPath = getAncestorPath(parentId, nodes);

  const isRootOrProject = !parentId || getSuggestedType() === 'project' || getSuggestedType() === 'department';

  const defaultAutoColor = isEditing
    ? initialNode?.color || null
    : isRootOrProject
    ? getUnusedProjectColor(nodes)
    : null;

  const [title, setTitle] = useState(initialNode?.title || '');
  const [type, setType] = useState<NodeType>(getSuggestedType());
  const [plannedDate, setPlannedDate] = useState(
    initialNode?.planned_date ? initialNode.planned_date.substring(0, 10) : ''
  );
  const [color, setColor] = useState<string | null>(defaultAutoColor);
  const [dateMode, setDateMode] = useState<'absolute' | 'relative'>(
    initialNode?.trigger_offset_days !== null && initialNode?.trigger_offset_days !== undefined ? 'relative' : 'absolute'
  );
  const [offsetDays, setOffsetDays] = useState<number>(initialNode?.trigger_offset_days || -7);
  const [isCritical, setIsCritical] = useState<boolean>(initialNode?.is_critical || false);
  const [status, setStatus] = useState<NodeStatus>(initialNode?.status || 'not_started');
  const [assignee, setAssignee] = useState(initialNode?.assignee || '');
  const [vendorContact, setVendorContact] = useState(initialNode?.vendor_contact || '');
  const [description, setDescription] = useState(initialNode?.description || '');

  // Reminder on-creation state
  const [attachReminder, setAttachReminder] = useState(false);
  const [reminderMode, setReminderMode] = useState<'relative' | 'fixed'>('relative');
  const [reminderOffset, setReminderOffset] = useState(-2);
  const [reminderFixedDate, setReminderFixedDate] = useState('');
  const [reminderMessage, setReminderMessage] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;

    let finalPlannedDate: string | null = null;
    let finalOffset: number | null = null;

    if (dateMode === 'relative' && parentId) {
      finalOffset = Number(offsetDays);
    } else if (plannedDate) {
      finalPlannedDate = new Date(plannedDate).toISOString();
    }

    if (isEditing && initialNode) {
      updateNode(initialNode.id, {
        title,
        type,
        color,
        planned_date: finalPlannedDate,
        trigger_offset_days: finalOffset,
        is_critical: isCritical,
        status,
        assignee: assignee || null,
        vendor_contact: vendorContact || null,
        description: description || null,
      });
    } else {
      const newId = crypto.randomUUID();
      addNode({
        id: newId,
        parent_id: parentId,
        type,
        title,
        color,
        planned_date: finalPlannedDate,
        trigger_offset_days: finalOffset,
        is_critical: isCritical,
        status,
        assignee: assignee || null,
        vendor_contact: vendorContact || null,
        description: description || null,
      });

      if (attachReminder) {
        let remindAtStr = new Date().toISOString();
        if (reminderMode === 'fixed' && reminderFixedDate) {
          remindAtStr = new Date(reminderFixedDate).toISOString();
        } else if (finalPlannedDate) {
          const target = new Date(finalPlannedDate);
          target.setDate(target.getDate() + Number(reminderOffset));
          remindAtStr = target.toISOString();
        }

        addReminder({
          node_id: newId,
          remind_at: remindAtStr,
          offset_mode: reminderMode,
          offset_days: reminderMode === 'relative' ? reminderOffset : null,
          message: reminderMessage || `Follow up on ${title}`,
        });
      }
    }

    onClose();
  };

  return (
    <div className="fixed inset-0 bg-black/40 backdrop-blur-xs flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-3xl shadow-2xl w-full max-w-lg overflow-hidden border border-gray-100 animate-in fade-in zoom-in-95 duration-150">
        
        {/* Modal Header */}
        <div className="px-6 py-3.5 border-b border-gray-100 flex items-center justify-between bg-gray-50/60">
          <div className="flex items-center gap-2">
            <Layers className="w-4 h-4 text-teal-600 shrink-0" />
            <div>
              <h2 className="text-sm font-bold text-gray-900 leading-tight">
                {isEditing ? 'Edit Milestone' : `Add ${type.charAt(0).toUpperCase() + type.slice(1)}`}
              </h2>
              
              {/* FULL ANCESTOR HIERARCHY BREADCRUMB PATH */}
              {ancestorPath.length > 0 ? (
                <div className="flex items-center flex-wrap gap-1 text-[11px] text-gray-500 leading-tight mt-0.5 font-medium">
                  <span>Hierarchy:</span>
                  {ancestorPath.map((step, idx) => (
                    <React.Fragment key={step.id}>
                      <span className={idx === ancestorPath.length - 1 ? 'font-bold text-gray-900' : 'text-gray-600'}>
                        {step.title}
                      </span>
                      {idx < ancestorPath.length - 1 && (
                        <ChevronRight className="w-3 h-3 text-gray-400 shrink-0 inline" />
                      )}
                    </React.Fragment>
                  ))}
                  <ChevronRight className="w-3 h-3 text-teal-600 shrink-0 inline" />
                  <span className="text-teal-700 font-bold">[{type}]</span>
                </div>
              ) : (
                <p className="text-[11px] text-gray-500 leading-tight">Creating top-level milestone</p>
              )}
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-200/60 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-3.5 max-h-[82vh] overflow-y-auto">
          
          {/* BOX 1: Primary Details */}
          <div className="bg-white p-3.5 rounded-2xl border border-gray-200 shadow-2xs space-y-3">
            <div>
              <label className="block text-xs font-semibold text-gray-900 mb-1">Title *</label>
              <input
                type="text"
                required
                autoFocus
                value={title}
                onChange={e => setTitle(e.target.value)}
                placeholder="e.g. Material A in-house delivery"
                className="w-full text-xs px-3 py-2 border border-gray-300 rounded-xl shadow-2xs focus:ring-2 focus:ring-teal-500 outline-none"
              />
            </div>

            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="text-xs font-semibold text-gray-900 flex items-center gap-1.5">
                  <Calendar className="w-3.5 h-3.5 text-teal-600" /> Target Date
                </label>

                {parentId && (
                  <div className="flex items-center text-[11px] bg-gray-100 p-0.5 rounded-lg border border-gray-200">
                    <button
                      type="button"
                      onClick={() => setDateMode('absolute')}
                      className={`px-2 py-0.5 rounded-md font-medium transition-colors ${
                        dateMode === 'absolute' ? 'bg-white text-gray-900 shadow-2xs' : 'text-gray-500 hover:text-gray-700'
                      }`}
                    >
                      Fixed Date
                    </button>
                    <button
                      type="button"
                      onClick={() => setDateMode('relative')}
                      className={`px-2 py-0.5 rounded-md font-medium transition-colors ${
                        dateMode === 'relative' ? 'bg-white text-teal-700 font-semibold shadow-2xs' : 'text-gray-500 hover:text-gray-700'
                      }`}
                    >
                      Relative Offset
                    </button>
                  </div>
                )}
              </div>

              {dateMode === 'absolute' || !parentId ? (
                <input
                  type="date"
                  value={plannedDate}
                  onChange={e => setPlannedDate(e.target.value)}
                  className="w-full text-xs px-3 py-1.5 border border-gray-300 rounded-xl outline-none focus:ring-2 focus:ring-teal-500"
                />
              ) : (
                <div className="bg-teal-50/60 p-2.5 rounded-xl border border-teal-200/80 space-y-1.5">
                  <div className="flex items-center gap-2">
                    <input
                      type="number"
                      value={offsetDays}
                      onChange={e => setOffsetDays(Number(e.target.value))}
                      className="w-16 text-xs px-2 py-1 border border-teal-300 rounded-md font-mono text-center font-bold text-teal-900 bg-white"
                    />
                    <span className="text-[11px] text-teal-900 font-medium">
                      days {offsetDays < 0 ? 'before' : 'after'} parent ({parentNode?.title})
                    </span>
                  </div>
                  <p className="text-[10px] text-teal-700 leading-tight">
                    ⚡ Auto-cascade: If {parentNode?.title}'s date shifts, this date shifts automatically.
                  </p>
                </div>
              )}
            </div>
          </div>

          {/* BOX 2: Priority & Alerts (Optional) */}
          <div className="bg-amber-50/40 p-3.5 rounded-2xl border border-amber-200/60 space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <span className="text-xs font-semibold text-amber-950 block">Critical Path & Alert Triggers <span className="text-amber-700 font-normal">(Optional)</span></span>
              </div>
              <CriticalFlag isCritical={isCritical} onToggle={() => setIsCritical(!isCritical)} interactive size="sm" />
            </div>

            {!isEditing && (
              <div className="pt-2 border-t border-amber-200/50 space-y-2 text-xs">
                <div className="flex items-center justify-between">
                  <label className="font-semibold text-amber-900 flex items-center gap-1.5">
                    <Bell className="w-3.5 h-3.5 text-amber-600" /> Set Reminder Alert
                  </label>
                  <input
                    type="checkbox"
                    checked={attachReminder}
                    onChange={e => setAttachReminder(e.target.checked)}
                    className="rounded border-amber-300 text-teal-600 focus:ring-teal-500"
                  />
                </div>

                {attachReminder && (
                  <div className="space-y-2 pt-1.5 bg-white p-2.5 rounded-xl border border-amber-200">
                    <div className="flex items-center gap-2">
                      <span className="text-[11px] font-medium text-gray-700">Trigger:</span>
                      <select
                        value={reminderMode}
                        onChange={e => setReminderMode(e.target.value as 'relative' | 'fixed')}
                        className="px-2 py-0.5 bg-gray-50 border border-gray-200 rounded-md text-[11px]"
                      >
                        <option value="relative">Relative Offset (X days before date)</option>
                        <option value="fixed">Fixed Timestamp</option>
                      </select>
                    </div>

                    {reminderMode === 'relative' ? (
                      <div className="flex items-center gap-2">
                        <input
                          type="number"
                          value={reminderOffset}
                          onChange={e => setReminderOffset(Number(e.target.value))}
                          className="w-16 p-1 border border-gray-300 rounded-md text-center font-mono text-xs font-bold"
                        />
                        <span className="text-[11px] text-gray-600">days before target date</span>
                      </div>
                    ) : (
                      <input
                        type="datetime-local"
                        value={reminderFixedDate}
                        onChange={e => setReminderFixedDate(e.target.value)}
                        className="w-full text-xs p-1 border border-gray-300 rounded-md font-mono"
                      />
                    )}

                    <input
                      type="text"
                      placeholder="Reminder message..."
                      value={reminderMessage}
                      onChange={e => setReminderMessage(e.target.value)}
                      className="w-full text-xs p-1.5 border border-gray-300 rounded-md outline-none"
                    />
                  </div>
                )}
              </div>
            )}
          </div>

          {/* BOX 3: Ownership & Vendor Details (Optional) */}
          <div className="bg-gray-50/80 p-3.5 rounded-2xl border border-gray-200 space-y-2">
            <span className="text-xs font-semibold text-gray-800 block">
              Ownership & Vendor Info <span className="text-gray-400 font-normal">(Optional)</span>
            </span>

            <div className="grid grid-cols-2 gap-2 text-xs">
              <div>
                <label className="block text-[11px] font-medium text-gray-600 mb-0.5 flex items-center gap-1">
                  <User className="w-3 h-3 text-gray-400" /> Assignee
                </label>
                <input
                  type="text"
                  value={assignee}
                  onChange={e => setAssignee(e.target.value)}
                  placeholder="e.g. Alex (Merchandising)"
                  className="w-full text-xs px-2.5 py-1.5 bg-white border border-gray-300 rounded-xl outline-none focus:border-teal-500"
                />
              </div>
              <div>
                <label className="block text-[11px] font-medium text-gray-600 mb-0.5 flex items-center gap-1">
                  <Tag className="w-3 h-3 text-gray-400" /> Vendor Contact
                </label>
                <input
                  type="text"
                  value={vendorContact}
                  onChange={e => setVendorContact(e.target.value)}
                  placeholder="e.g. Supplier X Email/Tel"
                  className="w-full text-xs px-2.5 py-1.5 bg-white border border-gray-300 rounded-xl outline-none focus:border-teal-500"
                />
              </div>
            </div>
          </div>

          {/* BOX 4: Notes & Description (Optional) */}
          <div className="bg-gray-50/80 p-3.5 rounded-2xl border border-gray-200 space-y-1.5">
            <label className="text-xs font-semibold text-gray-800 flex items-center gap-1">
              <FileText className="w-3.5 h-3.5 text-gray-500" /> Notes & Follow-up Log <span className="text-gray-400 font-normal">(Optional)</span>
            </label>
            <textarea
              rows={2}
              value={description}
              onChange={e => setDescription(e.target.value)}
              placeholder="Record technical specs, batch codes, or vendor follow-up logs..."
              className="w-full text-xs p-2.5 bg-white border border-gray-300 rounded-xl outline-none focus:border-teal-500"
            />
          </div>

          {/* BOX 5: Compact Color Theme (Optional) */}
          <div className="bg-gray-50/60 p-3 rounded-2xl border border-gray-200">
            <ColorPicker
              value={color}
              onChange={setColor}
              inheritedFromTitle={parentNode?.title}
            />
          </div>

          {/* Form Actions */}
          <div className="pt-3 border-t border-gray-100 flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-xs font-medium text-gray-600 hover:text-gray-800 rounded-xl transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="px-5 py-2 text-xs font-semibold text-white bg-teal-600 hover:bg-teal-700 rounded-xl shadow-xs transition-colors flex items-center gap-1.5"
            >
              <Check className="w-4 h-4" />
              <span>{isEditing ? 'Save Changes' : 'Create Milestone'}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
