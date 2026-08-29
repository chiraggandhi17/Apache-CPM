# Google Calendar OAuth Sync — Deploy Guide

## 1. One-time Supabase CLI setup

```bash
npm install -g supabase
supabase login
cd Apache-CPM
supabase link --project-ref epgkciibhgadtgpulfko
```

## 2. Set secrets (from your Google Cloud OAuth Client)

```bash
supabase secrets set GOOGLE_CLIENT_ID="your-client-id.apps.googleusercontent.com"
supabase secrets set GOOGLE_CLIENT_SECRET="your-client-secret"
supabase secrets set APP_URL="https://cadence-cpm.netlify.app"
```

(`SUPABASE_URL`, `SUPABASE_ANON_KEY`, and `SUPABASE_SERVICE_ROLE_KEY` are injected automatically — no need to set those.)

## 3. Deploy the functions

```bash
supabase functions deploy google-oauth-start
supabase functions deploy google-oauth-callback --no-verify-jwt
supabase functions deploy google-calendar-status
supabase functions deploy google-calendar-disconnect
supabase functions deploy google-calendar-sync
supabase functions deploy google-calendar-delete-events
```

> `google-calendar-delete-events` was added after the initial rollout (it's what
> cleans up the Google-side event when a task is deleted or marked complete in
> CPM). If you deployed before this function existed, run just that one line
> above to add it — nothing else needs to be redeployed.

`google-oauth-callback` needs `--no-verify-jwt` because Google redirects the browser to it directly — there's no Cadence session/JWT on that request. It authenticates the flow itself via the one-time `state` token instead (see the function's comments).

## 4. Run the migration

Paste `supabase/migrations/00013_google_calendar_oauth.sql` into the Supabase SQL Editor (same as previous migrations).

## 5. Verify the redirect URI matches

In Google Cloud Console → Credentials → your OAuth Client → Authorized redirect URIs, confirm this exact URL is listed:

```
https://epgkciibhgadtgpulfko.supabase.co/functions/v1/google-oauth-callback
```

## 6. Test it

1. Open Cadence → sidebar → "Google Cal" → "Connect Google Calendar."
2. Approve on Google's consent screen (you must be added as a test user in the OAuth consent screen config until the app is verified).
3. You should land back in Cadence with a "Google Calendar connected!" toast and the sync modal open.
4. Click "Sync Now" to pull recent/upcoming events into the review inbox and push any linked tasks out.

## Known v1 limitations

- Sync is on-demand ("Sync Now"), not instant — a scheduled background sync can be added later via `pg_cron` calling `google-calendar-sync` periodically.
- Each user connects their own Google account; org-wide tasks sync per-assignee (via `assignee_user_id`), not per-organization.
- Manual .ics export/import has been removed — real OAuth sync replaces it as the only sync path now that it's live for everyone.

Deleting a task or marking it (and its subtree) complete in CPM now deletes the
matching Google Calendar event via `google-calendar-delete-events` — this is
fire-and-forget from the frontend, so it fails silently if that function isn't
deployed yet (see the deploy step above).

The reverse direction is also handled: if a task's event is deleted directly
in Google Calendar, the next "Sync Now" detects it (either as a cancelled
tombstone from the incremental sync, or a 404/410 when trying to push an
update to it) and turns that task's "Sync to Calendar" toggle off and clears
its stored event id — it does not delete the CPM task, and does not recreate
the Google event. The task just stops being treated as linked.

## Reviewing pulled events without getting flooded

"Sync Now" pulls a default window (last 30 days to next 180 days on first
run, then only what changed since via the incremental syncToken). For
someone with a busy personal calendar that can still mean a lot of unrelated
events landing in the "New from Google Calendar" review inbox. Two things
help with that:

- **Pull a Specific Range** — a small date-range picker next to "Sync Now"
  calls `google-calendar-sync` with an explicit `{ rangeStart, rangeEnd }`
  body. This is a one-off lookup (no push, doesn't touch the syncToken) for
  cases like sweeping in an older season or a far-future launch on demand.
- **Bulk review** — the pending list supports multi-select with a search
  box, "Dismiss All" / "Dismiss Selected", and "Add Selected as..." which
  applies one chosen level (Department...Subtask) and one parent to every
  selected event at once — each keeps its own original date/time. For an
  event that needs individual placement instead, "Add to CPM" on that one
  row asks for its level + parent, then opens the full task form (color,
  critical flag, reminders, assignee, etc.) pre-filled from the event.

## Duplicate prevention

Re-syncing (or pulling an overlapping range) does not create duplicates:

- Every event CPM pushes to Google is tagged with a private
  `cpm_node_id` extended property. The pull step skips any event carrying
  that tag (or matching an existing task's `google_event_id`) — it's
  already a CPM task's mirror, not something "new from Google."
- Before creating a brand-new Google event for a task, the push step first
  looks for an existing event with that task's tag, in case a prior push
  created one but failed to save the id back onto the task — it reuses
  that event instead of creating a second one.
- Accepting a pending event (individually or in a batch) checks whether a
  task is already linked to that Google event id first; if so, it links to
  the existing task instead of creating a new one, which covers a
  double-click or a slow retry.
- As a heads-up only (never a block), the review list flags a pending
  event with a same title + same day as an existing, unlinked task —
  "Possibly already tracked as ...". This is a heuristic, not a hard
  match, since two genuinely different tasks can share a name and date.
