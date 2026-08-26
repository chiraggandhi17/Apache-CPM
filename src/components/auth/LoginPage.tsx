import React, { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import { 
  Lock, Mail, ArrowRight, CheckCircle2, UserPlus, LogIn, Building2, 
  Footprints, Sparkles, User, KeyRound, ArrowLeft, Send, AlertCircle, Eye, EyeOff 
} from 'lucide-react';

interface LoginPageProps {
  onLoginSuccess?: () => void;
}

interface PublicOrgBranding {
  org_id: string;
  org_name: string;
  org_code: string;
  brand_title: string;
  brand_tagline: string;
  logo_url: string | null;
  brand_color: string;
  is_activated: boolean;
  primary_admin_email: string | null;
}

export const LoginPage: React.FC<LoginPageProps> = ({ onLoginSuccess }) => {
  const [workspaceCode, setWorkspaceCode] = useState(() => {
    return localStorage.getItem('cadence_last_workspace_code') || '';
  });

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [fullName, setFullName] = useState('');
  const [isSignUp, setIsSignUp] = useState(false);
  const [isForgotPassword, setIsForgotPassword] = useState(false);
  
  // Registration Account Type Selection: Personal vs Company
  const [accountType, setAccountType] = useState<'personal' | 'company'>('personal');

  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [signUpSuccess, setSignUpSuccess] = useState<boolean>(false);
  const [needsEmailConfirmation, setNeedsEmailConfirmation] = useState<boolean>(false);
  const [resetEmailSent, setResetEmailSent] = useState<boolean>(false);
  const [resendSuccess, setResendSuccess] = useState<boolean>(false);
  const [isPrimaryAdminSuccess, setIsPrimaryAdminSuccess] = useState<boolean>(false);

  // Password Recovery Flow State
  const [isRecoveryMode, setIsRecoveryMode] = useState<boolean>(false);
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [passwordUpdateSuccess, setPasswordUpdateSuccess] = useState<boolean>(false);

  // Dynamic Live Real-Time Brand State
  const [orgBranding, setOrgBranding] = useState<PublicOrgBranding | null>(null);

  // Detect URL Hash Error Fragments & Recovery Tokens
  useEffect(() => {
    const hash = window.location.hash;
    const search = window.location.search;

    if (hash.includes('type=recovery') || hash.includes('reset-password') || search.includes('type=recovery')) {
      setIsRecoveryMode(true);
    }

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'PASSWORD_RECOVERY') {
        setIsRecoveryMode(true);
      }
    });

    if (hash || search) {
      const rawString = (hash.startsWith('#') ? hash.slice(1) : hash) || (search.startsWith('?') ? search.slice(1) : search);
      const params = new URLSearchParams(rawString);
      const errorCode = params.get('error_code');
      const errorDesc = params.get('error_description');

      if (errorCode || errorDesc) {
        const decodedDesc = errorDesc ? decodeURIComponent(errorDesc.replace(/\+/g, ' ')) : 'Authentication link is invalid or has expired.';
        setErrorMsg(`⚠️ Verification Error: ${decodedDesc} Please enter your email below to get a fresh link.`);
        setNeedsEmailConfirmation(true);

        try {
          window.history.replaceState(null, '', window.location.pathname);
        } catch {}
      }
    }

    return () => subscription.unsubscribe();
  }, []);

  const handleSaveNewPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newPassword || newPassword.length < 6) {
      setErrorMsg('Password must be at least 6 characters long.');
      return;
    }
    if (newPassword !== confirmPassword) {
      setErrorMsg('Passwords do not match.');
      return;
    }

    setLoading(true);
    setErrorMsg(null);

    try {
      const { error } = await supabase.auth.updateUser({ password: newPassword });
      if (error) throw error;

      // Safely sign out of temporary recovery session
      await supabase.auth.signOut();

      setPasswordUpdateSuccess(true);
      setIsRecoveryMode(false);
      setIsForgotPassword(false);
      setIsSignUp(false);
      setPassword('');
      setNewPassword('');
      setConfirmPassword('');

      try {
        window.history.replaceState(null, '', window.location.pathname);
      } catch {}
    } catch (err: any) {
      console.error('Password update error:', err);
      setErrorMsg(err.message || 'Failed to update password. Please request a new password reset link.');
    } finally {
      setLoading(false);
    }
  };

  // Debounced Dynamic Database Lookup when Workspace Code is typed
  useEffect(() => {
    if (accountType === 'personal') {
      setOrgBranding(null);
      return;
    }

    const trimmed = workspaceCode.trim().toUpperCase();
    if (!trimmed) {
      setOrgBranding(null);
      return;
    }

    const timer = setTimeout(async () => {
      try {
        const { data, error } = await supabase
          .from('organizations')
          .select('id, name, org_code, brand_title, brand_tagline, logo_url, brand_color, is_activated, primary_admin_email')
          .ilike('org_code', trimmed)
          .eq('status', 'active')
          .maybeSingle();

        if (data && !error) {
          setOrgBranding({
            org_id: data.id,
            org_name: data.name,
            org_code: data.org_code || trimmed,
            brand_title: data.brand_title || `Cadence - ${data.name}`,
            brand_tagline: data.brand_tagline || 'Enterprise Ex-Factory CPM Tracker',
            logo_url: data.logo_url,
            brand_color: data.brand_color || '#0d9488',
            is_activated: Boolean(data.is_activated),
            primary_admin_email: data.primary_admin_email,
          });
        } else {
          setOrgBranding(null);
        }
      } catch {
        setOrgBranding(null);
      }
    }, 250);

    return () => clearTimeout(timer);
  }, [workspaceCode, accountType]);

  const handleResetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim()) return;

    setLoading(true);
    setErrorMsg(null);
    setResetEmailSent(false);

    try {
      const { error } = await supabase.auth.resetPasswordForEmail(email.trim().toLowerCase(), {
        redirectTo: `${window.location.origin}/#reset-password`,
      });
      if (error) throw error;
      setResetEmailSent(true);
    } catch (err: any) {
      console.error('Password reset error:', err);
      if (err.message?.toLowerCase().includes('rate limit')) {
        setErrorMsg('⚠️ Email Rate Limit Exceeded (Supabase free default is 3 emails/hour). Please wait or increase rate limit in Supabase Dashboard -> Authentication -> Rate Limits.');
      } else if (err.message?.toLowerCase().includes('redirect')) {
        setErrorMsg(`⚠️ Redirect URL error: Please add "${window.location.origin}" under Supabase Dashboard -> Authentication -> Redirect URLs.`);
      } else {
        setErrorMsg(err.message || 'Failed to send password reset email.');
      }
    } finally {
      setLoading(false);
    }
  };

  const handleResendConfirmation = async () => {
    if (!email.trim()) {
      setErrorMsg('Please enter your email address above to resend confirmation link.');
      return;
    }

    setLoading(true);
    setErrorMsg(null);
    setResendSuccess(false);

    try {
      const { error } = await supabase.auth.resend({
        type: 'signup',
        email: email.trim().toLowerCase(),
      });

      if (error) throw error;
      setResendSuccess(true);
    } catch (err: any) {
      if (err.message?.toLowerCase().includes('rate limit')) {
        setErrorMsg('⚠️ Email Rate Limit Exceeded (Supabase free default is 3 emails/hour). Please wait or adjust limits in Supabase Dashboard.');
      } else {
        setErrorMsg(err.message || 'Failed to resend confirmation email.');
      }
    } finally {
      setLoading(false);
    }
  };

  const handleEmailAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setErrorMsg(null);
    setSignUpSuccess(false);
    setNeedsEmailConfirmation(false);
    setResendSuccess(false);

    try {
      const codeUpper = workspaceCode.trim().toUpperCase();
      if (codeUpper && accountType === 'company') {
        localStorage.setItem('cadence_last_workspace_code', codeUpper);
      }

      if (isSignUp) {
        if (!password || password.length < 6) {
          setErrorMsg('Password must be at least 6 characters long.');
          setLoading(false);
          return;
        }
        if (password !== confirmPassword) {
          setErrorMsg('⚠️ Passwords do not match. Please re-enter your password.');
          setLoading(false);
          return;
        }

        // Individual Personal Registration (Tier 1 Starter)
        if (accountType === 'personal') {
          const { data: authData, error: authError } = await supabase.auth.signUp({
            email: email.trim().toLowerCase(),
            password,
            options: {
              data: {
                full_name: fullName.trim() || email.split('@')[0],
                account_type: 'individual',
                tier: 'tier_1',
              },
            },
          });

          if (authError) throw authError;

          // Check if user already exists in Supabase Auth (empty identities array)
          if (authData.user && authData.user.identities && authData.user.identities.length === 0) {
            throw new Error(`An account with email "${email}" is already registered. Please click "Sign In" above or use "Forgot password?".`);
          }

          const userId = authData.user?.id;
          if (userId) {
            await supabase.from('profiles').upsert({
              id: userId,
              org_id: null,
              email: email.trim().toLowerCase(),
              full_name: fullName.trim() || email.split('@')[0],
              role: 'level_1',
              status: 'approved',
              approved_at: new Date().toISOString(),
            });
          }

          // Check if email confirmation is required by Supabase auth configuration
          if (!authData.session && authData.user && !authData.user.email_confirmed_at) {
            setNeedsEmailConfirmation(true);
          }

          setSignUpSuccess(true);
          return;
        }

        // Company Workspace Registration (Tier 3 Enterprise)
        if (!codeUpper) {
          throw new Error('Please enter a valid Company Workspace Code provided by your organization.');
        }

        if (!orgBranding) {
          throw new Error(`Invalid Workspace Code "${codeUpper}". Organization not found or not active.`);
        }

        const { data: authData, error: authError } = await supabase.auth.signUp({
          email: email.trim().toLowerCase(),
          password,
          options: {
            data: { 
              full_name: fullName.trim() || email.split('@')[0],
              workspace_code: codeUpper,
              account_type: 'organization_member',
              tier: 'tier_3',
            },
          },
        });

        if (authError) throw authError;

        // Check if user already exists in Supabase Auth (empty identities array)
        if (authData.user && authData.user.identities && authData.user.identities.length === 0) {
          throw new Error(`An account with email "${email}" is already registered with your organization. Please click "Sign In" above.`);
        }

        const userId = authData.user?.id;
        if (userId && orgBranding) {
          const isPrimary = orgBranding.primary_admin_email && 
            orgBranding.primary_admin_email.toLowerCase() === email.trim().toLowerCase();

          setIsPrimaryAdminSuccess(Boolean(isPrimary));

          await supabase.from('profiles').upsert({
            id: userId,
            org_id: orgBranding.org_id,
            email: email.trim().toLowerCase(),
            full_name: fullName.trim() || email.split('@')[0],
            role: isPrimary ? 'org_admin' : 'level_2',
            status: isPrimary ? 'approved' : 'pending',
            approved_at: isPrimary ? new Date().toISOString() : null,
          });

          if (isPrimary) {
            await supabase.from('organizations').update({ is_activated: true }).eq('id', orgBranding.org_id);
          }
        }

        if (!authData.session && authData.user && !authData.user.email_confirmed_at) {
          setNeedsEmailConfirmation(true);
        }

        setSignUpSuccess(true);
      } else {
        // Standard Secure Sign In
        const { error } = await supabase.auth.signInWithPassword({
          email: email.trim().toLowerCase(),
          password,
        });
        
        if (error) {
          if (error.message.toLowerCase().includes('email not confirmed')) {
            setNeedsEmailConfirmation(true);
          }
          throw error;
        }

        if (onLoginSuccess) onLoginSuccess();
      }
    } catch (err: any) {
      setErrorMsg(err.message || 'Authentication failed. Please check your credentials.');
    } finally {
      setLoading(false);
    }
  };

  const activeBrandColor = orgBranding?.brand_color || '#0d9488';
  const activeTitle = orgBranding?.brand_title || 'Cadence CPM';
  const activeTagline = orgBranding?.brand_tagline || 'Critical Path Milestone & Schedule Management';

  return (
    <div className="min-h-screen bg-slate-950 flex items-center justify-center p-4">
      <div className="bg-slate-900 border border-slate-800 rounded-3xl p-8 max-w-md w-full shadow-2xl space-y-6 transition-all">
        
        {/* Dynamic Brand Header */}
        <div className="text-center space-y-2">
          {orgBranding?.logo_url ? (
            <div className="h-12 flex items-center justify-center mx-auto mb-2">
              <img src={orgBranding.logo_url} alt="Logo" className="max-h-full max-w-full object-contain rounded-lg p-1 bg-white" />
            </div>
          ) : (
            <div 
              className="w-12 h-12 rounded-2xl flex items-center justify-center mx-auto text-slate-950 font-black shadow-lg transition-colors"
              style={{ backgroundColor: activeBrandColor }}
            >
              <Footprints className="w-6 h-6 text-slate-950" />
            </div>
          )}

          <h1 className="text-2xl font-extrabold text-white tracking-tight animate-in fade-in duration-200">
            {isForgotPassword ? 'Reset Password' : activeTitle}
          </h1>
          <p className="text-xs text-slate-400">
            {isForgotPassword 
              ? 'Enter your email to receive password recovery instructions' 
              : isSignUp 
              ? accountType === 'personal' 
                ? 'Create free personal task & calendar workspace' 
                : 'Join enterprise company workspace'
              : activeTagline}
          </p>
        </div>

        {/* PASSWORD UPDATE SUCCESS NOTIFICATION */}
        {passwordUpdateSuccess && (
          <div className="bg-emerald-500/10 border border-emerald-500/30 p-3 rounded-2xl text-xs text-emerald-300 text-center font-semibold flex items-center justify-center gap-1.5 mb-3">
            <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
            <span>✓ Password updated successfully! Please sign in with your new password.</span>
          </div>
        )}

        {/* ISOLATED PASSWORD RECOVERY MODE */}
        {isRecoveryMode ? (
          <form onSubmit={handleSaveNewPassword} className="space-y-4">
            <div className="bg-teal-500/10 border border-teal-500/30 p-3 rounded-2xl text-xs text-teal-300 text-center font-medium">
              🔒 <strong>Password Recovery Mode:</strong> Enter your new password below. Private dashboard access is locked until password update is completed.
            </div>

            {errorMsg && (
              <div className="bg-rose-500/10 border border-rose-500/30 p-3 rounded-2xl text-xs text-rose-300 text-center font-medium">
                {errorMsg}
              </div>
            )}

            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1">New Password</label>
              <div className="relative">
                <input
                  type={showPassword ? 'text' : 'password'}
                  required
                  minLength={6}
                  value={newPassword}
                  onChange={e => setNewPassword(e.target.value)}
                  placeholder="••••••••"
                  className="w-full text-xs pl-9 pr-10 py-2.5 bg-slate-850 border border-slate-700 rounded-xl text-white outline-none focus:border-teal-500 font-mono"
                />
                <Lock className="w-4 h-4 text-slate-500 absolute left-3 top-3" />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-3 text-slate-500 hover:text-slate-300 transition-colors"
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1">Confirm New Password</label>
              <div className="relative">
                <input
                  type={showPassword ? 'text' : 'password'}
                  required
                  minLength={6}
                  value={confirmPassword}
                  onChange={e => setConfirmPassword(e.target.value)}
                  placeholder="••••••••"
                  className="w-full text-xs pl-9 pr-10 py-2.5 bg-slate-850 border border-slate-700 rounded-xl text-white outline-none focus:border-teal-500 font-mono"
                />
                <Lock className="w-4 h-4 text-slate-500 absolute left-3 top-3" />
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full py-2.5 text-slate-950 font-bold text-xs rounded-xl shadow-lg transition-all flex items-center justify-center gap-1.5 bg-teal-500 hover:bg-teal-400"
            >
              <span>{loading ? 'Saving New Password...' : 'Save New Password & Return to Sign In'}</span>
            </button>
          </form>
        ) : isForgotPassword ? (
          <form onSubmit={handleResetPassword} className="space-y-4">
            {errorMsg && (
              <div className="bg-rose-500/10 border border-rose-500/30 p-3 rounded-2xl text-xs text-rose-300 text-center font-medium">
                {errorMsg}
              </div>
            )}

            {resetEmailSent ? (
              <div className="bg-emerald-500/10 border border-emerald-500/30 p-4 rounded-2xl text-xs text-emerald-300 text-center space-y-2">
                <CheckCircle2 className="w-8 h-8 text-emerald-400 mx-auto" />
                <p className="font-bold text-white text-sm">Password Reset Link Sent!</p>
                <p className="text-slate-300 text-[11px] leading-relaxed">
                  We have sent password reset instructions to <strong>{email}</strong>. Please check your inbox.
                </p>
                <button
                  type="button"
                  onClick={() => {
                    setIsForgotPassword(false);
                    setResetEmailSent(false);
                    setErrorMsg(null);
                  }}
                  className="mt-2 text-xs font-bold text-teal-400 hover:underline inline-flex items-center gap-1"
                >
                  <ArrowLeft className="w-3.5 h-3.5" /> Return to Sign In
                </button>
              </div>
            ) : (
              <>
                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">Registered Email Address</label>
                  <div className="relative">
                    <input
                      type="email"
                      required
                      autoFocus
                      value={email}
                      onChange={e => setEmail(e.target.value)}
                      placeholder="name@company.com"
                      className="w-full text-xs pl-9 pr-3 py-2.5 bg-slate-850 border border-slate-700 rounded-xl text-white outline-none focus:border-teal-500 font-mono"
                    />
                    <Mail className="w-4 h-4 text-slate-500 absolute left-3 top-3" />
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={loading}
                  className="w-full py-2.5 text-slate-950 font-bold text-xs rounded-xl shadow-lg transition-all flex items-center justify-center gap-1.5"
                  style={{ backgroundColor: activeBrandColor }}
                >
                  <KeyRound className="w-4 h-4" />
                  <span>{loading ? 'Sending Instructions...' : 'Send Password Reset Email'}</span>
                </button>

                <div className="text-center pt-2">
                  <button
                    type="button"
                    onClick={() => {
                      setIsForgotPassword(false);
                      setErrorMsg(null);
                    }}
                    className="text-xs font-semibold text-slate-400 hover:text-white transition-colors flex items-center justify-center gap-1 mx-auto"
                  >
                    <ArrowLeft className="w-3.5 h-3.5" /> Back to Sign In
                  </button>
                </div>
              </>
            )}
          </form>
        ) : (
          /* STANDARD SIGN IN / REGISTER FORM */
          <>
            {/* Auth Mode Toggle Tabs (Sign In vs Register) */}
            <div className="flex items-center bg-slate-850 p-1 rounded-2xl border border-slate-800 text-xs font-semibold">
              <button
                type="button"
                onClick={() => {
                  setIsSignUp(false);
                  setErrorMsg(null);
                  setSignUpSuccess(false);
                }}
                className={`flex-1 py-2 rounded-xl transition-all flex items-center justify-center gap-1.5 ${
                  !isSignUp ? 'text-slate-950 font-bold shadow-md' : 'text-slate-400 hover:text-white'
                }`}
                style={!isSignUp ? { backgroundColor: activeBrandColor } : {}}
              >
                <LogIn className="w-3.5 h-3.5" /> Sign In
              </button>

              <button
                type="button"
                onClick={() => {
                  setIsSignUp(true);
                  setErrorMsg(null);
                  setSignUpSuccess(false);
                }}
                className={`flex-1 py-2 rounded-xl transition-all flex items-center justify-center gap-1.5 ${
                  isSignUp ? 'text-slate-950 font-bold shadow-md' : 'text-slate-400 hover:text-white'
                }`}
                style={isSignUp ? { backgroundColor: activeBrandColor } : {}}
              >
                <UserPlus className="w-3.5 h-3.5" /> Register Account
              </button>
            </div>

            {/* If Registering: Clean Personal vs Company Workspace Selector */}
            {isSignUp && (
              <div className="bg-slate-850 p-2 rounded-2xl border border-slate-800 space-y-2">
                <div className="text-[11px] font-bold text-slate-400 px-1 uppercase tracking-wider">Account Type:</div>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      setAccountType('personal');
                      setWorkspaceCode('');
                      setOrgBranding(null);
                    }}
                    className={`p-2.5 rounded-xl border text-xs font-bold flex flex-col items-center gap-1 transition-all ${
                      accountType === 'personal'
                        ? 'border-teal-500 bg-teal-500/10 text-teal-300'
                        : 'border-slate-750 bg-slate-900 text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    <User className="w-4 h-4" />
                    <span>Personal (Free)</span>
                    <span className="text-[9px] font-normal text-slate-400">No workspace code needed</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setAccountType('company')}
                    className={`p-2.5 rounded-xl border text-xs font-bold flex flex-col items-center gap-1 transition-all ${
                      accountType === 'company'
                        ? 'border-teal-500 bg-teal-500/10 text-teal-300'
                        : 'border-slate-750 bg-slate-900 text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    <Building2 className="w-4 h-4" />
                    <span>Company / Org</span>
                    <span className="text-[9px] font-normal text-slate-400">Enter company code</span>
                  </button>
                </div>
              </div>
            )}

            {errorMsg && (
              <div className="bg-rose-500/10 border border-rose-500/30 p-3 rounded-2xl text-xs text-rose-300 text-center space-y-2 font-medium">
                <p>{errorMsg}</p>

                {needsEmailConfirmation && (
                  <button
                    type="button"
                    onClick={handleResendConfirmation}
                    className="px-3 py-1 bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 border border-amber-500/40 rounded-lg font-bold text-[11px] inline-flex items-center gap-1 transition-colors"
                  >
                    <Send className="w-3 h-3" /> Resend Confirmation Email
                  </button>
                )}
              </div>
            )}

            {resendSuccess && (
              <div className="bg-emerald-500/10 border border-emerald-500/30 p-3 rounded-2xl text-xs text-emerald-300 text-center font-medium">
                ✓ Confirmation link resent! Please check your email inbox ({email}).
              </div>
            )}

            {signUpSuccess && (
              <div className="bg-emerald-500/10 border border-emerald-500/30 p-4 rounded-2xl text-xs text-emerald-300 text-center space-y-1">
                <CheckCircle2 className="w-6 h-6 text-emerald-400 mx-auto" />
                <p className="font-bold text-white text-sm">
                  {accountType === 'personal' ? '🎉 Registration Submitted!' : isPrimaryAdminSuccess ? '🎉 Company Activated!' : 'Registration Submitted!'}
                </p>
                <p className="text-slate-300 text-[11px] leading-relaxed">
                  {needsEmailConfirmation
                    ? `📧 We sent a verification link to ${email}. Please check your inbox and confirm your email address before signing in!`
                    : accountType === 'personal'
                    ? 'Your personal task manager is ready. Sign in below to start organizing your timeline!'
                    : isPrimaryAdminSuccess 
                    ? 'Your Primary Org Admin account has been activated! Sign in below.' 
                    : 'Your registration has been submitted. Your Company Org Admin will review access.'}
                </p>

                {needsEmailConfirmation && (
                  <button
                    type="button"
                    onClick={handleResendConfirmation}
                    className="mt-2 px-3 py-1 bg-teal-500/20 hover:bg-teal-500/30 text-teal-300 border border-teal-500/40 rounded-lg font-bold text-[11px] inline-flex items-center gap-1 transition-colors"
                  >
                    <Send className="w-3 h-3" /> Resend Confirmation Email
                  </button>
                )}
              </div>
            )}

            {/* Auth Form */}
            <form onSubmit={handleEmailAuth} className="space-y-4">
              
              {/* Workspace ID (Only shown if Company Workspace Mode) */}
              {isSignUp && accountType === 'company' && (
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="block text-xs font-semibold text-slate-300">
                      Company Workspace Code <span className="text-rose-400">*</span>
                    </label>
                    {orgBranding && (
                      <span className="text-[10px] text-teal-400 font-mono font-bold flex items-center gap-1">
                        <Sparkles className="w-3 h-3" /> {orgBranding.org_name}
                      </span>
                    )}
                  </div>
                  
                  <div className="relative">
                    <input
                      type="text"
                      required
                      value={workspaceCode}
                      onChange={e => setWorkspaceCode(e.target.value.toUpperCase())}
                      placeholder="e.g. APACHE"
                      className="w-full text-xs pl-9 pr-3 py-2.5 bg-slate-850 border border-slate-700 rounded-xl text-white font-mono uppercase font-bold outline-none focus:border-teal-500 placeholder:text-slate-500 placeholder:normal-case placeholder:font-normal"
                    />
                    <Building2 className="w-4 h-4 text-slate-500 absolute left-3 top-3" />
                  </div>
                </div>
              )}

              {isSignUp && (
                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">Your Full Name</label>
                  <input
                    type="text"
                    required
                    value={fullName}
                    onChange={e => setFullName(e.target.value)}
                    placeholder="e.g. Alex Johnson"
                    className="w-full text-xs px-3 py-2.5 bg-slate-850 border border-slate-700 rounded-xl text-white outline-none focus:border-teal-500"
                  />
                </div>
              )}

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">Email Address</label>
                <div className="relative">
                  <input
                    type="email"
                    required
                    value={email}
                    onChange={e => setEmail(e.target.value)}
                    placeholder="name@email.com"
                    className="w-full text-xs pl-9 pr-3 py-2.5 bg-slate-850 border border-slate-700 rounded-xl text-white outline-none focus:border-teal-500 font-mono"
                  />
                  <Mail className="w-4 h-4 text-slate-500 absolute left-3 top-3" />
                </div>
              </div>

              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="block text-xs font-semibold text-slate-300">Password</label>
                  {!isSignUp && (
                    <button
                      type="button"
                      onClick={() => {
                        setIsForgotPassword(true);
                        setErrorMsg(null);
                        setResetEmailSent(false);
                      }}
                      className="text-[11px] font-semibold text-teal-400 hover:text-teal-300 hover:underline"
                    >
                      Forgot password?
                    </button>
                  )}
                </div>

                <div className="relative">
                  <input
                    type={showPassword ? 'text' : 'password'}
                    required
                    value={password}
                    onChange={e => setPassword(e.target.value)}
                    placeholder="••••••••"
                    className="w-full text-xs pl-9 pr-10 py-2.5 bg-slate-850 border border-slate-700 rounded-xl text-white outline-none focus:border-teal-500 font-mono"
                  />
                  <Lock className="w-4 h-4 text-slate-500 absolute left-3 top-3" />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-3 text-slate-500 hover:text-slate-300 transition-colors"
                    title={showPassword ? 'Hide password' : 'Show password'}
                  >
                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              {/* Confirm Password Field (Only shown during Account Registration) */}
              {isSignUp && (
                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">Confirm Password</label>
                  <div className="relative">
                    <input
                      type={showConfirmPassword ? 'text' : 'password'}
                      required
                      value={confirmPassword}
                      onChange={e => setConfirmPassword(e.target.value)}
                      placeholder="••••••••"
                      className="w-full text-xs pl-9 pr-10 py-2.5 bg-slate-850 border border-slate-700 rounded-xl text-white outline-none focus:border-teal-500 font-mono"
                    />
                    <Lock className="w-4 h-4 text-slate-500 absolute left-3 top-3" />
                    <button
                      type="button"
                      onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                      className="absolute right-3 top-3 text-slate-500 hover:text-slate-300 transition-colors"
                      title={showConfirmPassword ? 'Hide password' : 'Show password'}
                    >
                      {showConfirmPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>
              )}

              <button
                type="submit"
                disabled={loading}
                className="w-full py-2.5 text-slate-950 font-bold text-xs rounded-xl shadow-lg transition-all flex items-center justify-center gap-1.5"
                style={{ backgroundColor: activeBrandColor }}
              >
                <span>
                  {loading 
                    ? 'Authenticating...' 
                    : isSignUp 
                    ? accountType === 'personal' ? 'Create Free Personal Account' : 'Register with Company' 
                    : 'Sign In'}
                </span>
                <ArrowRight className="w-4 h-4" />
              </button>
            </form>
          </>
        )}
      </div>
    </div>
  );
};
