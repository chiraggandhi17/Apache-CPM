import { describe, it, expect } from 'vitest';
import { resolveDates, DateNodeInput } from '../src/lib/date-cascade';

describe('Date Cascade Pure Function (resolveDates)', () => {
  it('should preserve absolute date when no trigger_offset_days is provided', () => {
    const node: DateNodeInput = {
      id: 'root-1',
      parent_id: null,
      planned_date: '2026-12-31T00:00:00.000Z',
      trigger_offset_days: null,
    };

    const result = resolveDates(node);
    expect(result).toHaveLength(1);
    expect(result[0].planned_date).toBe('2026-12-31T00:00:00.000Z');
    expect(result[0].is_unresolvable).toBe(false);
  });

  it('should recalculate child date when parent date and trigger_offset_days are provided', () => {
    const parentDate = '2026-12-31T00:00:00.000Z';
    const tree: DateNodeInput = {
      id: 'project-1',
      parent_id: null,
      planned_date: parentDate,
      trigger_offset_days: null,
      children: [
        {
          id: 'task-1',
          parent_id: 'project-1',
          planned_date: null,
          trigger_offset_days: -30, // 30 days before Dec 31 -> Dec 1
        },
      ],
    };

    const results = resolveDates(tree);
    expect(results).toHaveLength(2);
    expect(results[0].planned_date).toBe(parentDate);
    // Task-1 should resolve to 2026-12-01
    expect(results[1].planned_date).toContain('2026-12-01');
    expect(results[1].is_unresolvable).toBe(false);
  });

  it('should handle multi-level recursive cascading (grandchild offset)', () => {
    const parentDate = '2026-12-31T00:00:00.000Z';
    const tree: DateNodeInput = {
      id: 'project-1',
      parent_id: null,
      planned_date: parentDate,
      trigger_offset_days: null,
      children: [
        {
          id: 'task-1',
          parent_id: 'project-1',
          planned_date: null,
          trigger_offset_days: -30, // Dec 1
          children: [
            {
              id: 'subtask-1',
              parent_id: 'task-1',
              planned_date: null,
              trigger_offset_days: -7, // 7 days before Dec 1 -> Nov 24
            },
          ],
        },
      ],
    };

    const results = resolveDates(tree);
    expect(results).toHaveLength(3);
    expect(results[1].planned_date).toContain('2026-12-01');
    expect(results[2].planned_date).toContain('2026-11-24');
  });

  it('should flag child as unresolvable if parent date is missing and offset is specified', () => {
    const tree: DateNodeInput = {
      id: 'project-1',
      parent_id: null,
      planned_date: null, // missing!
      trigger_offset_days: null,
      children: [
        {
          id: 'task-1',
          parent_id: 'project-1',
          planned_date: null,
          trigger_offset_days: -10,
        },
      ],
    };

    const results = resolveDates(tree);
    expect(results[1].is_unresolvable).toBe(true);
    expect(results[1].planned_date).toBeNull();
  });
});
