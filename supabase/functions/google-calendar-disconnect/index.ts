// supabase/functions/google-calendar-disconnect/index.ts
//
// Revokes the stored Google token (best-effort) and deletes the connection
// row. Also clears google_event_id off any of the user's nodes so a
// reconnect later starts clean instead of trying to update events that may
// no longer exist.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { corsHeaders, handleOptions } from '../_shared/cors.ts';

Deno.serve(async (req: Request) => {
  const preflight = handleOptions(req);
  if (preflight) return preflight;

  try {
    const authHeader = req.headers.get('Authorization') || '';
    const jwt = authHeader.replace('Bearer ', '');
    if (!jwt) {
      return new Response(JSON.stringify({ error: 'Missing Authorization header' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!;
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

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
    const adminClient = createClient(supabaseUrl, serviceRoleKey);

    const { data: connection } = await adminClient
      .from('google_calendar_connections')
      .select('refresh_token')
      .eq('user_id', userId)
      .maybeSingle();

    if (connection?.refresh_token) {
      try {
        await fetch('https://oauth2.googleapis.com/revoke', {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: new URLSearchParams({ token: connection.refresh_token }),
        });
      } catch {
        // Best-effort — proceed with local cleanup regardless.
      }
    }

    await adminClient.from('google_calendar_connections').delete().eq('user_id', userId);
    await adminClient.from('google_calendar_pending_events').delete().eq('user_id', userId);
    // Covers both individual accounts (user_id = them) and org accounts
    // (assignee_user_id = them) — see google-calendar-sync for the same scope.
    await adminClient
      .from('nodes')
      .update({ google_event_id: null })
      .or(`user_id.eq.${userId},assignee_user_id.eq.${userId}`);

    return new Response(JSON.stringify({ success: true }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
