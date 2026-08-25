import React, { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import { Lock, Mail, ArrowRight, CheckCircle2, UserPlus, LogIn, Building2, Footprints, Sparkles } from 'lucide-react';

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
    const urlParams = new URLSearchParams(window.location.search);
    const orgParam = urlParams.get('org') || urlParams.get('workspace');
    if (orgParam) return orgParam.toUpperCase();
    return localStorage.getItem('cadence_last_workspace_code') || '';
  });

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const [isSignUp, setIsSignUp] = useState(false);
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [signUpSuccess, setSignUpSuccess] = useState<boolean>(false);
  const [isPrimaryAdminSuccess, setIsPrimaryAdminSuccess] = useState<boolean>(false);

  // Live Real-Time Brand Preview State
  const [orgBranding, setOrgBranding] = useState<PublicOrgBranding | null>(null);

  // Debounced Organization Brand Lookup (No administrative hints revealed)
  useEffect(() => {
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

        if (data) {
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
      } catch (err) {
        setOrgBranding(null);
      }
    }, 250);

    return () => clearTimeout(timer);
  }, [workspaceCode]);

  const handleEmailAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setErrorMsg(null);
    setSignUpSuccess(false);

    try {
      const codeUpper = workspaceCode.trim().toUpperCase();
      if (codeUpper) {
        localStorage.setItem('cadence_last_workspace_code', codeUpper);
      }

      if (isSignUp) {
        if (!codeUpper) {
          throw new Error('Please enter a valid Organization Workspace Code provided by your company.');
        }

        if (!orgBranding) {
          throw new Error(`Invalid Workspace Code "${codeUpper}". Please verify with your organization administrator.`);
        }

        const { data: authData, error: authError } = await supabase.auth.signUp({
          email,
          password,
          options: {
            data: { 
              full_name: fullName.trim() || email.split('@')[0],
              workspace_code: codeUpper,
            },
          },
        });

        if (authError) throw authError;

        const userId = authData.user?.id;
        if (userId && orgBranding) {
          const isPrimary = orgBranding.primary_admin_email && 
            orgBranding.primary_admin_email.toLowerCase() === email.toLowerCase();

          setIsPrimaryAdminSuccess(Boolean(isPrimary));

          await supabase.from('profiles').upsert({
            id: userId,
            org_id: orgBranding.org_id,
            email,
            full_name: fullName.trim() || email.split('@')[0],
            role: isPrimary ? 'org_admin' : 'junior_manager',
            status: isPrimary ? 'approved' : 'pending',
            approved_at: isPrimary ? new Date().toISOString() : null,
          });

          if (isPrimary) {
            await supabase.from('organizations').update({ is_activated: true }).eq('id', orgBranding.org_id);
          }
        }

        setSignUpSuccess(true);
      } else {
        // Standard Secure Sign In
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
        if (onLoginSuccess) onLoginSuccess();
      }
    } catch (err: any) {
      setErrorMsg(err.message || 'Authentication failed. Please check your credentials.');
    } finally {
      setLoading(false);
    }
  };

  const activeBrandColor = orgBranding?.brand_color || '#0d9488';
  const activeTitle = orgBranding?.brand_title || 'Cadence';
  const activeTagline = orgBranding?.brand_tagline || 'Enterprise Critical Path Management System';

  return (
    <div className="min-h-screen bg-slate-950 flex items-center justify-center p-4">
      <div className="bg-slate-900 border border-slate-800 rounded-3xl p-8 max-w-md w-full shadow-2xl space-y-6 transition-all">
        
        {/* Clean, Zero-Leakage Brand Header */}
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
            {activeTitle}
          </h1>
          <p className="text-xs text-slate-400">
            {isSignUp ? 'Register company account' : activeTagline}
          </p>
        </div>

        {/* Auth Mode Toggle Tabs */}
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
            <UserPlus className="w-3.5 h-3.5" /> Register
          </button>
        </div>

        {errorMsg && (
          <div className="bg-rose-500/10 border border-rose-500/30 p-3 rounded-2xl text-xs text-rose-300 text-center font-medium">
            {errorMsg}
          </div>
        )}

        {signUpSuccess && (
          <div className="bg-emerald-500/10 border border-emerald-500/30 p-4 rounded-2xl text-xs text-emerald-300 text-center space-y-1">
            <CheckCircle2 className="w-6 h-6 text-emerald-400 mx-auto" />
            <p className="font-bold text-white text-sm">
              {isPrimaryAdminSuccess ? '🎉 Organization Activated!' : 'Registration Submitted!'}
            </p>
            <p className="text-slate-300 text-[11px]">
              {isPrimaryAdminSuccess 
                ? 'Your Primary Organization Admin account has been activated! Sign in below to access your Company Org Admin Center.' 
                : 'Your registration has been submitted. Your Company Org Admin will review and approve your account access.'}
            </p>
          </div>
        )}

        {/* Secure Form */}
        <form onSubmit={handleEmailAuth} className="space-y-4">
          
          {/* Workspace ID / Organization Code Input */}
          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="block text-xs font-semibold text-slate-300">
                Workspace Code {isSignUp && <span className="text-rose-400">*</span>}
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
                value={workspaceCode}
                onChange={e => setWorkspaceCode(e.target.value.toUpperCase())}
                placeholder="Enter company workspace code"
                className="w-full text-xs pl-9 pr-3 py-2.5 bg-slate-850 border border-slate-700 rounded-xl text-white font-mono uppercase font-bold outline-none focus:border-teal-500 placeholder:text-slate-500 placeholder:normal-case placeholder:font-normal"
              />
              <Building2 className="w-4 h-4 text-slate-500 absolute left-3 top-3" />
            </div>
          </div>

          {isSignUp && (
            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1">Full Name</label>
              <input
                type="text"
                required
                value={fullName}
                onChange={e => setFullName(e.target.value)}
                placeholder="e.g. Alex Merchandiser"
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
                placeholder="name@company.com"
                className="w-full text-xs pl-9 pr-3 py-2.5 bg-slate-850 border border-slate-700 rounded-xl text-white outline-none focus:border-teal-500"
              />
              <Mail className="w-4 h-4 text-slate-500 absolute left-3 top-3" />
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-300 mb-1">Password</label>
            <div className="relative">
              <input
                type="password"
                required
                value={password}
                onChange={e => setPassword(e.target.value)}
                placeholder="••••••••"
                className="w-full text-xs pl-9 pr-3 py-2.5 bg-slate-850 border border-slate-700 rounded-xl text-white outline-none focus:border-teal-500"
              />
              <Lock className="w-4 h-4 text-slate-500 absolute left-3 top-3" />
            </div>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full py-2.5 text-slate-950 font-bold text-xs rounded-xl shadow-lg transition-all flex items-center justify-center gap-1.5"
            style={{ backgroundColor: activeBrandColor }}
          >
            <span>{loading ? 'Authenticating...' : isSignUp ? 'Submit Registration' : 'Sign In'}</span>
            <ArrowRight className="w-4 h-4" />
          </button>
        </form>
      </div>
    </div>
  );
};
