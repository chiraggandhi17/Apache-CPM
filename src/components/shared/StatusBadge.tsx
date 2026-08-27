import React from 'react';
import { NodeStatus } from '../../types/domain';
import { CheckCircle2, Clock, AlertTriangle, PlayCircle } from 'lucide-react';

interface StatusBadgeProps {
  status: NodeStatus;
  onChange?: (newStatus: NodeStatus) => void;
  size?: 'sm' | 'md';
}

const CONFIG: Record<NodeStatus, { label: string; bg: string; text: string; border: string; icon: React.ReactNode }> = {
  not_started: {
    label: 'Not Started',
    bg: 'bg-[var(--badge-bg)]',
    text: 'text-[var(--text-secondary)]',
    border: 'border-[var(--border)]',
    icon: <Clock className="w-3 h-3 text-[var(--text-muted)]" />,
  },
  in_progress: {
    label: 'In Progress',
    bg: 'bg-blue-50',
    text: 'text-blue-700',
    border: 'border-blue-200',
    icon: <PlayCircle className="w-3 h-3 text-blue-600" />,
  },
  done: {
    label: 'Done',
    bg: 'bg-emerald-50',
    text: 'text-emerald-700',
    border: 'border-emerald-200',
    icon: <CheckCircle2 className="w-3 h-3 text-emerald-600" />,
  },
  blocked: {
    label: 'Blocked',
    bg: 'bg-rose-50',
    text: 'text-rose-700',
    border: 'border-rose-200',
    icon: <AlertTriangle className="w-3 h-3 text-rose-600" />,
  },
};

export const StatusBadge: React.FC<StatusBadgeProps> = ({ status, onChange, size = 'sm' }) => {
  const cfg = CONFIG[status] || CONFIG.not_started;

  if (onChange) {
    return (
      <select
        value={status}
        onChange={e => onChange(e.target.value as NodeStatus)}
        onClick={e => e.stopPropagation()}
        className={`font-medium rounded-md border shadow-2xs cursor-pointer focus:ring-1 focus:ring-teal-500 ${cfg.bg} ${cfg.text} ${cfg.border} ${
          size === 'sm' ? 'text-[11px] px-2 py-0.5' : 'text-xs px-2.5 py-1'
        }`}
      >
        <option value="not_started">Not Started</option>
        <option value="in_progress">In Progress</option>
        <option value="done">Done</option>
        <option value="blocked">Blocked</option>
      </select>
    );
  }

  return (
    <span
      className={`inline-flex items-center gap-1.5 font-medium rounded-md border ${cfg.bg} ${cfg.text} ${cfg.border} ${
        size === 'sm' ? 'text-[11px] px-2 py-0.5' : 'text-xs px-2.5 py-1'
      }`}
    >
      {cfg.icon}
      {cfg.label}
    </span>
  );
};
