import React, { useMemo, useState } from 'react';
import {
  addMonths, subMonths, startOfMonth, endOfMonth, startOfWeek, endOfWeek,
  eachDayOfInterval, isSameDay, isSameMonth, isToday, format, parseISO, isValid,
} from 'date-fns';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { getReadableTextColor } from '../../lib/color-resolver';

export interface InlineCalendarProps {
  mode?: 'single' | 'range';
  selectedDate?: string | null; // 'yyyy-MM-dd' — single mode
  rangeStart?: string | null;   // 'yyyy-MM-dd' — range mode
  rangeEnd?: string | null;     // 'yyyy-MM-dd' — range mode
  onSelectSingle?: (dateStr: string) => void;
  onSelectRange?: (start: string | null, end: string | null) => void;
  minDate?: Date | null;
  maxDate?: Date | null;
  accentColor?: string;
  className?: string;
}

const toStr = (d: Date) => format(d, 'yyyy-MM-dd');

const safeParse = (s?: string | null): Date | null => {
  if (!s) return null;
  try {
    const d = s.length > 10 ? parseISO(s) : parseISO(`${s}T00:00:00`);
    return isValid(d) ? d : null;
  } catch {
    return null;
  }
};

export const InlineCalendar: React.FC<InlineCalendarProps> = ({
  mode = 'single',
  selectedDate = null,
  rangeStart = null,
  rangeEnd = null,
  onSelectSingle,
  onSelectRange,
  minDate = null,
  maxDate = null,
  accentColor = '#0EA5A0',
  className = '',
}) => {
  const anchorDate = safeParse(selectedDate) || safeParse(rangeStart) || safeParse(rangeEnd) || new Date();
  const [viewMonth, setViewMonth] = useState<Date>(startOfMonth(anchorDate));
  const [hoverDate, setHoverDate] = useState<string | null>(null);

  const days = useMemo(() => {
    const start = startOfWeek(startOfMonth(viewMonth));
    const end = endOfWeek(endOfMonth(viewMonth));
    return eachDayOfInterval({ start, end });
  }, [viewMonth]);

  const textOnAccent = getReadableTextColor(accentColor);

  const isDisabled = (d: Date) => {
    if (minDate && d < new Date(minDate.getFullYear(), minDate.getMonth(), minDate.getDate())) return true;
    if (maxDate && d > new Date(maxDate.getFullYear(), maxDate.getMonth(), maxDate.getDate())) return true;
    return false;
  };

  const handleClick = (d: Date) => {
    if (isDisabled(d)) return;
    const dateStr = toStr(d);
    if (mode === 'single') {
      onSelectSingle?.(dateStr);
      return;
    }
    if (!rangeStart || (rangeStart && rangeEnd)) {
      onSelectRange?.(dateStr, null);
    } else if (dateStr < rangeStart) {
      onSelectRange?.(dateStr, rangeStart);
    } else {
      onSelectRange?.(rangeStart, dateStr);
    }
  };

  const rangePreviewEnd = rangeStart && !rangeEnd && hoverDate ? (hoverDate < rangeStart ? rangeStart : hoverDate) : rangeEnd;
  const rangePreviewStart = rangeStart && !rangeEnd && hoverDate && hoverDate < rangeStart ? hoverDate : rangeStart;

  return (
    <div className={`bg-[var(--card-bg)] rounded-2xl border border-[var(--border)] p-3 shadow-2xs select-none ${className}`}>
      {/* Month navigation header */}
      <div className="flex items-center justify-between mb-2">
        <button
          type="button"
          onClick={() => setViewMonth(subMonths(viewMonth, 1))}
          className="p-1.5 rounded-lg text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--badge-bg)] transition-colors"
        >
          <ChevronLeft className="w-4 h-4" />
        </button>
        <div className="flex items-center gap-2">
          <span className="text-xs font-extrabold text-[var(--text-primary)] tracking-tight">
            {format(viewMonth, 'MMMM yyyy')}
          </span>
          <button
            type="button"
            onClick={() => setViewMonth(startOfMonth(new Date()))}
            className="text-[10px] font-bold px-1.5 py-0.5 rounded-md border border-[var(--border)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--badge-bg)] transition-colors"
          >
            Today
          </button>
        </div>
        <button
          type="button"
          onClick={() => setViewMonth(addMonths(viewMonth, 1))}
          className="p-1.5 rounded-lg text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--badge-bg)] transition-colors"
        >
          <ChevronRight className="w-4 h-4" />
        </button>
      </div>

      {/* Weekday header */}
      <div className="grid grid-cols-7 gap-0.5 mb-1">
        {['S', 'M', 'T', 'W', 'T', 'F', 'S'].map((wd, i) => (
          <div key={i} className="text-center text-[9px] font-extrabold uppercase text-[var(--text-muted)] py-1">
            {wd}
          </div>
        ))}
      </div>

      {/* Day grid */}
      <div className="grid grid-cols-7 gap-0.5">
        {days.map(d => {
          const dateStr = toStr(d);
          const inCurrentMonth = isSameMonth(d, viewMonth);
          const disabled = isDisabled(d);
          const today = isToday(d);

          const isSelected = mode === 'single'
            ? selectedDate === dateStr
            : dateStr === rangeStart || dateStr === rangeEnd;

          const isInRange = mode === 'range' && rangePreviewStart && rangePreviewEnd
            ? dateStr > rangePreviewStart && dateStr < rangePreviewEnd
            : false;

          const isRangeEndpoint = mode === 'range' && (dateStr === rangeStart || dateStr === rangeEnd);

          return (
            <button
              key={dateStr}
              type="button"
              disabled={disabled}
              onClick={() => handleClick(d)}
              onMouseEnter={() => setHoverDate(dateStr)}
              onMouseLeave={() => setHoverDate(null)}
              title={disabled ? 'Outside allowed date range' : format(d, 'EEEE, MMM d, yyyy')}
              style={
                isSelected || isRangeEndpoint
                  ? { backgroundColor: accentColor, color: textOnAccent }
                  : isInRange
                  ? { backgroundColor: `${accentColor}22`, color: 'var(--text-primary)' }
                  : undefined
              }
              className={`relative h-7 rounded-lg text-[11px] font-bold transition-all flex items-center justify-center
                ${disabled ? 'text-[var(--text-muted)]/40 cursor-not-allowed' : 'cursor-pointer hover:scale-105'}
                ${!isSelected && !isRangeEndpoint && !isInRange && !disabled ? (inCurrentMonth ? 'text-[var(--text-primary)] hover:bg-[var(--badge-bg)]' : 'text-[var(--text-muted)] hover:bg-[var(--badge-bg)]') : ''}
                ${today && !isSelected && !isRangeEndpoint ? 'ring-1 ring-[var(--accent)] ring-inset' : ''}
                ${(isSelected || isRangeEndpoint) ? 'shadow-xs scale-105 font-extrabold' : ''}
              `}
            >
              {format(d, 'd')}
            </button>
          );
        })}
      </div>
    </div>
  );
};
