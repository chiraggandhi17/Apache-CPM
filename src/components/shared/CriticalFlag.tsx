import React from 'react';
import { AlertCircle } from 'lucide-react';

interface CriticalFlagProps {
  isCritical: boolean;
  onToggle?: () => void;
  size?: 'sm' | 'md';
  interactive?: boolean;
}

export const CriticalFlag: React.FC<CriticalFlagProps> = ({
  isCritical,
  onToggle,
  size = 'sm',
  interactive = false,
}) => {
  if (!isCritical && !interactive) return null;

  return (
    <button
      type="button"
      onClick={e => {
        if (interactive && onToggle) {
          e.stopPropagation();
          onToggle();
        }
      }}
      disabled={!interactive}
      title={isCritical ? 'Critical Path Item (Manual Flag)' : 'Toggle Critical Flag'}
      className={`inline-flex items-center gap-1 font-semibold rounded-md transition-colors ${
        isCritical
          ? 'bg-amber-100 text-amber-800 border border-amber-300 px-1.5 py-0.5'
          : 'bg-gray-100 text-gray-400 hover:text-amber-700 hover:bg-amber-50 px-1.5 py-0.5'
      } ${size === 'sm' ? 'text-[10px]' : 'text-xs'}`}
    >
      <AlertCircle className={size === 'sm' ? 'w-3 h-3 text-amber-600' : 'w-3.5 h-3.5 text-amber-600'} />
      {isCritical ? 'CRITICAL' : 'Flag Critical'}
    </button>
  );
};
