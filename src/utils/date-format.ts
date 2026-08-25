import { format, parseISO, isValid, differenceInDays } from 'date-fns';

/**
 * Formats ISO date string to user's local timezone readable date
 */
export function formatLocalDate(isoString: string | null | undefined, pattern: string = 'MMM d, yyyy'): string {
  if (!isoString) return 'No date';
  try {
    const date = parseISO(isoString);
    if (!isValid(date)) return 'Invalid date';
    return format(date, pattern);
  } catch {
    return 'Invalid date';
  }
}

/**
 * Formats time (e.g. 2:30 PM) in local timezone
 */
export function formatLocalTime(isoString: string | null | undefined): string {
  if (!isoString) return '';
  try {
    const date = parseISO(isoString);
    if (!isValid(date)) return '';
    return format(date, 'h:mm a');
  } catch {
    return '';
  }
}

/**
 * Returns human friendly relative description (e.g. "Overdue by 3 days", "Due in 2 days", "Today")
 */
export function getRelativeDateBadge(isoString: string | null | undefined): { label: string; isOverdue: boolean; isToday: boolean } {
  if (!isoString) return { label: 'No date', isOverdue: false, isToday: false };
  try {
    const date = parseISO(isoString);
    if (!isValid(date)) return { label: 'Invalid', isOverdue: false, isToday: false };

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const target = new Date(date);
    target.setHours(0, 0, 0, 0);

    const diff = differenceInDays(target, today);

    if (diff < 0) {
      return { label: `Overdue by ${Math.abs(diff)}d`, isOverdue: true, isToday: false };
    } else if (diff === 0) {
      return { label: 'Due Today', isOverdue: false, isToday: true };
    } else if (diff === 1) {
      return { label: 'Tomorrow', isOverdue: false, isToday: false };
    } else {
      return { label: `In ${diff} days`, isOverdue: false, isToday: false };
    }
  } catch {
    return { label: 'Invalid', isOverdue: false, isToday: false };
  }
}
