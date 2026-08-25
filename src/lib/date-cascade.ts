import { addDays, parseISO, formatISO, isValid } from 'date-fns';

export interface DateNodeInput {
  id: string;
  parent_id: string | null;
  planned_date: string | null;       // ISO 8601 string
  trigger_offset_days: number | null; // Offset relative to parent.planned_date
  children?: DateNodeInput[];
}

export interface ResolvedNodeDate {
  id: string;
  planned_date: string | null;
  is_unresolvable: boolean;
}

/**
 * Pure function: resolveDates
 * Takes a node tree and parent planned date, returning an array of resolved dates.
 * If trigger_offset_days is set and parent date exists, computes parent.planned_date + offset.
 * If trigger_offset_days is set but parent date is null, marks as unresolvable.
 */
export function resolveDates(
  node: DateNodeInput,
  parentPlannedDateStr: string | null = null
): ResolvedNodeDate[] {
  const results: ResolvedNodeDate[] = [];

  let effectiveDateStr: string | null = null;
  let isUnresolvable = false;

  if (node.trigger_offset_days !== null && node.trigger_offset_days !== undefined) {
    if (parentPlannedDateStr) {
      const parentDate = parseISO(parentPlannedDateStr);
      if (isValid(parentDate)) {
        const calculatedDate = addDays(parentDate, node.trigger_offset_days);
        effectiveDateStr = formatISO(calculatedDate);
      } else {
        isUnresolvable = true;
      }
    } else {
      isUnresolvable = true;
    }
  } else {
    effectiveDateStr = node.planned_date;
  }

  results.push({
    id: node.id,
    planned_date: effectiveDateStr,
    is_unresolvable: isUnresolvable,
  });

  if (node.children && node.children.length > 0) {
    for (const child of node.children) {
      const childResults = resolveDates(child, effectiveDateStr);
      results.push(...childResults);
    }
  }

  return results;
}
