import { supabase } from '../lib/supabase';

export interface GoogleCalendarStatus {
  connected: boolean;
  googleEmail?: string | null;
  lastSyncedAt?: string | null;
  connectedAt?: string | null;
}

async function invoke<T = any>(fn: string, opts?: { method?: 'GET' | 'POST' }): Promise<T> {
  const { data, error } = await supabase.functions.invoke(fn, { method: opts?.method || 'POST' });
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
