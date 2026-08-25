export interface CalendarEventPayload {
  title: string;
  description?: string | null;
  startDate: string; // ISO 8601 string
  endDate?: string | null;
  department?: string | null;
  isCritical?: boolean;
}

/**
 * Generates a 1-click Google Calendar Event Creation URL (template mode)
 */
export function generateGoogleCalendarUrl(event: CalendarEventPayload): string {
  const baseUrl = 'https://calendar.google.com/render?action=TEMPLATE';

  const formatGoogleDate = (iso: string) => {
    try {
      const d = new Date(iso);
      return d.toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z';
    } catch {
      return '';
    }
  };

  const start = formatGoogleDate(event.startDate);
  const end = event.endDate ? formatGoogleDate(event.endDate) : start;

  const titlePrefix = event.isCritical ? '⚡ ' : '';
  const text = encodeURIComponent(`${titlePrefix}${event.title}`);
  const details = encodeURIComponent(
    `Cadence Critical Path Milestone\nDepartment: ${event.department || 'Production'}\n\n${event.description || ''}`
  );

  return `${baseUrl}&text=${text}&dates=${start}/${end}&details=${details}`;
}

/**
 * Generates an iCal / Webcal Subscription Feed URL for Apple / Outlook / Google Calendar
 */
export function generateICalSubscriptionUrl(userId: string): string {
  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || 'https://epgkciibhgadtgpulfko.supabase.co';
  const feedUrl = `${supabaseUrl}/functions/v1/calendar-feed?token=${userId}`;
  return feedUrl;
}
