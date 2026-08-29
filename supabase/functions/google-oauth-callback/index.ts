// supabase/functions/google-oauth-callback/index.ts
//
// This is the exact URL registered as the "Authorized redirect URI" in
// Google Cloud Console. Google redirects the browser here after the user
// approves (or denies) access — a plain GET request, no Cadence session.
// We recover which CPM user this belongs to via the one-time `state` token
// minted by google-oauth-start, exchange the code for tokens, store them,
// then bounce the browser back into the app.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

Deno.serve(async (req: Request) => {
  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const appUrl = Deno.env.get('APP_URL') || 'https://cadence-cpm.netlify.app';
  const clientId = Deno.env.get('GOOGLE_CLIENT_ID')!;
  const clientSecret = Deno.env.get('GOOGLE_CLIENT_SECRET')!;
  const redirectUri = `${supabaseUrl}/functions/v1/google-oauth-callback`;

  const redirect = (status: 'connected' | 'error', detail?: string) => {
    const url = new URL(appUrl);
    url.searchParams.set('google_calendar', status);
    if (detail) url.searchParams.set('google_calendar_detail', detail);
    return Response.redirect(url.toString(), 302);
  };

  try {
    const url = new URL(req.url);
    const code = url.searchParams.get('code');
    const state = url.searchParams.get('state');
    const errorParam = url.searchParams.get('error');

    if (errorParam) return redirect('error', errorParam);
    if (!code || !state) return redirect('error', 'missing_code_or_state');

    const adminClient = createClient(supabaseUrl, serviceRoleKey);

    // Recover + burn the one-time state token
    const { data: stateRow, error: stateErr } = await adminClient
      .from('google_oauth_states')
      .select('*')
      .eq('state', state)
      .maybeSingle();

    if (stateErr || !stateRow) return redirect('error', 'invalid_state');
    await adminClient.from('google_oauth_states').delete().eq('state', state);

    if (new Date(stateRow.expires_at).getTime() < Date.now()) {
      return redirect('error', 'expired_state');
    }
    const userId = stateRow.user_id;

    // Exchange the authorization code for tokens
    const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code,
        client_id: clientId,
        client_secret: clientSecret,
        redirect_uri: redirectUri,
        grant_type: 'authorization_code',
      }),
    });
    const tokenData = await tokenRes.json();

    if (!tokenRes.ok || !tokenData.access_token) {
      console.error('Google token exchange failed:', tokenData);
      return redirect('error', 'token_exchange_failed');
    }

    // Best-effort: fetch the connected Google account's email for display
    let googleEmail: string | null = null;
    try {
      const userInfoRes = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
        headers: { Authorization: `Bearer ${tokenData.access_token}` },
      });
      if (userInfoRes.ok) {
        const info = await userInfoRes.json();
        googleEmail = info.email || null;
      }
    } catch {
      // non-fatal
    }

    const accessTokenExpiry = new Date(Date.now() + (tokenData.expires_in || 3600) * 1000).toISOString();

    // Google only returns a refresh_token on the FIRST consent (or when
    // prompt=consent forces re-issue, which google-oauth-start always sets).
    // If for some reason it's missing, keep whatever was already stored.
    const upsertPayload: Record<string, unknown> = {
      user_id: userId,
      google_email: googleEmail,
      access_token: tokenData.access_token,
      access_token_expiry: accessTokenExpiry,
      updated_at: new Date().toISOString(),
    };
    if (tokenData.refresh_token) {
      upsertPayload.refresh_token = tokenData.refresh_token;
    }

    if (tokenData.refresh_token) {
      const { error: upsertErr } = await adminClient
        .from('google_calendar_connections')
        .upsert(upsertPayload, { onConflict: 'user_id' });
      if (upsertErr) {
        console.error('Failed to store Google Calendar connection:', upsertErr);
        return redirect('error', 'storage_failed');
      }
    } else {
      // No new refresh token issued — update the existing row in place if one exists.
      const { error: updateErr } = await adminClient
        .from('google_calendar_connections')
        .update(upsertPayload)
        .eq('user_id', userId);
      if (updateErr) {
        console.error('Failed to update Google Calendar connection:', updateErr);
        return redirect('error', 'storage_failed');
      }
    }

    return redirect('connected');
  } catch (err) {
    console.error('google-oauth-callback error:', err);
    return redirect('error', 'unexpected_error');
  }
});
