import { NodeItem } from '../types/domain';

/**
 * Builds a standard RFC 5545 .ics calendar file from a set of nodes.
 * This is a real, fully client-side export — no backend/Edge Function
 * required — so it works reliably today. It's a one-time snapshot, not a
 * live-updating feed: re-download and re-import after dates change.
 */

function escapeICSText(text: string): string {
  return text
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\n/g, '\\n');
}

function toICSDate(iso: string): string {
  try {
    const d = new Date(iso);
    return d.toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z';
  } catch {
    return '';
  }
}

// Folds long lines per RFC 5545 (75 octets per line, continuation lines start with a space)
function foldLine(line: string): string {
  if (line.length <= 75) return line;
  let result = '';
  let remaining = line;
  let first = true;
  while (remaining.length > 0) {
    const chunkSize = first ? 75 : 74;
    result += (first ? '' : '\r\n ') + remaining.slice(0, chunkSize);
    remaining = remaining.slice(chunkSize);
    first = false;
  }
  return result;
}

export function generateICSFile(nodes: NodeItem[], calendarName = 'Cadence CPM'): string {
  const lines: string[] = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Cadence CPM//Calendar Export//EN',
    'CALSCALE:GREGORIAN',
    `X-WR-CALNAME:${escapeICSText(calendarName)}`,
  ];

  const nowStamp = toICSDate(new Date().toISOString());

  for (const node of nodes) {
    if (!node.planned_date) continue;

    const dtStart = toICSDate(node.start_date || node.planned_date);
    const dtEnd = toICSDate(node.planned_date);
    const summary = `${node.is_critical ? '⚡ ' : ''}${node.title}`;
    const descriptionParts = [
      `Cadence CPM Milestone`,
      node.department ? `Department: ${node.department}` : '',
      node.status ? `Status: ${node.status.replace(/_/g, ' ')}` : '',
      node.description || '',
    ].filter(Boolean);

    lines.push(
      'BEGIN:VEVENT',
      `UID:${node.id}@cadence-cpm`,
      `DTSTAMP:${nowStamp}`,
      `DTSTART:${dtStart}`,
      `DTEND:${dtEnd}`,
      foldLine(`SUMMARY:${escapeICSText(summary)}`),
      foldLine(`DESCRIPTION:${escapeICSText(descriptionParts.join('\\n'))}`),
      'END:VEVENT'
    );
  }

  lines.push('END:VCALENDAR');
  return lines.join('\r\n');
}

export function downloadICSFile(nodes: NodeItem[], filename = 'cadence-calendar.ics'): void {
  const content = generateICSFile(nodes);
  const blob = new Blob([content], { type: 'text/calendar;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
