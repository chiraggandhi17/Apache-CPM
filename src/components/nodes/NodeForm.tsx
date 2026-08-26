import React, { useState } from 'react';
import { NodeItem, NodeType, NodeStatus } from '../../types/domain';
import { useNodes } from '../../context/NodeContext';
import { ColorPicker } from '../shared/ColorPicker';
import { CriticalFlag } from '../shared/CriticalFlag';
import { getUnusedProjectColor } from '../../lib/color-resolver';
import { getAncestorPath } from '../../utils/hierarchy';
import { formatLocalDate } from '../../utils/date-format';
import { addDays, isValid, formatISO } from 'date-fns';
import { 
  X, Calendar, User, Tag, FileText, Bell, Layers, Check, 
  ChevronRight, ArrowLeft, ArrowRight, Trash2, Plus, Sparkles 
} from 'lucide-react';

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
  parentDate = null,
  initialNode = null,
  onClose,
}) => {
  const { addNode, updateNode, nodes, reminders, addReminder, dismissReminder } = useNodes();
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
  const parentEffectiveDate = parentNode?.planned_date || parentDate;

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
  
  // Date Mode State: Default to 'relative' if parent exists, else 'absolute'
  const [dateMode, setDateMode] = useState<'absolute' | 'relative'>(
    initialNode?.trigger_offset_days !== null && initialNode?.trigger_offset_days !== undefined
      ? 'relative'
      : parentId
      ? 'relative'
      : 'absolute'
  );

  // Intuitive Offset State
  const initialOffset = initialNode?.trigger_offset_days !== null && initialNode?.trigger_offset_days !== undefined 
    ? initialNode.trigger_offset_days 
    : -7;

  const [offsetDirection, setOffsetDirection] = useState<'before' | 'after' | 'same'>(
    initialOffset < 0 ? 'before' : initialOffset > 0 ? 'after' : 'same'
  );
  const [offsetDaysQty, setOffsetDaysQty] = useState<number>(Math.abs(initialOffset) || 7);

  const [isCritical, setIsCritical] = useState<boolean>(initialNode?.is_critical || false);
  const [status, setStatus] = useState<NodeStatus>(initialNode?.status || 'not_started');
  const [assignee, setAssignee] = useState(initialNode?.assignee || '');
  const [vendorContact, setVendorContact] = useState(initialNode?.vendor_contact || '');
  const [description, setDescription] = useState(initialNode?.description || '');

  // Reminder alert state (available in both Create & Edit)
  const existingNodeReminders = isEditing && initialNode 
    ? reminders.filter(r => r.node_id === initialNode.id && !r.dismissed_at) 
    : [];

  const [attachReminder, setAttachReminder] = useState(false);
  const [reminderPreset, setReminderPreset] = useState<string>('-2'); // '-2' = 2 days before
  const [customReminderDays, setCustomReminderDays] = useState<number>(2);
  const [reminderMessage, setReminderMessage] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Calculate final offset
  const computedOffsetDays: number | null = (() => {
    if (dateMode !== 'relative' || !parentId) return null;
    if (offsetDirection === 'same') return 0;
    if (offsetDirection === 'before') return -Math.abs(offsetDaysQty);
    return Math.abs(offsetDaysQty);
  })();

  // Calculate live resulting target date
  const calculatedTargetDate: string | null = (() => {
    if (dateMode === 'relative' && parentEffectiveDate && computedOffsetDays !== null) {
      try {
        const base = new Date(parentEffectiveDate);
        if (isValid(base)) {
          return formatISO(addDays(base, computedOffsetDays));
        }
      } catch {
        return null;
      }
    }
    return plannedDate ? new Date(plannedDate).toISOString() : null;
  })();

  // Calculate live reminder trigger date (with safe fallback to today if no date set)
  const calculatedReminderDate: string = (() => {
    const baseDateStr = calculatedTargetDate || (isEditing && initialNode?.planned_date);
    const baseDate = baseDateStr ? new Date(baseDateStr) : new Date();
    const daysBefore = reminderPreset === 'custom' ? customReminderDays : Math.abs(Number(reminderPreset));
    try {
      if (isValid(baseDate)) {
        return formatISO(addDays(baseDate, -daysBefore));
      }
    } catch {
      // Fallback
    }
    return formatISO(addDays(new Date(), -daysBefore));
  })();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || isSubmitting) return;

    setIsSubmitting(true);
    let finalPlannedDate: string | null = null;
    let finalOffset: number | null = null;

    if (dateMode === 'relative' && parentId) {
      finalOffset = computedOffsetDays;
      finalPlannedDate = calculatedTargetDate;
    } else if (plannedDate) {
      finalPlannedDate = new Date(plannedDate).toISOString();
    }

    try {
      let targetNodeId: string;

      if (isEditing && initialNode) {
        targetNodeId = initialNode.id;
        await updateNode(initialNode.id, {
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
        targetNodeId = await addNode({
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
      }

      // Attach Reminder Alert if checked
      if (attachReminder && targetNodeId) {
        const daysBefore = reminderPreset === 'custom' ? customReminderDays : Math.abs(Number(reminderPreset));
        let remindAtISO: string;

        if (finalPlannedDate && isValid(new Date(finalPlannedDate))) {
          remindAtISO = formatISO(addDays(new Date(finalPlannedDate), -daysBefore));
        } else {
          remindAtISO = formatISO(addDays(new Date(), -daysBefore));
        }

        await addReminder({
          node_id: targetNodeId,
          remind_at: remindAtISO,
          offset_mode: 'relative',
          offset_days: -daysBefore,
          message: reminderMessage.trim() || `Follow up on ${title}`,
        });
      }

      onClose();
    } catch (err) {
      console.error('Error saving node & reminder:', err);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-slate-950/60 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-in fade-in">
      <div className="bg-white rounded-3xl shadow-2xl w-full max-w-xl overflow-hidden border border-gray-200 max-h-[90vh] flex flex-col">
        
        {/* Modal Header */}
        <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between bg-slate-50/80 shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-teal-600/10 text-teal-700 flex items-center justify-center border border-teal-200 shrink-0">
              <Layers className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-sm font-bold text-gray-900 leading-tight">
                {isEditing ? 'Edit Milestone' : `Add ${type.charAt(0).toUpperCase() + type.slice(1)}`}
              </h2>
              
              {/* Ancestor Breadcrumb Path */}
              {ancestorPath.length > 0 && (
                <div className="flex items-center flex-wrap gap-1 text-[11px] text-gray-500 leading-tight mt-0.5 font-medium">
                  <span>In:</span>
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
                </div>
              )}
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-xl text-gray-400 hover:text-gray-700 hover:bg-gray-200/60 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="p-6 space-y-4 overflow-y-auto flex-1 text-xs">
          
          {/* Milestone Title */}
          <div>
            <label className="block font-bold text-gray-800 mb-1.5">
              Milestone / Task Name <span className="text-rose-500">*</span>
            </label>
            <input
              type="text"
              required
              autoFocus
              value={title}
              onChange={e => setTitle(e.target.value)}
              placeholder="e.g. 2D/3D Pattern Review, Tooling Opening, Material Test..."
              className="w-full text-xs px-3.5 py-2.5 bg-gray-50 border border-gray-300 rounded-xl outline-none focus:border-teal-500 focus:bg-white font-semibold transition-all shadow-2xs"
            />
          </div>

          {/* Type & Color Customization */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block font-bold text-gray-700 mb-1.5">Hierarchy Level</label>
              <select
                value={type}
                onChange={e => setType(e.target.value as NodeType)}
                className="w-full text-xs px-3 py-2 bg-gray-50 border border-gray-300 rounded-xl font-semibold outline-none focus:border-teal-500 focus:bg-white"
              >
                <option value="department">Department / Stream</option>
                <option value="season">Season / Group</option>
                <option value="project">Project / Model</option>
                <option value="task">Major Task</option>
                <option value="subtask">Sub-Task Milestone</option>
              </select>
            </div>

            <div>
              <label className="block font-bold text-gray-700 mb-1.5">Color Theme</label>
              <ColorPicker value={color} onChange={setColor} />
            </div>
          </div>

          {/* TARGET DATE & RELATIVE TIMING BUILDER */}
          <div className="bg-slate-50/80 p-4 rounded-2xl border border-slate-200 space-y-3">
            <div className="flex items-center justify-between">
              <label className="font-bold text-gray-900 flex items-center gap-1.5">
                <Calendar className="w-4 h-4 text-teal-600" /> Planned Target Date
              </label>

              {parentId && (
                <div className="flex items-center bg-white p-0.5 rounded-xl border border-gray-300 shadow-2xs">
                  <button
                    type="button"
                    onClick={() => setDateMode('relative')}
                    className={`px-3 py-1 rounded-lg font-bold text-[11px] transition-colors ${
                      dateMode === 'relative' 
                        ? 'bg-teal-600 text-white shadow-xs' 
                        : 'text-gray-600 hover:text-gray-900'
                    }`}
                  >
                    ⚡ Relative Offset
                  </button>
                  <button
                    type="button"
                    onClick={() => setDateMode('absolute')}
                    className={`px-3 py-1 rounded-lg font-bold text-[11px] transition-colors ${
                      dateMode === 'absolute' 
                        ? 'bg-teal-600 text-white shadow-xs' 
                        : 'text-gray-600 hover:text-gray-900'
                    }`}
                  >
                    📅 Fixed Date
                  </button>
                </div>
              )}
            </div>

            {/* RELATIVE OFFSET BUILDER */}
            {dateMode === 'relative' && parentId ? (
              <div className="bg-white p-4 rounded-2xl border border-teal-200 space-y-3.5 shadow-2xs">
                
                {/* Immediate Parent Reference Banner */}
                <div className="flex items-center justify-between text-xs bg-slate-100 p-2.5 rounded-xl border border-slate-200">
                  <div className="flex items-center gap-1.5 truncate">
                    <span className="text-gray-500 font-medium">Immediate Parent:</span>
                    <span className="font-bold text-gray-900 truncate">"{parentNode?.title || 'Parent Task'}"</span>
                  </div>
                  <span className="font-mono font-bold text-teal-800 bg-white px-2.5 py-0.5 rounded-md border border-slate-200 shrink-0 ml-2">
                    {parentEffectiveDate ? formatLocalDate(parentEffectiveDate, 'MMM d, yyyy') : 'No target date'}
                  </span>
                </div>

                {/* Timing Direction Tabs */}
                <div className="space-y-1.5">
                  <label className="block text-[11px] font-bold text-gray-700">Schedule Timing Relative to Parent:</label>
                  <div className="grid grid-cols-3 gap-2">
                    <button
                      type="button"
                      onClick={() => setOffsetDirection('before')}
                      className={`py-2 px-2 rounded-xl font-bold text-[11px] border flex items-center justify-center gap-1.5 transition-all ${
                        offsetDirection === 'before'
                          ? 'bg-teal-50 border-teal-500 text-teal-900 ring-2 ring-teal-400/40 shadow-xs'
                          : 'bg-gray-50 border-gray-200 text-gray-600 hover:bg-gray-100'
                      }`}
                    >
                      <ArrowLeft className="w-3.5 h-3.5 text-teal-600" />
                      <span>Before Parent</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => setOffsetDirection('same')}
                      className={`py-2 px-2 rounded-xl font-bold text-[11px] border flex items-center justify-center gap-1.5 transition-all ${
                        offsetDirection === 'same'
                          ? 'bg-teal-50 border-teal-500 text-teal-900 ring-2 ring-teal-400/40 shadow-xs'
                          : 'bg-gray-50 border-gray-200 text-gray-600 hover:bg-gray-100'
                      }`}
                    >
                      <span>On Same Day</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => setOffsetDirection('after')}
                      className={`py-2 px-2 rounded-xl font-bold text-[11px] border flex items-center justify-center gap-1.5 transition-all ${
                        offsetDirection === 'after'
                          ? 'bg-teal-50 border-teal-500 text-teal-900 ring-2 ring-teal-400/40 shadow-xs'
                          : 'bg-gray-50 border-gray-200 text-gray-600 hover:bg-gray-100'
                      }`}
                    >
                      <span>After Parent</span>
                      <ArrowRight className="w-3.5 h-3.5 text-teal-600" />
                    </button>
                  </div>
                </div>

                {/* Days Quantity & Presets Grid (Never Overflows!) */}
                {offsetDirection !== 'same' && (
                  <div className="p-3 bg-slate-50 rounded-xl border border-slate-200 space-y-2">
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-gray-700 text-xs">Offset Days:</span>
                      <input
                        type="number"
                        min="1"
                        max="365"
                        value={offsetDaysQty}
                        onChange={e => setOffsetDaysQty(Math.max(1, Number(e.target.value) || 1))}
                        className="w-16 h-8 text-center text-xs font-mono font-bold bg-white border border-gray-300 rounded-lg outline-none focus:border-teal-500"
                      />
                      <span className="text-gray-600 text-xs font-medium">days {offsetDirection} parent</span>
                    </div>

                    <div className="space-y-1">
                      <span className="text-[10px] uppercase font-bold text-gray-400 block">Quick Presets:</span>
                      <div className="grid grid-cols-6 gap-1.5">
                        {[1, 3, 7, 14, 21, 30].map(d => (
                          <button
                            key={d}
                            type="button"
                            onClick={() => setOffsetDaysQty(d)}
                            className={`py-1 rounded-lg text-[11px] font-bold border transition-colors text-center ${
                              offsetDaysQty === d
                                ? 'bg-teal-600 text-white border-teal-600 shadow-xs'
                                : 'bg-white text-gray-700 border-gray-200 hover:bg-gray-100'
                            }`}
                          >
                            {d}d
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>
                )}

                {/* Live Calculated Date Preview Card */}
                <div className="p-3 bg-teal-50 rounded-xl border border-teal-200 flex items-center justify-between">
                  <div>
                    <span className="text-[10px] font-bold uppercase tracking-wider text-teal-700 block">
                      Resulting Milestone Target Date
                    </span>
                    <span className="text-xs font-extrabold text-teal-950 font-mono">
                      {calculatedTargetDate ? formatLocalDate(calculatedTargetDate, 'EEEE, MMMM d, yyyy') : 'Parent has no target date'}
                    </span>
                  </div>
                  <span className="text-xs font-mono font-extrabold bg-teal-600 text-white px-2.5 py-1 rounded-lg shadow-2xs">
                    {offsetDirection === 'same' ? '0 Days' : `${offsetDirection === 'before' ? '-' : '+'}${offsetDaysQty} Days`}
                  </span>
                </div>
              </div>
            ) : (
              /* FIXED CALENDAR DATE INPUT */
              <div className="space-y-1.5">
                <input
                  type="date"
                  value={plannedDate}
                  onChange={e => setPlannedDate(e.target.value)}
                  className="w-full text-xs px-3.5 py-2.5 bg-white border border-gray-300 rounded-xl outline-none focus:border-teal-500 font-semibold"
                />
                {plannedDate && (
                  <p className="text-[11px] text-gray-500 font-mono pl-1">
                    Scheduled for: <strong>{formatLocalDate(new Date(plannedDate).toISOString(), 'EEEE, MMMM d, yyyy')}</strong>
                  </p>
                )}
              </div>
            )}
          </div>

          {/* CRITICAL PRIORITY & ALERTS SECTION */}
          <div className="bg-amber-50/50 p-4 rounded-2xl border border-amber-200 space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <span className="text-xs font-bold text-amber-950 block">Critical Path & Reminders</span>
                <span className="text-[11px] text-amber-800">Flag milestone priority & configure alert triggers</span>
              </div>
              <CriticalFlag isCritical={isCritical} onToggle={() => setIsCritical(!isCritical)} interactive size="sm" />
            </div>

            {/* Existing Alerts on this Milestone (when Editing) */}
            {isEditing && existingNodeReminders.length > 0 && (
              <div className="space-y-1.5 pt-2 border-t border-amber-200/60">
                <span className="text-[11px] font-bold text-amber-950 block">Existing Active Alerts:</span>
                {existingNodeReminders.map(rem => (
                  <div key={rem.id} className="bg-white p-2.5 rounded-xl border border-amber-200 flex items-center justify-between text-xs shadow-2xs">
                    <div>
                      <p className="font-semibold text-amber-950">{rem.message}</p>
                      <p className="text-[10px] text-amber-700 font-mono mt-0.5">Trigger: {formatLocalDate(rem.remind_at)}</p>
                    </div>
                    <button
                      type="button"
                      onClick={() => dismissReminder(rem.id)}
                      className="p-1 text-rose-500 hover:text-rose-700 rounded-lg hover:bg-rose-50 transition-colors"
                      title="Dismiss Alert"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            )}

            {/* Set New Alert */}
            <div className="pt-2 border-t border-amber-200/60 space-y-2.5">
              <div className="flex items-center justify-between">
                <label className="font-bold text-amber-950 flex items-center gap-1.5 cursor-pointer">
                  <Bell className="w-4 h-4 text-amber-600" />
                  <span>{isEditing ? 'Add New Alert Trigger' : 'Set Automatic Alert Trigger'}</span>
                </label>
                <input
                  type="checkbox"
                  checked={attachReminder}
                  onChange={e => setAttachReminder(e.target.checked)}
                  className="w-4 h-4 rounded border-amber-300 text-teal-600 focus:ring-teal-500 cursor-pointer"
                />
              </div>

              {attachReminder && (
                <div className="bg-white p-3.5 rounded-2xl border border-amber-300 space-y-3 animate-in fade-in shadow-2xs">
                  <label className="block text-[11px] font-bold text-gray-700">When should alert trigger?</label>
                  
                  {/* Quick Alert Presets (6-Column Grid inside Popup) */}
                  <div className="grid grid-cols-3 sm:grid-cols-6 gap-1.5">
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
                            ? 'bg-amber-600 text-white border-amber-600 shadow-xs'
                            : 'bg-gray-50 text-gray-700 border-gray-200 hover:bg-gray-100'
                        }`}
                      >
                        {p.label}
                      </button>
                    ))}
                  </div>

                  {reminderPreset === 'custom' && (
                    <div className="flex items-center gap-2 pt-1">
                      <input
                        type="number"
                        min="1"
                        max="60"
                        value={customReminderDays}
                        onChange={e => setCustomReminderDays(Math.max(1, Number(e.target.value) || 1))}
                        className="w-16 h-8 text-center font-mono font-bold bg-gray-50 border border-gray-300 rounded-lg text-xs"
                      />
                      <span className="text-xs text-gray-600 font-medium">days before target date</span>
                    </div>
                  )}

                  {/* Live Calculated Alert Date */}
                  {calculatedReminderDate && (
                    <div className="p-2.5 bg-amber-50 rounded-xl border border-amber-200 text-amber-950 text-xs font-bold flex items-center justify-between">
                      <span>🔔 Alert Trigger Date:</span>
                      <span className="font-mono text-amber-900">{formatLocalDate(calculatedReminderDate, 'EEEE, MMM d, yyyy')}</span>
                    </div>
                  )}

                  <input
                    type="text"
                    placeholder="Reminder note (e.g. Follow up with factory team on sample pull)..."
                    value={reminderMessage}
                    onChange={e => setReminderMessage(e.target.value)}
                    className="w-full text-xs p-2.5 bg-gray-50 border border-gray-300 rounded-xl outline-none focus:border-teal-500 font-medium"
                  />
                </div>
              )}
            </div>
          </div>

          {/* ASSIGNEE & VENDOR DETAILS */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block font-bold text-gray-700 mb-1.5 flex items-center gap-1">
                <User className="w-3.5 h-3.5 text-gray-400" /> Assignee
              </label>
              <input
                type="text"
                value={assignee}
                onChange={e => setAssignee(e.target.value)}
                placeholder="e.g. Alex J. (alex@company.com)"
                className="w-full text-xs px-3 py-2 bg-gray-50 border border-gray-300 rounded-xl outline-none focus:border-teal-500"
              />
            </div>

            <div>
              <label className="block font-bold text-gray-700 mb-1.5 flex items-center gap-1">
                <Tag className="w-3.5 h-3.5 text-gray-400" /> Vendor Contact
              </label>
              <input
                type="text"
                value={vendorContact}
                onChange={e => setVendorContact(e.target.value)}
                placeholder="e.g. Apache Footwear Tier 1"
                className="w-full text-xs px-3 py-2 bg-gray-50 border border-gray-300 rounded-xl outline-none focus:border-teal-500"
              />
            </div>
          </div>

          {/* Description & Follow-up Notes */}
          <div>
            <label className="block font-bold text-gray-700 mb-1.5 flex items-center gap-1">
              <FileText className="w-3.5 h-3.5 text-gray-400" /> Notes & Follow-up Log
            </label>
            <textarea
              rows={2}
              value={description}
              onChange={e => setDescription(e.target.value)}
              placeholder="Milestone technical requirements, fit comments, vendor instructions..."
              className="w-full text-xs p-2.5 bg-gray-50 border border-gray-300 rounded-xl outline-none focus:border-teal-500 leading-relaxed"
            />
          </div>

          {/* Form Actions */}
          <div className="flex items-center justify-end gap-2 pt-2 border-t border-gray-100">
            <button
              type="button"
              onClick={onClose}
              className="h-9 px-4 text-gray-600 font-semibold rounded-xl hover:bg-gray-100 transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="h-9 px-5 bg-teal-600 hover:bg-teal-700 text-white font-bold rounded-xl shadow-xs transition-all flex items-center gap-1.5"
            >
              <Check className="w-4 h-4" />
              <span>{isSubmitting ? 'Saving...' : isEditing ? 'Save Changes' : 'Create Milestone'}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
