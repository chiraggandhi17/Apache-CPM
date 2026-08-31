import React, { useState } from 'react';
import { MoveConflictItem, MovePreview } from '../../context/NodeContext';
import { formatLocalDate } from '../../utils/date-format';
import { Move, AlertTriangle, X, Check, Calendar } from 'lucide-react';

interface MoveConflictModalProps {
  preview: MovePreview;
  onConfirm: (dateOverrides: Record<string, string>) => void;
  onCancel: () => void;
}

/**
 * Shown after a drag-and-drop reparent whenever previewMove() found the move
 * valid. If it also found date conflicts (a moved/descendant target date now
 * falls after its new nearest ancestor's target date), each one gets an inline
 * date field so the user can fix it right here before the move is applied —
 * "Confirm Move" stays disabled until every conflict is resolved.
 */
export const MoveConflictModal: React.FC<MoveConflictModalProps> = ({ preview, onConfirm, onCancel }) => {
  const [overrides, setOverrides] = useState<Record<string, string>>({});
  const hasConflicts = preview.conflicts.length > 0;

  const resolvedCount = preview.conflicts.filter(c => {
    const fixed = overrides[c.nodeId];
    return fixed && new Date(fixed) <= new Date(c.limitDate);
  }).length;
  const allResolved = resolvedCount === preview.conflicts.length;

  return (
    <div className="fixed inset-0 bg-slate-950/60 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-in fade-in">
      <div className="bg-[var(--card-bg)] rounded-3xl p-6 max-w-lg w-full shadow-2xl border border-[var(--border)] space-y-4">

        {/* Header */}
        <div className="flex items-center gap-3">
          <div className={`w-10 h-10 rounded-2xl flex items-center justify-center border shrink-0 ${
            hasConflicts ? 'bg-amber-500/10 text-amber-600 border-amber-500/20' : 'bg-indigo-500/10 text-indigo-600 border-indigo-500/20'
          }`}>
            {hasConflicts ? <AlertTriangle className="w-5 h-5" /> : <Move className="w-5 h-5" />}
          </div>
          <div>
            <h2 className="text-base font-bold text-[var(--text-primary)]">Move "{preview.nodeTitle}"?</h2>
            <p className="text-xs text-[var(--text-muted)]">
              Moving under <strong className="text-[var(--text-secondary)]">"{preview.newParentTitle}"</strong>
              {preview.affectedCount > 1 ? ` — ${preview.affectedCount} tasks affected (with its subtasks).` : '.'}
            </p>
          </div>
        </div>

        {hasConflicts ? (
          <div className="bg-amber-50/70 p-3.5 rounded-2xl border border-amber-200 text-xs text-amber-900 space-y-2.5">
            <p className="font-semibold">
              {preview.conflicts.length} date{preview.conflicts.length === 1 ? '' : 's'} would now fall after the new parent milestone's target date. Fix {preview.conflicts.length === 1 ? 'it' : 'them'} below to continue:
            </p>

            <div className="max-h-64 overflow-y-auto space-y-2 pr-1">
              {preview.conflicts.map(c => {
                const fixed = overrides[c.nodeId];
                const isResolved = Boolean(fixed && new Date(fixed) <= new Date(c.limitDate));
                return (
                  <div key={c.nodeId} className={`p-2.5 rounded-xl border text-[11px] space-y-1.5 ${
                    isResolved ? 'bg-emerald-50/80 border-emerald-200' : 'bg-[var(--card-bg)] border-amber-200'
                  }`}>
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-bold text-[var(--text-primary)] truncate">{c.title}</span>
                      {isResolved && <Check className="w-3.5 h-3.5 text-emerald-600 shrink-0 stroke-[3]" />}
                    </div>
                    <div className="flex items-center justify-between gap-2 text-[10px] text-[var(--text-muted)] font-mono">
                      <span>Was: {formatLocalDate(c.currentDate, 'MMM d, yyyy')}</span>
                      <span>Limit: {formatLocalDate(c.limitDate, 'MMM d, yyyy')}</span>
                    </div>
                    <label className="flex items-center gap-1.5">
                      <Calendar className="w-3 h-3 text-amber-600 shrink-0" />
                      <input
                        type="date"
                        max={c.limitDate.slice(0, 10)}
                        value={fixed ? fixed.slice(0, 10) : ''}
                        onChange={e => setOverrides(prev => ({ ...prev, [c.nodeId]: e.target.value }))}
                        className="flex-1 px-2 py-1 bg-[var(--input-bg)] border border-[var(--input-border)] rounded-lg outline-none focus:border-[var(--input-focus-border)] font-mono text-[11px]"
                      />
                    </label>
                  </div>
                );
              })}
            </div>
          </div>
        ) : (
          <div className="bg-indigo-50/70 p-3.5 rounded-2xl border border-indigo-200 text-xs text-indigo-900">
            No date conflicts — every affected date still fits within its new parent's target date.
          </div>
        )}

        {/* Buttons */}
        <div className="flex items-center justify-end gap-2 pt-2 border-t border-[var(--border-subtle)]">
          <button
            type="button"
            onClick={onCancel}
            className="h-9 px-4 text-[var(--text-secondary)] font-semibold rounded-xl hover:bg-[var(--badge-bg)] text-xs"
          >
            Cancel
          </button>

          <button
            type="button"
            disabled={hasConflicts && !allResolved}
            onClick={() => onConfirm(overrides)}
            className={`h-9 px-4 font-bold rounded-xl shadow-xs text-xs flex items-center gap-1.5 transition-all ${
              hasConflicts && !allResolved
                ? 'bg-[var(--badge-bg)] text-[var(--text-muted)] border border-[var(--border)] cursor-not-allowed'
                : 'bg-indigo-600 hover:bg-indigo-700 text-white'
            }`}
          >
            <Move className="w-3.5 h-3.5" />
            <span>Confirm Move</span>
          </button>
        </div>
      </div>
    </div>
  );
};
