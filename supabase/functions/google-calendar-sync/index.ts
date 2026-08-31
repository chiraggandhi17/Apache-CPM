// supabase/functions/google-calendar-sync/index.ts
//
// The actual pull + push. Invoked on-demand (the "Sync Now" button in the
// modal) for phase 1 — no push-notification webhooks yet, so there is a
// small lag between an edit and the next manual/scheduled sync. To add
// periodic background syncing later, wrap a call to this function in a
// pg_cron job (see supabase/README-google-calendar.md).
//
// Scope of "this user's tasks": nodes where user_id = them (their own,
// individual accounts) OR assignee_user_id = them (their assigned tasks,
// org accounts) — so each person's own Google Calendar only ever reflects
// their own work, not the whole org's.
//
// Deletion sync: deleting a task's Google event from the CPM side is
// handled elsewhere (google-calendar-delete-events, called from
// NodeContext's cleanupGoogleEventsFor). Going the OTHER direction — an
// event deleted on the Google Calendar side — is handled below: a
// 'cancelled' tombstone from an incremental sync, or a 404/410 hit while
// pushing, both mean the CPM task's link is dead, so we clear
// google_event_id and turn its "Sync to Calendar" toggle off instead of
// silently failing every sync from then on.
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
  if (!res.ok || !data.access_token) {
    throw new Error(`Token refresh failed: ${JSON.stringify(data)}`);
  }
  return data as { access_token: string; expires_in: number };
}

