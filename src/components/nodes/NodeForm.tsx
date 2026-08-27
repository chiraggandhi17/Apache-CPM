import React, { useState } from 'react';
import { NodeItem, NodeType, NodeStatus } from '../../types/domain';
import { useNodes } from '../../context/NodeContext';
import { ColorPicker } from '../shared/ColorPicker';
import { InlineCalendar } from '../shared/InlineCalendar';
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
    if (!parentId) return 'department'; // Level 1 Department by default for root creation
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
  const [color, setColor] = useState<string | null>(defaultAutoColor || (isRootOrProject ? getUnusedProjectColor(nodes) : null));

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

  // Calendar pickers default open only when no date is set yet (new task);
  // once a date exists they collapse to a compact summary chip to reduce clutter.
  const [showFixedCalendar, setShowFixedCalendar] = useState<boolean>(!plannedDate);
  const [showRangeCalendar, setShowRangeCalendar] = useState<boolean>(!(startDate && plannedDate));

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
    
    // Fix: Root nodes (!parentId) ALWAYS get saved with a vibrant color, subtasks inherit parent color!
    let finalColor: string | null = null;
    if (overrideColor && color) {
      finalColor = color;
    } else if (!parentId) {
      finalColor = color || defaultAutoColor || getUnusedProjectColor(nodes);
    } else {
      finalColor = null;
    }

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
      <div className="bg-[var(--card-bg)] rounded-3xl shadow-2xl w-full max-w-xl overflow-hidden border border-[var(--border)] max-h-[90vh] flex flex-col">
        
        {/* Modal Header with Dynamic Parent Color Theme Accent */}
        <div 
          className="px-6 py-4 border-b border-[var(--border-subtle)] flex items-center justify-between bg-[var(--badge-bg)] shrink-0"
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
                <h2 className="text-sm font-bold text-[var(--text-primary)] leading-tight">
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
                <div className="flex items-center flex-wrap gap-1 text-[11px] text-[var(--text-muted)] leading-tight mt-0.5 font-medium">
                  <span>In:</span>
                  {ancestorPath.map((step, idx) => (
                    <React.Fragment key={step.id}>
                      <span className={idx === ancestorPath.length - 1 ? 'font-bold text-[var(--text-primary)]' : 'text-[var(--text-secondary)]'}>
                        {step.title}
                      </span>
                      {idx < ancestorPath.length - 1 && (
                        <ChevronRight className="w-3 h-3 text-[var(--text-muted)] shrink-0 inline" />
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
            className="p-1.5 rounded-xl text-[var(--text-muted)] hover:text-[var(--text-secondary)] hover:bg-[var(--badge-bg)] transition-colors"
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
            <label className="block font-bold text-[var(--text-primary)] mb-1.5">
              Milestone / Task Name <span className="text-rose-500">*</span>
            </label>
            <input
              type="text"
              required
              autoFocus
              value={title}
              onChange={e => setTitle(e.target.value)}
              placeholder="e.g. 2D/3D Pattern Review, Tooling Opening, Material Test..."
              className="w-full text-xs px-3.5 py-2.5 bg-[var(--input-bg)] border border-[var(--border)] rounded-xl outline-none focus:border-[var(--accent)] focus:bg-[var(--card-bg)] font-semibold transition-all shadow-2xs"
            />
          </div>

          {/* Hierarchy Type & Color Customization */}
          <div className="space-y-3">
            <div>
              <label className="block font-bold text-[var(--text-secondary)] mb-1.5">Node Type / Category</label>
              <select
                value={type}
                onChange={e => setType(e.target.value as NodeType)}
                className="w-full text-xs px-3 py-2 bg-[var(--input-bg)] border border-[var(--border)] rounded-xl font-semibold outline-none focus:border-[var(--accent)] focus:bg-[var(--card-bg)]"
              >
                <option value="department">Department / Stream (Level 1)</option>
                <option value="season">Season / Group (Level 2)</option>
                <option value="project">Project / Model (Level 3)</option>
                <option value="task">Major Task (Level 4)</option>
                <option value="subtask">Sub-Task Milestone (Level 5)</option>
              </select>
            </div>

            {/* De-cluttered Optional Color Swatch Override Checkbox */}
            <div className="bg-[var(--badge-bg)] p-3 rounded-2xl border border-[var(--border)] space-y-2.5">
              <label className="flex items-center gap-2.5 text-xs font-bold text-[var(--text-primary)] cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={overrideColor}
                  onChange={e => {
                    setOverrideColor(e.target.checked);
                    if (!e.target.checked) setColor(null);
                    else if (!color) setColor(defaultAutoColor || '#0D9488');
                  }}
                  className="w-4 h-4 rounded border-[var(--border)] text-teal-600 focus:ring-teal-500 cursor-pointer"
                />
                <span>Customize Accent Color (Override Theme Gradient)</span>
              </label>

              {!overrideColor && (
                <p className="text-[11px] text-[var(--text-muted)] italic pl-6">
                  ✨ Inherits parent color with a soft, readable level gradient tint automatically.
                </p>
              )}

              {overrideColor && (
                <div className="pt-2 border-t border-[var(--border)]">
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
          <div className="bg-[var(--badge-bg)] p-4 rounded-2xl border border-[var(--border)] space-y-3.5 shadow-2xs">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-[var(--border)]/80 pb-2.5">
              <div>
                <label className="font-extrabold text-[var(--text-primary)] flex items-center gap-1.5 text-xs">
                  <Calendar className="w-4 h-4 text-teal-600 shrink-0" />
                  <span>Milestone Scheduling & Dates</span>
                </label>
                <span className="text-[11px] text-[var(--text-muted)] block mt-0.5">Select how this milestone's date is calculated & tracked</span>
              </div>

              {/* 3-MODE DATE TYPE SEGMENTED SELECTOR */}
              <div className="flex items-center bg-[var(--badge-bg)] p-1 rounded-xl border border-[var(--border)] shadow-2xs self-start sm:self-auto">
                {parentId && (
                  <button
                    type="button"
                    onClick={() => setDateMode('offset')}
                    className={`px-3 py-1.5 rounded-lg font-extrabold text-[11px] transition-all flex items-center gap-1 ${
                      dateMode === 'offset' 
                        ? 'bg-teal-600 text-white shadow-xs' 
                        : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--card-bg)]/50'
                    }`}
                  >
                    <span>⚡ Relative Offset</span>
                  </button>
                )}

                <button
                  type="button"
                  onClick={() => setDateMode('single')}
                  className={`px-3 py-1.5 rounded-lg font-extrabold text-[11px] transition-all flex items-center gap-1 ${
                    dateMode === 'single' 
                      ? 'bg-teal-600 text-white shadow-xs' 
                      : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--card-bg)]/50'
                  }`}
                >
                  <span>📌 Fixed Date</span>
                </button>

                <button
                  type="button"
                  onClick={() => setDateMode('range')}
                  className={`px-3 py-1.5 rounded-lg font-extrabold text-[11px] transition-all flex items-center gap-1 ${
                    dateMode === 'range' 
                      ? 'bg-teal-600 text-white shadow-xs' 
                      : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--card-bg)]/50'
                  }`}
                >
                  <span>🗓️ Date Range</span>
                </button>
              </div>
            </div>

            {/* MODE 1: RELATIVE OFFSET BUILDER (Dependent on Parent) */}
            {dateMode === 'offset' && parentId ? (
              <div className="bg-[var(--card-bg)] p-4 rounded-2xl border border-teal-200/80 space-y-3.5 shadow-2xs animate-in fade-in">
                
                {/* Immediate Parent Reference Banner */}
                <div className="flex items-center justify-between text-xs bg-teal-50/70 p-3 rounded-xl border border-teal-200">
                  <div className="flex items-center gap-2 truncate">
                    <Layers className="w-4 h-4 text-teal-700 shrink-0" />
                    <span className="text-[var(--text-secondary)] font-medium shrink-0">Parent Milestone:</span>
                    <span className="font-bold text-teal-950 truncate">"{parentNode?.title || 'Parent Task'}"</span>
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0 ml-2">
                    <span className="text-[11px] font-bold text-teal-700">Deadline:</span>
                    <span className="font-mono font-extrabold text-teal-900 bg-[var(--card-bg)] px-2.5 py-1 rounded-md border border-teal-200 shadow-2xs">
                      {parentEffectiveDate ? formatLocalDate(parentEffectiveDate, 'MMM d, yyyy') : 'No Target Date'}
                    </span>
                  </div>
                </div>

                {/* Timing Direction Cards */}
                <div className="space-y-1.5">
                  <label className="block text-[11px] font-extrabold text-[var(--text-secondary)]">Timing Relative to Parent Milestone:</label>
                  <div className="grid grid-cols-3 gap-2">
                    <button
                      type="button"
                      onClick={() => setOffsetDirection('before')}
                      className={`py-2.5 px-2 rounded-xl font-bold text-[11px] border flex items-center justify-center gap-1.5 transition-all ${
                        offsetDirection === 'before'
                          ? 'bg-teal-50 border-teal-500 text-teal-950 ring-2 ring-teal-400/40 shadow-xs'
                          : 'bg-[var(--input-bg)] border-[var(--border)] text-[var(--text-secondary)] hover:bg-[var(--badge-bg)]'
                      }`}
                    >
                      <ArrowLeft className="w-3.5 h-3.5 text-teal-600 shrink-0" />
                      <span>Before Parent</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => setOffsetDirection('same')}
                      className={`py-2.5 px-2 rounded-xl font-bold text-[11px] border flex items-center justify-center gap-1.5 transition-all ${
                        offsetDirection === 'same'
                          ? 'bg-teal-50 border-teal-500 text-teal-950 ring-2 ring-teal-400/40 shadow-xs'
                          : 'bg-[var(--input-bg)] border-[var(--border)] text-[var(--text-secondary)] hover:bg-[var(--badge-bg)]'
                      }`}
                    >
                      <span>● Same Day</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => setOffsetDirection('after')}
                      className={`py-2.5 px-2 rounded-xl font-bold text-[11px] border flex items-center justify-center gap-1.5 transition-all ${
                        offsetDirection === 'after'
                          ? 'bg-teal-50 border-teal-500 text-teal-950 ring-2 ring-teal-400/40 shadow-xs'
                          : 'bg-[var(--input-bg)] border-[var(--border)] text-[var(--text-secondary)] hover:bg-[var(--badge-bg)]'
                      }`}
                    >
                      <span>After Parent</span>
                      <ArrowRight className="w-3.5 h-3.5 text-teal-600 shrink-0" />
                    </button>
                  </div>
                </div>

                {/* Days Offset Stepper & Presets */}
                {offsetDirection !== 'same' && (
                  <div className="space-y-2.5 pt-2 border-t border-[var(--border-subtle)]">
                    <div className="flex items-center justify-between">
                      <label className="text-[11px] font-bold text-[var(--text-secondary)]">
                        {offsetDirection === 'before' ? 'Days Before Parent Target:' : 'Days After Parent Target:'}
                      </label>
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => setOffsetDaysQty(Math.max(1, offsetDaysQty - 1))}
                          className="w-7 h-7 rounded-lg bg-[var(--badge-bg)] border border-[var(--border)] font-bold text-[var(--text-secondary)] hover:bg-[var(--badge-bg)] flex items-center justify-center"
                        >
                          -
                        </button>
                        <input
                          type="number"
                          min="1"
                          max="365"
                          value={offsetDaysQty}
                          onChange={e => setOffsetDaysQty(Math.max(1, Number(e.target.value) || 1))}
                          className="w-16 h-8 text-center font-mono font-bold bg-[var(--input-bg)] border border-[var(--border)] rounded-lg text-xs"
                        />
                        <button
                          type="button"
                          onClick={() => setOffsetDaysQty(offsetDaysQty + 1)}
                          className="w-7 h-7 rounded-lg bg-[var(--badge-bg)] border border-[var(--border)] font-bold text-[var(--text-secondary)] hover:bg-[var(--badge-bg)] flex items-center justify-center"
                        >
                          +
                        </button>
                        <span className="text-xs font-bold text-[var(--text-muted)] ml-1">Days</span>
                      </div>
                    </div>

                    <div className="space-y-1">
                      <span className="text-[10px] uppercase font-bold text-[var(--text-muted)] block">Quick Offset Presets:</span>
                      <div className="grid grid-cols-6 gap-1.5">
                        {[1, 3, 7, 14, 21, 30].map(d => (
                          <button
                            key={d}
                            type="button"
                            onClick={() => setOffsetDaysQty(d)}
                            className={`py-1.5 rounded-lg text-[11px] font-bold border transition-all text-center ${
                              offsetDaysQty === d
                                ? 'bg-teal-600 text-white border-teal-600 shadow-xs'
                                : 'bg-[var(--card-bg)] text-[var(--text-secondary)] border-[var(--border)] hover:bg-[var(--badge-bg)]'
                            }`}
                          >
                            {d}d
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>
                )}

                {/* Resulting Milestone Target Date Preview */}
                <div className="p-3 bg-teal-500 text-white rounded-xl border border-teal-600 flex items-center justify-between shadow-xs">
                  <div>
                    <span className="text-[10px] font-bold uppercase tracking-wider text-teal-100 block">
                      Calculated Target Date
                    </span>
                    <span className="text-xs font-extrabold font-mono">
                      {calculatedTargetDate ? formatLocalDate(calculatedTargetDate, 'EEEE, MMMM d, yyyy') : 'Parent has no target date'}
                    </span>
                  </div>
                  <span className="text-xs font-mono font-extrabold bg-[var(--card-bg)] text-teal-900 px-3 py-1 rounded-lg shadow-2xs border border-white/20">
                    {offsetDirection === 'same' ? '0 Days' : `${offsetDirection === 'before' ? '-' : '+'}${offsetDaysQty} Days`}
                  </span>
                </div>
              </div>
            ) : dateMode === 'range' ? (
              /* MODE 2: DATE RANGE INPUT (Start Date -> Target End Date) via visual calendar */
              <div className="bg-[var(--card-bg)] p-4 rounded-2xl border border-indigo-200 space-y-3.5 shadow-2xs animate-in fade-in">
                {/* Start / End readout chips — click either to jump into the calendar */}
                <div className="grid grid-cols-2 gap-3 text-xs">
                  <button
                    type="button"
                    onClick={() => setShowRangeCalendar(true)}
                    className={`p-2.5 rounded-xl border-2 text-left transition-all ${!startDate || (startDate && !plannedDate) ? 'border-indigo-400 bg-indigo-50/80 ring-2 ring-indigo-200' : 'border-[var(--border)] bg-[var(--input-bg)] hover:border-indigo-300'}`}
                  >
                    <span className="block font-bold text-[var(--text-muted)] text-[10px] uppercase tracking-wide">Start Date</span>
                    <span className="font-mono font-extrabold text-indigo-950 text-xs">
                      {startDate ? formatLocalDate(new Date(startDate).toISOString(), 'MMM d, yyyy') : 'Tap a day →'}
                    </span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowRangeCalendar(true)}
                    className={`p-2.5 rounded-xl border-2 text-left transition-all ${startDate && !plannedDate ? 'border-indigo-400 bg-indigo-50/80 ring-2 ring-indigo-200' : 'border-[var(--border)] bg-[var(--input-bg)] hover:border-indigo-300'}`}
                  >
                    <span className="block font-bold text-[var(--text-muted)] text-[10px] uppercase tracking-wide">Target End Date</span>
                    <span className="font-mono font-extrabold text-indigo-950 text-xs">
                      {plannedDate ? formatLocalDate(new Date(plannedDate).toISOString(), 'MMM d, yyyy') : startDate ? 'Tap end day →' : '—'}
                    </span>
                  </button>
                </div>

                {/* Visual Range Calendar — collapses once both ends are picked to keep the form tidy */}
                {showRangeCalendar ? (
                  <InlineCalendar
                    mode="range"
                    rangeStart={startDate || null}
                    rangeEnd={plannedDate || null}
                    onSelectRange={(start, end) => {
                      setStartDate(start || '');
                      setPlannedDate(end || '');
                      if (start && end) setShowRangeCalendar(false);
                    }}
                    accentColor={parentResolvedColor}
                    maxDate={parentEffectiveDate ? new Date(parentEffectiveDate) : null}
                  />
                ) : (
                  <button
                    type="button"
                    onClick={() => setShowRangeCalendar(true)}
                    className="w-full py-2 rounded-xl border border-dashed border-indigo-300 text-indigo-700 text-[11px] font-bold hover:bg-indigo-50/60 transition-colors flex items-center justify-center gap-1.5"
                  >
                    <Calendar className="w-3.5 h-3.5" />
                    <span>Change Dates on Calendar</span>
                  </button>
                )}

                {/* Quick Add Duration Presets */}
                <div className="space-y-1.5 pt-1 border-t border-[var(--border-subtle)]">
                  <span className="text-[10px] uppercase font-bold text-[var(--text-muted)] block">Quick Duration Add (from Start Date):</span>
                  <div className="grid grid-cols-5 gap-1.5">
                    {[
                      { label: '+3 Days', days: 3 },
                      { label: '+7 Days', days: 7 },
                      { label: '+14 Days', days: 14 },
                      { label: '+30 Days', days: 30 },
                      { label: '+60 Days', days: 60 },
                    ].map(preset => (
                      <button
                        key={preset.days}
                        type="button"
                        onClick={() => {
                          const base = startDate ? new Date(startDate) : new Date();
                          if (!startDate) {
                            setStartDate(new Date().toISOString().substring(0, 10));
                          }
                          const target = addDays(base, preset.days);
                          setPlannedDate(target.toISOString().substring(0, 10));
                        }}
                        className="py-1.5 px-1 rounded-lg text-[11px] font-bold border border-indigo-200 bg-indigo-50/60 hover:bg-indigo-600 hover:text-white text-indigo-900 transition-all text-center"
                      >
                        {preset.label}
                      </button>
                    ))}
                  </div>
                </div>

                {startDate && plannedDate && new Date(startDate) <= new Date(plannedDate) && (
                  <div className="p-3 bg-indigo-50/90 rounded-xl border border-indigo-200 text-indigo-950 text-xs flex items-center justify-between font-medium">
                    <div className="flex items-center gap-2">
                      <Calendar className="w-4 h-4 text-indigo-600" />
                      <span>Range Span: <strong>{formatLocalDate(new Date(startDate).toISOString(), 'MMM d')}</strong> → <strong>{formatLocalDate(new Date(plannedDate).toISOString(), 'MMM d, yyyy')}</strong></span>
                    </div>
                    <span className="font-mono font-extrabold text-indigo-950 bg-[var(--card-bg)] px-2.5 py-1 rounded-md border border-indigo-200 shadow-2xs">
                      {Math.ceil((new Date(plannedDate).getTime() - new Date(startDate).getTime()) / (1000 * 60 * 60 * 24)) + 1} Days
                    </span>
                  </div>
                )}
              </div>
            ) : (
              /* MODE 3: SINGLE FIXED CALENDAR DATE INPUT — visual calendar picker */
              <div className="bg-[var(--card-bg)] p-4 rounded-2xl border border-[var(--border)] space-y-3 shadow-2xs animate-in fade-in">
                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <label className="block font-bold text-[var(--text-secondary)]">Fixed Target Date</label>
                    {plannedDate && (
                      <button
                        type="button"
                        onClick={() => setShowFixedCalendar(o => !o)}
                        className="text-[11px] font-bold text-[var(--accent)] hover:underline flex items-center gap-1"
                      >
                        {showFixedCalendar ? 'Hide Calendar' : 'Change'}
                      </button>
                    )}
                  </div>

                  {showFixedCalendar ? (
                    <InlineCalendar
                      mode="single"
                      selectedDate={plannedDate || null}
                      onSelectSingle={d => {
                        setPlannedDate(d);
                        setShowFixedCalendar(false);
                      }}
                      accentColor={parentResolvedColor}
                      maxDate={parentEffectiveDate ? new Date(parentEffectiveDate) : null}
                    />
                  ) : (
                    <button
                      type="button"
                      onClick={() => setShowFixedCalendar(true)}
                      className="w-full p-3 bg-[var(--badge-bg)] rounded-xl border border-[var(--border)] flex items-center justify-between hover:border-[var(--accent)]/40 transition-colors"
                    >
                      <span className="flex items-center gap-2">
                        <Calendar className="w-4 h-4" style={{ color: parentResolvedColor }} />
                        <span className="font-mono font-extrabold text-[var(--text-primary)] text-xs">
                          {plannedDate ? formatLocalDate(new Date(plannedDate).toISOString(), 'EEEE, MMM d, yyyy') : 'No date selected'}
                        </span>
                      </span>
                      <span className="text-[11px] font-bold text-[var(--accent)]">Tap to pick</span>
                    </button>
                  )}
                </div>

                {/* Quick Date Shortcuts */}
                <div className="space-y-1.5 pt-1 border-t border-[var(--border-subtle)]">
                  <span className="text-[10px] uppercase font-bold text-[var(--text-muted)] block">1-Click Date Shortcuts:</span>
                  <div className="grid grid-cols-3 sm:grid-cols-6 gap-1.5">
                    {[
                      { label: 'Today', days: 0 },
                      { label: 'Tomorrow', days: 1 },
                      { label: '+3 Days', days: 3 },
                      { label: '+7 Days', days: 7 },
                      { label: '+14 Days', days: 14 },
                      { label: '+30 Days', days: 30 },
                    ].map(s => (
                      <button
                        key={s.label}
                        type="button"
                        onClick={() => {
                          const target = addDays(new Date(), s.days);
                          setPlannedDate(target.toISOString().substring(0, 10));
                        }}
                        className="py-1.5 px-1 rounded-lg text-[11px] font-bold border border-[var(--border)] bg-[var(--input-bg)] hover:bg-teal-600 hover:text-white text-[var(--text-secondary)] transition-all text-center truncate"
                      >
                        {s.label}
                      </button>
                    ))}
                  </div>
                </div>

                {plannedDate && (
                  <div className="p-3 bg-slate-100 rounded-xl border border-[var(--border)] text-xs font-medium text-slate-800 flex items-center justify-between">
                    <span className="text-[var(--text-secondary)]">Scheduled Target Date:</span>
                    <span className="font-mono font-extrabold text-teal-800 bg-[var(--card-bg)] px-2.5 py-1 rounded-lg border border-[var(--border)] shadow-2xs">
                      {formatLocalDate(new Date(plannedDate).toISOString(), 'EEEE, MMMM d, yyyy')}
                    </span>
                  </div>
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
                  <div key={rem.id} className="bg-[var(--card-bg)] p-2.5 rounded-xl border border-amber-200 flex items-center justify-between text-xs shadow-2xs">
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
                <div className="bg-[var(--card-bg)] p-3.5 rounded-2xl border border-amber-300 space-y-3 animate-in fade-in shadow-2xs">
                  <label className="block text-[11px] font-bold text-[var(--text-secondary)]">When should alert trigger?</label>
                  
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
                            : 'bg-[var(--input-bg)] text-[var(--text-secondary)] border-[var(--border)] hover:bg-[var(--badge-bg)]'
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
                        className="w-16 h-8 text-center font-mono font-bold bg-[var(--input-bg)] border border-[var(--border)] rounded-lg text-xs"
                      />
                      <span className="text-xs text-[var(--text-secondary)] font-medium">days before target date</span>
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
                    className="w-full text-xs p-2.5 bg-[var(--input-bg)] border border-[var(--border)] rounded-xl outline-none focus:border-[var(--accent)] font-medium"
                  />
                </div>
              )}
            </div>
          </div>

          {/* ASSIGNEE & VENDOR DETAILS */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block font-bold text-[var(--text-secondary)] mb-1.5 flex items-center gap-1">
                <User className="w-3.5 h-3.5 text-[var(--text-muted)]" /> Assignee
              </label>
              <input
                type="text"
                value={assignee}
                onChange={e => setAssignee(e.target.value)}
                placeholder="e.g. Alex J. (alex@company.com)"
                className="w-full text-xs px-3 py-2 bg-[var(--input-bg)] border border-[var(--border)] rounded-xl outline-none focus:border-[var(--accent)]"
              />
            </div>

            <div>
              <label className="block font-bold text-[var(--text-secondary)] mb-1.5 flex items-center gap-1">
                <Tag className="w-3.5 h-3.5 text-[var(--text-muted)]" /> Vendor Contact
              </label>
              <input
                type="text"
                value={vendorContact}
                onChange={e => setVendorContact(e.target.value)}
                placeholder="e.g. Apache Footwear Tier 1"
                className="w-full text-xs px-3 py-2 bg-[var(--input-bg)] border border-[var(--border)] rounded-xl outline-none focus:border-[var(--accent)]"
              />
            </div>
          </div>

          {/* Description & Follow-up Notes */}
          <div>
            <label className="block font-bold text-[var(--text-secondary)] mb-1.5 flex items-center gap-1">
              <FileText className="w-3.5 h-3.5 text-[var(--text-muted)]" /> Notes & Follow-up Log
            </label>
            <textarea
              rows={2}
              value={description}
              onChange={e => setDescription(e.target.value)}
              placeholder="Milestone technical requirements, fit comments, vendor instructions..."
              className="w-full text-xs p-2.5 bg-[var(--input-bg)] border border-[var(--border)] rounded-xl outline-none focus:border-[var(--accent)] leading-relaxed"
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
          <div className="flex items-center justify-end gap-2 pt-2 border-t border-[var(--border-subtle)]">
            <button
              type="button"
              onClick={onClose}
              className="h-9 px-4 text-[var(--text-secondary)] font-semibold rounded-xl hover:bg-[var(--badge-bg)] transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting || Boolean(dateValidationError)}
              className={`h-9 px-5 font-bold rounded-xl shadow-xs transition-all flex items-center gap-1.5 ${
                dateValidationError
                  ? 'bg-[var(--badge-bg)] text-[var(--text-muted)] border border-[var(--border)] cursor-not-allowed'
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
