import React from 'react';
import { NodeItem } from '../../types/domain';
import { CheckCircle2, AlertCircle, X, Check } from 'lucide-react';

interface SubtreeCompletionModalProps {
  parentTitle: string;
  descendantNodes: NodeItem[];
  onConfirm: () => void;
  onCancel: () => void;
}

export const SubtreeCompletionModal: React.FC<SubtreeCompletionModalProps> = ({
  parentTitle,
  descendantNodes,
  onConfirm,
  onCancel,
}) => {
  const pendingSubtasks = descendantNodes.filter(n => n.status !== 'done');

  return (
    <div className="fixed inset-0 bg-slate-950/60 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-in fade-in">
      <div className="bg-white rounded-3xl p-6 max-w-md w-full shadow-2xl border border-gray-200 space-y-4">
        
        {/* Header */}
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-2xl bg-emerald-500/10 text-emerald-600 flex items-center justify-center border border-emerald-500/20 shrink-0">
            <CheckCircle2 className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-base font-bold text-gray-900">Mark Milestone & Subtasks Completed?</h2>
            <p className="text-xs text-gray-500">Cascade completion to all child milestones.</p>
          </div>
        </div>

        {/* Message */}
        <div className="bg-emerald-50/70 p-3.5 rounded-2xl border border-emerald-200 text-xs text-emerald-900 space-y-2">
          <p className="font-semibold">
            Marking <strong>"{parentTitle}"</strong> as completed will also mark the following <strong>{pendingSubtasks.length}</strong> subtasks as completed:
          </p>

          <div className="max-h-36 overflow-y-auto space-y-1 pr-1">
            {pendingSubtasks.map(child => (
              <div key={child.id} className="flex items-center gap-2 bg-white/80 px-2.5 py-1.5 rounded-xl border border-emerald-200/80 text-[11px]">
                <Check className="w-3 h-3 text-emerald-600 shrink-0 stroke-[3]" />
                <span className="font-bold text-gray-800 truncate">{child.title}</span>
                <span className="text-[10px] text-gray-400 font-mono ml-auto shrink-0">{child.type}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Buttons */}
        <div className="flex items-center justify-end gap-2 pt-2 border-t border-gray-100">
          <button
            type="button"
            onClick={onCancel}
            className="h-9 px-4 text-gray-600 font-semibold rounded-xl hover:bg-gray-100 text-xs"
          >
            Cancel
          </button>
          
          <button
            type="button"
            onClick={onConfirm}
            className="h-9 px-4 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-xl shadow-xs text-xs flex items-center gap-1.5"
          >
            <Check className="w-3.5 h-3.5 stroke-[3]" />
            <span>Complete All {pendingSubtasks.length + 1} Tasks</span>
          </button>
        </div>
      </div>
    </div>
  );
};
