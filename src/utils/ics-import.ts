/**
 * Minimal RFC 5545 .ics parser, sufficient for the VEVENT blocks Google
 * Calendar's own "Export" produces (and most other calendar apps). Handles
 * line-unfolding (continuation lines start with a space/tab), the common
 * DTSTART/DTEND value forms (UTC "Z" timestamps, local timestamps, and
 * all-day DATE values), and basic text unescaping. It intentionally does
 * not attempt full RFC coverage (timezones via VTIMEZONE, RRULE expansion,
 * etc.) — good enough for "import my calendar's events as tasks."
 */

export interface ParsedICSEvent {
  uid: string;
  title: string;
  description: string | null;
  startISO: string;
  endISO: string | null;
  isAllDay: boolean;
}

function unescapeICSText(text: string): string {
  return text
    .replace(/\\n/gi, '\n')
    .replace(/\\,/g, ',')
    .replace(/\\;/g, ';')
    .replace(/\\\\/g, '\\');
}

function unfoldLines(raw: string): string[] {
  const rawLines = raw.split(/\r\n|\n|\r/);
  const unfolded: string[] = [];
  for (const line of rawLines) {
    if ((line.startsWith(' ') || line.startsWith('\t')) && unfolded.length > 0) {
      unfolded[unfolded.length - 1] += line.slice(1);
    } else {
      unfolded.push(line);
    }
  }
  return unfolded;
}

// Parses DTSTART/DTEND-style ICS date values into an ISO string.
// Forms handled: "20260115T090000Z" (UTC), "20260115T090000" (local/floating),
// "20260115" (all-day DATE).
function parseICSDate(value: string): { iso: string; isAllDay: boolean } | null {
  const dateOnlyMatch = value.match(/^(\d{4})(\d{2})(\d{2})$/);
  if (dateOnlyMatch) {
    const [, y, m, d] = dateOnlyMatch;
    return { iso: `${y}-${m}-${d}T00:00:00.000Z`, isAllDay: true };
  }

  const dateTimeMatch = value.match(/^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})(Z)?$/);
  if (dateTimeMatch) {
    const [, y, mo, d, h, mi, s, z] = dateTimeMatch;
    const iso = `${y}-${mo}-${d}T${h}:${mi}:${s}.000${z ? 'Z' : ''}`;
    try {
      return { iso: new Date(iso).toISOString(), isAllDay: false };
    } catch {
      return null;
    }
  }

  return null;
}

export function parseICSFile(raw: string): ParsedICSEvent[] {
  const lines = unfoldLines(raw);
  const events: ParsedICSEvent[] = [];

  let current: Partial<ParsedICSEvent> & { _isAllDay?: boolean } | null = null;

  for (const line of lines) {
    if (line.startsWith('BEGIN:VEVENT')) {
      current = {};
      continue;
    }
    if (line.startsWith('END:VEVENT')) {
      if (current && current.startISO) {
        events.push({
          uid: current.uid || `imported-${events.length}-${Date.now()}`,
          title: current.title || 'Untitled Event',
          description: current.description || null,
          startISO: current.startISO,
          endISO: current.endISO || null,
          isAllDay: Boolean(current._isAllDay),
        });
      }
      current = null;
      continue;
    }
    if (!current) continue;

    const colonIdx = line.indexOf(':');
    if (colonIdx === -1) continue;

    const rawKey = line.slice(0, colonIdx);
    const value = line.slice(colonIdx + 1);
    // Strip parameters, e.g. "DTSTART;TZID=America/New_York" -> "DTSTART"
    const key = rawKey.split(';')[0].toUpperCase();

    if (key === 'UID') {
      current.uid = value.trim();
    } else if (key === 'SUMMARY') {
      current.title = unescapeICSText(value);
    } else if (key === 'DESCRIPTION') {
      current.description = unescapeICSText(value);
    } else if (key === 'DTSTART') {
      const parsed = parseICSDate(value.trim());
      if (parsed) {
        current.startISO = parsed.iso;
        current._isAllDay = parsed.isAllDay;
      }
    } else if (key === 'DTEND') {
      const parsed = parseICSDate(value.trim());
      if (parsed) current.endISO = parsed.iso;
    }
  }

  return events;
}
