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
```

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
- Unlinking or deleting a task does not delete its already-created Google Calendar event.
- Each user connects their own Google account; org-wide tasks sync per-assignee (via `assignee_user_id`), not per-organization.
