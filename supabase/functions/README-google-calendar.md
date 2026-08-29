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
