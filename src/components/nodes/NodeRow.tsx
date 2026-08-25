import React, { useState } from 'react';
import { TreeNode, NodeType } from '../../types/domain';
import { useNodes } from '../../context/NodeContext';
import { StatusBadge } from '../shared/StatusBadge';
import { CriticalFlag } from '../shared/CriticalFlag';
import { formatLocalDate, getRelativeDateBadge } from '../../utils/date-format';
import { NodeForm } from './NodeForm';
import { ChevronRight, ChevronDown, Plus, Folder, Calendar, CheckSquare, Layers, Clock, Check } from 'lucide-react';

interface NodeRowProps {
  node: TreeNode;
  onSelectNode: (node: TreeNode) => void;
}

const TYPE_ICONS: Record<NodeType, React.ReactNode> = {
  department: <Layers className="w-4 h-4 text-blue-600" />,
  season: <Folder className="w-4 h-4 text-indigo-500" />,
  project: <Calendar className="w-4 h-4 text-teal-600" />,
  task: <CheckSquare className="w-4 h-4 text-gray-600" />,
  subtask: <Clock className="w-4 h-4 text-gray-400" />,
  reminder: <Clock className="w-4 h-4 text-amber-500" />,
};

export const NodeRow: React.FC<NodeRowProps> = ({ node, onSelectNode }) => {
  const { toggleCritical, updateStatus, toggleDone } = useNodes();
  const [isExpanded, setIsExpanded] = useState(false);
  const [showAddChild, setShowAddChild] = useState(false);

  const hasChildren = node.children && node.children.length > 0;

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

  return (
    <div className="space-y-1">
      <div
        onClick={() => onSelectNode(node)}
        style={{ paddingLeft: `${node.depth * 20 + 12}px` }}
        className={`group relative flex items-center justify-between py-2.5 pr-3 rounded-xl border border-gray-200/80 bg-white hover:bg-gray-50/80 transition-all cursor-pointer shadow-2xs ${
          node.is_overdue ? 'ring-1 ring-rose-300 border-rose-200' : ''
        } ${isCompleted ? 'opacity-70 bg-gray-50/60' : ''}`}
      >
        <span
          className="absolute left-0 top-2 bottom-2 w-1 rounded-r-full shadow-2xs"
          style={{ backgroundColor: node.effective_color }}
        />

        <div className="flex items-center gap-2.5 min-w-0 pr-2">
          {/* Chevron expander */}
          {hasChildren ? (
            <button
              type="button"
              onClick={e => {
                e.stopPropagation();
                setIsExpanded(!isExpanded);
              }}
              className="p-1 rounded-md text-gray-400 hover:text-gray-700 hover:bg-gray-200/60 transition-colors"
            >
              {isExpanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
            </button>
          ) : (
            <span className="w-6" />
          )}

          {/* Quick 1-click Completion Checkbox */}
          <button
            type="button"
            onClick={e => {
              e.stopPropagation();
              toggleDone(node.id);
            }}
            title={isCompleted ? 'Mark incomplete' : 'Mark complete'}
            className={`w-4 h-4 rounded border flex items-center justify-center transition-colors shrink-0 ${
              isCompleted
                ? 'bg-emerald-600 border-emerald-600 text-white'
                : 'border-gray-300 hover:border-teal-500 bg-white'
            }`}
          >
            {isCompleted && <Check className="w-3 h-3 stroke-[3]" />}
          </button>

          {/* Type Icon */}
          <span className="shrink-0">{TYPE_ICONS[node.type] || TYPE_ICONS.task}</span>

          {/* Title */}
          <span className={`font-semibold text-xs md:text-sm truncate ${
            isCompleted ? 'line-through text-gray-400 font-normal' : 'text-gray-900'
          }`}>
            {node.title}
          </span>

          {/* Critical Flag */}
          <CriticalFlag
            isCritical={node.is_critical}
            onToggle={() => toggleCritical(node.id)}
            interactive
            size="sm"
          />

          {/* Progress bar pill */}
          {percentDone !== null && (
            <div className="hidden sm:flex items-center gap-1.5 px-2 py-0.5 bg-gray-100 rounded-full text-[10px] font-mono text-gray-600 border border-gray-200">
              <div className="w-12 h-1.5 bg-gray-200 rounded-full overflow-hidden">
                <div
                  className="h-full bg-teal-500 rounded-full"
                  style={{ width: `${percentDone}%` }}
                />
              </div>
              <span>{percentDone}%</span>
            </div>
          )}
        </div>

        {/* Right metadata & controls */}
        <div className="flex items-center gap-2 shrink-0">
          {node.planned_date && (
            <span
              className={`text-[11px] font-mono font-medium px-2 py-0.5 rounded-md border ${
                dateBadge.isOverdue && !isCompleted
                  ? 'bg-rose-50 text-rose-700 border-rose-200 font-bold'
                  : dateBadge.isToday && !isCompleted
                  ? 'bg-amber-50 text-amber-800 border-amber-200 font-bold'
                  : 'bg-gray-50 text-gray-600 border-gray-200'
              }`}
            >
              {formatLocalDate(node.planned_date, 'MMM d')}
            </span>
          )}

          <StatusBadge status={node.status} onChange={s => updateStatus(node.id, s)} size="sm" />

          <button
            type="button"
            onClick={e => {
              e.stopPropagation();
              setShowAddChild(true);
            }}
            title={`Add item under ${node.title}`}
            className="opacity-0 group-hover:opacity-100 transition-opacity p-1 text-teal-700 hover:bg-teal-50 rounded-md border border-teal-200 text-[11px] font-semibold flex items-center gap-0.5"
          >
            <Plus className="w-3.5 h-3.5" />
            <span className="hidden md:inline">Add</span>
          </button>
        </div>
      </div>

      {isExpanded && hasChildren && (
        <div className="space-y-1 pl-2 border-l border-gray-200/80 ml-4 pt-1">
          {node.children.map(child => (
            <NodeRow key={child.id} node={child} onSelectNode={onSelectNode} />
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
    </div>
  );
};
