import { addDays, addWeeks, addMonths, parseISO, formatISO } from 'date-fns';

export type RecurrenceRule = 'daily' | 'weekly' | 'monthly';

export const RECURRENCE_OPTIONS: { value: RecurrenceRule; label: string }[] = [
  { value: 'daily', label: 'Daily' },
  { value: 'weekly', label: 'Weekly' },
  { value: 'monthly', label: 'Monthly' },
];

export function recurrenceLabel(rule?: string | null): string | null {
  const found = RECURRENCE_OPTIONS.find(o => o.value === rule);
  return found ? found.label : null;
}

/**
 * Given a reminder's current trigger time and its recurrence rule, returns the
 * ISO timestamp of the next occurrence. Used to "reset" a recurring reminder
 * to a fresh future trigger instead of permanently dismissing it.
 */
export function computeNextOccurrence(currentRemindAt: string, rule: string | null | undefined): string | null {
  if (!rule) return null;
  try {
    const base = parseISO(currentRemindAt);
    let next: Date;
    switch (rule) {
      case 'daily':
        next = addDays(base, 1);
        break;
      case 'weekly':
        next = addWeeks(base, 1);
        break;
      case 'monthly':
        next = addMonths(base, 1);
        break;
      default:
        return null;
    }

    // If the naive next occurrence is already in the past (e.g. the reminder
    // was dismissed long after it originally fired), fast-forward from "now"
    // instead, so recurring alerts don't fire on every app load in a burst.
    const now = new Date();
    while (next.getTime() < now.getTime()) {
      if (rule === 'daily') next = addDays(next, 1);
      else if (rule === 'weekly') next = addWeeks(next, 1);
      else if (rule === 'monthly') next = addMonths(next, 1);
      else break;
    }

    return formatISO(next);
  } catch {
    return null;
  }
}