function toGoogleEventBody(node: { id: string; title: string; description: string | null; is_critical: boolean; department: string | null; start_date: string | null; planned_date: string | null }) {
  const summary = `${node.is_critical ? '⚡ ' : ''}${node.title}`;
  const description = [
    'Synced from Cadence CPM',
    node.department ? `Department: ${node.department}` : '',
    node.description || '',
  ].filter(Boolean).join('\n');

  const start = node.start_date || node.planned_date!;
  const end = node.planned_date || node.start_date!;

  return {
    summary,
    description,
    start: { dateTime: new Date(start).toISOString() },
    end: { dateTime: new Date(end).toISOString() },
    // Tags every event CPM creates with its source node id, so we can
    // recognize "this is our own event" both when re-pulling it (avoids
    // re-offering it as a new import) and when deciding whether to create
    // a fresh event or reuse one that already exists (avoids a duplicate
    // POST if a prior create succeeded but saving the id back failed).
    extendedProperties: { private: { cpm_node_id: node.id } },
  };
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

    // Optional explicit range: when the user picks "Pull This Range" in the
    // UI instead of the default "Sync Now", we do a plain one-off pull
    // scoped to those dates — no push, and we don't touch the stored
    // syncToken (that cursor is reserved for the regular incremental sync).
    const body = await req.json().catch(() => ({}));
    const rangeStart: string | null = typeof body?.rangeStart === 'string' ? body.rangeStart : null;
    const rangeEnd: string | null = typeof body?.rangeEnd === 'string' ? body.rangeEnd : null;
    const isRangeMode = Boolean(rangeStart && rangeEnd);

    const { data: connection } = await admin
      .from('google_calendar_connections')
      .select('*')
      .eq('user_id', userId)
      .maybeSingle();

    if (!connection) {
      return new Response(JSON.stringify({ error: 'not_connected' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { access_token: accessToken } = await refreshAccessToken(clientId, clientSecret, connection.refresh_token);
    const calendarId = connection.google_calendar_id || 'primary';
    const authHeaders = { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' };

    // ---------- PULL: Google Calendar → pending review inbox ----------
    let pulledCount = 0;
    let flaggedEditCount = 0;
    let nextSyncToken: string | null = connection.sync_token;
    {
      const listUrl = new URL(`${CALENDAR_EVENTS_BASE}/${encodeURIComponent(calendarId)}/events`);
      if (isRangeMode) {
        // Explicit user-picked window — Google doesn't allow combining
        // syncToken with timeMin/timeMax, so this is always a plain listing.
        listUrl.searchParams.set('timeMin', new Date(rangeStart!).toISOString());
        listUrl.searchParams.set('timeMax', new Date(rangeEnd!).toISOString());
        listUrl.searchParams.set('singleEvents', 'true');
      } else if (connection.sync_token) {
        listUrl.searchParams.set('syncToken', connection.sync_token);
      } else {
        const timeMin = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
        const timeMax = new Date(Date.now() + 180 * 24 * 60 * 60 * 1000).toISOString();
        listUrl.searchParams.set('timeMin', timeMin);
        listUrl.searchParams.set('timeMax', timeMax);
        listUrl.searchParams.set('singleEvents', 'true');
      }

      let pageToken: string | undefined;
      let invalidSyncToken = false;
      do {
        if (pageToken) listUrl.searchParams.set('pageToken', pageToken);
        const res = await fetch(listUrl.toString(), { headers: authHeaders });
        const data = await res.json();

        if (res.status === 410) {
          // Sync token expired/invalid — fall back to a fresh full sync next run.
          invalidSyncToken = true;
          break;
        }
        if (!res.ok) {
          console.error('Calendar list events failed:', data);
          break;
        }

        for (const event of data.items || []) {
          if (!event.id) continue;

          if (event.status === 'cancelled') {
            // Deleted on Google's side. If a CPM task was linked to this
            // event, stop treating it as synced instead of letting every
            // future push against it fail with a 404 forever.
            await admin
              .from('nodes')
              .update({ google_event_id: null, calendar_sync_enabled: false })
              .eq('google_event_id', event.id)
              .or(`user_id.eq.${userId},assignee_user_id.eq.${userId}`);
            await admin
              .from('google_calendar_pending_events')
              .delete()
              .eq('user_id', userId)
              .eq('google_event_id', event.id);
            continue;
          }

          const startRaw = event.start?.dateTime || event.start?.date;
          const endRaw = event.end?.dateTime || event.end?.date;
          if (!startRaw) continue;

          // Already tracked by a CPM task — either we pushed it ourselves
          // (extendedProperties tag, belt-and-suspenders in case the id
          // hasn't round-tripped back onto the node yet) or a previous pull
          // already linked it. Not a "new" event, but its Google-side
          // content may have changed since — check for an edit conflict
          // instead of silently ignoring it.
          const cpmNodeId = event.extendedProperties?.private?.cpm_node_id;
          const { data: linkedNode } = await admin
            .from('nodes')
            .select('id, title, is_critical, start_date, planned_date, google_event_id')
            .or(cpmNodeId ? `id.eq.${cpmNodeId}` : `google_event_id.eq.${event.id}`)
            .or(`user_id.eq.${userId},assignee_user_id.eq.${userId}`)
            .maybeSingle();

          if (linkedNode) {
            const expectedSummary = `${linkedNode.is_critical ? '⚡ ' : ''}${linkedNode.title}`;
            const expectedStart = linkedNode.start_date || linkedNode.planned_date;
            const expectedEnd = linkedNode.planned_date || linkedNode.start_date;
            const startMatches = expectedStart && new Date(expectedStart).getTime() === new Date(startRaw).getTime();
            const endMatches = !endRaw || !expectedEnd || new Date(expectedEnd).getTime() === new Date(endRaw).getTime();
            const titleMatches = (event.summary || '') === expectedSummary;

            if (titleMatches && startMatches && endMatches) continue; // in sync, nothing to flag

            const { data: existingConflict } = await admin
              .from('google_calendar_pending_events')
              .select('id, status, title, start_at, end_at')
              .eq('user_id', userId)
              .eq('google_event_id', event.id)
              .maybeSingle();

            // Already flagged with this exact Google-side content and the
            // user already decided (applied/dismissed) — don't re-nag every
            // sync. A *further* edit on Google's side (content differs from
            // what's stored) still re-opens it for review.
            const unchanged = existingConflict
              && existingConflict.title === (event.summary || 'Untitled Event')
              && existingConflict.start_at === new Date(startRaw).toISOString()
              && existingConflict.end_at === (endRaw ? new Date(endRaw).toISOString() : null);
            if (existingConflict && existingConflict.status !== 'pending' && unchanged) continue;

            await admin.from('google_calendar_pending_events').upsert(
              {
                user_id: userId,
                google_event_id: event.id,
                title: event.summary || 'Untitled Event',
                description: event.description || null,
                start_at: new Date(startRaw).toISOString(),
                end_at: endRaw ? new Date(endRaw).toISOString() : null,
                is_all_day: !event.start?.dateTime,
                status: 'pending',
                kind: 'edited',
                node_id: linkedNode.id,
              },
              { onConflict: 'user_id,google_event_id' }
            );
            flaggedEditCount++;
            continue;
          }

          const { data: existing } = await admin
            .from('google_calendar_pending_events')
            .select('id, status')
            .eq('user_id', userId)
            .eq('google_event_id', event.id)
            .maybeSingle();

          // Don't clobber a choice the user already made on this event —
          // except a "dismissed" one during an explicit range re-pull: the
          // user picked this exact window again, so surface it once more in
          // case they've changed their mind. A routine incremental sync
          // (isRangeMode === false) never resurrects a dismissed event, so
          // background syncs stay quiet.
          if (existing) {
            if (existing.status === 'imported') continue;
            if (existing.status === 'dismissed' && !isRangeMode) continue;
          }

          await admin.from('google_calendar_pending_events').upsert(
            {
              user_id: userId,
              google_event_id: event.id,
              title: event.summary || 'Untitled Event',
              description: event.description || null,
              start_at: new Date(startRaw).toISOString(),
              end_at: endRaw ? new Date(endRaw).toISOString() : null,
              is_all_day: !event.start?.dateTime,
              status: 'pending',
              kind: 'new',
              node_id: null,
            },
            { onConflict: 'user_id,google_event_id' }
          );
          pulledCount++;
        }

        pageToken = data.nextPageToken;
        if (data.nextSyncToken) nextSyncToken = data.nextSyncToken;
      } while (pageToken);

      if (invalidSyncToken) nextSyncToken = null;
    }

    // ---------- PUSH: linked CPM tasks → Google Calendar ----------
    // Skipped entirely in range mode — that action is "just show me what's
    // in Google for this window," not a full two-way sync.
    let pushedCount = 0;
    if (!isRangeMode) {
      const { data: linkedNodes } = await admin
        .from('nodes')
        .select('id, title, description, is_critical, department, start_date, planned_date, google_event_id, calendar_sync_enabled')
        .or(`user_id.eq.${userId},assignee_user_id.eq.${userId}`)
        .eq('calendar_sync_enabled', true)
        .not('planned_date', 'is', null);

      for (const node of linkedNodes || []) {
        const eventBody = toGoogleEventBody(node);
        try {
          if (node.google_event_id) {
            const res = await fetch(
              `${CALENDAR_EVENTS_BASE}/${encodeURIComponent(calendarId)}/events/${node.google_event_id}`,
              { method: 'PATCH', headers: authHeaders, body: JSON.stringify(eventBody) }
            );
            if (res.ok) {
              pushedCount++;
            } else if (res.status === 404 || res.status === 410) {
              // Event is gone on Google's side (missed by the pull step above,
              // e.g. after a full resync that doesn't carry deletion tombstones).
              // Same fix: unlink instead of failing forever.
              await admin
                .from('nodes')
                .update({ google_event_id: null, calendar_sync_enabled: false })
                .eq('id', node.id);
            } else {
              console.error('Failed to update Google event for node', node.id, await res.text());
            }
          } else {
            // Guard against double-creating: if a previous push already
            // created this node's event but the id never made it back onto
            // the node (e.g. the write failed after a successful POST),
            // find it by our own tag instead of creating a second one.
            const dedupeUrl = new URL(`${CALENDAR_EVENTS_BASE}/${encodeURIComponent(calendarId)}/events`);
            dedupeUrl.searchParams.set('privateExtendedProperty', `cpm_node_id=${node.id}`);
            const dedupeRes = await fetch(dedupeUrl.toString(), { headers: authHeaders });
            const dedupeData = dedupeRes.ok ? await dedupeRes.json().catch(() => ({})) : {};
            const existingMatch = (dedupeData.items || []).find((it: any) => it.status !== 'cancelled');

            if (existingMatch) {
              await admin.from('nodes').update({ google_event_id: existingMatch.id }).eq('id', node.id);
              pushedCount++;
              continue;
            }

            const res = await fetch(
              `${CALENDAR_EVENTS_BASE}/${encodeURIComponent(calendarId)}/events`,
              { method: 'POST', headers: authHeaders, body: JSON.stringify(eventBody) }
            );
            const created = await res.json();
            if (res.ok && created.id) {
              await admin.from('nodes').update({ google_event_id: created.id }).eq('id', node.id);
              pushedCount++;
            } else {
              console.error('Failed to create Google event for node', node.id, created);
            }
          }
        } catch (err) {
          console.error('Push error for node', node.id, err);
        }
      }
    }

    // Range pulls don't advance the incremental cursor — they're an
    // independent, explicit lookup, not the ongoing sync.
    await admin
      .from('google_calendar_connections')
      .update(
        isRangeMode
          ? { last_synced_at: new Date().toISOString() }
          : { sync_token: nextSyncToken, last_synced_at: new Date().toISOString() }
      )
      .eq('user_id', userId);

    return new Response(JSON.stringify({ success: true, pulled: pulledCount, pushed: pushedCount, flagged: flaggedEditCount }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (err) {
    console.error('google-calendar-sync error:', err);
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
