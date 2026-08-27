import React, { useState } from 'react';
import { TreeNode, NodeType, NodeItem } from '../../types/domain';
import { useNodes } from '../../context/NodeContext';
import { StatusBadge } from '../shared/StatusBadge';
import { CriticalFlag } from '../shared/CriticalFlag';
import { formatLocalDate, getRelativeDateBadge } from '../../utils/date-format';
import { NodeForm } from './NodeForm';
import { useToast } from '../../context/ToastContext';
import { SubtreeCompletionModal } from './SubtreeCompletionModal';
import { 
  ChevronRight, ChevronDown, Plus, Folder, Calendar, CheckSquare, 
  Layers, Clock, Check, Lock, Edit3, Trash2, Bell, Building2, FolderKanban, Box, Zap, CornerDownRight
} from 'lucide-react';

interface NodeRowProps {
  node: TreeNode;
  onSelectNode: (node: TreeNode) => void;
  selectMode?: boolean;
  selectedIds?: Set<string>;
  onToggleSelect?: (nodeId: string) => void;
}

const getNodeIcon = (type: NodeType): React.ReactNode => {
  switch (type) {
    case 'department': return <Building2 className="w-4 h-4" />;
    case 'season': return <FolderKanban className="w-4 h-4" />;
    case 'project': return <Box className="w-4 h-4" />;
    case 'task': return <Zap className="w-4 h-4" />;
    case 'subtask': return <CornerDownRight className="w-4 h-4" />;
    case 'reminder': return <Bell className="w-4 h-4" />;
    default: return <Zap className="w-4 h-4" />;
  }
};

