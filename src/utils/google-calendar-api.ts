import { supabase } from '../lib/supabase';

export interface GoogleCalendarStatus {
  connected: boolean;
  googleEmail?: string | null;
  lastSyncedAt?: string | null;
  connectedAt?: string | null;
}

async function invoke<T = any>(fn: string, opts?: { method?: 'GET' | 'POST'; body?: Record<string, unknown> }): Promise<T> {
  const { data, error } = await supabase.functions.invoke(fn, { method: opts?.method || 'POST', body: opts?.body });
  if (error) throw error;
  if (data?.error) throw new Error(data.error);
  return data as T;
}

/** Kicks off the OAuth flow: fetches the Google consent URL and redirects the browser to it. */
export async function startGoogleOAuth(): Promise<void> {
  const data = await invoke<{ url: string }>('google-oauth-start');
  window.location.href = data.url;
}

export async function getGoogleCalendarStatus(): Promise<GoogleCalendarStatus> {
  return invoke<GoogleCalendarStatus>('google-calendar-status', { method: 'GET' });
}

export async function disconnectGoogleCalendar(): Promise<void> {
  await invoke('google-calendar-disconnect');
}

export async function syncGoogleCalendarNow(): Promise<{ pulled: number; pushed: number }> {
  return invoke<{ pulled: number; pushed: number }>('google-calendar-sync');
}

/**
 * One-off pull scoped to an explicit date range instead of the default
 * auto window — lets the user say "just show me what's in Google between
 * these two dates" without triggering a full push/incremental sync.
 */
export async function pullGoogleCalendarRange(rangeStart: string, rangeEnd: string): Promise<{ pulled: number }> {
  return invoke<{ pulled: number }>('google-calendar-sync', { body: { rangeStart, rangeEnd } });
}

/**
 * Best-effort cleanup: deletes the given Google Calendar events. Called
 * right when a task is deleted or marked complete in CPM so its calendar
 * event doesn't linger until the next "Sync Now". Silently no-ops if the
 * user isn't connected to Google — never throws into the caller's UI flow.
 */
export async function deleteGoogleCalendarEvents(eventIds: string[]): Promise<void> {
  if (eventIds.length === 0) return;
  try {
    await invoke('google-calendar-delete-events', { body: { eventIds } });
  } catch (err) {
    console.error('deleteGoogleCalendarEvents failed:', err);
  }
}
