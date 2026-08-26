import { describe, it, expect } from 'vitest';
import { addDays, formatISO, parseISO, isValid } from 'date-fns';

export function calculateReminderTriggerDate(
  targetDateISO: string | null | undefined,
  daysBefore: number
): string {
  const baseDate = targetDateISO && isValid(parseISO(targetDateISO)) 
    ? parseISO(targetDateISO) 
    : new Date();

  return formatISO(addDays(baseDate, -Math.abs(daysBefore)));
}

describe('Reminder Trigger Date Calculator', () => {
  it('should correctly subtract offset days from target date', () => {
    const target = '2026-09-15T00:00:00.000Z';
    const result = calculateReminderTriggerDate(target, 2); // 2 days before
    expect(result).toContain('2026-09-13');
  });

  it('should default to target date when daysBefore is 0', () => {
    const target = '2026-09-15T00:00:00.000Z';
    const result = calculateReminderTriggerDate(target, 0);
    expect(result).toContain('2026-09-15');
  });

  it('should safely fallback to today if target date is null', () => {
    const result = calculateReminderTriggerDate(null, 3);
    expect(result).toBeDefined();
    expect(isValid(parseISO(result))).toBe(true);
  });
});

describe('Node & Reminder Lifecycle Linking', () => {
  it('should generate a valid node_id and construct a matching reminder payload', () => {
    const newNodeId = crypto.randomUUID();
    const plannedDate = '2026-09-20T00:00:00.000Z';
    const daysBefore = 2;
    const remindAtISO = calculateReminderTriggerDate(plannedDate, daysBefore);

    const reminderPayload = {
      id: crypto.randomUUID(),
      node_id: newNodeId,
      remind_at: remindAtISO,
      offset_mode: 'relative',
      offset_days: -daysBefore,
      message: 'Follow up on Tooling Opening',
    };

    expect(reminderPayload.node_id).toBe(newNodeId);
    expect(reminderPayload.remind_at).toContain('2026-09-18');
  });
});