export const NodeRow: React.FC<NodeRowProps> = ({ node, onSelectNode, selectMode = false, selectedIds, onToggleSelect }) => {
  const { 
    reminders, toggleCritical, updateStatus, toggleDone, deleteNode, 
    getNodeAccessInfo, getDescendantNodes, completeNodeAndSubtree,
    hideNodeLocally, restoreNodesLocally,
  } = useNodes();
  const toast = useToast();
  
  // Collapse tree hierarchy by default
  const [isExpanded, setIsExpanded] = useState(false);
  const [showAddChild, setShowAddChild] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [showCompletionModal, setShowCompletionModal] = useState(false);

  const hasChildren = node.children && node.children.length > 0;
  const accessInfo = getNodeAccessInfo(node.id);
  const isEditable = accessInfo.isEditable;

  const countAllSubtasks = (n: TreeNode): { total: number; done: number } => {
    let total = 0;
    let done = 0;
    if (n.children) {
      for (const c of n.children) {
        total++;
        if (c.status === 'done') done++;
        const sub = countAllSubtasks(c);
        total += sub.total;
        done += sub.done;
      }
    }
    return { total, done };
  };

  const { total, done } = countAllSubtasks(node);
  const percentDone = total > 0 ? Math.round((done / total) * 100) : null;
  const dateBadge = getRelativeDateBadge(node.planned_date);

  const isCompleted = node.status === 'done';
  const descendants = getDescendantNodes(node.id);
  const pendingDescendants = descendants.filter(d => d.status !== 'done');
  const activeNodeReminders = reminders.filter(r => r.node_id === node.id && !r.dismissed_at);

  const handleCheckboxClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!isCompleted && pendingDescendants.length > 0) {
      setShowCompletionModal(true);
    } else {
      toggleDone(node.id);
    }
  };

  const handleConfirmCascadeCompletion = () => {
    completeNodeAndSubtree(node.id);
    setShowCompletionModal(false);
  };

  return (
    <div className="space-y-1">
      <div
        onClick={() => (selectMode ? onToggleSelect?.(node.id) : onSelectNode(node))}
        style={{ paddingLeft: `${node.depth * 20 + 12}px` }}
        className={`group relative flex items-center justify-between py-2.5 pr-3 rounded-xl border border-[var(--border)] bg-[var(--card-bg)] hover:bg-[var(--canvas-bg)] transition-all cursor-pointer shadow-2xs ${
          node.is_overdue ? 'ring-1 ring-rose-300 border-rose-200' : ''
        } ${isCompleted ? 'opacity-70 bg-[var(--canvas-bg)]' : ''}`}
      >
        <span
          className="absolute left-0 top-2 bottom-2 w-1 rounded-r-full shadow-2xs"
          style={{ backgroundColor: node.effective_color }}
        />

        <div className="flex items-center gap-2.5 min-w-0 pr-2">
          {/* Bulk-select checkbox */}
          {selectMode && (
            <button
              type="button"
              onClick={e => {
                e.stopPropagation();
                onToggleSelect?.(node.id);
              }}
              className={`w-4 h-4 rounded border flex items-center justify-center transition-colors shrink-0 ${
                selectedIds?.has(node.id)
                  ? 'bg-[var(--accent)] border-[var(--accent)] text-white'
                  : 'border-[var(--input-border)] hover:border-[var(--accent)] bg-[var(--card-bg)]'
              }`}
            >
              {selectedIds?.has(node.id) && <Check className="w-3 h-3 stroke-[3]" />}
            </button>
          )}

          {/* Chevron expander */}
          {hasChildren ? (
            <button
              type="button"
              onClick={e => {
                e.stopPropagation();
                setIsExpanded(!isExpanded);
              }}
              className="p-1 rounded-md text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--border-subtle)] transition-colors"
            >
              {isExpanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
            </button>
          ) : (
            <span className="w-6" />
          )}

          {/* Quick 1-click Completion Checkbox (With Subtree Cascade) */}
          {isEditable ? (
            <button
              type="button"
              onClick={handleCheckboxClick}
              title={isCompleted ? 'Mark incomplete' : 'Mark complete (and cascade to subtasks)'}
              className={`w-4 h-4 rounded border flex items-center justify-center transition-colors shrink-0 ${
                isCompleted
                  ? 'bg-emerald-600 border-emerald-600 text-white'
                  : 'border-[var(--input-border)] hover:border-[var(--accent)] bg-[var(--card-bg)]'
              }`}
            >
              {isCompleted && <Check className="w-3 h-3 stroke-[3]" />}
            </button>
          ) : (
            <span className="w-4 h-4 flex items-center justify-center shrink-0" title={accessInfo.tooltipText}>
              <Lock className="w-3.5 h-3.5 text-[var(--text-muted)]" />
            </span>
          )}

          {/* Type Icon & Level Depth Badge (Dynamically tinted with node's level gradient color) */}
          <div className="flex items-center gap-1 shrink-0">
            <span className="transition-colors" style={{ color: node.effective_color }}>
              {getNodeIcon(node.type)}
            </span>
            <span 
              style={{
                backgroundColor: `${node.effective_color}15`,
                color: node.effective_color,
                borderColor: `${node.effective_color}40`,
              }}
              className="text-[9px] font-mono font-extrabold px-1 rounded border shadow-2xs"
            >
              L{node.depth + 1}
            </span>
          </div>

          {/* Title */}
          <span className={`font-semibold text-xs md:text-sm truncate ${
            isCompleted ? 'line-through text-[var(--text-muted)] font-normal' : 'text-[var(--text-primary)]'
          }`}>
            {node.title}
          </span>

          {/* Critical Flag */}
          <CriticalFlag
            isCritical={node.is_critical}
            onToggle={isEditable ? () => toggleCritical(node.id) : undefined}
            interactive={isEditable}
            size="sm"
          />

          {/* Active Alert Badge inheriting node color */}
          {activeNodeReminders.length > 0 && (
            <span 
              title={`Alert Scheduled: ${activeNodeReminders.map(r => r.message).join(' | ')}`}
              style={{
                backgroundColor: `${node.effective_color}18`,
                borderColor: `${node.effective_color}60`,
                color: node.effective_color,
              }}
              className="px-1.5 py-0.5 rounded-md border text-[10px] font-bold flex items-center gap-0.5 shadow-2xs shrink-0"
            >
              <Bell className="w-3 h-3" />
              <span>{activeNodeReminders.length}</span>
            </span>
          )}

          {/* Progress bar pill */}
          {percentDone !== null && (
            <div className="hidden sm:flex items-center gap-1.5 px-2 py-0.5 bg-[var(--canvas-bg)] rounded-full text-[10px] font-mono text-[var(--text-secondary)] border border-[var(--border)]">
              <div className="w-12 h-1.5 bg-[var(--border-subtle)] rounded-full overflow-hidden">
                <div
                  className="h-full bg-[var(--accent)] rounded-full"
                  style={{ width: `${percentDone}%` }}
                />
              </div>
              <span>{percentDone}%</span>
            </div>
          )}
        </div>

        {/* Right metadata & Action Controls */}
        <div className="flex items-center gap-2 shrink-0">
          {node.planned_date && (
            <span
              className={`text-[11px] font-mono font-medium px-2 py-0.5 rounded-md border ${
                dateBadge.isOverdue && !isCompleted
                  ? 'bg-rose-50 text-rose-700 border-rose-200 font-bold'
                  : dateBadge.isToday && !isCompleted
                  ? 'bg-amber-50 text-amber-800 border-amber-200 font-bold'
                  : 'bg-[var(--badge-bg)] text-[var(--text-secondary)] border-[var(--border)]'
              }`}
            >
              {formatLocalDate(node.planned_date, 'MMM d')}
            </span>
          )}

          <StatusBadge 
            status={node.status} 
            onChange={isEditable ? s => {
              if (s === 'done' && pendingDescendants.length > 0) {
                setShowCompletionModal(true);
              } else {
                updateStatus(node.id, s);
              }
            } : undefined} 
            size="sm" 
          />

          {/* Editable Actions: Add Sub-task, Edit, Delete */}
          {isEditable && (
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={e => {
                  e.stopPropagation();
                  setShowAddChild(true);
                }}
                title={`Add sub-task under "${node.title}"`}
                className="p-1 text-[var(--accent)] bg-[var(--accent-subtle)] hover:bg-[var(--accent-subtle)] rounded-lg border border-[var(--accent)]/20 text-[11px] font-bold flex items-center gap-0.5 shadow-2xs"
              >
                <Plus className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">Sub-task</span>
              </button>

              <button
                type="button"
                onClick={e => {
                  e.stopPropagation();
                  setIsEditing(true);
                }}
                title="Edit Milestone Details"
                className="p-1 text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--canvas-bg)] rounded-lg border border-[var(--border)]"
              >
                <Edit3 className="w-3.5 h-3.5" />
              </button>

              <button
                type="button"
                onClick={e => {
                  e.stopPropagation();
                  const removed = hideNodeLocally(node.id);
                  toast.undoable({
                    message: `"${node.title}" deleted${hasChildren ? ' (with its subtasks)' : ''}.`,
                    onCommit: () => deleteNode(node.id),
                    onUndo: () => restoreNodesLocally(removed),
                  });
                }}
                title="Delete Milestone"
                className="p-1 text-rose-500 hover:text-rose-700 hover:bg-rose-50 rounded-lg border border-rose-200"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </div>
          )}
        </div>
      </div>

      {isExpanded && hasChildren && (
        <div className="space-y-1 pl-2 border-l border-[var(--border)] ml-4 pt-1">
          {node.children.map(child => (
            <NodeRow
              key={child.id}
              node={child}
              onSelectNode={onSelectNode}
              selectMode={selectMode}
              selectedIds={selectedIds}
              onToggleSelect={onToggleSelect}
            />
          ))}
        </div>
      )}

      {showAddChild && (
        <NodeForm
          parentId={node.id}
          parentType={node.type}
          parentDate={node.planned_date}
          onClose={() => setShowAddChild(false)}
        />
      )}

      {isEditing && (
        <NodeForm
          initialNode={node}
          parentId={node.parent_id}
          onClose={() => setIsEditing(false)}
        />
      )}

      {/* SUBTREE COMPLETION CONFIRMATION MODAL */}
      {showCompletionModal && (
        <SubtreeCompletionModal
          parentTitle={node.title}
          descendantNodes={descendants}
          onConfirm={handleConfirmCascadeCompletion}
          onCancel={() => setShowCompletionModal(false)}
        />
      )}
    </div>
  );
};
