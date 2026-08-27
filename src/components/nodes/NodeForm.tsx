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
  ChevronRight, ArrowLeft, ArrowRight, Trash2, Plus, Sparkles, AlertCircle 
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
  const [startDate, setStartDate] = useState(
    initialNode?.start_date ? initialNode.start_date.substring(0, 10) : ''
  );
  const [plannedDate, setPlannedDate] = useState(
    initialNode?.planned_date ? initialNode.planned_date.substring(0, 10) : ''
  );
  
  // Color Override Toggle (De-cluttered: only show swatch picker when checked)
  const [overrideColor, setOverrideColor] = useState<boolean>(Boolean(initialNode?.color));
  const [color, setColor] = useState<string | null>(defaultAutoColor);
  
  // Date Mode State: 'single' (Fixed Date), 'offset' (Relative to Parent), 'range' (Start -> End Range)
  const [dateMode, setDateMode] = useState<'single' | 'offset' | 'range'>(
    initialNode?.start_date
      ? 'range'
      : initialNode?.trigger_offset_days !== null && initialNode?.trigger_offset_days !== undefined
      ? 'offset'
      : parentId
      ? 'offset'
      : 'single'
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
    if (dateMode !== 'offset' || !parentId) return null;
    if (offsetDirection === 'same') return 0;
    if (offsetDirection === 'before') return -Math.abs(offsetDaysQty);
    return Math.abs(offsetDaysQty);
  })();

  // Calculate live resulting target date
  const calculatedTargetDate: string | null = (() => {
    if (dateMode === 'offset' && parentEffectiveDate && computedOffsetDays !== null) {
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

  // Date Hierarchy & Lineage Validation Rules
  const dateValidationError: string | null = (() => {
    // Range mode validation: start date must be <= end date
    if (dateMode === 'range' && startDate && plannedDate) {
      if (new Date(startDate) > new Date(plannedDate)) {
        return '⚠️ Invalid Date Range: Start Date cannot be later than Target End Date.';
      }
    }

    if (!calculatedTargetDate) return null;
    const targetDateObj = new Date(calculatedTargetDate);
    if (!isValid(targetDateObj)) return null;

    // Rule A: Target date cannot be before year 2020
    const minAllowedDate = new Date('2020-01-01');
    if (targetDateObj < minAllowedDate) {
      return '⚠️ Invalid Target Date: Milestone target date cannot be set before year 2020.';
    }

    // Rule B: Target date CANNOT be later than parent node target date
    if (parentNode && parentEffectiveDate) {
      const parentDateObj = new Date(parentEffectiveDate);
      if (isValid(parentDateObj) && targetDateObj > parentDateObj) {
        const childFormatted = formatLocalDate(calculatedTargetDate, 'MMM d, yyyy');
        const parentFormatted = formatLocalDate(parentEffectiveDate, 'MMM d, yyyy');
        return `⚠️ Date Exceeds Parent Limit: Selected date (${childFormatted}) is later than parent milestone "${parentNode.title}" target date (${parentFormatted}). Please choose a date on or before ${parentFormatted}, or update the parent node's target date first.`;
      }
    }

    return null;
  })();

  const parentResolvedColor = parentNode?.color || (parentNode as any)?.effective_color || '#0D9488';

  // Hierarchy level depth labels
  const hierarchyDepth = ancestorPath.length + (parentNode ? 1 : 0);
  const hierarchyLabels: Record<number, string> = {
    1: 'Level 1: Department / Brand Space',
    2: 'Level 2: Season / Collection',
    3: 'Level 3: Product Model / Project',
    4: 'Level 4: Milestone Task',
    5: 'Level 5: Subtask / Action Item',
  };
  const currentHierarchyText = hierarchyLabels[hierarchyDepth] || `Level ${hierarchyDepth} Node`;

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
    if (!title.trim() || isSubmitting || dateValidationError) return;

    setIsSubmitting(true);
    let finalStartDate: string | null = null;
    let finalPlannedDate: string | null = null;
    let finalOffset: number | null = null;
    let finalColor: string | null = overrideColor ? color : null;

    if (dateMode === 'offset' && parentId) {
      finalOffset = computedOffsetDays;
      finalPlannedDate = calculatedTargetDate;
    } else if (dateMode === 'range') {
      finalStartDate = startDate ? new Date(startDate).toISOString() : null;
      finalPlannedDate = plannedDate ? new Date(plannedDate).toISOString() : null;
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
          color: finalColor,
          start_date: finalStartDate,
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
          color: finalColor,
          start_date: finalStartDate,
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
        
        {/* Modal Header with Dynamic Parent Color Theme Accent */}
        <div 
          className="px-6 py-4 border-b border-gray-100 flex items-center justify-between bg-slate-50/80 shrink-0"
          style={{ borderTop: `6px solid ${parentResolvedColor}` }}
        >
          <div className="flex items-center gap-2.5">
            <div 
              className="w-8 h-8 rounded-xl flex items-center justify-center text-white font-bold shrink-0 shadow-2xs"
              style={{ backgroundColor: parentResolvedColor }}
            >
              <Layers className="w-4 h-4" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-sm font-bold text-gray-900 leading-tight">
                  {isEditing ? 'Edit Milestone' : `Add ${type.charAt(0).toUpperCase() + type.slice(1)}`}
                </h2>
                {parentNode && (
                  <span 
                    className="text-[10px] font-mono px-2 py-0.5 rounded-md font-bold text-white shadow-2xs"
                    style={{ backgroundColor: parentResolvedColor }}
                  >
                    Parent Theme
                  </span>
                )}
              </div>
              
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
          
          {/* Hierarchy Level Explanatory Card */}
          <div className="bg-teal-50/70 p-3 rounded-2xl border border-teal-200 text-xs text-teal-900 space-y-1">
            <div className="flex items-center justify-between font-bold">
              <span className="flex items-center gap-1.5 text-teal-950">
                <Layers className="w-4 h-4 text-teal-700" />
                <span>{currentHierarchyText}</span>
              </span>
              {parentNode && (
                <span className="text-[11px] text-teal-800 font-medium">
                  Parent Target: <strong>{parentEffectiveDate ? formatLocalDate(parentEffectiveDate, 'MMM d, yyyy') : 'No Limit'}</strong>
                </span>
              )}
            </div>
            <p className="text-[11px] text-teal-800 leading-relaxed">
              💡 <strong>Hierarchy Rules:</strong> Hierarchy levels structure tasks into sub-tasks (e.g. Model → Stage → Task → Subtask). Target dates of sub-tasks cannot exceed the parent milestone's target date.
            </p>
          </div>

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

          {/* Hierarchy Type & Color Customization */}
          <div className="space-y-3">
            <div>
              <label className="block font-bold text-gray-700 mb-1.5">Node Type / Category</label>
              <select
                value={type}
                onChange={e => setType(e.target.value as NodeType)}
                className="w-full text-xs px-3 py-2 bg-gray-50 border border-gray-300 rounded-xl font-semibold outline-none focus:border-teal-500 focus:bg-white"
              >
                <option value="department">Department / Stream (Level 1)</option>
                <option value="season">Season / Group (Level 2)</option>
                <option value="project">Project / Model (Level 3)</option>
                <option value="task">Major Task (Level 4)</option>
                <option value="subtask">Sub-Task Milestone (Level 5)</option>
              </select>
            </div>

            {/* De-cluttered Optional Color Swatch Override Checkbox */}
            <div className="bg-slate-50 p-3 rounded-2xl border border-slate-200 space-y-2.5">
              <label className="flex items-center gap-2.5 text-xs font-bold text-gray-800 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={overrideColor}
                  onChange={e => {
                    setOverrideColor(e.target.checked);
                    if (!e.target.checked) setColor(null);
                    else if (!color) setColor(defaultAutoColor || '#0D9488');
                  }}
                  className="w-4 h-4 rounded border-gray-300 text-teal-600 focus:ring-teal-500 cursor-pointer"
                />
                <span>Customize Accent Color (Override Theme Gradient)</span>
              </label>

              {!overrideColor && (
                <p className="text-[11px] text-gray-500 italic pl-6">
                  ✨ Inherits parent color with a soft, readable level gradient tint automatically.
                </p>
              )}

              {overrideColor && (
                <div className="pt-2 border-t border-gray-200">
                  <ColorPicker
                    value={color}
                    onChange={setColor}
                    inheritedColor={parentResolvedColor}
                    inheritedFromTitle={parentNode?.title}
                  />
                </div>
              )}
            </div>
          </div>

          {/* TARGET DATE & RELATIVE TIMING BUILDER */}
          <div className="bg-slate-50/80 p-4 rounded-2xl border border-slate-200 space-y-3">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <label className="font-bold text-gray-900 flex items-center gap-1.5 text-xs">
                <Calendar className="w-4 h-4 text-teal-600" /> Milestone Scheduling Panel
              </label>

              {/* 3-MODE DATE TYPE TABS */}
              <div className="flex items-center bg-white p-0.5 rounded-xl border border-gray-300 shadow-2xs">
                {parentId && (
                  <button
                    type="button"
                    onClick={() => setDateMode('offset')}
                    className={`px-2.5 py-1 rounded-lg font-bold text-[11px] transition-colors ${
                      dateMode === 'offset' 
                        ? 'bg-teal-600 text-white shadow-xs' 
                        : 'text-gray-600 hover:text-gray-900'
                    }`}
                  >
                    ⚡ Offset
                  </button>
                )}

                <button
                  type="button"
                  onClick={() => setDateMode('single')}
                  className={`px-2.5 py-1 rounded-lg font-bold text-[11px] transition-colors ${
                    dateMode === 'single' 
                      ? 'bg-teal-600 text-white shadow-xs' 
                      : 'text-gray-600 hover:text-gray-900'
                  }`}
                >
                  📌 Single Date
                </button>

                <button
                  type="button"
                  onClick={() => setDateMode('range')}
                  className={`px-2.5 py-1 rounded-lg font-bold text-[11px] transition-colors ${
                    dateMode === 'range' 
                      ? 'bg-teal-600 text-white shadow-xs' 
                      : 'text-gray-600 hover:text-gray-900'
                  }`}
                >
                  🗓️ Date Range
                </button>
              </div>
            </div>

            {/* MODE 1: RELATIVE OFFSET BUILDER */}
            {dateMode === 'offset' && parentId ? (
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

                {/* Days Quantity Inputs */}
                {offsetDirection !== 'same' && (
                  <div className="space-y-2 pt-1 border-t border-gray-100">
                    <div className="flex items-center justify-between">
                      <label className="text-[11px] font-bold text-gray-700">
                        {offsetDirection === 'before' ? 'Days Before Parent Target:' : 'Days After Parent Target:'}
                      </label>
                      <div className="flex items-center gap-1">
                        <input
                          type="number"
                          min="1"
                          max="365"
                          value={offsetDaysQty}
                          onChange={e => setOffsetDaysQty(Math.max(1, Number(e.target.value) || 1))}
                          className="w-16 h-8 text-center font-mono font-bold bg-gray-50 border border-gray-300 rounded-lg text-xs"
                        />
                        <span className="text-xs font-bold text-gray-500">Days</span>
                      </div>
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
            ) : dateMode === 'range' ? (
              /* MODE 2: DATE RANGE INPUT (Start Date -> Target End Date) */
              <div className="bg-white p-4 rounded-2xl border border-indigo-200 space-y-3 shadow-2xs">
                <div className="grid grid-cols-2 gap-3 text-xs">
                  <div>
                    <label className="block font-bold text-gray-700 mb-1">Start Date</label>
                    <input
                      type="date"
                      value={startDate}
                      onChange={e => setStartDate(e.target.value)}
                      className="w-full text-xs px-3 py-2 bg-gray-50 border border-gray-300 rounded-xl outline-none focus:border-teal-500 font-semibold"
                    />
                  </div>

                  <div>
                    <label className="block font-bold text-gray-700 mb-1">Target End Date</label>
                    <input
                      type="date"
                      value={plannedDate}
                      onChange={e => setPlannedDate(e.target.value)}
                      className="w-full text-xs px-3 py-2 bg-gray-50 border border-gray-300 rounded-xl outline-none focus:border-teal-500 font-semibold"
                    />
                  </div>
                </div>

                {startDate && plannedDate && new Date(startDate) <= new Date(plannedDate) && (
                  <div className="p-2.5 bg-indigo-50 rounded-xl border border-indigo-200 text-indigo-950 text-xs flex items-center justify-between font-medium">
                    <span>🗓️ Total Range Duration:</span>
                    <span className="font-mono font-extrabold text-indigo-900 bg-white px-2 py-0.5 rounded-md border border-indigo-200">
                      {Math.ceil((new Date(plannedDate).getTime() - new Date(startDate).getTime()) / (1000 * 60 * 60 * 24)) + 1} Days
                    </span>
                  </div>
                )}
              </div>
            ) : (
              /* MODE 3: SINGLE FIXED CALENDAR DATE INPUT */
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

          {/* Date Hierarchy Validation Banner */}
          {dateValidationError && (
            <div className="bg-rose-50 border border-rose-200 p-3 rounded-2xl text-xs text-rose-900 font-medium space-y-1 shadow-2xs animate-in fade-in">
              <div className="flex items-start gap-1.5 font-bold text-rose-950">
                <AlertCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
                <span>Date Validation Error</span>
              </div>
              <p className="text-[11px] leading-relaxed text-rose-800">{dateValidationError}</p>
            </div>
          )}

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
              disabled={isSubmitting || Boolean(dateValidationError)}
              className={`h-9 px-5 font-bold rounded-xl shadow-xs transition-all flex items-center gap-1.5 ${
                dateValidationError
                  ? 'bg-gray-200 text-gray-400 border border-gray-300 cursor-not-allowed'
                  : 'bg-teal-600 hover:bg-teal-700 text-white'
              }`}
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
