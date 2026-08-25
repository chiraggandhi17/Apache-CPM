import React from 'react';
import { useAuth, UserRole, FeatureKey } from '../../context/AuthContext';
import { Clock, ShieldAlert, Lock, Sparkles } from 'lucide-react';

export const ProtectedAppGuard: React.FC<{ children: React.ReactNode; fallbackLogin: React.ReactNode }> = ({
  children,
  fallbackLogin,
}) => {
  const { user, profile, isLoading, signOut } = useAuth();

  if (isLoading) {
    return (
      <div className="min-h-screen bg-slate-900 flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-teal-500"></div>
      </div>
    );
  }

  // If live user is logged in and pending approval
  if (user && profile?.status === 'pending') {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center p-4">
        <div className="bg-slate-900 border border-slate-800 rounded-3xl p-8 max-w-md text-center space-y-4 shadow-2xl">
          <div className="w-12 h-12 rounded-2xl bg-amber-500/10 text-amber-400 flex items-center justify-center mx-auto border border-amber-500/20">
            <Clock className="w-6 h-6 animate-pulse" />
          </div>
          <div>
            <h2 className="text-xl font-bold text-white">Account Pending Approval</h2>
            <p className="text-xs text-slate-400 leading-relaxed mt-1">
              Your account (<span className="text-slate-200 font-mono">{user.email}</span>) has been registered. An Apache CPM Administrator must approve your access before you can view production timelines.
            </p>
          </div>

          <div className="bg-slate-850 p-3 rounded-2xl border border-slate-800 text-[11px] text-slate-300">
            💡 <strong className="text-white">Admin Note:</strong> If you are the system owner, sign in with your primary Admin account to grant approval.
          </div>

          <button
            type="button"
            onClick={() => signOut()}
            className="w-full py-2.5 bg-slate-800 hover:bg-slate-700 text-xs font-semibold text-slate-200 rounded-xl transition-colors"
          >
            Sign Out
          </button>
        </div>
      </div>
    );
  }

  if (user && profile?.status === 'revoked') {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center p-4">
        <div className="bg-slate-900 border border-rose-900/30 rounded-3xl p-8 max-w-md text-center space-y-4 shadow-2xl">
          <div className="w-12 h-12 rounded-2xl bg-rose-500/10 text-rose-400 flex items-center justify-center mx-auto border border-rose-500/20">
            <ShieldAlert className="w-6 h-6" />
          </div>
          <div>
            <h2 className="text-xl font-bold text-white">Access Revoked</h2>
            <p className="text-xs text-slate-400 leading-relaxed mt-1">
              Your account access has been suspended by an administrator. Please contact your department lead to restore access.
            </p>
          </div>
          <button
            type="button"
            onClick={() => signOut()}
            className="w-full py-2.5 bg-slate-800 hover:bg-slate-700 text-xs font-semibold text-slate-200 rounded-xl transition-colors"
          >
            Sign Out
          </button>
        </div>
      </div>
    );
  }

  return <>{children}</>;
};

export const FeatureGate: React.FC<{
  feature: FeatureKey;
  children: React.ReactNode;
  fallback?: React.ReactNode;
}> = ({ feature, children, fallback = null }) => {
  const { hasFeature } = useAuth();

  if (!hasFeature(feature)) {
    if (fallback) return <>{fallback}</>;

    return (
      <div className="bg-gradient-to-r from-slate-900 to-slate-800 p-6 rounded-2xl border border-slate-700 text-slate-200 space-y-3">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-xl bg-amber-500/10 text-amber-400 border border-amber-500/30 flex items-center justify-center">
            <Lock className="w-4 h-4" />
          </div>
          <div>
            <h3 className="text-sm font-bold text-white flex items-center gap-1.5">
              <span>Premium Module Locked</span>
              <span className="text-[10px] bg-amber-500/20 text-amber-300 px-2 py-0.5 rounded-md border border-amber-500/30 font-mono">
                {feature}
              </span>
            </h3>
            <p className="text-xs text-slate-400">
              This feature module is not enabled for your account tier. Ask your Apache CPM Admin to toggle access in the Admin Control Center.
            </p>
          </div>
        </div>
      </div>
    );
  }

  return <>{children}</>;
};

export const RoleGuard: React.FC<{
  roles: UserRole[];
  children: React.ReactNode;
  fallback?: React.ReactNode;
}> = ({ roles, children, fallback = null }) => {
  const { hasRole } = useAuth();
  if (!hasRole(roles)) {
    return <>{fallback}</>;
  }
  return <>{children}</>;
};
