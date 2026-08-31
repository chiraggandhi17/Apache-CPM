// supabase/functions/google-calendar-preferences/index.ts
//
// Lets a connected user set their own sync preferences — currently just
// default_sync_new_tasks (whether a brand-new task starts with "Sync to
// Calendar" on) and setup_completed (whether the first-connection
// preferences step has been shown). Same auth pattern as
// google-calendar-status: the frontend never touches google_calendar_connections
// directly since it has no RLS policies at all.
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

    const body = await req.json().catch(() => ({}));
    const update: Record<string, unknown> = {};
    if (typeof body?.defaultSyncNewTasks === 'boolean') update.default_sync_new_tasks = body.defaultSyncNewTasks;
    if (typeof body?.setupCompleted === 'boolean') update.setup_completed = body.setupCompleted;

    if (Object.keys(update).length === 0) {
      return new Response(JSON.stringify({ error: 'No valid preference fields provided' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    update.updated_at = new Date().toISOString();

    const adminClient = createClient(supabaseUrl, serviceRoleKey);
    const { error: updateErr } = await adminClient
      .from('google_calendar_connections')
      .update(update)
      .eq('user_id', userData.user.id);

    if (updateErr) {
      return new Response(JSON.stringify({ error: updateErr.message }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

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
