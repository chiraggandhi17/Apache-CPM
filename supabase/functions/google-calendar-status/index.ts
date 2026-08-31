// supabase/functions/google-calendar-status/index.ts
//
// Lets the frontend ask "is this user connected to Google Calendar?" without
// ever exposing the underlying tokens — google_calendar_connections has no
// RLS policies at all, so this is the only sanctioned way to read anything
// about a user's connection from the browser.
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

    const adminClient = createClient(supabaseUrl, serviceRoleKey);
    const { data: connection } = await adminClient
      .from('google_calendar_connections')
      .select('google_email, last_synced_at, created_at, default_sync_new_tasks, setup_completed')
      .eq('user_id', userData.user.id)
      .maybeSingle();

    return new Response(
      JSON.stringify(
        connection
          ? {
              connected: true,
              googleEmail: connection.google_email,
              lastSyncedAt: connection.last_synced_at,
              connectedAt: connection.created_at,
              defaultSyncNewTasks: connection.default_sync_new_tasks,
              setupCompleted: connection.setup_completed,
            }
          : { connected: false }
      ),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (err) {
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
