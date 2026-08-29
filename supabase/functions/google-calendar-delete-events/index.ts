// supabase/functions/google-calendar-delete-events/index.ts
//
// Deletes one or more Google Calendar events for the calling user. Called
// from the frontend right when a task is deleted or marked complete in CPM,
// so the calendar doesn't accumulate stale/completed events waiting for the
// next "Sync Now". Best-effort: a missing connection or an already-gone
// event is not treated as an error, since the caller fires this
// fire-and-forget and doesn't want it surfacing to the user.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { corsHeaders, handleOptions } from '../_shared/cors.ts';

const CALENDAR_EVENTS_BASE = 'https://www.googleapis.com/calendar/v3/calendars';

async function refreshAccessToken(clientId: string, clientSecret: string, refreshToken: string) {
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: refreshToken,
      grant_type: 'refresh_token',
    }),
  });
  const data = await res.json();
  if (!res.ok || !data.access_token) throw new Error(`Token refresh failed: ${JSON.stringify(data)}`);
  return data.access_token as string;
}

Deno.serve(async (req: Request) => {
  const preflight = handleOptions(req);
  if (preflight) return preflight;

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!;
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const clientId = Deno.env.get('GOOGLE_CLIENT_ID')!;
  const clientSecret = Deno.env.get('GOOGLE_CLIENT_SECRET')!;

  try {
    const authHeader = req.headers.get('Authorization') || '';
    const jwt = authHeader.replace('Bearer ', '');
    if (!jwt) {
      return new Response(JSON.stringify({ error: 'Missing Authorization header' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { eventIds } = await req.json().catch(() => ({ eventIds: [] }));
    if (!Array.isArray(eventIds) || eventIds.length === 0) {
      return new Response(JSON.stringify({ deleted: 0 }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: userData, error: userErr } = await userClient.auth.getUser(jwt);
    if (userErr || !userData?.user) {
      return new Response(JSON.stringify({ error: 'Invalid session' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    const userId = userData.user.id;
    const admin = createClient(supabaseUrl, serviceRoleKey);

    const { data: connection } = await admin
      .from('google_calendar_connections')
      .select('refresh_token, google_calendar_id')
      .eq('user_id', userId)
      .maybeSingle();

    // Not connected — nothing to clean up on Google's side, not an error.
    if (!connection) {
      return new Response(JSON.stringify({ deleted: 0, reason: 'not_connected' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const accessToken = await refreshAccessToken(clientId, clientSecret, connection.refresh_token);
    const calendarId = connection.google_calendar_id || 'primary';
    let deleted = 0;

    for (const eventId of eventIds) {
      try {
        const res = await fetch(
          `${CALENDAR_EVENTS_BASE}/${encodeURIComponent(calendarId)}/events/${eventId}`,
          { method: 'DELETE', headers: { Authorization: `Bearer ${accessToken}` } }
        );
        // 200/204 = deleted, 404/410 = already gone — both count as success.
        if (res.ok || res.status === 404 || res.status === 410) deleted++;
        else console.error(`Failed to delete Google event ${eventId}:`, await res.text());
      } catch (err) {
        console.error(`Error deleting Google event ${eventId}:`, err);
      }
    }

    return new Response(JSON.stringify({ deleted }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (err) {
    console.error('google-calendar-delete-events error:', err);
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
